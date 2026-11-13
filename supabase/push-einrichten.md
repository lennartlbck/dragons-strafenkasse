# Push-Benachrichtigungen einrichten (einmalig beim Live-Gang)

Alles läuft im **kostenlosen** Supabase-Plan: Web Push, eine Edge Function, `pg_net` und `pg_cron`.
Die geheimen Werte stehen **nur** in `~/App Dragons/Schluessel/push-geheim.json`, also nie im Repo.

## Reihenfolge

1. **SQL ausführen:** Supabase → SQL Editor → `supabase/schema.sql` ausführen. Dabei entstehen:
   - die Tabelle `push_subs`
   - die Auslöser und Funktionen
   - die Erweiterungen `pg_net` und `pg_cron`
   - der stündliche Zeitplan `dragons-push`
2. **Geheimnis in den Vault** (SQL Editor, Wert `PUSH_SECRET` aus der Schlüsseldatei):
   ```sql
   select vault.create_secret('<PUSH_SECRET>', 'push_secret');
   ```
3. **Edge Function anlegen:**
   - Supabase → Edge Functions → *Deploy a new function* → *Via Editor*.
   - Name: `push`. Inhalt: `supabase/functions/push/index.ts`.
   - In den Einstellungen der Funktion **„Verify JWT“ ausschalten**. Die Funktion prüft stattdessen `PUSH_SECRET`.
4. **Secrets der Edge Function** (Edge Functions → Secrets), alle drei aus der Schlüsseldatei:
   - `PUSH_SECRET`
   - `VAPID_PUBLIC_KEY`
   - `VAPID_PRIVATE_JWK`
5. **Geburtstage eintragen:** `supabase/seed-geburtstage.sql` im SQL Editor ausführen. Die Datei ist lokal und nicht im Repo. Genauso `supabase/seed-doener-paypal.sql` (PayPal-Adresse für Döner).
6. **App hochladen:** `index.html`, `sw.js`, `config.js` (enthält nur den öffentlichen Schlüssel).
7. **Test:**
   1. Kasse vom Home-Bildschirm öffnen.
   2. ☰ → Benachrichtigungen → einschalten → „Test senden“.

## Wer bekommt was

| Ereignis | Empfänger |
|---|---|
| Neue Strafe | der betroffene Spieler |
| Zahltag gestartet | jeder, der etwas zahlen muss |
| Zahltag endet in < 24 h (18 Uhr) | wer noch offen ist und nicht gemeldet hat |
| Dienstag 17 Uhr | alle, die noch keinen Döner bestellt haben |
| Neues Fußballspiel / Runde vorbei | alle |
| „Ich habe bezahlt“ gemeldet | Kassenwart und Admin |
| Geburtstag (9 Uhr) | Glückwunsch an das Geburtstagskind, Info an alle anderen; dazu automatisch ein Kabinenfest |

Jeder kann jedes Thema pro Gerät abschalten. Beim Abmelden wird das Gerät automatisch abgemeldet.

## Grenzen im Free-Plan

Die Edge Function hat 500.000 Aufrufe pro Monat frei. Sie wird nur aufgerufen, wenn wirklich eine Nachricht rausgeht, also grob ein paar Hundert Mal im Monat. Der stündliche Zeitplan läuft in der Datenbank und kostet nichts extra.
