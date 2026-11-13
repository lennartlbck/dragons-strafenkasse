// @ts-nocheck – reines JavaScript, damit Deploy ohne Typprüfung klappt
// Dragons Kasse – Versand von Push-Benachrichtigungen (Supabase Edge Function, kostenlos im Free-Plan).
// Die Datenbank entscheidet, WER WAS bekommt (siehe push_send in schema.sql) und ruft diese Funktion über pg_net auf.
// Die Funktion verschlüsselt die Nachricht nach Web-Push-Standard (RFC 8291 + VAPID RFC 8292) und schickt sie an
// Apple, Google oder Mozilla. Keine Fremdbibliotheken: alles mit WebCrypto, das in Deno und Node gleich funktioniert.
//
// Geheimnisse (Supabase → Edge Functions → Secrets), NIE ins Repo:
//   PUSH_SECRET        – gleicher Wert wie im Vault-Eintrag „push_secret“; nur wer ihn kennt, darf senden
//   VAPID_PUBLIC_KEY   – öffentlicher Schlüssel (steht auch in config.js)
//   VAPID_PRIVATE_JWK  – privater Schlüssel als JWK-JSON
// Automatisch vorhanden: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (zum Aufräumen abgemeldeter Geräte).
// Beim Anlegen „Verify JWT“ AUSschalten – die Funktion prüft stattdessen PUSH_SECRET.

const enc = new TextEncoder();
const APP_URL = 'https://lennartlbck.github.io/dragons-strafenkasse/';
// Nur echte Push-Dienste anschreiben – sonst könnte jemand eine fremde Adresse als „Gerät“ eintragen.
export const ALLOWED = /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+(\.[a-z0-9-]+)*\.notify\.windows\.com|[a-z0-9-]+(\.[a-z0-9-]+)*\.push\.apple\.com)\//;

export const b64u = {
  enc(buf) { let s = ''; for (const b of new Uint8Array(buf)) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); },
  dec(str) { const s = atob(String(str).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((String(str).length + 3) % 4)); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; },
};
const concat = (...a) => { const out = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let o = 0; for (const x of a) { out.set(x, o); o += x.length; } return out; };
async function hkdf(salt, ikm, info, bytes) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, bytes * 8));
}

// Verschlüsselt die Nachricht für ein Gerät (Content-Encoding aes128gcm, RFC 8291)
export async function encrypt(sub, text) {
  const uaPub = b64u.dec(sub.p256dh), auth = b64u.dec(sub.auth);
  const as = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey));
  const ua = await crypto.subtle.importKey('raw', uaPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: ua }, as.privateKey, 256));
  const ikm = await hkdf(auth, shared, concat(enc.encode('WebPush: info\0'), uaPub, asPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(enc.encode(text), new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 16, 0]); // Datensatzgröße 4096
  return concat(salt, rs, new Uint8Array([asPub.length]), asPub, ct);
}

// VAPID-Anmeldung beim Push-Dienst (ES256-JWT, RFC 8292)
export async function vapidHeader(endpoint, vapid) {
  const jwk = typeof vapid.privateJwk === 'string' ? JSON.parse(vapid.privateJwk) : vapid.privateJwk;
  const key = await crypto.subtle.importKey('jwk', { ...jwk, key_ops: ['sign'], ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const head = b64u.enc(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64u.enc(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: vapid.subject || APP_URL })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(head + '.' + body));
  return `vapid t=${head}.${body}.${b64u.enc(sig)}, k=${vapid.publicKey}`;
}

export async function sendPush(sub, msg, vapid, fx = fetch) {
  if (!ALLOWED.test(sub.endpoint)) return { endpoint: sub.endpoint, status: 0, error: 'not allowed' };
  try {
    const body = await encrypt(sub, JSON.stringify(msg));
    const r = await fx(sub.endpoint, { method: 'POST', body, headers: { Authorization: await vapidHeader(sub.endpoint, vapid), 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '86400', Urgency: 'normal' } });
    return { endpoint: sub.endpoint, status: r.status };
  } catch (e) { return { endpoint: sub.endpoint, status: 0, error: String(e && e.message || e) }; }
}

function sameSecret(a, b) { if (!a || !b || a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });

export async function handle(req, env, fx = fetch) {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!sameSecret(req.headers.get('x-push-secret') || '', env.PUSH_SECRET || '')) return json({ error: 'unauthorized' }, 401);
  let p; try { p = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
  const subs = Array.isArray(p.subs) ? p.subs.slice(0, 500) : [];
  const msg = { title: String(p.title || 'Dragons Kasse').slice(0, 120), body: String(p.body || '').slice(0, 400), tag: p.tag ? String(p.tag).slice(0, 64) : undefined, url: APP_URL };
  const vapid = { publicKey: env.VAPID_PUBLIC_KEY, privateJwk: env.VAPID_PRIVATE_JWK, subject: env.VAPID_SUBJECT };
  const res = await Promise.all(subs.map(s => sendPush(s, msg, vapid, fx)));
  // Abgemeldete Geräte (404/410) aus der Tabelle entfernen
  const gone = res.filter(r => r.status === 404 || r.status === 410).map(r => r.endpoint);
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (gone.length && env.SUPABASE_URL && key) {
    const h = { apikey: key, ...(key.startsWith('eyJ') ? { Authorization: 'Bearer ' + key } : {}) };
    await Promise.all(gone.map(e => fx(`${env.SUPABASE_URL}/rest/v1/push_subs?endpoint=eq.${encodeURIComponent(e)}`, { method: 'DELETE', headers: h }).catch(() => null)));
  }
  return json({ sent: res.filter(r => r.status >= 200 && r.status < 300).length, failed: res.filter(r => !(r.status >= 200 && r.status < 300)).map(r => ({ status: r.status, error: r.error })), gone: gone.length });
}

if (typeof Deno !== 'undefined') Deno.serve(req => handle(req, Deno.env.toObject()));
