(function(){
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'});
const eur=n=>fmt.format(Math.round((Number(n)||0)*100)/100);
const today=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
const dDE=s=>{if(!s)return'';const [y,m,d]=s.split('-');return `${d}.${m}.${y}`};
const num=v=>{const n=parseFloat(String(v).replace(',','.'));return isFinite(n)?n:0};
const CAT_ORDER=['Beiträge & Getränke','Pünktlichkeit & Anwesenheit','Spiel & Training','Handy & Verhalten','Kleidung & Eigentum','Ämter','Sonderstrafen','Kasse'];

const S={players:[],fines:[],entries:[],bills:[],got:{p:0,f:0,e:0,b:0},db:null,uid:null,canWrite:null,canEdit:false,
  settings:{},mOpen:{},bClosed:{},receipts:[],rcUrls:{},favs:[],ksort:'nr',smode:'saison',links:[],prof:{},zahltags:[],doener:[],fussball:[],geburt:{},wash:{},gb:{},gbDone:{},members:[],me:null,tab:'erfassen',q:'',status:'loading',sheet:null,stale:false,month:today().slice(0,7),kview:'personen'};
const COLS=[['beitrag','Monatsbeitrag'],['strafen','Strafen'],['fussball','Fußball'],['bier','Bier'],['sonder','Sonderausgaben']];
const COL_BY_FINE={f01:'beitrag',f02:'bier',f03:'bier',f26:'fussball'};
const colOf=e=>e.col||COL_BY_FINE[e.fineId]||(e.billId?'sonder':'strafen');
const isCost=b=>!b.kind||b.kind==='ausgabe';
const BILL_CATS=['Duschdas','Bier','Pfand','Musikbox','Teamevent','Tickets Kerb','Auslagen Oktoberfest','Fußball','Würfel','Plakat & Sticker','Spieltag Verpflegung','Babyöl','Mega KBF','Auslagen letzte Saison','Therme','Spende','Pizza Spieltag','Zelser Spieltag'];
const MONTHS=['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
const monthName=m=>m==='saison'?'Saison 26/27':MONTHS[+m.slice(5,7)-1]+' '+m.slice(0,4);
const inPeriod=(d,m)=>m==='saison'||String(d||'').slice(0,7)===m;
const shortName=p=>{if(!p)return'?';const [f,...r]=p.name.split(' ');const dup=S.players.filter(x=>x.name.split(' ')[0]===f).length>1;return dup&&r.length?f+' '+r[r.length-1][0]+'.':f};
try{const t=localStorage.getItem('tab');if(t)S.tab=t==='konten'?'uebersicht':t;const k=localStorage.getItem('ksort');if(['nr','high'].includes(k))S.ksort=k}catch(e){}

const ICONS={
 erfassen:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
 konten:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="8" r="3.2"/><path d="M3 19c.8-3.2 3.2-5 6-5s5.2 1.8 6 5"/><path d="M16 5.5a3 3 0 0 1 0 5.6M18 14c1.6.7 2.6 2.4 3 5"/></svg>',
 uebersicht:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M3.5 9.5h17M9.5 9.5V20"/></svg>',
 rechnungen:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/></svg>',
 verlauf:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
 menu:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
 plus:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
 minus:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 12h14"/></svg>',
 x:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
 chevL:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
 grip:'<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.7"/><circle cx="15" cy="6" r="1.7"/><circle cx="9" cy="12" r="1.7"/><circle cx="15" cy="12" r="1.7"/><circle cx="9" cy="18" r="1.7"/><circle cx="15" cy="18" r="1.7"/></svg>',
 camera:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l1.6-2.4h6.8L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.2" r="3.6"/></svg>',
 chevR:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
 check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
 search:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg>',
 trash:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/></svg>',
 clock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
 euro:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17.5 6.5A7 7 0 1 0 17.5 17.5M4 10h9M4 14h9"/></svg>',
 logout:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14M10 16l-4-4 4-4M6 12h10"/></svg>',
 star:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M12 3.6l2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 17l-5.3 2.8 1.1-5.9L3.5 9.8l5.9-.8z"/></svg>',
 starFill:'<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M12 3.6l2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 17l-5.3 2.8 1.1-5.9L3.5 9.8l5.9-.8z"/></svg>',
 kalender:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
 verwalten:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>'};

const I=k=>ICONS[k].replace('<svg','<svg class="ico" aria-hidden="true" focusable="false"');
const TITLES={erfassen:'Eintragen',uebersicht:'Übersicht',rechnungen:'Rechnungen',kalender:'Kalender',verwalten:'Verwalten'};
/* ---------- Ableitungen ---------- */
const pById=id=>S.players.find(p=>p.id===id)||TEAM_ENT.find(p=>p.id===id);
function sortedPlayers(all){
  const list=S.players.filter(p=>all||p.active!==false);
  return list.sort((a,b)=>{const sa=a.role==='Spieler'?0:1,sb=b.role==='Spieler'?0:1;if(sa!==sb)return sa-sb;
    if(sa===0)return (a.number??999)-(b.number??999);return (a.order??50)-(b.order??50)||a.name.localeCompare(b.name)});
}
function balance(pid){let open=0,paid=0,kf=0,credit=0,rep=0;for(const e of S.entries){if(e.playerId!==pid)continue;
  if(e.paid)paid+=e.amount||0;else{open+=e.amount||0;if(e.reported)rep++} if(e.kabinenfest&&!e.kfDone)kf++;}
  credit=r2(credMap()[pid]||0);open=r2(open);return{open,paid,kf,credit,rep,net:r2(open-credit)}}
const r2=x=>Math.round(x*100)/100;
// Guthaben aus ausgelegten Rechnungen/Gutschriften: was davon noch nicht erstattet oder mit Strafen verrechnet ist
// ACHTUNG: spiegelt credit_left()/consume_credit() in supabase/schema.sql – Regeländerungen immer an beiden Stellen machen
const credLeft=b=>r2((b.amount||0)-(b.credited||0));
let _cm={src:null,m:{}};
function credMap(){if(_cm.src!==S.bills){const m={};for(const b of S.bills){if(b.kind==='einzahlung'||!b.paidBy||b.refunded)continue;const l=credLeft(b);if(l>0)m[b.paidBy]=(m[b.paidBy]||0)+l}_cm={src:S.bills,m}}return _cm.m}
// Bezahlt Einträge über die Datenbank und verrechnet dabei vorhandenes Guthaben (auch Teilbeträge).
// Sonst verrechnet die Datenbank sofort, wenn eine Rechnung oder ein Eintrag dazukommt (credit_auto in schema.sql).
async function payEntries(pid,ids,via){if(!ids.length)return{n:0,used:0};
  const {data,error}=await S.sb.rpc('pay_entries',{pid,ids,via});if(error)throw error;
  try{await S.db.refresh('entries','bills')}catch(e){}
  return data||{n:0,used:0}}
const sumAmt=es=>r2(es.reduce((a,e)=>a+(e.amount||0),0));
const netTxt=n=>n>0?eur(n):n<0?'+ '+eur(-n):eur(0);
// ---------- Backup ----------
const BACKUP_TABLES=['players','fines','entries','bills','settings','zahltag','fees','receipts','members','kasse_intern','fussball','doener','geburt','trikotwash','geburtstage','schulden','anzeigen','berichte','wuerfel','umfrage'];
const daysSince=iso=>iso?Math.floor((Date.now()-Date.parse(iso))/DAY):null;
async function makeBackup(){
  const out={app:'Dragons Kasse',format:1,exportedAt:new Date().toISOString(),tables:{}},counts={};
  for(const t of BACKUP_TABLES){const all=[];
    for(let from=0;;from+=1000){const {data,error}=await S.sb.from(t).select(t==='members'?'*':'id,data,updated_at').order(t==='members'?'user_id':'id').range(from,from+999);
      if(error)throw error;all.push(...(data||[]));if(!data||data.length<1000)break}
    out.tables[t]=all;counts[t]=all.length}
  const blob=new Blob([JSON.stringify(out,null,1)],{type:'application/json'}),a=document.createElement('a');
  a.href=URL.createObjectURL(blob);a.download=`dragons-kasse-backup-${today()}.json`;document.body.appendChild(a);a.click();
  setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},2000);
  // die Datei ist schon gespeichert: scheitert nur der Zeitstempel, ist das kein fehlgeschlagenes Backup
  try{await S.db.doc('kasse_intern/backup').set({lastAt:out.exportedAt,by:pById(myPid())?.name||S.email||null,counts})}catch(e){counts.noStamp=true}
  return counts}
// Protokoll für Änderungen, die den Kassenstand verschieben (bezahlte Einträge gelöscht/geöffnet, Rechnung gelöscht).
// Liegt in kasse_intern (nur Kassenwart/Admin) und erscheint im Kassenstand unter „Änderungen seit dem letzten Abgleich“.
async function logChange(text,amount){
  try{const it={at:new Date().toISOString(),by:pById(myPid())?.name||S.email||null,text,amount:amount==null?null:r2(amount)};
    await S.db.doc('kasse_intern/protokoll').set({items:[it,...((S.klog||{}).items||[])].slice(0,200)})}catch(e){}
}
// ---------- Kassenstand ----------
// Soll = Startbestand + Zahlungen der Spieler (ohne den mit Guthaben verrechneten Teil) + Sondereinzahlungen
//        − Ausgaben aus der Kasse − Erstattungen an Spieler (jeweils ab dem Startdatum)
function kasseSoll(){
  const st=(S.kstand||{}).start;if(!st||!st.date)return null;const d0=st.date,day=x=>String(x||'').slice(0,10);
  let pay=0,ein=0,aus=0,erst=0;
  for(const e of S.entries)if(e.paid&&day(e.paidAt||e.date)>=d0)pay+=(e.amount||0)-(e.creditUsed||0);
  for(const b of S.bills){
    if(b.kind==='einzahlung'){if(day(b.date)>=d0)ein+=b.amount||0;continue}
    if(isCost(b)&&!b.paidBy&&day(b.date)>=d0)aus+=b.amount||0;
    if(b.paidBy&&b.refunded&&!b.verrechnet&&day(b.refundedAt||b.date)>=d0)erst+=credLeft(b)}
  pay=r2(pay);ein=r2(ein);aus=r2(aus);erst=r2(erst);
  return{start:r2(st.amount||0),date:d0,pay,ein,aus,erst,soll:r2((st.amount||0)+pay+ein-aus-erst)}}
const kasseIst=()=>r2(['kk','kp','kb'].reduce((a,id)=>a+num($('#'+id)?.value||0),0));
function kasseDiffHtml(ist,soll){const d=r2(ist-soll);
  return d===0?`<span class="tag ok">passt genau</span>`:`<span class="tag ${d>0?'ok':'owe'}">${d>0?'+ ':'− '}${eur(Math.abs(d))} ${d>0?'mehr als erwartet':'fehlen'}</span>`}
function totals(){let open=0,paid=0,kf=0;for(const e of S.entries){if(e.paid)paid+=e.amount||0;else open+=e.amount||0;if(e.kabinenfest&&!e.kfDone)kf++}return{open,paid,kf}}
function priceLabel(f){const p=[];if(f.base)p.push(eur(f.base));if(f.per)p.push((f.base?'+ ':'')+eur(f.per)+' / '+(f.unit||'Stück'));
  if(f.kabinenfest)p.push((p.length?'+ ':'')+'Kabinenfest');if(f.wuerfeln)p.push((p.length?'+ ':'')+'Würfeln');return p.join(' ')||'Betrag frei'}
function avatar(p,cls=''){if(!p)return `<span class="av ${cls}">?</span>`;
  if(p.img)return `<span class="av ${cls}"><img src="${esc(p.img)}" alt="" loading="lazy"></span>`;
  const ini=p.name.split(/\s+/).map(w=>w[0]).slice(0,2).join('');return `<span class="av ${cls}">${esc(ini)}</span>`}
S.termine=[];S.kalView='woche';S.kalMon=null;S.kalM=null;
const ROLES=[['member','Spieler'],['kassenwart','Kassenwart'],['admin','Admin'],['deckenzaehler','Deckenzähler'],['doenerwart','Dönerwart'],['trainer','Trainer'],['mannschaftsverantwortlicher','Mannschaftsverantwortlicher'],['trikotwart','Trikotwart'],['wasserwart','Wasserwart'],['aufraeumdienst','Aufräumdienst'],['kabinenfestwart','Kabinenfestwart']];
const roleName=r=>(ROLES.find(x=>x[0]===r)||[0,r])[1];
const pLabel=p=>p?(p.role==='Spieler'&&p.number!=null?'#'+p.number+' · ':'')+(p.role&&p.role!=='Spieler'?p.role:'Spieler'):'';

/* ---------- Rendering ---------- */
// ---------- Rote Punkte: Neues wie bei den Benachrichtigungen ----------
// Jede Stelle hat einen Zeitpunkt der letzten Neuigkeit. Ist er jünger als „zuletzt angesehen“ (pro Gerät gemerkt), gibt es einen Punkt an der Stelle
// und am Reiter. Angesehen gilt eine Stelle beim Öffnen (Konto, Zahlungen, Menüpunkt, Kachel, Spiel) oder beim Verlassen des Reiters (Rest).
let _seen=null;
const seenMap=()=>{if(!_seen){try{_seen=JSON.parse(localStorage.getItem('seen:'+S.uid)||'null')}catch(e){}if(!_seen||!_seen._){_seen={_:new Date().toISOString()};saveSeen()}}return _seen}; // erster Start: nichts Altes als neu
const saveSeen=()=>{try{localStorage.setItem('seen:'+S.uid,JSON.stringify(_seen))}catch(e){}};
const seenAt=k=>seenMap()[k]||seenMap()._;
const latest=a=>a.reduce((x,y)=>y&&y>x?y:x,'');
const at=(d,h)=>new Date(d+'T'+h+':00').toISOString();
function spots(){if(S.status==='loading')return [];const me=myPid(),meName=pById(me)?.name,td=tdIso(),bn=berlinNow(),byOther=(t,by)=>by&&by!==S.uid?t:'';
  return [
    ['konto','uebersicht',me&&latest(S.entries.filter(e=>e.playerId===me&&e.createdBy!==S.uid&&!String(e.id).startsWith('kf-gb-')).map(e=>e.createdAt))], // neue Strafe für mich (Geburtstags-Kabinenfest ohne eigene Nachricht)
    ['rechnungen','uebersicht',S.canWrite===true&&latest([...S.receipts.map(r=>byOther(r.createdAt,r.uid)),...(S.bills||[]).map(b=>byOther(b.createdAt,b.createdBy))])], // Beleg hochgeladen / Rechnung eingetragen
    ['zahlungen','uebersicht',isKW()&&latest(S.entries.filter(e=>e.reported&&!e.paid).map(e=>e.reportedAt))], // Zahlung gemeldet
    ['zahltag','uebersicht',zOpen()&&zt().startedAt],
    ['m:doener','uebersicht',latest([bn.wd===3&&bn.h>=12&&me&&doenerList(addDays(td,-1)).some(d=>d.pid===me&&!d.paid&&!d.reportedAt)&&at(td,'12'), // Mi 12 Uhr: Döner von gestern noch nicht bezahlt
      ...(hasRole('doenerwart')?(S.doener||[]).map(d=>d.reportedAt):[])])],
    ['m:fussball','uebersicht',latest((S.fussball||[]).map(g=>g.createdAt))],
    ['m:gb','uebersicht',gbList().withB.some(x=>x.days===0)&&at(td,'09')],
    ['anz','erfassen',hasRole('kassenwart')&&latest(anzOpen().map(a=>a.createdAt))], // neue Anzeige: Punkt nur für den Kassenwart
    ['vt-mitglieder','verwalten',isAdmin()&&latest((S.members||[]).filter(m=>!m.approved).map(m=>m.created_at))], // neue Anmeldung
    ['plan','kalender',latest(S.termine.filter(x=>x.type==='plan'&&x.by!==meName).map(x=>x.sentAt))], // Wochenplan
    ...S.termine.filter(x=>x.poll&&x.type==='spiel'&&pollOpen(x)).map(x=>['poll:'+x.id,'kalender',x.poll.at])] // Umfrage
    .filter(([k,,t])=>t&&t>seenAt(k))}
// beim Öffnen einer Stelle bzw. Verlassen eines Reiters
function markSeen(keys){const m=seenMap(),now=new Date().toISOString(),ks=keys.filter(k=>S.dots?.has(k));if(!ks.length)return;ks.forEach(k=>m[k]=now);saveSeen();
  renderTabs();ks.forEach(k=>document.querySelectorAll(`.idot[data-k="${CSS.escape(k)}"]`).forEach(e=>e.remove())); // Punkte sofort weg, ohne alles neu zu zeichnen
  if(![...S.dots].some(k=>k.startsWith('m:')))document.querySelector('.menubtn .tdot')?.remove()}
// Reiter wechseln (Tab-Leiste und Sprung aus dem Verlauf)
function goTab(k){markSeen(leaveKeys());S.tab=k;if(k==='verwalten'&&S.loadMembers)S.loadMembers();try{localStorage.setItem('tab',k)}catch(e){}$('#view').innerHTML='';render();scrollTo(0,0)}
const LEAVE={uebersicht:['zahltag'],rechnungen:['rechnungen'],erfassen:['anz'],kalender:['plan']};
const leaveKeys=()=>LEAVE[S.tab]||[];
const isNewAt=(k,t,by)=>!!S.dots?.has(k)&&!!t&&t>seenAt(k)&&!!by&&by!==S.uid; // diese Zeile ist neu (von jemand anderem)
// Kalender: geänderte Tage der letzten Meldung „Termin geändert“ (bei „Neue Woche“ nur der Punkt am Reiter)
const calcPlanDays=()=>{const me=pById(myPid())?.name,sa=seenAt('plan');return new Set(S.termine.filter(x=>x.type==='plan'&&x.by!==me).flatMap(x=>Object.entries(x.changedAt||{}).filter(([,t])=>t>sa).map(([d])=>d)))};
const planDays=()=>S.planDays||new Set(); // einmal pro Bildaufbau in renderTabs berechnet
const idot=(k,pre)=>S.dots?.has(k)?`<span class="idot${pre?' pre':''}" data-k="${esc(k)}" role="img" aria-label="neu"></span>`:''; // pre: vor dem Text (bei abgeschnittenen Zeilen)
function renderTabs(){
  const tabs=[['kalender','Kalender'],['uebersicht','Übersicht'],['erfassen','Eintragen']];
  if(S.canEdit||isKW())tabs.push(['verwalten','Verwalten']);
  if(!tabs.some(t=>t[0]===S.tab)&&S.tab!=='rechnungen')S.tab='erfassen'; // Rechnungen ist ein Unterbereich der Übersicht
  const cur=S.tab==='rechnungen'?'uebersicht':S.tab,sp=spots();S.dots=new Set(sp.map(x=>x[0]));S.planDays=S.dots.has('plan')?calcPlanDays():null;const dt=new Set(sp.filter(x=>x[1]!==cur).map(x=>x[1]));
  $('#tabs').innerHTML=tabs.map(([k,l])=>{const d=dt.has(k);return `<button data-act="tab" data-k="${k}" ${k===cur?'aria-current="page"':''}${d?` aria-label="${l}, etwas neu"`:''}>${ICONS[k]}${d?'<i class="tdot" aria-hidden="true"></i>':''}${l}</button>`}).join('');
}
function statusBanner(){if(S.refreshing&&S.stale)return `<div class="banner">Keine Verbindung – du siehst den zuletzt geladenen Stand.</div>`;return (S.refreshing&&S.status!=='nodb'?`<div class="syncnote" role="status">Wird aktualisiert …</div>`:'')+statusBanner2()}
function statusBanner2(){
  if(S.status==='nodb')return `<div class="banner">Die Kasse ist gerade nicht erreichbar. Prüfe deine Internetverbindung und lade die Seite neu.</div>`;
  if(S.stale)return `<div class="banner">Die Daten sind gerade nicht erreichbar. Was du siehst, ist eventuell nicht aktuell.</div>`;
  if(S.amtFines)return `<div class="info">Als ${esc(S.amtRoles.join(' und '))} trägst du ${esc([...S.amtFines].map(id=>'„'+(S.fines.find(f=>f.id===id)?.title||id)+'“').join(', '))} ein. Alles andere macht der Kassenwart.</div>`;
  if(S.canWrite===false)return `<div class="info">Du siehst die Kasse und kannst bezahlen. Strafen und Rechnungen trägt der Kassenwart ein. Fotos von Rechnungen kannst du unter „Rechnungen“ hochladen.</div>`;
  return '';
}
// Neue Daten aus der Datenbank: mehrere Änderungen kurz hintereinander werden zu einem Neuaufbau gebündelt
let _rq=0;const renderSoon=()=>{_rq||=requestAnimationFrame(()=>{_rq=0;render()})};
function render(){
  if(S.status==='auth')return;
  renderTabs();
  const v=$('#view');
  if(S.tab==='erfassen'){
    if(!$('#finelist')){v.innerHTML=`<h1 class="ltitle">Eintragen</h1><div id="anz"></div><div id="bn"></div><label class="search">${I('search')}<input id="q" type="search" enterkeyhint="search" autocomplete="off" placeholder="Strafe suchen" value="${esc(S.q)}" aria-label="Strafe suchen"></label><div id="finelist"></div>`}
    $('#anz').innerHTML=anzeigenBlock();$('#bn').innerHTML=statusBanner();
    $('#finelist').innerHTML=fineList();
  } else{const sx=v.querySelector('.tablewrap')?.scrollLeft||0;
    const title=(S.tab==='rechnungen'?`<button class="chipbtn" data-act="tab" data-k="uebersicht">${I('chevL')}Übersicht</button>`:'')+`<h1 class="ltitle">${TITLES[S.tab]}</h1>`;
    const html=(S.tab==='uebersicht'?`<div class="ltrow">${title}<button class="iconbtn round menubtn" data-act="openMenu" aria-label="Menü: Döner, Fußball, Kabinenfest, Trikots und Benachrichtigungen" aria-haspopup="dialog">${I('menu')}${[...(S.dots||[])].some(k=>k.startsWith('m:'))?'<i class="tdot" aria-hidden="true"></i>':''}</button></div>`:title)+(S.tab==='kalender'?'':statusBanner())+(S.tab==='uebersicht'?zahltagBanner():'')+(S.tab==='uebersicht'?uebersichtAll():S.tab==='rechnungen'?rechnungen():S.tab==='kalender'?kalender():verwalten());
    // nur neu aufbauen, wenn sich wirklich etwas geändert hat (sonst ruckelt die Seite bei jeder Server-Meldung)
    if(v.__html!==html||!v.__node||v.firstElementChild!==v.__node){v.innerHTML=html;v.__html=html;v.__node=v.firstElementChild;const tw=v.querySelector('.tablewrap');if(tw)tw.scrollLeft=sx}}
  if(S.sheet)renderSheet(true);
  checkPenalties();hydrateImgs();gbKfCheck();
}
// graue Platzhalter, solange (beim allerersten Start) noch keine Daten da sind
const skel=(n=5)=>`<div class="skel" aria-busy="true" aria-label="Wird geladen">${'<i></i>'.repeat(n)}</div>`;
function loadingOr(html,what){
  if(S.status==='loading')return skel();
  return html;
}
function fineList(){
  const q=S.q.trim().toLowerCase();
  const fines=S.fines.filter(f=>(!S.amtFines||S.amtFines.has(f.id))&&(!q||(f.title+' '+(f.hint||'')+' '+(f.cat||'')).toLowerCase().includes(q)));
  if(S.status==='loading')return skel();
  if(!S.fines.length)return `<div class="empty" style="margin-top:12px">Noch kein Strafenkatalog hinterlegt.${S.canEdit?' Lege unter „Verwalten“ die erste Strafe an.':''}</div>`;
  const groups={};for(const f of fines)(groups[f.cat||'Sonstiges']??=[]).push(f);
  const cats=Object.keys(groups).sort((a,b)=>{const ia=CAT_ORDER.indexOf(a),ib=CAT_ORDER.indexOf(b);return (ia<0?99:ia)-(ib<0?99:ib)});
  let h='';
  if(!q&&!S.amtFines)h+=`<button class="free" data-act="free">${I('plus')} Freier Betrag (Sonstiges, Würfeln …)</button>`;
  if(!cats.length)h+=`<div class="empty" style="margin-top:12px">Keine Strafe passt zu „${esc(S.q)}“.</div>`;
  const byOrder=(a,b)=>(a.order??0)-(b.order??0);
  const row=f=>{const fav=S.favs.includes(f.id);return `<div class="finerow"><button class="star" data-act="fav" data-id="${esc(f.id)}" aria-pressed="${fav}" aria-label="${esc(f.title)} ${fav?'aus den Favoriten entfernen':'zu den Favoriten hinzufügen'}">${I(fav?'starFill':'star')}</button><button class="fine" data-act="fine" data-id="${esc(f.id)}"><span class="t"><b>${esc(f.title)}</b>${f.hint?`<i>${esc(f.hint)}</i>`:''}</span><span class="price">${esc(priceLabel(f))}</span>${I('chevR').replace('class="ico"','class="ico chev"')}</button></div>`};
  const favs=!q?S.favs.map(id=>fines.find(f=>f.id===id)).filter(Boolean):[];
  if(favs.length)h+=`<h2 class="section-h">Favoriten</h2><div class="fines">`+favs.map(row).join('')+`</div>`;
  for(const c of cats){
    h+=`<h2 class="section-h">${esc(c)}</h2><div class="fines">`+groups[c].sort(byOrder).map(row).join('')+`</div>`;
  }
  return h;
}
/* ---------- Bezahlen per PayPal ---------- */
function ppTarget(raw){let v=String(raw===undefined?S.settings.paypal||'':raw||'').trim();if(!v)return null;
  if(v.includes('@')&&!/paypal\.me/i.test(v))return{type:'mail',v};
  v=v.replace(/^https?:\/\//i,'').replace(/^(www\.)?paypal\.me\//i,'').split(/[/?#]/)[0];return v?{type:'me',v}:null}
function paypalUrl(amount,name,target,item){const t=target===undefined?ppTarget():target;if(!t)return null;const a=(Math.round(amount*100)/100).toFixed(2);
  if(t.type==='me')return `https://www.paypal.me/${encodeURIComponent(t.v)}/${a}EUR`;
  return `https://www.paypal.com/cgi-bin/webscr?cmd=_xclick&business=${encodeURIComponent(t.v)}&amount=${a}&currency_code=EUR&no_shipping=1&item_name=${encodeURIComponent(item||'Mannschaftskasse Dragons – '+name)}`}
const ibanOk=v=>{if(!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(v))return false;const r=(v.slice(4)+v.slice(0,4)).replace(/[A-Z]/g,c=>c.charCodeAt(0)-55);let m=0;for(const ch of r)m=(m*10+ +ch)%97;return m===1};
const fmtIban=v=>String(v).replace(/\s/g,'').replace(/(.{4})/g,'$1 ').trim();
const purpose=p=>'Mannschaftskasse Dragons '+p.name;
const toPay=b=>Math.max(0,Math.round((b.open-b.credit)*100)/100);
const DAY=864e5,KW_DEFAULT='p29',LATE_FEE=10;
const myPid=()=>S.me?S.me.player_id:null;
// Ämter mit Strafrechten (wie amt_fine in schema.sql): nur diese Strafen dürfen sie selbst eintragen. Wasserwart/Aufräumdienst melden per Anzeige.
const AMT_FINES={deckenzaehler:['f26']};
function setPerms(){const mgr=hasRole('admin','kassenwart'),a=Object.entries(AMT_FINES).filter(([r])=>hasRole(r));S.canEdit=mgr;S.canWrite=mgr;
  S.amtFines=!mgr&&a.length?new Set(a.flatMap(x=>x[1])):null;S.amtRoles=a.map(x=>roleName(x[0]))}
const favKey=()=>'favs-'+(S.uid||'x');
function loadFavs(){try{const v=JSON.parse(localStorage.getItem(favKey())||'[]');return Array.isArray(v)?v:[]}catch(e){return[]}}
function saveFavs(){try{localStorage.setItem(favKey(),JSON.stringify(S.favs))}catch(e){}}
// Strafen mit Zwei-Schritt-Ablauf: Spieler wählen → Weiter → Anzahl pro Spieler
const COUNT_FLOW={f26:'Deckentreffer',f02:'Bier',f03:'Radler'};
const countFine=f=>!!f&&f.id in COUNT_FLOW;
const canEnter=f=>S.canWrite===true||!!(S.amtFines&&f&&S.amtFines.has(f.id))||(!!f&&f.id==='kf-manual'&&hasRole('kabinenfestwart'));
// Kabinenfeste planen und abhaken: Kassenwart, Admin, Kabinenfestwart
const canKf=()=>S.canWrite===true||hasRole('kabinenfestwart');
// nur kfDone/kfOrder/kfWeek ändern (geht auch für den Kabinenfestwart, siehe kf_patch in schema.sql)
async function kfPatch(id,patch){const {error}=await S.sb.rpc('kf_patch',{doc_id:id,patch});if(error)throw error;const e=S.entries.find(x=>x.id===id);if(e)Object.assign(e,patch);renderSoon()}
const kwPid=()=>S.settings.kassenwartPlayer||KW_DEFAULT;
// Hauptrolle (role) plus weitere Rollen (roles); 'member' zählt nicht als Rolle
const rolesOf=m=>m?[m.role,...(m.roles||[])].filter(r=>r&&r!=='member'):[];
const hasRole=(...r)=>rolesOf(S.me).some(x=>r.includes(x));
// aus einer Auswahl Haupt- und weitere Rollen machen (Admin/Kassenwart zuerst, damit die Datenbank-Regeln greifen)
const splitRoles=sel=>{const l=ROLES.map(x=>x[0]).filter(k=>k!=='member'&&sel.includes(k)).sort((a,b)=>(b==='admin')-(a==='admin'));return{role:l[0]||'member',roles:l.slice(1)}};
const isDoenerwart=()=>hasRole('doenerwart'),isTrikotwart=()=>hasRole('trikotwart');
const canTrikot=()=>isKW()||isTrikotwart(); // Trikots sehen: Kassenwart, Admin, Trikotwart; ändern nur der Trikotwart
const isAdmin=()=>hasRole('admin');
const isKW=()=>hasRole('kassenwart','admin'); // Admin darf alles, was der Kassenwart darf
const zt=()=>{const z=[...S.zahltags].sort((a,b)=>String(b.startedAt).localeCompare(String(a.startedAt)))[0];return z&&z.active&&z.endsAt?z:null};
// Rückblick auf einen Zahltag: wer hat bezahlt (rechtzeitig / zu spät), wer noch nicht, welche Verzugsstrafen sind angefallen
const zAll=()=>[...S.zahltags].filter(z=>z.endsAt).sort((a,b)=>String(b.startedAt).localeCompare(String(a.startedAt)));
function zReview(z){
  const end=Date.parse(z.endsAt),ids=new Set(z.entryIds||[]),rows=[];let due=0,paid=0,open=0,late=0,fees=0,feesOpen=0;
  const lateFees=S.entries.filter(e=>e.auto&&/^verzug-/.test(e.id)&&e.id.split('-')[1]===z.runId);
  for(const pid of Object.keys(z.due||{})){
    const es=S.entries.filter(e=>ids.has(e.id)&&e.playerId===pid),dueAmt=r2(z.due[pid]||0);
    // noch offen = offene Zahltag-Einträge, aber höchstens das, was nach Abzug des Guthabens wirklich zu zahlen ist
    const bal=balance(pid);
    const rest=r2(Math.min(es.filter(e=>!e.paid).reduce((a,e)=>a+(e.amount||0),0),Math.max(0,bal.net)));
    const lateEs=es.filter(e=>e.paid&&Date.parse(e.reportedAt||e.paidAt||0)>end);
    const fe=lateFees.find(e=>e.playerId===pid);
    const st=rest>0?'open':(lateEs.length||(fe&&fe.paid))?'late':'ok';
    rows.push({pid,p:pById(pid),due:dueAmt,rest:r2(rest+(fe&&!fe.paid?fe.amount||0:0)),st,fee:fe||null,net:bal.net});
    due+=dueAmt;if(st==='open'){open+=rest}else if(st==='late')late+=dueAmt;else paid+=dueAmt;
    if(fe){fees+=fe.amount||0;if(!fe.paid)feesOpen+=fe.amount||0}
  }
  const erlassen=Math.max(0,(z.penaltiesCount||0)-lateFees.length);
  rows.sort((a,b)=>({open:0,late:1,ok:2}[a.st]-{open:0,late:1,ok:2}[b.st])||b.rest-a.rest||(a.p?.number??999)-(b.p?.number??999));
  return{rows,due:r2(due),open:r2(open),late:r2(late),paid:r2(paid),fees:r2(fees),feesOpen:r2(feesOpen),erlassen,
         n:{open:rows.filter(r=>r.st==='open').length,late:rows.filter(r=>r.st==='late').length,ok:rows.filter(r=>r.st==='ok').length},over:Date.now()>=end}
}
const zOpen=()=>{const z=zt();return !!z&&Date.now()<Date.parse(z.endsAt)};
function leftTxt(ms){if(ms<=0)return 'abgelaufen';const d=Math.floor(ms/DAY),h=Math.floor(ms%DAY/36e5),m=Math.ceil(ms%36e5/6e4);
  return d?`noch ${d} ${d===1?'Tag':'Tage'}${h?' '+h+' Std.':''}`:h?`noch ${h} Std.`:`noch ${m} Min.`}
const dtDE=iso=>{const d=new Date(iso);return d.toLocaleDateString('de-DE',{weekday:'short',day:'2-digit',month:'2-digit'})+', '+d.toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})+' Uhr'};
function payBox(p,b){
  if(!zOpen()||myPid()!==p.id)return ''; // bezahlen kann jeder nur für sich selbst
  const z=zt(),amt=toPay(b),url=paypalUrl(amt,p.name),t=ppTarget();
  const mine=myPid()===p.id,canMark=mine||isKW()||S.canEdit;
  const myOpen=S.entries.filter(e=>e.playerId===p.id&&!e.paid),toReport=myOpen.filter(e=>!e.reported),pending=myOpen.filter(e=>e.reported);
  const repSum=toReport.reduce((a,e)=>a+(e.amount||0),0),direct=isKW();
  const head=`<div class="pay-h"><span>Zahltag · bis ${esc(dtDE(z.endsAt))} · ${esc(leftTxt(Date.parse(z.endsAt)-Date.now()))}</span>${amt>0?`<b class="num">${eur(amt)}</b>`:''}</div>`;
  if(amt<=0)return `<div class="paybox done">${head}<span>${esc(mine?'Du musst':p.name.split(' ')[0]+' muss')} gerade nichts zahlen${b.credit>b.open?` – Guthaben ${eur(b.credit-b.open)}`:''}.</span></div>`;
  if(!direct&&pending.length&&!toReport.length)return `<div class="paybox wait">${head}<p><b>Zahlung gemeldet</b></p><p class="note">Der Kassenwart prüft, ob das Geld angekommen ist, und bestätigt es dann. Bis dahin steht der Betrag noch als offen da.</p><button class="btn" data-act="unreport" data-id="${esc(p.id)}">Meldung zurücknehmen</button></div>`;
  return `<div class="paybox">${head}
    ${b.credit?`<p class="note">Offen ${eur(b.open)} − Guthaben ${eur(b.credit)}</p>`:''}${S.settings.payNote?`<p>${esc(S.settings.payNote)}</p>`:''}
    ${url?`<a class="btn paypal" href="${esc(url)}" target="_blank" rel="noopener" data-act="ppOpened" data-id="${esc(p.id)}">Mit PayPal bezahlen · ${eur(amt)}</a>
    <div class="pp-addr"><span>An: <b>${esc(t.v)}</b></span><button class="mini" data-act="copyPP">Kopieren</button></div>`:''}
    ${S.settings.iban?`<details class="bank" ${url?'':'open'}><summary>Lieber per Überweisung</summary>
      <div class="pp-addr"><span>IBAN: <b class="num">${esc(fmtIban(S.settings.iban))}</b></span><button class="mini" data-act="copyTxt" data-v="${esc(S.settings.iban.replace(/\s/g,''))}">Kopieren</button></div>
      ${S.settings.owner?`<div class="pp-addr"><span>Empfänger: <b>${esc(S.settings.owner)}</b></span></div>`:''}
      <div class="pp-addr"><span>Betrag: <b class="num">${eur(amt)}</b></span><button class="mini" data-act="copyTxt" data-v="${amt.toFixed(2).replace('.',',')}">Kopieren</button></div>
      <div class="pp-addr"><span>Verwendungszweck: <b>${esc(purpose(p))}</b></span><button class="mini" data-act="copyTxt" data-v="${esc(purpose(p))}">Kopieren</button></div></details>`:''}
    ${canMark?`<button class="btn good ${S.ppOpened===p.id?'pulse':''}" data-act="selfPaid" data-id="${esc(p.id)}">${S.confirmPaid===p.id?(direct?`Ja, ${eur(b.open)} als bezahlt markieren`:`Ja, ${eur(repSum)} als bezahlt melden`):'Ich habe bezahlt'}</button>`
      :''}
    ${direct?'':`<p class="note">Nach deiner Meldung bestätigt der Kassenwart die Zahlung, sobald das Geld angekommen ist.</p>`}
    <p class="note">Wer bis ${esc(dtDE(z.endsAt))} nicht bezahlt hat, bekommt automatisch ${eur(LATE_FEE)} Strafe (Zahlungsverzug).</p></div>`;
}
function zahltagBanner(){
  let h='';
  if(zOpen()){const z=zt(),me=myPid();
    h+=`<div class="zahltag" role="status">${ICONS.clock}<b>Zahltag · ${esc(leftTxt(Date.parse(z.endsAt)-Date.now()))}${idot('zahltag')}</b><span>bis ${esc(dtDE(z.endsAt))} – danach automatisch ${eur(LATE_FEE)} Verzug.</span>${me?`<button class="btn" data-act="person" data-id="${esc(me)}">Mein Konto &amp; bezahlen</button>`:''}</div>`}
  if(isKW())h+=confirmCard();
  return h;
}
function pendingPays(){const g={};for(const e of S.entries)if(e.reported&&!e.paid&&pById(e.playerId))(g[e.playerId]??=[]).push(e);return g}
function confirmCard(){
  const g=pendingPays(),ids=Object.keys(g);if(!ids.length)return '';
  const sum=ids.reduce((a,pid)=>a+g[pid].reduce((x,e)=>x+(e.amount||0),0),0);
  return `<button class="payall wait" data-act="openConfirm"><span class="pa-ic">${ICONS.clock}</span><span class="pa-t"><b>Zahlungen bestätigen${idot('zahlungen')}</b><small>${ids.length} ${ids.length===1?'Spieler hat':'Spieler haben'} bezahlt gemeldet · ${eur(sum)}</small></span>${I('chevR').replace('class="ico"','class="ico chev"')}</button>`;
}
function kwCard(){
  const open=zOpen(),ready=!!(S.settings.paypal||S.settings.iban),zl=zAll();
  return `<div class="kwcard"><div><b>Kassenwart</b> <span>${open?`Zahltag läuft bis ${esc(dtDE(zt().endsAt))}.`:'Starte den Zahltag – er schließt sich nach genau 7 Tagen von selbst.'}</span></div>
    ${open?`<button class="btn danger" data-act="endZahltag">${S.confirmEnd?'Wirklich beenden? (ohne Strafen)':'Zahltag vorzeitig beenden'}</button>`
    :`<button class="btn primary" data-act="startZahltag" ${ready&&S.canWrite===true?'':'disabled'}>Zahltag starten (7 Tage)</button>`}
    ${zl.length?`<button class="btn block" data-act="openZR" data-id="${esc(zl[0].runId||zl[0].id)}">${open?'Zwischenstand ansehen':'Rückblick auf den letzten Zahltag'}</button>`:''}</div>`;
}
function meLine(){
  if(!S.me)return '';const p=pById(myPid());
  return `<p class="me">Angemeldet als <b>${esc(p?p.name:S.email||'')}</b>${rolesOf(S.me).map(r=>`<span class="tag">${esc(roleName(r))}</span>`).join('')}<button class="chipbtn" data-act="logout">${I('logout')}Abmelden</button></p>`;
}

function kontenSeg(){return `<div class="toolbar" style="margin-top:0"><div class="seg full" role="group" aria-label="Ansicht">${[['personen','Personen'],['verlauf','Verlauf'],['statistik','Statistik']].map(([k,l])=>`<button data-act="kview" data-k="${k}" aria-pressed="${S.kview===k}">${l}</button>`).join('')}</div></div>`}

/* ---------- Übersicht (wie die MaKa-Tabelle) ---------- */
function periods(){
  const set=new Set([today().slice(0,7)]);
  for(const e of S.entries)if(e.date)set.add(e.date.slice(0,7));
  for(const b of S.bills)if(b.date)set.add(b.date.slice(0,7));
  return [...set].sort();
}
// Zahlen für eine Monats- oder Saisonübersicht (Übersicht, PDF und Excel nutzen dieselbe Rechnung)
function reportData(m){
  const rows=[];const tot={beitrag:0,strafen:0,fussball:0,bier:0,sonder:0,aus:0,gut:0,sum:0};
  const ent=S.entries.filter(e=>inPeriod(e.date,m)),bills=S.bills.filter(b=>inPeriod(b.date,m));
  for(const p of sortedPlayers(true)){
    const r={p,beitrag:0,strafen:0,fussball:0,bier:0,sonder:0,gut:0,open:0,n:0};
    for(const e of ent)if(e.playerId===p.id){r[colOf(e)]+=e.amount||0;r.n++;if(!e.paid)r.open+=e.amount||0}
    for(const b of bills)if(b.kind!=='einzahlung'&&b.paidBy===p.id)r.gut+=b.amount||0;
    r.aus=r.beitrag+r.strafen+r.fussball+r.bier+r.sonder;r.sum=r.aus-r.gut;
    if(p.role!=='Spieler'&&!r.aus&&!r.gut)continue;
    if(p.active===false&&!r.aus&&!r.gut)continue;
    rows.push(r);for(const k in tot)tot[k]+=r[k]||0;
  }
  const einnahmen=tot.aus,ausgaben=bills.filter(isCost).reduce((s,b)=>s+(b.amount||0),0),
        sonderein=bills.filter(b=>b.kind==='einzahlung').reduce((s,b)=>s+(b.amount||0),0),netto=einnahmen-ausgaben+sonderein;
  return{rows,tot,ent,bills,einnahmen,ausgaben,sonderein,netto};
}
function uebersicht(){
  if(S.status==='loading')return {top:'',bottom:''};
  const ps=periods(),m=S.month;const idx=m==='saison'?ps.length:ps.indexOf(m);
  let h=`<div class="monthbar"><button class="iconbtn round" data-act="month" data-d="-1" aria-label="Vorheriger Monat" ${idx<=0?'disabled':''}>${I('chevL')}</button><h2>${esc(monthName(m))}</h2><button class="iconbtn round" data-act="month" data-d="1" aria-label="Nächster Monat" ${m==='saison'?'disabled':''}>${I('chevR')}</button></div>`;
  const {rows,tot,ent,bills,einnahmen,ausgaben,sonderein,netto}=reportData(m);
  h+=`<div class="kpis"><div class="kpi in"><span>Einnahmen</span><b class="num">${eur(einnahmen)}</b></div><div class="kpi out"><span>Ausgaben</span><b class="num">${eur(ausgaben)}</b></div><div class="kpi"><span>Sondereinzahlungen</span><b class="num">${eur(sonderein)}</b></div><div class="kpi net"><span>Netto</span><b class="num">${eur(netto)}</b></div></div>`;
  const top=h;h='';
  // Kostenliste
  const byCat={};for(const b of bills)if(isCost(b))byCat[b.cat||'Sonstiges']=(byCat[b.cat||'Sonstiges']||0)+(b.amount||0);
  const cats=Object.entries(byCat).sort((a,b)=>b[1]-a[1]);const max=Math.max(1,...cats.map(x=>x[1]));
  h+=`<h2 class="section-h">Kostenliste · Ausgaben des Teams</h2>`;
  h+=cats.length?`<div class="costs">`+cats.map(([k,v])=>`<div class="cost" title="${esc(k)}: ${eur(v)} (${Math.round(v/ausgaben*100)} %)"><span class="lbl">${esc(k)}</span><span class="bar"><i style="width:${(v/max*100).toFixed(1)}%"></i></span><span class="val">${eur(v)}<small>${Math.round(v/ausgaben*100)} %</small></span></div>`).join('')+
    `<div class="cost total"><b>Gesamt</b><b class="val">${eur(ausgaben)}</b></div></div>`
    :`<div class="empty">Keine Rechnungen in diesem Zeitraum. Unter „Rechnungen“ kannst du Ausgaben wie Bier, Duschdas oder Tickets eintragen.</div>`;
  h+=`<div class="toolbar" style="margin-top:16px"><button class="btn block" data-act="copyMonth">Übersicht für die Gruppe kopieren</button></div>`;
  S._lastOverview={rows,tot,einnahmen,ausgaben,sonderein,netto,cats};
  return {top,bottom:h};
}

/* ---------- Anzeigen ---------- */
// Jeder kann jemanden mit Foto und vorgeschlagener Strafe anzeigen; der Kassenwart trägt die Strafe ein oder lehnt ab.
const fotoGeteilt=a=>(S.anzeigen||[]).some(x=>x.id!==a.id&&x.path===a.path); // mehrere Angezeigte teilen sich ein Foto
const anzOpen=()=>(S.anzeigen||[]).filter(a=>(a.status||'neu')==='neu').sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
function anzRow(a){const p=pById(a.playerId),by=pById(a.by);
  return `<div class="row tap" role="button" tabindex="0" data-act="anzView" data-id="${esc(a.id)}">${a.path?`<img class="rthumb" data-bucket="anzeigen" data-path="${esc(a.path)}" alt="Foto">`:avatar(p)}<div class="m"><b>${S.dots?.has('anz')&&a.createdAt>seenAt('anz')?idot('anz',1):''}${esc((a.nr?'#'+a.nr+' ':'')+(p?p.name:'Unbekannt')+': '+(a.title||''))}</b><i>${esc('von '+(by?by.name:'?')+' · '+dDE(String(a.createdAt).slice(0,10))+' · '+(a.qty?a.qty+' '+(a.unit||'')+' · ':'')+eur(a.amount||0))}</i></div>${I('chevR').replace('class="ico"','class="ico chev"')}</div>`}
function anzeigenBlock(){if(S.status==='loading')return '';
  const open=anzOpen(); // alle sehen die offenen Anzeigen (keine doppelten), bestätigen darf nur der Kassenwart
  let h=`<button class="btn primary" style="width:100%;margin:0 0 12px" data-act="anzNew">${I('camera')}Anzeige erstatten</button>`;
  if(open.length)h+=`<h2 class="section-h" style="margin-top:0">Offene Anzeigen · ${open.length}${idot('anz')}</h2><div class="rows" style="margin-bottom:14px">${open.map(anzRow).join('')}</div>`;
  return h}
// anzeigen kann man jede Strafe aus dem Katalog (sortiert wie der Katalog)
const anzFines=()=>[...S.fines].sort((a,b)=>{const ia=CAT_ORDER.indexOf(a.cat),ib=CAT_ORDER.indexOf(b.cat);return (ia<0?99:ia)-(ib<0?99:ib)||(a.order??0)-(b.order??0)});
// Strafen mit Preis pro Einheit (z. B. Minuten Verspätung): die Menge je angezeigter Person eingeben
const anzQty0=f=>f.base?0:1;
const anzAmt=(f,n)=>Math.round(((f.base||0)+(f.per||0)*n)*100)/100;
function anzQtyRows(s,f,ps){const u=f.unit||'Stück';
  return `<h3 class="section-h">${esc(u)} pro Person</h3><div class="rows" style="margin-bottom:12px">`+ps.map(p=>{const n=s.counts?.[p.id]??anzQty0(f);
    return `<div class="row dq">${avatar(p)}<div class="m"><b>${esc(p.name)}</b><i class="anzsum" data-pid="${esc(p.id)}">${eur(anzAmt(f,n))}</i></div><div class="stepper"><button data-act="anzqty" data-pid="${esc(p.id)}" data-d="-1" aria-label="Weniger ${esc(u)} für ${esc(p.name)}">${I('minus')}</button><input class="dqin anzqin" inputmode="numeric" data-pid="${esc(p.id)}" value="${n}" aria-label="${esc(u)} von ${esc(p.name)}"><button data-act="anzqty" data-pid="${esc(p.id)}" data-d="1" aria-label="Mehr ${esc(u)} für ${esc(p.name)}">${I('plus')}</button></div></div>`}).join('')+`</div>`}
function anzQtySet(pid,n){const s=S.sheet,f=S.fines.find(x=>x.id===s.fid);if(!f)return;(s.counts??={})[pid]=n;
  const inp=document.querySelector(`.anzqin[data-pid="${CSS.escape(pid)}"]`);if(inp&&document.activeElement!==inp)inp.value=n;
  const sum=document.querySelector(`.anzsum[data-pid="${CSS.escape(pid)}"]`);if(sum)sum.textContent=eur(anzAmt(f,n))}
// Anzeige in drei Schritten: Wen? (ein oder mehrere Spieler, auch man selbst; Suche nach Nummer) → Welche Strafe? (ganzer Katalog) → Details mit Foto
function anzNewSheet(s){const ps=(s.pids||[]).map(pById).filter(Boolean),f=S.fines.find(x=>x.id===s.fid),step=!s.wer||!ps.length?'wer':!f?'was':'details',me=myPid();
  const who=ps.length?`<div class="row" style="margin-bottom:10px">${avatar(ps[0])}<div class="m"><b class="wrapb">${esc(ps.map(p=>p.id===me?p.name+' (du)':p.name).join(', '))}</b><i>${ps.length>1?ps.length+' Personen':ps[0].number!=null?'#'+ps[0].number:''}</i></div><button class="chipbtn" data-act="anzStep" data-k="wer">ändern</button></div>`:'';
  const foto=`<label class="btn filebtn" for="anfile">${I('camera')}${s.blob?'Anderes Foto wählen':'Foto aufnehmen oder auswählen'}</label><input id="anfile" type="file" accept="image/*" hidden>${s.preview?`<img class="rbig" src="${esc(s.preview)}" alt="Vorschau" ${step==='wer'?'style="max-height:160px;object-fit:cover"':''}>`:''}`;
  if(step==='wer'){const sel=new Set(s.pids||[]);
    return{head:`<h2>Anzeige erstatten</h2><p>Foto hinzufügen und antippen, wen du anzeigst – auch mehrere oder dich selbst</p>`,
    body:`<div class="fields" style="margin-bottom:14px">${foto}</div>
      <label class="search" style="margin:0 0 12px">${I('search')}<input id="annr" type="search" inputmode="numeric" pattern="[0-9]*" autocomplete="off" placeholder="Nummer suchen (z. B. von der Flasche)" aria-label="Nummer suchen"></label>
      <div style="min-height:100dvh"><div class="grid" id="anzgrid">${sortedPlayers(false).map(x=>`<button class="pick" data-act="anzPick" data-id="${esc(x.id)}" data-no="${x.number??''}" aria-pressed="${sel.has(x.id)}">${x.number!=null?`<span class="no">${x.number}</span>`:''}${avatar(x)}<b>${esc(x.name.split(' ')[0])}</b><small>${esc(x.id===me?'du':x.name.split(' ').slice(1).join(' '))}</small></button>`).join('')}</div>
      <div class="empty" id="anznone" hidden>Niemand mit dieser Nummer.</div></div>`,
    foot:`<button class="btn primary" data-act="anzWeiter" ${sel.size?'':'disabled'}>${sel.size?`Weiter mit ${sel.size} ${sel.size===1?'Person':'Personen'}`:'Person(en) antippen'}</button>`}}
  if(step==='was'){const fs=anzFines(),groups={};for(const x of fs)(groups[x.cat||'Sonstiges']??=[]).push(x);
    return{head:`<h2>Anzeige erstatten</h2><p>Welche Strafe?</p>`,
      body:who+`<label class="search" style="margin:0 0 12px">${I('search')}<input id="anq" type="search" autocomplete="off" placeholder="Strafe suchen" aria-label="Strafe suchen"></label><div id="anzfines">`
        +Object.entries(groups).map(([c,l])=>`<div class="anzg"><h2 class="section-h">${esc(c)}</h2><div class="fines">${l.map(x=>`<button class="fine" data-act="anzFine" data-id="${esc(x.id)}" data-q="${esc((x.title+' '+(x.hint||'')+' '+c).toLowerCase())}"><span class="t"><b>${esc(x.title)}</b>${x.hint?`<i>${esc(x.hint)}</i>`:''}</span><span class="price">${esc(priceLabel(x))}</span>${I('chevR').replace('class="ico"','class="ico chev"')}</button>`).join('')}</div></div>`).join('')+`</div>`,foot:''}}
  return{head:`<h2>Anzeige erstatten</h2><p>Was ist passiert?</p>`,
    body:who+`<div class="row" style="margin-bottom:12px"><div class="m"><b>${esc(f.title)}</b><i>${esc(priceLabel(f))}</i></div><button class="chipbtn" data-act="anzStep" data-k="was">ändern</button></div>
      ${f.per?anzQtyRows(s,f,ps):''}
      <div class="fields"><div class="field"><label for="ann">Beschreibung (optional)</label><input id="ann" maxlength="200" value="${esc(s.note||'')}" placeholder="z. B. Matte nach dem Training liegen gelassen"></div>
      ${foto}</div>`,
    foot:`<button class="btn primary" id="ansave" data-act="anzSave">${ps.length>1?`${ps.length} Anzeigen abschicken`:'Anzeige abschicken'}</button>`}}
function anzViewSheet(s){const a=(S.anzeigen||[]).find(x=>x.id===s.id);if(!a)return{head:'<h2>Anzeige</h2>',body:'<div class="empty">Diese Anzeige gibt es nicht mehr.</div>',foot:''};
  const p=pById(a.playerId),by=pById(a.by),kw=S.canWrite===true,open=(a.status||'neu')==='neu';
  return{head:`<h2>${esc((p?p.name:'Unbekannt')+': '+(a.title||''))}</h2><p>${esc('Angezeigt von '+(by?by.name:'?')+' am '+dDE(String(a.createdAt).slice(0,10)))}</p>`,
    body:(a.qty?`<div class="row" style="margin-bottom:12px"><div class="m"><b>${esc(a.unit||'Menge')}</b></div><div class="r"><strong class="num" style="font-size:22px">${esc(a.qty)}</strong></div></div>`:'')+(a.nr?`<div class="row" style="margin-bottom:12px"><div class="m"><b>Gesuchte Nummer</b></div><div class="r"><strong class="num" style="font-size:22px">#${esc(a.nr)}</strong></div></div>`:'')+(a.path?`<img class="rbig" data-bucket="anzeigen" data-path="${esc(a.path)}" alt="Foto zur Anzeige">`:'<p class="note">Kein Foto.</p>')+(a.note?`<p style="margin:12px 4px 0">${esc(a.note)}</p>`:'')
      +(kw&&open?`<div class="field" style="margin-top:14px"><label for="ana">Betrag (€)</label><input id="ana" inputmode="decimal" value="${esc(String(a.amount||0).replace('.',','))}"></div>`:`<p class="note" style="margin-top:12px">${open?'Wartet auf den Kassenwart.':a.status==='ok'?'Strafe eingetragen.':'Abgelehnt.'}</p>`),
    foot:kw&&open?`<div class="split"><button class="btn danger" data-act="anzNo" data-id="${esc(a.id)}">${S.confirmDel==='an'+a.id?'Wirklich ablehnen?':'Ablehnen'}</button><button class="btn primary" id="anok" data-act="anzOk" data-id="${esc(a.id)}">Strafe eintragen</button></div>`
      :(open&&a.uid===S.uid?`<button class="btn danger" data-act="anzDel" data-id="${esc(a.id)}">${S.confirmDel==='ad'+a.id?'Wirklich zurückziehen?':'Anzeige zurückziehen'}</button>`:'')}}
async function anzSave(el){const s=S.sheet,pids=(s.pids||[]).filter(pById),f=S.fines.find(x=>x.id===s.fid);
  if(!pids.length){toast('Bitte antippen, wen du anzeigst');return}if(!f){toast('Bitte eine Strafe auswählen');return}
  if(f.per&&!f.base){const z=pids.find(p=>!((s.counts?.[p]??anzQty0(f))>0));if(z){toast(`Bitte ${f.unit||'Stück'} für ${pById(z)?.name.split(' ')[0]||'alle'} eingeben`);return}}
  el.disabled=true;let path=null;
  try{
    if(s.blob){path=`${S.uid}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}.${({'image/png':'png','image/webp':'webp'})[s.blob.type]||'jpg'}`;
      const up=await S.sb.storage.from('anzeigen').upload(path,s.blob,{contentType:s.blob.type||'image/jpeg'});if(up.error)throw up.error}
    const base={uid:S.uid,by:myPid(),nr:s.nr||null,fineId:f.id,title:f.title,note:$('#ann').value.trim()||null,path,status:'neu',createdAt:new Date().toISOString()};let n=0;
    try{for(const pid of pids){const q=f.per?(s.counts?.[pid]??anzQty0(f)):null; // Menge (z. B. Minuten) je Person
      await S.db.doc('anzeigen/a'+Date.now().toString(36)+Math.random().toString(36).slice(2,5)).set({...base,playerId:pid,amount:f.per?anzAmt(f,q):(f.base||0),...(f.per?{qty:q,unit:f.unit||'Stück'}:{})});n++}} // eine Anzeige pro Person, gemeinsames Foto
    catch(e){if(path&&!n)try{await S.sb.storage.from('anzeigen').remove([path])}catch(_){}if(!n)throw e;toast(`Nur ${n} von ${pids.length} Anzeigen gespeichert: ${errMsg(e)}`);closeSheet();render();return}
    closeSheet();render();toast(n>1?`${n} Anzeigen abgeschickt – der Kassenwart prüft sie`:'Anzeige abgeschickt – der Kassenwart prüft sie'); // neu zeichnen: die Liste kam eventuell, als das Fenster noch offen war
  }catch(e){el.disabled=false;toast(errMsg(e))}}
// Kassenwart: Strafe aus der Anzeige eintragen (wie beim normalen Eintragen) und die Anzeige als erledigt markieren
async function anzOk(el,a){const f=S.fines.find(x=>x.id===a.fineId)||{},amount=Math.round(num($('#ana').value)*100)/100,by=pById(a.by),now=new Date().toISOString(),eid='anz-'+a.id;
  if(!(amount>=0)){toast('Bitte einen Betrag eingeben');return}el.disabled=true;
  try{await S.db.doc('entries/'+eid).set({playerId:a.playerId,fineId:a.fineId||null,title:a.title,amount,qty:a.qty??null,unit:a.qty?a.unit||null:null,col:f.col||COL_BY_FINE[a.fineId]||'strafen',spieltag:false,kabinenfest:!!f.kabinenfest,kfDone:false,
      note:'Anzeige von '+(by?by.name:'?')+(a.nr?' (Nummer '+a.nr+')':'')+(a.note?': '+a.note:''),date:String(a.createdAt).slice(0,10),createdAt:now,createdBy:S.uid||null,paid:false,paidAt:null,anzeige:a.id});
    await S.db.doc('anzeigen/'+a.id).update({status:'ok',entryId:eid,doneAt:now});closeSheet();toast('Strafe eingetragen')}
  catch(e){el.disabled=false;toast(errMsg(e))}}

/* ---------- Rechnungen ---------- */
function receiptsBlock(){
  const open=[...S.receipts].filter(r=>r.status!=='verbucht').sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  let h=`<button class="btn" style="width:100%;margin:0 0 14px" data-act="newReceipt">${I('camera')}Beleg hochladen</button>`;
  if(!open.length)return h;
  return h+`<h2 class="section-h" style="margin-top:4px">Eingereichte Belege · ${open.length}</h2><div class="rows" style="margin-bottom:6px">`+open.map(r=>{const p=pById(r.playerId);
    return `<div class="row tap" role="button" tabindex="0" data-act="viewReceipt" data-id="${esc(r.id)}"><img class="rthumb" data-path="${esc(r.path)}" alt="Beleg"><div class="m"><b>${isNewAt('rechnungen',r.createdAt,r.uid)?idot('rechnungen',1):''}${esc(p?p.name:'Unbekannt')}</b><i>${esc(dDE(r.date)+(r.amount?' · '+eur(r.amount):'')+(r.note?' · '+r.note:''))}</i></div>${I('chevR').replace('class="ico"','class="ico chev"')}</div>`}).join('')+`</div>`;
}
async function hydrateImgs(){
  const els=[...document.querySelectorAll('img[data-path]:not([src])')];if(!els.length||!S.sb)return;
  const key=e=>(e.dataset.bucket||'belege')+':'+e.dataset.path,fresh=k=>S.rcUrls[k]&&S.rcUrls[k].exp>Date.now();
  if(S.rcFailAt&&Date.now()-S.rcFailAt<30000&&els.every(e=>!fresh(key(e))))return;
  const need={};for(const e of els)if(!fresh(key(e)))(need[e.dataset.bucket||'belege']??=new Set()).add(e.dataset.path);
  await Promise.all(Object.entries(need).map(async([b,ps])=>{try{const {data,error}=await S.sb.storage.from(b).createSignedUrls([...ps],3600);if(error)throw error;S.rcFailAt=0;(data||[]).forEach(d=>{if(d.signedUrl)S.rcUrls[b+':'+d.path]={u:d.signedUrl,exp:Date.now()+3500e3}})}catch(e){S.rcFailAt=Date.now()}}));
  els.forEach(e=>{const c=S.rcUrls[key(e)];if(c)e.src=c.u});
}
// Eingaben im Personen-Fenster merken, bevor es für die Foto-Vorschau neu aufgebaut wird
function keepPlayer(){const p=S.sheet.player;p.name=$('#pn').value;p.role=$('#pr').value;p.number=$('#pno').value;p.active=$('#pa').checked}
async function shrinkImage(file,max=1600){
  try{const bmp=await createImageBitmap(file);const k=Math.min(1,max/Math.max(bmp.width,bmp.height));const c=document.createElement('canvas');c.width=Math.round(bmp.width*k);c.height=Math.round(bmp.height*k);
    c.getContext('2d').drawImage(bmp,0,0,c.width,c.height);const b=await new Promise(r=>c.toBlob(r,'image/jpeg',.82));if(b)return b}catch(e){}
  return /^image\/(jpeg|png|webp)$/.test(file.type)&&file.size<=5*1024*1024?file:null;
}
function rcBack(s){const b=s&&s.back;if(b)openSheet(b);else closeSheet()}
async function saveReceipt(){
  const s=S.sheet;if(!s||!s.blob||s.busy||!S.sb)return;s.busy=true;const btn=$('#rcsave');if(btn)btn.disabled=true;
  const path=`${S.uid}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}.${({'image/png':'png','image/webp':'webp'})[s.blob.type]||'jpg'}`;
  try{
    const up=await S.sb.storage.from('belege').upload(path,s.blob,{contentType:s.blob.type||'image/jpeg'});if(up.error)throw up.error;
    const amt=Math.round(num($('#rca').value)*100)/100;
    try{await S.db.doc('receipts/r'+Date.now().toString(36)+Math.random().toString(36).slice(2,5)).set({path,uid:S.uid,playerId:myPid(),note:$('#rcn').value.trim()||null,amount:amt>0?amt:null,date:$('#rcd').value||today(),createdAt:new Date().toISOString(),status:'neu'})}
    catch(e){try{await S.sb.storage.from('belege').remove([path])}catch(_){}throw e}
    closeSheet();toast('Beleg hochgeladen – der Kassenwart sieht ihn jetzt');
  }catch(e){s.busy=false;if(btn)btn.disabled=false;toast(errMsg(e))}
}
async function saveEntry(){
  const s=S.sheet,e=S.entries.find(x=>x.id===s.id);if(!e)return;
  const raw=$('#ea').value.trim();
  const n={playerId:$('#ep').value,title:$('#et').value.trim()||e.title,amount:Math.round(num(raw)*100)/100,date:$('#ed').value||e.date,note:$('#en').value.trim()};
  if(!raw||!isFinite(parseFloat(raw.replace(',','.')))||n.amount<0){toast('Bitte einen gültigen Betrag eingeben');return}
  const nm=id=>pById(id)?.name||'?',c=[];
  if(n.playerId!==e.playerId)c.push(`Person: ${nm(e.playerId)} → ${nm(n.playerId)}`);
  if(n.title!==e.title)c.push(`Bezeichnung: „${e.title}“ → „${n.title}“`);
  if(n.amount!==e.amount)c.push(`Betrag: ${eur(e.amount)} → ${eur(n.amount)}`);
  if(n.date!==e.date)c.push(`Datum: ${dDE(e.date)} → ${dDE(n.date)}`);
  if(n.note!==(e.note||''))c.push(`Notiz: „${e.note||''}“ → „${n.note}“`);
  if(!c.length){rcBack(s);return}
  const by=pById(myPid())?.name||S.email||'Unbekannt';
  const reset=e.reported&&!e.paid&&(n.playerId!==e.playerId||n.amount!==e.amount);
  if(reset)c.push('Zahlungsmeldung zurückgesetzt');
  await setEntry(e.id,{...n,...(reset?{reported:false,reportedAt:null,reportedBy:null}:{}),note:n.note||null,history:[...(e.history||[]),{at:new Date().toISOString(),by,c}]});
  toast('Eintrag geändert');rcBack(s);
}
function rechnungen(){
  if(S.status==='loading')return skel();
  let h=(S.canWrite===true?`<div class="toolbar" style="margin-top:0"><button class="btn primary" data-act="editBill" data-k="ausgabe">${I('plus')}Rechnung</button><button class="btn" data-act="editBill" data-k="einzahlung">${I('plus')}Einzahlung</button></div>`:'')+receiptsBlock();
  if(!S.bills.length)return h+`<div class="empty">Noch keine Rechnungen. Trag hier Ausgaben fürs Team ein – z. B. Bier, Duschdas oder Kerb-Tickets. Wer ausgelegt hat, bekommt den Betrag als Gutschrift; auf Wunsch wird die Rechnung als Sonderausgabe auf Spieler umgelegt.</div>`;
  const list=[...S.bills].sort((a,b)=>String(b.date).localeCompare(String(a.date))||String(b.createdAt).localeCompare(String(a.createdAt)));
  let cur='';
  for(const b of list){
    const mo=String(b.date||'').slice(0,7);
    if(mo!==cur){if(cur)h+='</div>';cur=mo;const sum=list.filter(x=>String(x.date).slice(0,7)===mo&&isCost(x)).reduce((s,x)=>s+(x.amount||0),0),n=list.filter(x=>String(x.date).slice(0,7)===mo).length,closed=!!S.bClosed[mo];
      h+=`<button class="section-h mhead" data-act="bmon" data-m="${esc(mo)}" aria-expanded="${!closed}"><span>${esc(monthName(mo))} · ${eur(sum)} Ausgaben${closed?` · ${n} ${n===1?'Eintrag':'Einträge'}`:''}</span>${I('chevR').replace('class="ico"','class="ico chev"')}</button><div class="rows" ${closed?'hidden':''}>`}
    const p=b.paidBy?pById(b.paidBy):null;const ein=b.kind==='einzahlung';
    const gs=b.kind==='gutschrift';const meta=[dDE(b.date)];if(gs)meta.push('Gutschrift für '+(p?p.name:'?'));else if(!ein)meta.push(p?'ausgelegt von '+p.name:'aus der Kasse');if(b.splitIds?.length)meta.push('umgelegt auf '+b.splitIds.length+' × '+eur(b.perPerson));if(b.note)meta.push(b.note);
    const canW=S.canWrite===true;
    const tags=(ein?'<span class="tag ok">Sondereinzahlung</span>':gs?'<span class="tag">nur Gutschrift</span>':'')+(p&&b.verrechnet?'<span class="tag ok">mit Strafen verrechnet</span>':p&&b.credited>0?`<span class="tag ok">${eur(b.credited)} verrechnet · Rest ${eur(credLeft(b))}</span>`:'')+(p&&b.refunded&&!b.verrechnet?`<span class="tag ok">${b.credited>0?eur(credLeft(b))+' ':''}ausbezahlt</span>`:'');
    const inner=`${p?avatar(p):`<span class="av">${ein?ICONS.plus:ICONS.euro}</span>`}<div class="m"><b>${isNewAt('rechnungen',b.createdAt,b.createdBy)?idot('rechnungen',1):''}${esc(b.title||b.cat)}</b><i>${esc((b.title&&b.cat&&b.title!==b.cat?b.cat+' · ':'')+meta.join(' · '))}</i>${tags||b.receiptId?`<div class="tags">${tags}${b.receiptId?'<span class="tag">Beleg</span>':''}</div>`:''}</div><div class="r"><strong class="num" style="${ein?'color:var(--good)':''}">${ein?'+ ':''}${eur(b.amount)}</strong></div>`;
    h+=canW?`<div class="row tap" role="button" tabindex="0" data-act="editBill" data-id="${esc(b.id)}" aria-label="${esc((b.title||b.cat)+' bearbeiten')}">${inner}${I('chevR').replace('class="ico"','class="ico chev"')}</div>`:`<div class="row">${inner}</div>`;
  }
  return h+'</div>';
}

const kfList=()=>S.entries.filter(e=>e.kabinenfest&&!e.kfDone).sort((a,c)=>(a.kfOrder??1e9)-(c.kfOrder??1e9)||String(a.date).localeCompare(String(c.date))||String(a.createdAt||'').localeCompare(String(c.createdAt||'')));
// Kalender: Jede Woche (Mo–So) ist ein Kabinenfest dran, in der Reihenfolge der Liste „Offen“
const isoD=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
function monOf(d){const x=new Date(d.getFullYear(),d.getMonth(),d.getDate(),12);x.setDate(x.getDate()-((x.getDay()+6)%7));return x}
// Planung: Kabinenfeste mit fest gewählter Woche (kfWeek = Montag) stehen in dieser Woche.
// Alle übrigen füllen der Reihe nach (Liste „Offen“) die freien Wochen ab dieser Woche.
// „Heute“ immer nach deutscher Zeit (wie Döner und Geburtstage), auch auf Handys mit anderer Zeitzone
const bToday=()=>{const b=berlinNow().date;return new Date(+b.slice(0,4),+b.slice(5,7)-1,+b.slice(8,10),12)};
const kfFixed=e=>!!(e.kfWeek&&e.kfWeek>=isoD(monOf(bToday())));
const kfQueue=()=>kfList().filter(e=>!kfFixed(e));
function kfSchedule(){const l=kfList(),fixed=l.filter(kfFixed),queue=l.filter(e=>!kfFixed(e));
  const taken=new Set(fixed.map(e=>e.kfWeek)),out=fixed.map(e=>({e,mon:e.kfWeek}));let d=monOf(bToday());
  for(const e of queue){while(taken.has(isoD(d))){d=new Date(d);d.setDate(d.getDate()+7)}const m=isoD(d);out.push({e,mon:m});taken.add(m);d=new Date(d);d.setDate(d.getDate()+7)}
  return out.sort((a,b)=>a.mon.localeCompare(b.mon))}
function kfWeekMap(){const m={};for(const x of kfSchedule())(m[x.mon]??=[]).push(x.e);return m}
const kfThisWeek=()=>kfWeekMap()[isoD(monOf(bToday()))]||[];
const kfWho=e=>pById(e.playerId)||TEAM_ENT.find(t=>t.id===e.playerId)||null;
function kwRange(mon){const d=new Date(mon+'T12:00:00'),e=new Date(d);e.setDate(e.getDate()+6);const f=x=>`${String(x.getDate()).padStart(2,'0')}.${String(x.getMonth()+1).padStart(2,'0')}.`;return{kw:isoKw(d),range:f(d)+' – '+f(e)}}
function isoKw(d){const t=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));const n=t.getUTCDay()||7;t.setUTCDate(t.getUTCDate()+4-n);return Math.ceil(((t-Date.UTC(t.getUTCFullYear(),0,1))/864e5+1)/7)}
function kfCalendar(s){const now=bToday(),cur=s.cal||{y:now.getFullYear(),m:now.getMonth()},map=kfWeekMap(),todayIso=isoD(now),thisMon=isoD(monOf(now)),canW=canKf();
  const first=new Date(cur.y,cur.m,1,12);let d=monOf(first);const last=new Date(cur.y,cur.m+1,0,12);
  let h=`<div class="calnav"><button class="iconbtn round" data-act="kfcal" data-d="-1" aria-label="Vorheriger Monat">${I('chevL')}</button><b>${MONTHS[cur.m]} ${cur.y}</b><button class="iconbtn round" data-act="kfcal" data-d="1" aria-label="Nächster Monat">${I('chevR')}</button></div>
    <div class="cal" role="grid" aria-label="Kabinenfest-Kalender ${MONTHS[cur.m]} ${cur.y}"><div class="cal-h"></div>${['Mo','Di','Mi','Do','Fr','Sa','So'].map(x=>`<div class="cal-h">${x}</div>`).join('')}`;
  while(d<=last){const wk=isoD(d),es=map[wk]||[],has=es.length>0,isNow=wk===thisMon,add=canW&&wk>=thisMon,kw=isoKw(d);
    const tap=add?` data-act="kfAddWeek" data-id="${wk}" role="button" tabindex="0" aria-label="Kabinenfest in KW ${kw} hinzufügen"`:'';
    h+=`<div class="cal-kw ${has?'has':''} ${add?'tapw':''}"${tap}>KW ${kw}</div>`;
    for(let i=0;i<7;i++){const x=new Date(d);x.setDate(x.getDate()+i);const iso=isoD(x);h+=`<div class="cal-d ${x.getMonth()!==cur.m?'out':''} ${has?'has':''} ${isNow&&has?'now':''} ${iso===todayIso?'today':''} ${add?'tapw':''}" role="gridcell" ${add?`data-act="kfAddWeek" data-id="${wk}"`:''} ${iso===todayIso?'aria-current="date"':''}><span>${x.getDate()}</span></div>`}
    for(const e of es){const p=kfWho(e);h+=`<div class="cal-host ${isNow?'now':''}">${p&&p.team?`<span class="av">${p.id==='team-alt'?'A':'J'}</span>`:avatar(p)}<div><b>${esc(p?p.name:'Unbekannt')}${p&&!p.team?drg(p.id):''}</b><i>${isNow?'Diese Woche · ':''}${e.kfWeek?'fest eingeplant · ':''}${esc(e.kfWeek&&e.note&&!/^Eingeplant für KW/.test(e.note)?e.note:e.title)}</i></div></div>`}
    d=new Date(d);d.setDate(d.getDate()+7)}
  h+=`</div><p class="note" style="margin:10px 4px 0">${canW?'Tippe auf eine Woche, um dort ein Kabinenfest einzutragen. ':''}Ohne feste Woche verteilen sich die Kabinenfeste der Reihe nach auf die freien Wochen (Reihenfolge unter „Offen“).</p>`;
  return h}
function kfWeekAddSheet(s){const r=kwRange(s.mon),es=kfWeekMap()[s.mon]||[];
  const head=`<h2>Kabinenfest in KW ${r.kw}</h2><p>${r.range}</p>`;
  let body=es.length?`<div class="hint" style="margin-bottom:12px">In dieser Woche schon eingeplant: ${es.map(e=>esc(kfWho(e)?.name||'Unbekannt')).join(', ')}</div>`:'';
  body+=`<h3 class="section-h">Wer?</h3><div class="grid">`+TEAM_ENT.concat(sortedPlayers(false)).map(p=>p.team?`<button class="pick teampick" data-act="kfwPick" data-id="${esc(p.id)}" aria-pressed="${s.pid===p.id}"><span class="av teamav">${p.id==='team-alt'?'A':'J'}</span><b>${esc(p.name)}</b><small>Mannschaft</small><span class="ok">${ICONS.check}</span></button>`:`<button class="pick" data-act="kfwPick" data-id="${esc(p.id)}" aria-pressed="${s.pid===p.id}">${p.role==='Spieler'&&p.number!=null?`<span class="no">${p.number}</span>`:''}${avatar(p)}<b>${esc(p.name.split(' ')[0])}</b><small>${esc(p.role==='Spieler'?p.name.split(' ').slice(1).join(' '):p.role)}</small><span class="ok">${ICONS.check}</span></button>`).join('')+`</div>`;
  body+=`<div class="fields" style="margin-top:12px"><div class="field"><label for="kfwn">Grund (optional)</label><input id="kfwn" maxlength="120" value="${esc(s.note||'')}" placeholder="z. B. Aufstieg, neuer Job …"></div></div>`;
  return{head,body,foot:`<div class="split"><button class="btn" data-act="kfwBack">Abbrechen</button><button class="btn primary" data-act="kfwSave" ${s.pid?'':'disabled'}>Eintragen</button></div>`}}
/* ---------- Geburtstage ---------- */
// Tag und Monat (MM-TT) für alle sichtbar; das volle Geburtsdatum mit Jahr bleibt bei „Trikots“ (nur Kassenwart/Admin).
const validMd=v=>/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(v||'');
const isLeap=y=>y%4===0&&(y%100!==0||y%400===0);
// Tage bis zum nächsten Geburtstag (deutsche Zeit); 29.02. wird in Nicht-Schaltjahren am 28.02. gefeiert
function gbNext(md){const b=berlinNow(),y=+b.date.slice(0,4),t=b.date.slice(5);const eff=yy=>md==='02-29'&&!isLeap(yy)?'02-28':md;
  const yy=t<=eff(y)?y:y+1,m=eff(yy);
  const target=Date.UTC(yy,+m.slice(0,2)-1,+m.slice(3)),today=Date.UTC(y,+t.slice(0,2)-1,+t.slice(3));return{days:Math.round((target-today)/864e5),year:yy}}
function gbList(){const all=S.players.filter(p=>p.active!==false);const withB=[],without=[];
  for(const p of all){const md=S.gb[p.id];if(validMd(md))withB.push({p,md,...gbNext(md)});else without.push(p)}
  withB.sort((a,b)=>a.days-b.days||a.p.name.localeCompare(b.p.name));return{withB,without}}
const gbDays=n=>n===0?'🎉 Heute!':n===1?'morgen':`in ${n} Tagen`;
const mdDE=md=>md.slice(3)+'.'+md.slice(0,2)+'.';
function gbSheet(){const {withB,without}=gbList(),kw=isKW();
  const next=withB.filter(x=>x.days===withB[0]?.days);
  let body='';
  if(next.length)body+=`<div class="gbnext">${next.map(x=>`<div class="gbn">${avatar(x.p)}<div class="m"><small>${x.days===0?'Heute Geburtstag':'Nächster Geburtstag'}</small><b>${esc(x.p.name)}</b><i>${esc(mdDE(x.md))} · ${gbDays(x.days)}</i></div><span class="gbic" aria-hidden="true">🎂</span></div>`).join('')}</div>`;
  else body+=`<div class="empty">Noch keine Geburtstage eingetragen.</div>`;
  const row=(x,first)=>`<div class="row gbrow ${first?'now':''} ${kw?'tap':''}" ${kw?`data-act="gbEdit" data-id="${esc(x.p.id)}" role="button" tabindex="0"`:''}><div class="gbd"><b>${esc(mdDE(x.md))}</b></div>${avatar(x.p)}<div class="m"><b>${esc(x.p.name)}</b><i>${gbDays(x.days)}</i></div>${kw?I('chevR'):''}</div>`;
  if(withB.length)body+=`<h3 class="sub-h">Reihenfolge ab heute</h3><div class="rows">${withB.map((x,i)=>row(x,x.days===withB[0].days)).join('')}</div>`;
  if(kw&&without.length)body+=`<h3 class="sub-h">Ohne Geburtstag · ${without.length}</h3><div class="rows">${without.map(p=>`<div class="row tap" data-act="gbEdit" data-id="${esc(p.id)}" role="button" tabindex="0">${avatar(p)}<div class="m"><b>${esc(p.name)}</b><i>Geburtstag eintragen</i></div>${I('chevR')}</div>`).join('')}</div>`;
  body+=`<p class="note" style="margin:10px 4px 0">Am Geburtstag gibt es um 9 Uhr eine Benachrichtigung, und das Geburtstagskind bekommt automatisch ein Kabinenfest eingetragen.</p>`;
  return{head:`<h2>Geburtstage</h2>`,body,foot:kw?`<button class="btn primary" data-act="gbAdd">${I('plus')}Geburtstag hinzufügen</button>`:''}}
// Person auswählen (wie beim Strafen-Eintragen), danach Tag und Monat wählen
function gbPickSheet(){const ps=S.players.filter(p=>p.active!==false).sort((a,b)=>(validMd(S.gb[a.id])?1:0)-(validMd(S.gb[b.id])?1:0)||(a.number??999)-(b.number??999)||a.name.localeCompare(b.name));
  return{head:`<h2>Geburtstag hinzufügen</h2><p>Für wen?</p>`,body:`<div class="grid">`+ps.map(p=>{const md=S.gb[p.id];return `<button class="pick" data-act="gbPick" data-id="${esc(p.id)}">${p.role==='Spieler'&&p.number!=null?`<span class="no">${p.number}</span>`:''}${avatar(p)}<b>${esc(p.name.split(' ')[0])}</b><small>${validMd(md)?'🎂 '+esc(mdDE(md)):esc(p.role==='Spieler'?p.name.split(' ').slice(1).join(' '):p.role)}</small></button>`}).join('')+`</div><p class="note" style="margin:10px 4px 0">Personen ohne Geburtstag stehen vorne.</p>`,foot:''}}
function gbEditSheet(s){const p=pById(s.id);if(!p||!isKW())return gbSheet();const md=S.gb[p.id]||'';
  const dd=validMd(md)?+md.slice(3):'',mm=validMd(md)?+md.slice(0,2):'';
  return{head:`<div style="display:flex;gap:12px;align-items:center">${avatar(p)}<div><h2>${esc(p.name)}</h2><p>Geburtstag</p></div></div>`,
    body:`<div class="two"><div class="field"><label for="gbt">Tag</label><select id="gbt"><option value="">–</option>${Array.from({length:31},(_,i)=>`<option ${dd===i+1?'selected':''}>${i+1}</option>`).join('')}</select></div><div class="field"><label for="gbm">Monat</label><select id="gbm"><option value="">–</option>${MONTHS.map((m,i)=>`<option value="${i+1}" ${mm===i+1?'selected':''}>${m}</option>`).join('')}</select></div></div>`,
    foot:`<div class="split">${md?`<button class="btn danger" data-act="gbDel" data-id="${esc(p.id)}">Entfernen</button>`:`<button class="btn" data-act="gbBack">Abbrechen</button>`}<button class="btn primary" data-act="gbSave" data-id="${esc(p.id)}">Speichern</button></div>`}}
// Am Geburtstag automatisch ein Kabinenfest (feste ID je Person und Jahr). Läuft auf dem Server stündlich mit (push_tick);
// hier zusätzlich, wenn Kassenwart/Admin die App öffnet – falls der Zeitplan einmal nicht läuft.
// Merker kasse_intern/gb_done: einmal angelegt, wird es nie neu erzeugt – auch nicht, wenn es gelöscht wurde.
async function gbKfCheck(){if(!isKW()||S.status!=='ready'||!S.got.e||!S.gbLoaded||!S.gbDoneLoaded||S._gbBusy||(S._gbFailAt&&Date.now()-S._gbFailAt<300000))return;
  const b=berlinNow(),md=b.date.slice(5),y=b.date.slice(0,4);
  const due=Object.entries(S.gb).filter(([pid,v])=>v===md||(v==='02-29'&&md==='02-28'&&!isLeap(+y))).map(([pid])=>pid)
    .filter(pid=>{const p=pById(pid);return p&&p.active!==false&&!S.gbDone[pid+'-'+y]&&!S.entries.some(e=>e.id==='kf-gb-'+pid+'-'+y)});
  if(!due.length)return;S._gbBusy=true;
  try{for(const pid of due){
      await S.db.doc('entries/kf-gb-'+pid+'-'+y).set({playerId:pid,fineId:'kf-manual',title:'Geburtstag',amount:0,qty:null,unit:null,col:'strafen',spieltag:false,kabinenfest:true,kfDone:false,note:'Geburtstag am '+dDE(b.date),date:b.date,createdAt:new Date().toISOString(),createdBy:S.uid||null,paid:false,paidAt:null,auto:'geburtstag'});
      S.gbDone={...S.gbDone,[pid+'-'+y]:true};await S.db.doc('kasse_intern/gb_done').set(S.gbDone)}
    S._gbFailAt=0}
  catch(e){S._gbFailAt=Date.now()} // nicht bei jeder Aktualisierung neu versuchen, erst nach 5 Minuten
  S._gbBusy=false}
async function kfSave(ids){
  const jobs=[];ids.forEach((id,i)=>{const e=S.entries.find(x=>x.id===id);if(e&&e.kfOrder!==i*10){const prev=e.kfOrder;e.kfOrder=i*10;jobs.push(kfPatch(id,{kfOrder:i*10}).catch(err=>{e.kfOrder=prev;throw err}))}});
  const r=await Promise.allSettled(jobs),bad=r.find(x=>x.status==='rejected');
  if(bad){toast(errMsg(bad.reason));if(S.sheet&&S.sheet.type==='kf')renderSheet(false)}
}
function kontenCopy(){
  const sd=(S.schulden||[]).filter(x=>!x.done);
  return `<div class="toolbar"><button class="menuitem rechbtn" data-act="tab" data-k="rechnungen"><span class="mi-ic" aria-hidden="true">🧾</span><span class="mi-t"><b>Rechnungen${idot('rechnungen')}</b><small>Ausgaben, Einzahlungen und Belege</small></span>${I('chevR')}</button></div>`
    +(hasRole('kassenwart')?`<div class="toolbar"><button class="menuitem rechbtn" data-act="openSchulden"><span class="mi-ic" aria-hidden="true">📝</span><span class="mi-t"><b>Schulden</b><small>${sd.length?`${sd.length} offen · ${eur(sd.reduce((a,x)=>a+(x.amount||0),0))}`:'Nur für dich sichtbar'}</small></span>${I('chevR')}</button></div>`:'');
}
function kontenList(){
  const ps=sortedPlayers(false).map(p=>({p,b:balance(p.id)}));
  if(!ps.length)return `<div class="empty">Noch keine Personen im Kader.</div>`;
  const num=x=>x.p.number??999;
  if(S.ksort==='high')ps.sort((a,b)=>b.b.net-a.b.net||num(a)-num(b));
  return `<div class="people">`+ps.map(({p,b})=>`<button class="person" data-act="person" data-id="${esc(p.id)}">${avatar(p)}<span class="n"><b>${p.id===myPid()?idot('konto',1):''}${esc(p.name)}${drg(p.id)}</b><i>${b.credit?`Strafen ${eur(b.open)} − Guthaben ${eur(b.credit)}`:esc(pLabel(p))}</i>${b.net<0?`<span class="tag ok">bekommt ${eur(-b.net)}</span>`:''}${b.rep?`<span class="tag owe">Zahlung gemeldet</span>`:''}${b.kf?`<span class="tag kf">${b.kf}× Kabinenfest</span>`:''}</span><span class="amt num ${b.net>0?'pos':b.net<0?'neg':'zero'}">${netTxt(b.net)}</span></button>`).join('')+`</div>`;
}
function sortBar(){return `<div class="sortbar"><span class="k">Sortieren</span><div class="seg" role="group" aria-label="Sortierung der Konten">${[['nr','Nummer'],['high','Betrag']].map(([k,l])=>`<button data-act="ksort" data-k="${k}" aria-pressed="${S.ksort===k}">${l}</button>`).join('')}</div></div>`}
function uebersichtAll(){
  if(S.status==='loading')return skel();
  const ou=uebersicht();
  return meLine()+`<h2 class="section-h">Monatsübersicht</h2>`+ou.top+kontenCopy()+`<h2 class="section-h">Konten</h2>`+kontenSeg()+(S.kview==='verlauf'?verlauf():S.kview==='statistik'?statistik():sortBar()+kontenList())+ou.bottom;
}
function entryRow(e,withPerson,readOnly){
  const p=pById(e.playerId),canW=!readOnly&&S.canWrite===true;
  const meta=[dDE(e.date)];if(e.qty&&e.unit)meta.push(e.qty+' '+e.unit);if(e.note)meta.push(e.note);
  const tags=(e.kabinenfest?(canW?`<button class="chipbtn ${e.kfDone?'on':''}" data-act="kf" data-id="${esc(e.id)}" aria-pressed="${!!e.kfDone}">${e.kfDone?I('check')+'Kabinenfest erledigt':'Kabinenfest offen'}</button>`:`<span class="tag ${e.kfDone?'ok':'kf'}">Kabinenfest${e.kfDone?' erledigt':''}</span>`):'')
    +(e.reported&&!e.paid?'<span class="tag owe">Zahlung gemeldet</span>':'')+(e.paid&&e.paidVia==='gemeldet'?'<span class="tag">selbst gemeldet</span>':'')+(e.paid&&e.paidVia==='bestaetigt'?'<span class="tag ok">bestätigt</span>':'')+(e.paid&&e.paidVia==='guthaben'?'<span class="tag ok">mit Guthaben bezahlt</span>':'')+(e.spieltag?'<span class="tag owe">Spieltag ×2</span>':'')+(e.auto?'<span class="tag kf">automatisch</span>':'')+(e.autoFee?'<span class="tag">automatisch</span>':'');
  const lead=canW?`<button class="tick" data-act="paid" data-id="${esc(e.id)}" aria-pressed="${!!e.paid}" aria-label="${e.paid?'Als offen markieren':'Als bezahlt markieren'}"><span>${ICONS.check}</span></button>`:(withPerson?avatar(p):'');
  const del=canW?(S.confirmDel===e.id?`<button class="iconbtn warn" data-act="del" data-id="${esc(e.id)}">Löschen?</button>`:`<button class="iconbtn" data-act="del" data-id="${esc(e.id)}" aria-label="Eintrag löschen">${I('trash')}</button>`):'';
  const title=withPerson?(p?.name||'Unbekannt'):e.title, sub=(withPerson?e.title+' · ':'')+meta.join(' · ');
  return `<div class="row ${e.paid?'paid':''}">${lead}<div class="m${canW?' editable':''}" ${canW?`data-act="editEntry" data-id="${esc(e.id)}" role="button" tabindex="0" aria-label="${esc(e.title+' bearbeiten')}"`:''}><b>${esc(title)}</b><i>${esc(sub)}</i>${e.history&&e.history.length?'<span class="edtag">bearbeitet</span>':''}${tags?`<div class="tags">${tags}</div>`:''}</div><div class="r"><strong class="num">${eur(e.amount)}</strong></div>${del}</div>`;
}
/* ---------- Monatsabschluss (PDF / Excel) ---------- */
const csvCell=v=>{const t=String(v??'');return /[;"\n\r]/.test(t)?'"'+t.replace(/"/g,'""')+'"':t};
const csvText=v=>{const t=String(v??'');return /^[=+\-@\t\r]/.test(t)?"'"+t:t}
const csvNum=n=>(Math.round((Number(n)||0)*100)/100).toFixed(2).replace('.',',');
function reportMonths(){return ['saison',...periods().slice().reverse()]}
function reportCsv(m){
  const d=reportData(m),L=[],row=(...c)=>L.push(c.map(csvCell).join(';'));
  row('Dragons Kasse – Monatsabschluss',csvText(monthName(m)));row('Erstellt am',dDE(today()));L.push('');
  row('Kennzahlen');row('Einnahmen',csvNum(d.einnahmen));row('Ausgaben',csvNum(d.ausgaben));row('Sondereinzahlungen',csvNum(d.sonderein));row('Netto',csvNum(d.netto));L.push('');
  row('Personen');row('Nr.','Name','Beitrag','Strafen','Fußball','Bier','Sonderausgaben','Summe','Gutschrift','Offen');
  d.rows.filter(r=>r.aus||r.gut||r.open).forEach(r=>row(r.p.number??'',csvText(r.p.name),csvNum(r.beitrag),csvNum(r.strafen),csvNum(r.fussball),csvNum(r.bier),csvNum(r.sonder),csvNum(r.aus),csvNum(r.gut),csvNum(r.open)));
  row('','Gesamt',csvNum(d.tot.beitrag),csvNum(d.tot.strafen),csvNum(d.tot.fussball),csvNum(d.tot.bier),csvNum(d.tot.sonder),csvNum(d.tot.aus),csvNum(d.tot.gut),csvNum(d.rows.reduce((a,r)=>a+r.open,0)));L.push('');
  row('Rechnungen und Einzahlungen');row('Datum','Art','Kategorie','Titel','Bezahlt von','Betrag');
  [...d.bills].sort((a,b)=>String(a.date).localeCompare(String(b.date))).forEach(b=>{const p=b.paidBy?pById(b.paidBy):null;
    row(dDE(b.date),b.kind==='einzahlung'?'Einzahlung':b.kind==='gutschrift'?'Gutschrift':'Ausgabe',csvText(b.cat||''),csvText(b.title||''),csvText(p?p.name:(b.kind==='einzahlung'?'':'Kasse')),csvNum(b.amount))});
  return '﻿'+L.join('\r\n')+'\r\n';
}
function downloadFile(name,text,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},2000)}
function reportHtml(m){
  const d=reportData(m),k=kasseSoll(),by=pById(myPid())?.name||S.email||'';
  const byCat={};for(const b of d.bills)if(isCost(b))byCat[b.cat||'Sonstiges']=(byCat[b.cat||'Sonstiges']||0)+(b.amount||0);
  const cats=Object.entries(byCat).sort((a,b)=>b[1]-a[1]);
  const td=(v,c='')=>`<td class="${c}">${v}</td>`,n=v=>eur(v);
  const bl=[...d.bills].sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  return `<div class="rpt"><h1>Dragons Kasse</h1><p class="sub">Monatsabschluss · ${esc(monthName(m))}</p>
    <table class="kp"><tr><td><span>Einnahmen</span><b>${n(d.einnahmen)}</b></td><td><span>Ausgaben</span><b>${n(d.ausgaben)}</b></td><td><span>Sondereinzahlungen</span><b>${n(d.sonderein)}</b></td><td><span>Netto</span><b>${n(d.netto)}</b></td></tr></table>
    ${k?`<p class="note">Kassenstand laut App (Soll): <b>${n(k.soll)}</b> – Startbestand ${n(k.start)} am ${esc(dDE(k.date))}.</p>`:''}
    <h2>Einnahmen nach Art</h2><table><tr><th>Beitrag</th><th>Strafen</th><th>Fußball</th><th>Bier</th><th>Sonder</th><th>Gesamt</th></tr><tr>${[d.tot.beitrag,d.tot.strafen,d.tot.fussball,d.tot.bier,d.tot.sonder,d.tot.aus].map(v=>td(n(v),'r')).join('')}</tr></table>
    <h2>Ausgaben nach Kategorie</h2>${cats.length?`<table>${cats.map(([c,v])=>`<tr>${td(esc(c))}${td(n(v),'r')}</tr>`).join('')}<tr class="t">${td('Gesamt')}${td(n(d.ausgaben),'r')}</tr></table>`:'<p class="note">Keine Ausgaben.</p>'}
    <h2>Rechnungen und Einzahlungen</h2>${bl.length?`<table><tr><th>Datum</th><th>Titel</th><th>Kategorie</th><th>Bezahlt von</th><th>Betrag</th></tr>${bl.map(b=>{const p=b.paidBy?pById(b.paidBy):null;return `<tr>${td(esc(dDE(b.date)))}${td(esc(b.title||b.cat||''))}${td(esc(b.cat||''))}${td(esc(p?p.name:(b.kind==='einzahlung'?'–':'Kasse')))}${td((b.kind==='einzahlung'?'+ ':'')+n(b.amount),'r')}</tr>`}).join('')}</table>`:'<p class="note">Keine Rechnungen.</p>'}
    <h2>Personen</h2><table><tr><th>Name</th><th>Beitrag</th><th>Strafen</th><th>Fußball</th><th>Bier</th><th>Sonder</th><th>Gutschrift</th><th>Offen</th></tr>${d.rows.filter(r=>r.aus||r.gut||r.open).map(r=>`<tr>${td(esc((r.p.number!=null?'#'+r.p.number+' ':'')+r.p.name))}${[r.beitrag,r.strafen,r.fussball,r.bier,r.sonder].map(v=>td(v?n(v):'–','r')).join('')}${td(r.gut?n(r.gut):'–','r')}${td(r.open?n(r.open):'–','r')}</tr>`).join('')}<tr class="t">${td('Gesamt')}${[d.tot.beitrag,d.tot.strafen,d.tot.fussball,d.tot.bier,d.tot.sonder,d.tot.gut,d.rows.reduce((a,r)=>a+r.open,0)].map(v=>td(n(v),'r')).join('')}</tr></table>
    <p class="foot">Erstellt am ${esc(dDE(today()))}${by?' von '+esc(by):''} · TSG Münster Dragons, 1. Herren</p></div>`;
}
function printReport(m){
  let root=document.getElementById('printRoot');if(!root){root=document.createElement('div');root.id='printRoot';document.body.appendChild(root)}
  root.innerHTML=reportHtml(m);document.body.classList.add('printing');
  const done=()=>{document.body.classList.remove('printing');root.innerHTML='';window.removeEventListener('afterprint',done)};
  window.addEventListener('afterprint',done);
  const old=document.title;document.title=`Dragons Kasse ${monthName(m)}`;
  setTimeout(()=>{try{window.print()}catch(e){done();toast('Drucken ist hier nicht möglich')}document.title=old},50);
}
/* ---------- Saison-Statistik ---------- */
const MONEY_COLS=['strafen','fussball','bier'];
const byVal=(a,b)=>b.v-a.v||(pById(a.id).number??999)-(pById(b.id).number??999);
// Wettbewerbs-Rang (Gleichstand teilt sich den Platz); mit n nur die ersten n Plätze
function rankTop(l,n){let rk=0,prev=null;l.forEach((x,i)=>{if(x.v!==prev){rk=i+1;prev=x.v}x.rk=rk});return n?l.filter(x=>x.rk<=n):l}
// Summe aus Strafen, Fußball und Bier je Spieler in einem Monat (ohne Teams)
function monthTotals(mon){const t={};for(const e of S.entries){const p=pById(e.playerId);if(!p||p.team||String(e.date||'').slice(0,7)!==mon||!MONEY_COLS.includes(colOf(e)))continue;t[e.playerId]=(t[e.playerId]||0)+(e.amount||0)}return t}
const topIds=t=>{const mx=Math.max(0,...Object.values(t));return mx>0?Object.keys(t).filter(i=>t[i]===mx):[]};
function statistik(){
  const mo=S.smode==='monat'?curMonth():'saison',me=myPid();
  const isP=e=>{const p=pById(e.playerId);return !!p&&!p.team};
  const ent=S.entries.filter(e=>inPeriod(e.date,mo)&&isP(e)&&(e.amount||0)>0);
  const per={};for(const e of ent){const c=colOf(e);if(!MONEY_COLS.includes(c))continue;const r=per[e.playerId]??={strafen:0,fussball:0,bier:0};r[c]+=e.amount||0}
  const rankBy=(get,n=5)=>rankTop(Object.entries(per).map(([id,r])=>({id,v:r2(get(r))})).filter(x=>x.v>0).sort(byVal),n);
  const medal=r=>r===1?'🥇':r===2?'🥈':r===3?'🥉':`<span class="rk">${r}.</span>`;
  const bars=(list,fmt)=>{if(!list.length)return `<p class="note" style="margin:6px 4px">Noch keine Daten.</p>`;const mx=list[0].v;
    return `<div class="stbars">`+list.map(x=>{const p=pById(x.id);return `<div class="strow ${x.id===me?'mine':''}"><span class="md">${medal(x.rk)}</span><span class="nm">${esc(p.name)}${drg(x.id)}${x.id===me?' <span class="tag ok">du</span>':''}</span><span class="vl num">${fmt(x.v)}</span><span class="bar"><i style="width:${Math.max(4,x.v/mx*100)}%"></i></span></div>`}).join('')+`</div>`};
  const card=(t,sub,body)=>`<div class="stcard"><h3>${t}</h3>${sub?`<p class="note">${sub}</p>`:''}${body}</div>`;
  // Kabinenfeste
  const kf={};for(const e of S.entries)if(e.kabinenfest&&inPeriod(e.date,mo)&&isP(e))kf[e.playerId]=(kf[e.playerId]||0)+1;
  const kfl=rankTop(Object.entries(kf).map(([id,v])=>({id,v})).sort(byVal),5);
  // Drachen-Titel: wer hat in einem abgeschlossenen Monat am meisten gezahlt
  const titles={};if(mo==='saison')for(const m of periods().filter(m=>m<curMonth()))for(const id of topIds(monthTotals(m)))titles[id]=(titles[id]||0)+1;
  const tl=rankTop(Object.entries(titles).map(([id,v])=>({id,v})).sort(byVal));
  const money=ent.filter(e=>MONEY_COLS.includes(colOf(e)));
  // Anzeigenhauptmeister: wer am meisten bestätigte Anzeigen erstattet hat, Zahlen aus anzeigen_rangliste()
  const az={};for(const r of S.anzRank||[])if(pById(r.pid)&&inPeriod(r.mon+'-01',mo))az[r.pid]=(az[r.pid]||0)+r.n;
  const azl=rankTop(Object.entries(az).map(([id,v])=>({id,v})).sort(byVal),5);
  let h=`<div class="toolbar" style="margin-top:0"><div class="seg full" role="group" aria-label="Zeitraum">${[['saison','Saison 26/27'],['monat',monthName(curMonth())]].map(([k,l])=>`<button data-act="smode" data-k="${k}" aria-pressed="${S.smode===k}">${esc(l)}</button>`).join('')}</div></div>`;
  if(!money.length&&!kfl.length&&!azl.length)return h+`<div class="empty">Für diesen Zeitraum gibt es noch keine Strafen.</div>`;
  h+=card('Größte Zahler','Strafen, Fußball und Bier zusammen – der Erste wird im nächsten Monat zum 🐲',bars(rankBy(r=>r.strafen+r.fussball+r.bier),eur));
  h+=card('Meiste Strafen','Nur Spalte „Strafen“',bars(rankBy(r=>r.strafen),eur));
  h+=card('Fußball an der Decke',null,bars(rankBy(r=>r.fussball),eur));
  h+=card('Bier',null,bars(rankBy(r=>r.bier),eur));
  if(kfl.length)h+=card('Kabinenfeste','Wer wie oft eines aufgebrummt bekommen hat',bars(kfl,v=>v+'×'));
  if(azl.length)h+=card('Anzeigenhauptmeister 👮','Wer die meisten Anzeigen erstattet hat – es zählen nur vom Kassenwart bestätigte',bars(azl,v=>v+(v===1?' Anzeige':' Anzeigen')));
  if(mo==='saison'&&tl.length)h+=card('Drachen-Titel','Monate, in denen jemand am meisten gezahlt hat',bars(tl.filter(x=>x.rk<=5),v=>v+'×'));
  return h;
}
function verlauf(){
  if(S.status==='loading')return skel();
  const list=S.entries;
  if(!list.length)return `<div class="empty">Noch keine Strafen eingetragen. Tippe unter „Eintragen“ auf eine Strafe und wähle die Person.</div>`;
  const kw=isKW(),swipeRow=e=>`<div class="swipe${S.confirmDel===e.id?' open':''}"><div class="swipe-act"><button data-act="del" data-id="${esc(e.id)}">${S.confirmDel===e.id?'Wirklich löschen?':'Löschen'}</button></div><div class="swipe-in">${entryRow(e,true,true)}</div></div>`;
  return `<div class="rows">`+list.slice(0,300).map(e=>kw?swipeRow(e):entryRow(e,true,true)).join('')+`</div>`;
}
const curMonth=()=>today().slice(0,7);
/* Drache des Monats: wer im Vormonat am meisten (Strafen, Fußball, Bier) bezahlt hat, trägt im aktuellen Monat 🐲 hinter dem Namen. Bei Gleichstand alle. */
let _drg={src:null,cm:null,v:new Set()};
function dragons(){const cm=curMonth(),y=+cm.slice(0,4),m=+cm.slice(5,7),pm=m===1?`${y-1}-12`:`${y}-${String(m-1).padStart(2,'0')}`;
  if(_drg.src===S.entries&&_drg.cm===cm)return _drg;
  _drg={src:S.entries,cm,pm,v:new Set(topIds(monthTotals(pm)))};return _drg}
const drg=id=>dragons().v.has(id)?' <span class="drg" role="img" aria-label="Drache des Monats" title="Drache des Monats">🐲</span>':'';
function verwalten(){
  if(S.status==='loading')return skel();
  return S.canEdit?verwaltenAdmin():'';
}
// Ausklappbare Kachel (merkt sich offen/zu in S.mOpen, siehe toggle-Handler)
const tile=(key,icon,title,sub,body)=>`<details class="vtile" data-key="${key}" ${S.mOpen[key]?'open':''}><summary class="menuitem"><span class="mi-ic" aria-hidden="true">${icon}</span><span class="mi-t"><b>${title}${idot(key)}</b><small>${esc(sub)}</small></span>${I('chevR')}</summary><div class="vt-body">${body}</div></details>`;
function verwaltenAdmin(){
  const st=S.settings,kp=pById(kwPid()),z=zt();
  const claims=S.links.filter(l=>l.playerId===kwPid());
  let h=(isKW()?kwCard():'')+`<h2 class="section-h">Bezahlen</h2><div class="stat" style="display:grid;gap:10px;padding:14px">
    <div><span class="k">PayPal</span><div style="font-weight:600;margin-top:2px">${st.paypal?esc(st.paypal):'<span class="note">noch keine Adresse hinterlegt</span>'}</div></div>
    <div><span class="k">Überweisung</span><div style="font-weight:600;margin-top:2px" class="num">${st.iban?esc(fmtIban(st.iban))+(st.owner?' · '+esc(st.owner):''):'<span class="note">keine IBAN hinterlegt</span>'}</div></div>
    <div><span class="k">Zahltag</span><div style="margin-top:4px">${zOpen()?`<span class="tag ok">läuft bis ${esc(dtDE(z.endsAt))}</span>`:z?`<span class="tag">abgelaufen am ${esc(dtDE(z.endsAt))}</span>`:'<span class="tag">aus</span>'}</div></div>
    <div class="toolbar" style="margin:0"><button class="btn block" data-act="editSettings">Zahlungsdaten bearbeiten</button></div></div>`;
  { const k=kasseSoll(),last=((S.kstand||{}).checks||[])[0];
    h+=`<h2 class="section-h">Kassenstand</h2><button class="payall kasse" data-act="openKasse"><span class="pa-ic">${ICONS.euro}</span><span class="pa-t"><b>${k?'Soll heute '+eur(k.soll):'Kassenstand einrichten'}</b><small>${k?(last?`Letzter Abgleich ${esc(dDE(last.at.slice(0,10)))}: ${r2(last.ist-last.soll)===0?'passte genau':(last.ist>last.soll?'+ ':'− ')+eur(Math.abs(r2(last.ist-last.soll)))}`:'Noch kein Abgleich – jetzt mit Konto, PayPal und Bargeld vergleichen'):'Einmal den aktuellen Bestand eintragen – danach rechnet die App mit'}</small></span>${I('chevR').replace('class="ico"','class="ico chev"')}</button>`;
    { const ms=reportMonths(),cur=ms.includes(S.rpm)?S.rpm:(periods().includes(curMonth())?curMonth():'saison');
      h+=`<h2 class="section-h">Monatsabschluss</h2><div class="stat" style="display:grid;gap:12px;padding:14px"><p class="note" style="margin:0">Einnahmen, Ausgaben, Rechnungen und alle Personen für einen Monat – als PDF (Drucken → „Als PDF sichern“) oder als Tabelle für Excel.</p>
        <div class="field" style="margin:0"><label for="rpm">Zeitraum</label><select id="rpm">${ms.map(m=>`<option value="${esc(m)}" ${m===cur?'selected':''}>${esc(monthName(m))}</option>`).join('')}</select></div>
        <div class="split"><button class="btn primary" data-act="rpPdf">Als PDF</button><button class="btn" data-act="rpCsv">Für Excel</button></div></div>`; }
    const bk=S.backup||{},ago=daysSince(bk.lastAt),warn=ago===null||ago>30;
    h+=`<h2 class="section-h">Backup</h2><div class="stat backup ${warn?'warn':''}"><p>${ago===null?'<b>Noch kein Backup.</b> ':`Letztes Backup <b>${ago===0?'heute':ago===1?'gestern':'vor '+ago+' Tagen'}</b>${bk.by?' von '+esc(bk.by):''}. `}Der kostenlose Supabase-Tarif macht keine eigenen Sicherungen – lade am besten einmal im Monat ein Backup herunter und leg es z. B. in iCloud ab.</p>
      <button class="btn block ${warn?'primary':''}" data-act="backup" ${S.busyBackup?'disabled':''}>${S.busyBackup?'Wird erstellt …':'Backup herunterladen'}</button></div>`; }
  // Rollen von Admin und Kassenwart ändert nur der Admin (die Datenbank erzwingt das ebenfalls)
  const isAdm=isAdmin(),locked=m=>!isAdm&&rolesOf(m).some(r=>r==='admin'||r==='kassenwart');
  const ms=[...S.members].sort((a,b)=>(a.approved?1:0)-(b.approved?1:0)||String(a.email).localeCompare(String(b.email)));
  const mBody=`<p class="note" style="margin-top:-2px">Nur freigeschaltete Konten sehen die Kasse. Nur der <b>Kassenwart</b> kann den Zahltag starten; Kassenwart und Admins tragen Strafen und Rechnungen ein.</p>`;
  const mList=ms.length?`<div class="rows">`+ms.map(m=>{const pp=pById(m.player_id);return `<div class="mrow">${avatar(pp)}<div class="m"><b>${esc(pp?pp.name:'– kein Spieler –')}</b><i>${esc(isNameMail(m.email)?'Name bei Anmeldung: „'+m.email.split('@')[0].replace(/\./g,' ')+'“':m.email||'')}${m.user_id===S.uid?' · du':''}</i></div><div class="r">${m.approved?`<span class="tag ok">freigeschaltet</span>`:`<span class="tag kf">wartet</span>`}</div>
    <div class="acts"><button class="mini" data-act="editRoles" data-id="${esc(m.user_id)}" ${m.user_id===S.uid||locked(m)?'disabled':''}>${esc(rolesOf(m).map(roleName).join(', ')||'Spieler')}</button>
    ${m.user_id===S.uid||locked(m)?'':`<button class="mini ${m.approved?'':'on'}" data-act="approve" data-id="${esc(m.user_id)}">${m.approved?'Sperren':'Freischalten'}</button><button class="mini ${S.confirmDel==='m'+m.user_id?'warn':''}" data-act="delMember" data-id="${esc(m.user_id)}">${S.confirmDel==='m'+m.user_id?'Wirklich entfernen?':'Entfernen'}</button>`}</div></div>`}).join('')+`</div>`
    :`<div class="empty">Noch keine Mitglieder.</div>`;
  h+=tile('vt-mitglieder','👥','Mitglieder &amp; Rollen',`${ms.length} Konten${ms.some(m=>!m.approved)?' · '+ms.filter(m=>!m.approved).length+' warten':''}`,mBody+mList);
  const fBtn=`<div class="toolbar"><button class="btn primary block" data-act="editFine" data-id="">${I('plus')}Neue Strafe</button></div>`;
  const fs=[...S.fines].sort((a,b)=>{const ia=CAT_ORDER.indexOf(a.cat),ib=CAT_ORDER.indexOf(b.cat);return (ia<0?99:ia)-(ib<0?99:ib)||(a.order??0)-(b.order??0)});
  const fList=fs.length?`<div class="fines">`+fs.map(f=>`<button class="fine" data-act="editFine" data-id="${esc(f.id)}"><span class="t"><b>${esc(f.title)}</b><i>${esc(f.cat||'Sonstiges')}</i></span><span class="price">${esc(priceLabel(f))}</span></button>`).join('')+`</div>`:`<div class="empty">Noch keine Strafen.</div>`;
  h+=tile('vt-strafen','📋','Strafenkatalog',`${fs.length} Strafen`,fBtn+fList);
  const pBtn=`<div class="toolbar"><button class="btn primary block" data-act="editPlayer" data-id="">${I('plus')}Person hinzufügen</button></div>`;
  const ps=sortedPlayers(true);
  const pList=ps.length?`<div class="people">`+ps.map(p=>`<button class="person" data-act="editPlayer" data-id="${esc(p.id)}">${avatar(p)}<span class="n"><b>${p.id===myPid()?idot('konto',1):''}${esc(p.name)}${drg(p.id)}</b><i>${esc(pLabel(p))}</i></span>${p.active===false?'<span class="tag">inaktiv</span>':''}</button>`).join('')+`</div>`:`<div class="empty">Noch niemand im Kader.</div>`;
  h+=tile('vt-kader','🏃','Kader',`${ps.length} Personen`,pBtn+pList);
  return h;
}

/* ---------- Sheets ---------- */
/* ---------- Menü: Döner & Fußball ---------- */
// Uhrzeit immer in deutscher Zeit, damit der Bestellschluss auch auf Handys mit anderer Zeitzone stimmt (die Datenbank prüft genauso)
function berlinNow(){const p={};for(const x of new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23',weekday:'short'}).formatToParts(new Date()))p[x.type]=x.value;
  return{date:`${p.year}-${p.month}-${p.day}`,h:+p.hour,wd:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(p.weekday)}}
const addDays=(d,n)=>{const x=new Date(d+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10)};
// Bestellt wird für den nächsten Dienstag (am Dienstag selbst für heute). Dienstag ab 18 Uhr ist die Liste zu. Ab Mittwoch gilt die nächste Woche, alte Bestellungen werden gelöscht.
// Eintragen nur am Dienstag selbst bis 18 Uhr (wie doener_open in schema.sql); closed = Dienstag nach 18 Uhr
function doenerWeek(){const n=berlinNow();return{tue:addDays(n.date,(2-n.wd+7)%7),open:n.wd===2&&n.h<18,closed:n.wd===2&&n.h>=18}}
const doenerList=w=>S.doener.filter(d=>d.week===w).sort((a,b)=>String(a.at).localeCompare(String(b.at)));
const fbGames=()=>S.fussball.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))||String(b.createdAt).localeCompare(String(a.createdAt)));
const TEAMS=[['jung','Team Jung'],['alt','Team Alt']];
const teamName=k=>k==='jung'?'Team Jung':'Team Alt',otherTeam=k=>k==='jung'?'alt':'jung';
// Punkte: normales Tor 1, Kopfball 2, Eigentor des Gegners 1
const FB_WIN=5;
const fbPts=(x,team)=>(x.goals||[]).filter(t=>t.team===team).reduce((a,t)=>a+(t.n||0)+2*(t.k||0),0)+((x.og||{})[team]||0);
// Runden: Wer zuerst 5 Spiele gewinnt, gewinnt die Runde. Danach geht es wieder bei 0:0 los und das Verlierer-Team bekommt ein Kabinenfest.
function fbRounds(){const asc=fbGames().reverse(),rounds=[];let cur={jung:0,alt:0},games=[];
  for(const x of asc){const w=x.jung>x.alt?'jung':x.alt>x.jung?'alt':null;games.push(x);if(!w)continue;cur[w]++;
    if(cur[w]>=FB_WIN){rounds.push({no:rounds.length+1,winner:w,loser:otherTeam(w),w:cur[w],l:cur[otherTeam(w)],endId:x.id,date:x.date,games});cur={jung:0,alt:0};games=[]}}
  return{rounds,cur,games}}
function fbStats(){const st={tore:{}};
  for(const x of fbGames())for(const t of x.goals||[]){const o=st.tore[t.pid]??={n:0,k:0,games:new Set()};o.n+=t.n||0;o.k+=t.k||0;if((t.n||0)+(t.k||0))o.games.add(x.id)}
  st.ranking=Object.entries(st.tore).map(([pid,o])=>({p:pById(pid),pid,n:o.n,k:o.k,pts:o.n+2*o.k,games:o.games.size})).filter(x=>x.pts>0)
    .sort((a,b)=>b.pts-a.pts||b.k-a.k||a.games-b.games||String(a.p?.name).localeCompare(String(b.p?.name)));
  return st}
const goalTxt=(n,k)=>[n?n+' '+(n===1?'Tor':'Tore'):'',k?k+' '+(k===1?'Kopfball':'Kopfbälle'):''].filter(Boolean).join(' + ');
function scorerTxt(x,team){const l=(x.goals||[]).filter(t=>t.team===team&&((t.n||0)+(t.k||0))).map(t=>(pById(t.pid)?.name.split(' ')[0]||'?')+' ('+goalTxt(t.n||0,t.k||0)+')');
  const og=(x.og||{})[team]||0;if(og)l.push(og+' '+(og===1?'Eigentor':'Eigentore'));return l.join(', ')}
function scoreBoard(a,b,label){const w=a>b?'jung':b>a?'alt':'';
  return `<div class="score" ${label?`aria-label="${esc(label)}"`:''}><div class="sc-t ${w==='jung'?'win':''}"><span>Team Jung</span><b class="num">${a}</b></div><span class="sc-x">:</span><div class="sc-t ${w==='alt'?'win':''}"><span>Team Alt</span><b class="num">${b}</b></div></div>`}
function gameRow(x,kw){const sj=scorerTxt(x,'jung'),sa=scorerTxt(x,'alt');
  return `<div class="row gamerow ${kw?'tap':''}" ${kw?`data-act="fbEdit" data-id="${esc(x.id)}" role="button" tabindex="0"`:''}><div class="m"><b>${esc(dDE(x.date))} · <span class="${x.jung>x.alt?'gw':''}">Jung ${x.jung}</span> : <span class="${x.alt>x.jung?'gw':''}">${x.alt} Alt</span></b>
    <i class="wrap"><span class="gt">Jung</span> ${esc(sj||'–')}</i><i class="wrap"><span class="gt">Alt</span> ${esc(sa||'–')}</i></div>${kw?I('chevR'):''}</div>`}
// Serie: die Spiele einer Runde als Kette (älteste links) plus Siege in Folge
const fbWinner=x=>x.jung>x.alt?'jung':x.alt>x.jung?'alt':null;
// Serie: die Spiele einer Runde als Kette (älteste links). Antippen öffnet das Spiel (Kassenwart/Admin: zum Bearbeiten).
function seriesChips(games){return `<div class="series" role="list">`+games.map(x=>{const w=fbWinner(x);return `<button class="sch ${w||''}" role="listitem" data-act="fbGame" data-id="${esc(x.id)}" aria-label="${esc(dDE(x.date))}: Jung ${x.jung}, Alt ${x.alt}${w?', Sieg '+teamName(w):''}"><b>${w==='jung'?'Jung':w==='alt'?'Alt':'–'}</b><small class="num">${x.jung}:${x.alt}</small></button>`}).join('')+`</div>`}
function streak(){const g=fbGames();let w=null,n=0;for(const x of g){const v=fbWinner(x);if(!v)break;if(w===null)w=v;if(v!==w)break;n++}return{w,n}}
// Torserie: in wie vielen Spielen hintereinander (vom letzten Spiel rückwärts) hat ein Spieler getroffen?
function scorerStreaks(){const g=fbGames(),out={};if(!g.length)return out;
  const hit=(x,pid)=>(x.goals||[]).some(t=>t.pid===pid&&(t.n||0)+(t.k||0)>0);
  for(const t of g[0].goals||[]){if(!((t.n||0)+(t.k||0))||out[t.pid])continue;let n=0;for(const x of g){if(!hit(x,t.pid))break;n++}if(n>=2)out[t.pid]=n}
  return out}
function fussballSheet(){
  const st=fbStats(),r=fbRounds(),kw=isKW(),sk=streak(),ss=scorerStreaks();
  const hot=Object.entries(ss).sort((a,b)=>b[1]-a[1]);
  let body=`<h3 class="sub-h" style="margin-top:0">Runde ${r.rounds.length+1} · Siege</h3>${scoreBoard(r.cur.jung,r.cur.alt,'Siege in dieser Runde: Team Jung '+r.cur.jung+', Team Alt '+r.cur.alt)}`+(kw?`<button class="btn primary fbnew" data-act="fbNew">${I('plus')}Neues Spiel eintragen</button>`:'');
  body+=`<h3 class="sub-h">Momentane Serie</h3>`+(r.games.length?seriesChips(r.games):`<div class="empty">In dieser Runde wurde noch nicht gespielt.</div>`)+
    (sk.n?`<p class="streak">${sk.n>=2?'🔥 ':''}<b>${teamName(sk.w)}</b> hat ${sk.n===1?'das letzte Spiel':'die letzten '+sk.n+' Spiele'} gewonnen</p>`:'')+
    hot.map(([pid,n])=>`<p class="streak">⚽ <b>${esc(pById(pid)?.name.split(' ')[0]||'?')}</b> trifft seit ${n} Spielen in Folge</p>`).join('');
  if(r.rounds.length)body+=`<h3 class="sub-h">Bisherige Runden</h3><div class="rows">`+r.rounds.slice().reverse().map(x=>`<div class="row tap" data-act="fbRound" data-id="${x.no}" role="button" tabindex="0"><div class="m"><b>Runde ${x.no} · ${teamName(x.winner)} gewinnt ${x.w} : ${x.l}</b><i class="wrap">${esc(dDE(x.games[0].date))} bis ${esc(dDE(x.date))} · Kabinenfest für ${teamName(x.loser)}</i></div>${I('chevR')}</div>`).join('')+`</div>`;
  body+=`<h3 class="sub-h">Torschützen</h3>`+(st.ranking.length?`<div class="rows">`+st.ranking.map((x,i)=>`<div class="row"><span class="pos">${i+1}</span>${avatar(x.p)}<div class="m"><b>${esc(x.p?x.p.name:'Unbekannt')}</b><i>${esc(goalTxt(x.n,x.k))} · ${x.games} ${x.games===1?'Spiel':'Spiele'}</i>${(x.pts===st.ranking[0].pts||ss[x.pid])?`<div class="tags">${x.pts===st.ranking[0].pts?'<span class="tag kf" role="img" aria-label="Torjäger">👑 Torjäger</span>':''}${ss[x.pid]?`<span class="tag owe">🔥 ${ss[x.pid]} Spiele in Folge getroffen</span>`:''}</div>`:''}</div><div class="r"><strong class="num">${x.pts} ${x.pts===1?'Punkt':'Punkte'}</strong></div></div>`).join('')+`</div>`:`<div class="empty">Noch keine Torschützen eingetragen.</div>`);
  body+=`<p class="note" style="margin:10px 4px 0">Punkte: Tor 1 · Kopfball 2 · Eigentor 1 für das andere Team${r.games.length?' · Ein Spiel in der Serie antippen für Details':''}</p>`;
  return{head:`<h2>Fußball</h2>`,body,foot:''}}
function fbGameSheet(s){const x=S.fussball.find(g=>g.id===s.id);
  if(!x)return{head:`<h2>Spiel</h2>`,body:`<div class="empty">Dieses Spiel gibt es nicht mehr.</div>`,foot:`<button class="btn" data-act="fbBack">Zurück</button>`};
  return{head:`<h2>Spiel vom ${esc(dDE(x.date))}</h2>`,body:scoreBoard(x.jung,x.alt)+`<h3 class="sub-h">Torschützen</h3><div class="rows">${gameRow({...x,date:x.date},false)}</div>`,foot:`<button class="btn" data-act="fbBack">${I('chevL')}Zurück</button>`}}
function fbRoundSheet(s){const x=fbRounds().rounds.find(r=>r.no===s.no),kw=isKW();
  if(!x)return{head:`<h2>Runde ${s.no}</h2>`,body:`<div class="empty">Diese Runde gibt es nicht mehr.</div>`,foot:`<button class="btn" data-act="fbBack">Zurück</button>`};
  const head=`<h2>Runde ${x.no}</h2><p>${esc(dDE(x.games[0].date))} bis ${esc(dDE(x.date))} · Kabinenfest für ${teamName(x.loser)}</p>`;
  const body=`${scoreBoard(x.winner==='jung'?x.w:x.l,x.winner==='alt'?x.w:x.l,'Siege in Runde '+x.no)}<h3 class="sub-h">Serie</h3>${seriesChips(x.games)}
    <h3 class="sub-h">Ergebnisse · ${x.games.length} ${x.games.length===1?'Spiel':'Spiele'}</h3><div class="rows">${x.games.slice().reverse().map(g=>gameRow(g,kw)).join('')}</div>`;
  return{head,body,foot:`<button class="btn" data-act="fbBack">${I('chevL')}Zurück zur Übersicht</button>`}}
function fbEditSheet(s){
  const j=fbPts(s,'jung'),a=fbPts(s,'alt');
  const head=`<h2>${s.id?'Spiel bearbeiten':'Spiel eintragen'}</h2><p>Das Ergebnis rechnet sich aus den Toren</p>`;
  const st=(act,attrs,v,label)=>`<div class="stepper sm"><button data-act="${act}" ${attrs} data-d="-1" aria-label="${esc(label)} weniger">${I('minus')}</button><output class="num">${v}</output><button data-act="${act}" ${attrs} data-d="1" aria-label="${esc(label)} mehr">${I('plus')}</button></div>`;
  let body=`<div class="fields"><div class="field"><label for="fbd">Datum</label><input id="fbd" type="date" value="${esc(s.date)}"></div></div>${scoreBoard(j,a)}`;
  if(j===a&&(j||a))body+=`<p class="note" style="margin:8px 4px 0;color:var(--danger)">Unentschieden gibt es nicht – ein Team muss vorne liegen.</p>`;
  for(const [k,l] of TEAMS){const gs=s.goals.filter(t=>t.team===k),used=new Set(gs.map(t=>t.pid));
    body+=`<h3 class="sub-h">${l} · ${fbPts(s,k)} ${fbPts(s,k)===1?'Punkt':'Punkte'}</h3><div class="rows">`+gs.map(t=>{const p=pById(t.pid),nm=p?p.name:'Unbekannt';
      return `<div class="row goalrow">${avatar(p)}<div class="m"><b>${esc(nm)}</b><div class="gsteps"><div><small>Tor · 1</small>${st('fbGoal',`data-team="${k}" data-id="${esc(t.pid)}" data-kind="n"`,t.n||0,'Tore von '+nm)}</div><div><small>Kopfball · 2</small>${st('fbGoal',`data-team="${k}" data-id="${esc(t.pid)}" data-kind="k"`,t.k||0,'Kopfbälle von '+nm)}</div></div></div></div>`}).join('')+
      `<div class="row goalrow"><span class="av">ET</span><div class="m"><b>Eigentore vom Gegner</b><div class="gsteps"><div><small>je 1 Punkt</small>${st('fbOg',`data-team="${k}"`,(s.og||{})[k]||0,'Eigentore für '+l)}</div></div></div></div></div>`+
      `<button class="btn fbaddbtn" data-act="fbPickOpen" data-team="${k}">${I('plus')}Torschützen für ${l}</button>`}
  const foot=`<div class="split">${s.id?`<button class="btn danger" data-act="fbDel">${S.confirmDel==='fb'?'Wirklich löschen?':'Löschen'}</button>`:`<button class="btn" data-act="fbBack">Abbrechen</button>`}<button class="btn primary" data-act="fbSave">Speichern</button></div>`;
  return{head,body,foot}}
function doenerSheet(s){
  const w=doenerWeek(),list=doenerList(w.tue),me=myPid(),mine=list.find(d=>d.pid===me),canTick=isDoenerwart();
  // Bezahlt wird für den letzten Dienstag (Mittwoch/Donnerstag) oder für heute, falls heute Dienstag ist
  const pw=w.tue===berlinNow().date?w.tue:addDays(w.tue,-7),plist=pw===w.tue?list:doenerList(pw),mineP=plist.find(d=>d.pid===me),po=(mineP&&!mineP.paid)?mineP:mine; // po: die Bestellung, die bezahlt wird (offene vom letzten Dienstag, sonst die aktuelle)
  const head=`<h2>Döner</h2><p>Bestellung für Dienstag, ${esc(dDE(w.tue).slice(0,6))} · ${w.open?'heute bis 18 Uhr eintragen':w.closed?'Bestellschluss vorbei':'Eintragen am Dienstag'}</p>`;
  let body='',foot='';
  if(!w.open)body+=`<div class="hint" style="margin-bottom:14px">${w.closed?'Bestellschluss war heute um 18 Uhr. Nächsten Dienstag geht es wieder.':'Eintragen geht nur am Dienstag, bis 18 Uhr. Um 12 Uhr kommt eine Erinnerung.'}</div>`;
  else if(me)body+=`<div class="fields"><div class="field"><label for="dtext">${mine?'Deine Bestellung':'Was möchtest du?'}</label><textarea id="dtext" rows="2" maxlength="200" placeholder="z. B. Döner mit allem, scharf, ohne Zwiebeln">${esc(s.draft??mine?.text??'')}</textarea></div></div>`;
  const dt=ppTarget(S.settings.doenerPaypal);
  if(po&&!po.paid&&dt){const amt=num(s.pay);body+=`<div class="paybox" style="margin-top:14px"><div class="pay-h"><span>Döner bezahlen</span></div><div class="field"><label for="dpay">Betrag (€)</label><input id="dpay" inputmode="decimal" value="${esc(s.pay||'')}" placeholder="z. B. 7,50"></div>
    <a class="btn paypal ${amt>0?'':'off'}" id="dpaylink" ${amt>0?`href="${esc(paypalUrl(amt,'',dt,'Döner Dragons – '+(pById(me)?.name||'')))}" target="_blank" rel="noopener"`:'aria-disabled="true"'}>Mit PayPal bezahlen${amt>0?' · '+eur(amt):''}</a>
    <div class="pp-addr"><span>An: <b>${esc(dt.v)}</b></span><button class="mini" data-act="copyTxt" data-v="${esc(dt.v)}">Kopieren</button></div></div>`}
  if(po&&!po.paid){body+=po.reportedAt?`<button class="btn" style="margin-top:10px;width:100%;opacity:.55" disabled>✓ Bezahlt gemeldet</button><p class="note" style="margin:6px 4px 0">Der Dönerwart hat eine Nachricht bekommen und hakt es ab.</p>`
    :`<button class="btn good" style="margin-top:10px;width:100%" data-act="doenerPaid" data-w="${esc(po.week)}">Ich habe bezahlt${S.doenerNeu?'<span class="idot" role="img" aria-label="neu"></span>':''}</button><p class="note" style="margin:6px 4px 0">Der Dönerwart bekommt eine Nachricht und hakt es ab.</p>`}
  if(po&&po.paid)body+=`<div class="hint" style="margin-top:14px">Dein Döner ist als bezahlt abgehakt. 👍</div>`;
  const tickNote=`<p class="note" style="margin:6px 4px 0">Häkchen links: Zahlung ist angekommen.</p>`;
  const ordRow=(d,canDel)=>{const p=pById(d.pid);
    return `<div class="row">${canTick?`<button class="tick" data-act="dwPaid" data-id="${esc(d.id)}" aria-pressed="${!!d.paid}" aria-label="${esc((p?p.name:'')+(d.paid?': als offen markieren':': als bezahlt markieren'))}"><span>${ICONS.check}</span></button>`:''}${avatar(p)}<div class="m"><b>${esc(p?p.name:'Unbekannt')}${d.pid===me?' <span class="tag ok">du</span>':''}${d.paid?' <span class="tag ok">bezahlt</span>':d.reportedAt?' <span class="tag">gemeldet</span>':''}</b><i class="wrap">${esc(d.text)}</i></div>${canDel?`<button class="iconbtn ${S.confirmDel==='dn'+d.id?'warn':''}" data-act="delDoener" data-id="${esc(d.id)}" aria-label="Bestellung von ${esc(p?p.name:'')} löschen">${S.confirmDel==='dn'+d.id?'Löschen?':I('trash')}</button>`:''}</div>`};
  if(pw!==w.tue&&plist.length)body+=`<h3 class="sub-h">Letzter Dienstag, ${esc(dDE(pw).slice(0,6))} · ${plist.filter(d=>d.paid).length} von ${plist.length} bezahlt</h3><div class="rows">`+plist.map(d=>ordRow(d,false)).join('')+`</div>`+(canTick?tickNote:'');
  body+=`<h3 class="sub-h">Bestellungen · ${list.length}</h3>`+(list.length?`<div class="rows">`+list.map(d=>ordRow(d,d.pid===me&&w.open)).join('')+`</div>`+(canTick&&pw===w.tue?tickNote:''):`<div class="empty">Noch niemand eingetragen.</div>`); // jeder löscht nur seine eigene Bestellung
  const btns=[];
  if(list.length)btns.push(`<button class="btn" data-act="copyDoener">Liste kopieren</button>`);
  if(w.open&&me)btns.push(`<button class="btn primary" data-act="saveDoener">${mine?'Ändern':'Eintragen'}</button>`);
  if(btns.length)foot=btns.length>1?`<div class="split">${btns.join('')}</div>`:btns[0];
  return{head,body,foot}}
// Torschützen auswählen wie beim Strafen-Eintragen: Kacheln mit Bild, mehrere antippen, dann hinzufügen
function fbPickSheet(s){const e=s.back,l=teamName(s.team),used=new Set(e.goals.filter(t=>t.team===s.team).map(t=>t.pid));
  const head=`<h2>Torschützen ${l}</h2><p>Antippen, wer getroffen hat</p>`;
  const body=`<div class="grid">`+sortedPlayers(false).map(p=>{const on=used.has(p.id)||s.sel.has(p.id);return `<button class="pick" data-act="fbPick" data-id="${esc(p.id)}" aria-pressed="${on}" ${used.has(p.id)?'disabled':''}>${p.role==='Spieler'&&p.number!=null?`<span class="no">${p.number}</span>`:''}${avatar(p)}<b>${esc(p.name.split(' ')[0])}</b><small>${esc(p.role==='Spieler'?p.name.split(' ').slice(1).join(' '):p.role)}</small><span class="ok">${ICONS.check}</span></button>`}).join('')+`</div>`;
  const n=s.sel.size;
  return{head,body,foot:`<div class="split"><button class="btn" data-act="fbPickBack">Zurück</button><button class="btn primary" data-act="fbPickDone" ${n?'':'disabled'}>${n?n+' hinzufügen':'Spieler wählen'}</button></div>`}}
/* ---------- Push-Benachrichtigungen (Web Push, kostenlos) ---------- */
const PUSH_KINDS=[['strafe','Neue Strafen','Wenn für dich etwas eingetragen wird'],['zahltag','Zahltag','Beim Start und einen Tag vor dem Ende, falls noch etwas offen ist'],['doener','Döner','Bestellen (Di 12 Uhr), Erinnerung (Di 17 Uhr), Zahlungs-Erinnerung (Mi 12 Uhr) und Hinweise für den Dönerwart'],['fussball','Fußball','Neue Spiele und das Ende einer Runde'],['geburtstag','Geburtstage','Glückwünsche an dich und wer heute Geburtstag hat'],['plan','Wochenplan','Wenn Trainer oder Mannschaftsverantwortlicher die Woche eingetragen haben'],['bericht','Berichte','Sonntag vor der Abgabe (12 Uhr) und am Abgabetag (9 Uhr), wenn du einen Bericht schreibst'],['umfrage','Umfragen','Wenn eine Umfrage zur Auswärtsfahrt startet'],['anzeige','Anzeigen','Wenn jemand eine Anzeige erstattet'],['anmeldung','Neue Anmeldungen','Wenn sich jemand neu registriert und freigeschaltet werden möchte'],['meldung','Gemeldete Zahlungen','Wenn jemand „Ich habe bezahlt“ meldet']];
// Zahl am App-Icon (setzt sw.js bei jeder Push-Nachricht): beim Öffnen und beim Zurückwechseln in die App auf 0
function clearBadge(){try{navigator.clearAppBadge&&navigator.clearAppBadge().catch(()=>{})}catch(e){}try{window.caches&&caches.open('badge').then(c=>c.delete('n')).catch(()=>{})}catch(e){}}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')clearBadge()});
const isIOS=()=>/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const isStandalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
const pushSupported=()=>'serviceWorker' in navigator&&!!window.PushManager&&!!window.Notification;
// Gespeicherter Datenstand auf dem Handy: pro Konto (kc:<uid>:<tabelle>), wird beim Abmelden gelöscht
S.cached=new Set();const cacheKey=t=>'kc:'+S.uid+':'+t;
function clearLocalData(){S.noSave=true;try{for(const k of Object.keys(localStorage))if(k.startsWith('kc:')||k.startsWith('me:'))localStorage.removeItem(k)}catch(e){}}
function swReg(){if(!('serviceWorker' in navigator))return Promise.resolve(null);return S.swp??=navigator.serviceWorker.register('sw.js').catch(()=>null)}
function b64uToU8(v){v=v.replace(/-/g,'+').replace(/_/g,'/');const b=atob(v+'==='.slice((v.length+3)%4));return Uint8Array.from(b,c=>c.charCodeAt(0))}
async function pushLoad(){const st={sub:null,row:null,ready:true};
  try{if(pushSupported()){const reg=await swReg(),sub=reg&&await reg.pushManager.getSubscription();
    if(sub){st.sub=sub;const {data}=await S.sb.from('push_subs').select('endpoint,prefs').eq('endpoint',sub.endpoint).maybeSingle();st.row=data||null}}}catch(e){}
  S.push=st;if(S.sheet&&(S.sheet.type==='push'||S.sheet.type==='menu')){S.still=true;renderSheet(false)}}
// Benachrichtigungen: oben umschalten zwischen „Verlauf“ (alles, was an dich ging, 30 Tage) und „Einstellung“ (dieses Gerät)
const pushSeg=()=>`<div class="seg full" role="group" aria-label="Ansicht" style="margin-top:10px">${[['verlauf','Verlauf'],['einstellen','Einstellung']].map(([k,l])=>`<button data-act="pushView" data-k="${k}" aria-pressed="${(S.pushView||'verlauf')===k}">${l}</button>`).join('')}</div>`;
async function pushLogLoad(){const {data,error}=await S.sb.from('push_verlauf').select('kind,title,body,tag,at').order('at',{ascending:false}).limit(150);
  S.pushLog=error?'fehler':data||[];if(S.sheet?.type==='push'){S.still=true;renderSheet(false)}}
// Antippen im Verlauf: dieselbe Aktion wie der passende Knopf in der App (Konto, Döner, Spiel, Reiter …)
function pushGo(x){const me=myPid(),a=(act,k,v)=>`data-act="${act}"${k?` data-${k}="${esc(v)}"`:''}`;
  switch(x.kind){
    case 'strafe':case 'zahltag':return me?a('person','id',me):'';
    case 'doener':return a('openDoener');case 'fussball':return a('openFussball');case 'geburtstag':return a('openGb');case 'bericht':return a('openBerichte');
    case 'meldung':return isKW()?a('openConfirm'):'';
    case 'umfrage':{const id=String(x.tag||'').replace(/^umfrage-/,'');return terminById(id)?a('terminView','id',id):a('pushTab','k','kalender')}
    case 'plan':return a('pushTab','k','kalender');case 'anzeige':return hasRole('kassenwart')?a('pushTab','k','erfassen'):'';
    case 'anmeldung':return isAdmin()?a('pushTab','k','verwalten'):'';
  }return ''}
function pushLogBody(){const L=S.pushLog;if(!L)return skel();if(L==='fehler')return `<div class="hint">Der Verlauf konnte gerade nicht geladen werden. Prüfe die Verbindung und öffne das Fenster noch einmal.</div>`;if(!L.length)return `<div class="empty">Noch keine Benachrichtigungen in den letzten 30 Tagen.</div>`;
  const td=tdIso(),day=d=>d===td?'Heute':d===addDays(td,-1)?'Gestern':dDE(d),hm=iso=>new Date(iso).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'});let h='',cur='';
  for(const x of L){const d=isoD(new Date(x.at));if(d!==cur){h+=(cur?'</div>':'')+`<h2 class="section-h">${esc(day(d))}</h2><div class="rows">`;cur=d}
    const go=pushGo(x);
    h+=`<div class="row${go?' tap':''}" ${go?`role="button" tabindex="0" data-from="push" ${go}`:''}><div class="m"><b class="wrapb">${esc(x.title)}</b>${x.body?`<i class="wrap">${esc(x.body)}</i>`:''}</div><div class="r"><small class="num">${esc(hm(x.at))}</small></div>${go?I('chevR').replace('class="ico"','class="ico chev"'):''}</div>`}
  return h+'</div><p class="note" style="margin:10px 4px 0">Hier steht alles, was an dich ging – auch wenn Benachrichtigungen auf diesem Gerät aus sind. Nach 30 Tagen wird es gelöscht.</p>'}
function pushSheet(){const st=S.push||{},head=`<h2>Benachrichtigungen</h2>${pushSeg()}`;let body='',foot='';
  if((S.pushView||'verlauf')==='verlauf')return{head,body:pushLogBody(),foot:''};
  const kinds=PUSH_KINDS.filter(k=>k[0]==='anmeldung'?isAdmin():k[0]==='anzeige'?hasRole('kassenwart'):k[0]!=='meldung'||isKW());
  const list=`<div class="rows">`+kinds.map(([k,t,d])=>`<div class="row"><div class="m"><b>${t}</b><i class="wrap">${d}</i></div></div>`).join('')+`</div>`;
  if(!pushSupported())body=isIOS()&&!isStandalone()
    ?`<div class="hint">Auf dem iPhone gehen Benachrichtigungen nur, wenn die Kasse auf dem <b>Home-Bildschirm</b> liegt:<br>In Safari unten auf <b>Teilen</b> tippen → <b>„Zum Home-Bildschirm“</b>. Danach die Kasse über das neue Icon öffnen und hier einschalten. Dafür braucht es iOS 16.4 oder neuer.</div>`
    :`<div class="hint">Dieser Browser kann keine Benachrichtigungen empfangen. Öffne die Kasse am Handy über das Icon auf dem Home-Bildschirm.</div>`;
  else if(!st.ready)body=skel();
  else if(Notification.permission==='denied')body=`<div class="hint">Benachrichtigungen sind für die Dragons Kasse blockiert. Auf dem iPhone: <b>Einstellungen → Mitteilungen → Dragons Kasse → Mitteilungen erlauben</b>. Danach hier noch einmal öffnen.</div>`;
  else if(!st.row){body=`<p class="note" style="margin:0 4px 12px">Schalte Benachrichtigungen ein, dann bekommst du eine Nachricht bei:</p>${list}<p class="note" style="margin:10px 4px 0">Danach kannst du einzelne Themen wieder abschalten.</p>`;
    foot=`<button class="btn primary" data-act="pushOn">🔔 Benachrichtigungen einschalten</button>`}
  else{const pr=st.row.prefs||{};
    body=`<div class="tag ok" style="margin:0 2px 12px">🔔 An auf diesem Gerät</div><div class="rows">`+kinds.map(([k,t,d])=>`<label class="row pushk"><div class="m"><b>${t}</b><i class="wrap">${d}</i></div><input type="checkbox" class="switch" data-pk="${k}" ${pr[k]!==false?'checked':''} aria-label="${esc(t)}"></label>`).join('')+`</div>`;
    foot=`<div class="split"><button class="btn" data-act="pushOff">Ausschalten</button><button class="btn primary" data-act="pushTest">Test senden</button></div>`}
  return{head,body:`<p class="note" style="margin:0 4px 12px">Gilt für dieses Gerät.</p>`+body,foot}}
/* ---------- Trikots: Spieler nach Alter, von jung bis alt ---------- */
const ageOf=iso=>{const [y,m,d]=iso.split('-').map(Number),n=new Date();let a=n.getFullYear()-y;if(n.getMonth()+1<m||(n.getMonth()+1===m&&n.getDate()<d))a--;return a};
const validBirth=v=>/^\d{4}-\d{2}-\d{2}$/.test(v||'')&&!isNaN(Date.parse(v))&&v<=today()&&v>='1940-01-01';
const lastWash=pid=>(S.wash[pid]||[])[0]||null;
function trikotList(){const all=S.players.filter(p=>p.role==='Spieler'&&p.active!==false);
  const withD=all.filter(p=>validBirth(S.geburt[p.id])).sort((a,b)=>S.geburt[b.id].localeCompare(S.geburt[a.id])||(a.number??999)-(b.number??999)||a.name.localeCompare(b.name));
  const without=all.filter(p=>!validBirth(S.geburt[p.id])).sort((a,b)=>(a.number??999)-(b.number??999)||a.name.localeCompare(b.name));
  return{withD,without}}
function trikotSheet(){if(!canTrikot())return{head:`<h2>Trikots</h2>`,body:`<div class="empty">Nur für Kassenwart, Admin und Trikotwart.</div>`,foot:''};const {withD,without}=trikotList(),kw=isTrikotwart();
  const row=(p,i)=>{const d=S.geburt[p.id],ok=validBirth(d);
    const lw=lastWash(p.id);
    return `<div class="row tap" data-act="trikotEdit" data-id="${esc(p.id)}" role="button" tabindex="0">${ok?`<span class="pos">${i+1}</span>`:'<span class="pos">–</span>'}${avatar(p)}<div class="m"><b>${esc(p.name)}</b><i>${ok?esc(dDE(d))+' · '+ageOf(d)+' Jahre':'Geburtsdatum fehlt'}</i>${lw?`<div class="tags"><span class="tag ok">🧺 gewaschen ${esc(dDE(lw.at.slice(0,10)).slice(0,6))}</span></div>`:''}</div>${p.number!=null?`<div class="r"><strong class="num">#${p.number}</strong></div>`:''}${I('chevR')}</div>`};
  let body=withD.length?`<h3 class="sub-h" style="margin-top:0">Jung → alt</h3><div class="rows">${withD.map(row).join('')}</div>`:'';
  if(without.length)body+=`<h3 class="sub-h" ${withD.length?'':'style="margin-top:0"'}>Ohne Geburtsdatum · ${without.length}</h3><div class="rows">${without.map(row).join('')}</div>`;
  if(!withD.length&&!without.length)body=`<div class="empty">Noch keine Spieler im Kader.</div>`;
  body=`<div class="hint" style="margin-bottom:12px">${kw?`Tippe auf einen Spieler und dann auf „Gewaschen“, wenn er die Trikots gewaschen hat.${without.length?' Dort kannst du auch das Geburtsdatum eintragen.':''}`:'Diesen Bereich sehen Kassenwart, Admin und Trikotwart. Eintragen kann nur der Trikotwart.'}</div>`+body;
  return{head:`<h2>Trikots</h2><p>${withD.length} von ${withD.length+without.length} Spielern sortiert</p>`,body,foot:''}}
function trikotEditSheet(s){const p=pById(s.id);if(!p||!canTrikot())return trikotSheet();const d=S.geburt[p.id]||'',kw=isTrikotwart(),can=kw,log=S.wash[p.id]||[];
  const head=`<div style="display:flex;gap:12px;align-items:center">${avatar(p)}<div style="min-width:0"><h2>${esc(p.name)}</h2><p>${validBirth(d)?esc(dDE(d))+' · '+ageOf(d)+' Jahre':'Geburtsdatum fehlt'}${p.number!=null?' · #'+p.number:''}</p></div></div>`;
  const lw=log[0];
  let body=`<div class="credbox"><div><span>Zuletzt gewaschen</span><b>${lw?esc(dDE(lw.at.slice(0,10))):'noch nie'}</b></div>${lw&&lw.by?`<div><span>Eingetragen von</span><b>${esc(lw.by)}</b></div>`:''}<div><span>Insgesamt</span><b>${log.length}×</b></div></div>`;
  if(!can)body+=`<p class="note" style="margin:10px 4px 0">Nur der Trikotwart kann „Gewaschen“ und das Geburtsdatum eintragen.</p>`;
  if(log.length)body+=`<h3 class="sub-h">Verlauf</h3><div class="rows">${log.slice(0,8).map(x=>`<div class="row"><div class="m"><b>${esc(dDE(x.at.slice(0,10)))}</b><i>${esc(x.by||'')}</i></div></div>`).join('')}</div>`;
  if(kw)body+=`<h3 class="sub-h">Geburtsdatum</h3><div class="two"><div class="field"><input id="gbd" type="date" aria-label="Geburtsdatum" value="${esc(validBirth(d)?d:'')}" min="1940-01-01" max="${today()}"></div><button class="btn" data-act="trikotSave" data-id="${esc(p.id)}">Speichern</button></div>${d?`<button class="linkbtn" data-act="trikotDel" data-id="${esc(p.id)}">Geburtsdatum entfernen</button>`:''}`;
  const foot=`<div class="split"><button class="btn" data-act="trikotBack">Zurück</button>${can?`<button class="btn primary" data-act="trikotWash" data-id="${esc(p.id)}">🧺 Gewaschen</button>`:''}</div>`;
  return{head,body,foot}}
function menuSheet(){
  const w=doenerWeek(),n=doenerList(w.tue).length,last=fbGames()[0],fr=last?fbRounds():null;
  const item=(act,ic,t,sub)=>`<button class="menuitem" data-act="${act}"><span class="mi-ic" aria-hidden="true">${ic}</span><span class="mi-t"><b>${t}${idot('m:'+act.slice(4).toLowerCase())}</b><small>${esc(sub)}</small></span>${I('chevR')}</button>`;
  return{head:`<h2>Mehr</h2>`,body:`<div class="menulist">`
    +item('openFussball','⚽','Fußball',last?`Siege in Runde ${fr.rounds.length+1}: Jung ${fr.cur.jung} : ${fr.cur.alt} Alt`:'Ergebnisse und Torschützen')
    +item('openDoener','🥙','Döner',(()=>{const lt=addDays(w.tue,-7),u=w.tue!==berlinNow().date&&doenerList(lt).some(d=>d.pid===myPid()&&!d.paid&&!d.reportedAt);return u?`Döner vom ${dDE(lt).slice(0,6)} noch nicht bezahlt`:(w.open?'Heute bis 18 Uhr':w.closed?'Bestellschluss vorbei':'Bestellen am Dienstag')+' · '+n+' '+(n===1?'Bestellung':'Bestellungen')})())
    +item('openBaelle','🏐','Bälle entharzen',(()=>{const c=baelleCur();return c?`Diese Woche: ${baelleNames(c)}${c.doneAt?' ✓':''}`:'Kein Plan für diese Woche'})())
    +item('openKf','🎉','Kabinenfest',(()=>{const l=kfList(),tw=kfThisWeek();return l.length?(tw.length?`Diese Woche: ${tw.map(e=>kfWho(e)?.name||'Unbekannt').join(', ')}`:'Diese Woche frei')+` · ${l.length} offen`:'Alles erledigt'})())
    +(canTrikot()?item('openTrikot','👕','Trikots',(()=>{const t=trikotList();return t.withD.length?`${t.withD.length} Spieler · jung bis alt`:'Spieler nach Alter sortiert'})()):'')
    +item('openBerichte','📝','Berichte',(()=>{const n=berichteNext(),me=myPid()&&n.find(x=>x.lage===myPid()||x.gruss===myPid());return me?`Du: ${me.lage===myPid()?'Lage der Liga':'Grußwort'} · Abgabe ${me.abgabe?dDE(me.abgabe).slice(0,6):'–'}`:n[0]?`Nächstes: ${n[0].gegner} · ${dDE(n[0].date).slice(0,6)}`:'Lage der Liga und Grußwort'})())
    +item('openWuerfel','🎲','Würfelliste',(()=>{const n=(S.wuerfel||[]).length;return n?n+' '+(n===1?'muss':'müssen')+' noch würfeln':'Niemand muss würfeln'})())
    +item('openGb','🎂','Geburtstage',(()=>{const g=gbList().withB;if(!g.length)return 'Noch keine eingetragen';const x=g[0];return x.days===0?`Heute: ${x.p.name} 🎉`:`Nächster: ${x.p.name.split(' ')[0]} · ${mdDE(x.md)}`})())
    +item('openPush','🔔','Benachrichtigungen',S.push?.row?'An auf diesem Gerät':'Aus – hier einschalten')+`</div>`,foot:''}}
// Rollen einer Person: mehrere ankreuzbar. Admin/Kassenwart vergibt nur der Admin.
function rolesSheet(s){const m=S.members.find(x=>x.user_id===s.uid),p=m&&pById(m.player_id);if(!m)return{head:'<h2>Rollen</h2>',body:'',foot:''};
  return{head:`<h2>Rollen</h2><p>${esc(p?p.name:m.email||'')}</p>`,
    body:`<div class="fields">${ROLES.filter(([k])=>k!=='member').map(([k,l])=>`<label class="check"><input type="checkbox" data-role="${k}" ${s.sel.includes(k)?'checked':''} ${!isAdmin()&&(k==='admin'||k==='kassenwart')?'disabled':''}> ${esc(l)}</label>`).join('')}</div><p class="note" style="margin:10px 4px 0">Ohne Haken ist die Person einfach Spieler. Es gibt nur einen Kassenwart.</p>`,
    foot:`<button class="btn primary" data-act="saveRoles">Speichern</button>`}}
// Schulden: einfache Liste nur für den Kassenwart (Name, Betrag, abhaken)
function schuldenSheet(){const all=[...(S.schulden||[])].sort((a,b)=>(!!a.done-!!b.done)||String(b.createdAt).localeCompare(String(a.createdAt)));
  const open=all.filter(x=>!x.done),sum=open.reduce((a,x)=>a+(x.amount||0),0);
  const row=x=>`<div class="row ${x.done?'paid':''}"><button class="tick" data-act="schuldTick" data-id="${esc(x.id)}" aria-pressed="${!!x.done}" aria-label="${esc(x.name+(x.done?': wieder offen':': abhaken'))}"><span>${ICONS.check}</span></button><div class="m"><b>${esc(x.name)}</b>${x.note?`<i class="wrap">${esc(x.note)}</i>`:''}</div><div class="r"><strong class="num">${eur(x.amount||0)}</strong></div><button class="iconbtn ${S.confirmDel==='sd'+x.id?'warn':''}" data-act="schuldDel" data-id="${esc(x.id)}" aria-label="${S.confirmDel==='sd'+x.id?'Wirklich löschen?':'Löschen'}">${I('x')}</button></div>`;
  return{head:`<h2>Schulden</h2><p>Nur für dich als Kassenwart sichtbar</p>`,
    body:`<div class="fields"><div class="two"><div class="field"><label for="sdn">Name</label><input id="sdn" maxlength="80" autocomplete="off"></div><div class="field"><label for="sda">Betrag (€)</label><input id="sda" inputmode="decimal"></div></div>
      <div class="field"><label for="sdt">Notiz (optional)</label><input id="sdt" maxlength="120" autocomplete="off"></div><button class="btn primary" data-act="schuldAdd">${I('plus')}Eintragen</button></div>`
      +(all.length?`<div class="credbox" style="margin-top:14px"><div class="sum"><span>Noch offen (${open.length})</span><b class="num">${eur(sum)}</b></div></div><div class="rows" style="margin-top:10px">${all.map(row).join('')}</div>`:`<div class="empty" style="margin-top:14px">Noch keine Schulden eingetragen.</div>`),foot:''}}
// Berichte fürs Hallenheft: Plan pro Heimspiel (Lage der Liga, Grußwort, Abgabe). Nur zum Ansehen.
const berichteAll=()=>[...(S.berichte||[])].sort((a,b)=>String(a.date).localeCompare(String(b.date)));
const berichteNext=()=>berichteAll().filter(x=>x.date>=today());
function berichteSheet(){const me=myPid(),pn=id=>pById(id)?.name||'–',all=berichteAll();
  const row=x=>{const [,m,d]=x.date.split('-'),past=x.date<today(),mine=!!me&&(x.lage===me||x.gruss===me);
    return `<div class="row ${past?'paid':''}"><div class="kdate"><b>${+d}.</b><small>${esc(MONTHS[+m-1].slice(0,3))}</small></div><div class="m"><b class="wrapb">${esc(x.gegner||'')}</b><div style="display:grid;grid-template-columns:auto 1fr;gap:2px 8px;margin-top:4px;font-size:15px;line-height:1.3">${[['Lage der Liga',x.lage],['Grußwort',x.gruss]].map(([t,id])=>`<span style="color:var(--muted);font-size:15px">${t}</span><b style="font-size:15px;font-weight:${id===me?800:600}">${esc(pn(id))}</b>`).join('')}</div><div class="tags">${x.abgabe?`<span class="tag">Abgabe ${esc(dDE(x.abgabe).slice(0,6))}</span>`:''}${mine?'<span class="tag kf">du schreibst</span>':''}</div></div></div>`};
  const fut=all.filter(x=>x.date>=today()),past=all.filter(x=>x.date<today());
  return{head:`<h2>Berichte</h2><p>Lage der Liga und Grußwort fürs Hallenheft</p>`,body:`<p class="note" style="margin:0 4px 10px">Wer schreibt, bekommt am Sonntag vor der Abgabe um 12 Uhr und am Abgabetag um 9 Uhr eine Erinnerung.</p>`
    +(all.length?(fut.length?`<div class="rows">${fut.map(row).join('')}</div>`:'')+(past.length?`<h3 class="sub-h">Vorbei</h3><div class="rows">${past.map(row).join('')}</div>`:''):`<div class="empty">Noch kein Plan eingetragen.</div>`),foot:''}}
// Würfelliste: wer noch würfeln muss – Spieler oder freier Name. Eintragen und abhaken: Kassenwart und Admin.
function wuerfelSheet(){const kw=S.canWrite===true,l=[...(S.wuerfel||[])].sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt)));
  const add=kw?`<button class="btn primary block" style="margin-bottom:14px" data-act="wfNew">${I('plus')}Hinzufügen</button>`:'';
  const row=x=>{const p=x.pid&&pById(x.pid);return `<div class="row">${p?avatar(p):'<span class="av">🎲</span>'}<div class="m"><b>${esc(p?p.name:x.name)}</b><i>seit ${esc(dDE(String(x.createdAt).slice(0,10)))}</i></div>${kw?`<button class="chipbtn" data-act="wfDone" data-id="${esc(x.id)}">${I('check')}Gewürfelt</button>`:''}</div>`};
  return{head:`<h2>Würfelliste</h2><p>Wer noch würfeln muss</p>`,body:add+(l.length?`<div class="rows">${l.map(row).join('')}</div>`:`<div class="empty">Gerade muss niemand würfeln.</div>`),foot:''}}
// Würfelliste ergänzen: Spieler antippen (mehrere möglich) oder einen freien Namen eingeben
function wuerfelAddSheet(s){const on=new Set((S.wuerfel||[]).map(x=>x.pid).filter(Boolean)),n=s.sel.size;
  return{head:`<h2>Würfelliste</h2><p>Wer muss würfeln? Spieler antippen oder Namen eingeben</p>`,
    body:`<div class="grid">${sortedPlayers(false).map(p=>`<button class="pick" data-act="wfPick" data-id="${esc(p.id)}" aria-pressed="${s.sel.has(p.id)}" ${on.has(p.id)?'disabled':''}>${p.number!=null?`<span class="no">${p.number}</span>`:''}${avatar(p)}<b>${esc(p.name.split(' ')[0])}</b><small>${on.has(p.id)?'steht schon drauf':esc(p.name.split(' ').slice(1).join(' '))}</small><span class="ok">${ICONS.check}</span></button>`).join('')}</div>
      <div class="field" style="margin-top:14px"><label for="wfn">Oder Namen eingeben (z. B. Gast)</label><input id="wfn" maxlength="80" autocomplete="off" value="${esc(s.name||'')}"></div>`,
    foot:`<button class="btn primary" data-act="wfSave">${n?n+' Spieler hinzufügen':'Hinzufügen'}</button>`}}
function textSheet(s){return{head:`<h2>Text zum Kopieren</h2><p>Lange drücken → Alles auswählen → Kopieren</p>`,body:`<textarea id="cp" rows="14" readonly style="width:100%;font:inherit;padding:10px;border-radius:10px;border:1px solid var(--line);background:var(--surface);color:var(--ink)">${esc(s.txt||'')}</textarea>`,foot:''}}
async function copyOut(txt){
  try{await navigator.clipboard.writeText(txt);toast('Kopiert – jetzt in die Gruppe einfügen')}catch(e){openSheet({type:'text',txt});const t=$('#cp');if(t){t.focus();t.select()}}}
function fbAddGoal(s,team,pid,kind,d){let t=s.goals.find(x=>x.team===team&&x.pid===pid);
  if(!t){if(d<0)return;t={pid,team,n:0,k:0};s.goals.push(t)}
  t[kind]=Math.max(0,(t[kind]||0)+d)}
// Ein Kabinenfest pro beendeter Runde für das Verlierer-Team. Feste ID je Rundennummer (kf-fb-r1, kf-fb-r2 …),
// damit es nie doppelt entsteht – auch nicht, wenn später ein älteres Spiel geändert wird.
// Noch offene Auto-Kabinenfeste werden angepasst oder entfernt; erledigte bleiben unangetastet.
async function syncFbKf(){const {rounds}=fbRounds(),now=new Date().toISOString(),neu=[];
  for(const r of rounds){const id='kf-fb-r'+r.no,ex=S.entries.find(e=>e.id===id),pid='team-'+r.loser,note=`Fußball Runde ${r.no} verloren (${teamName(r.winner)} ${r.w} : ${r.l})`;
    if(!ex){await S.db.doc('entries/'+id).set({playerId:pid,fineId:'kf-manual',title:'Fußball-Runde verloren',amount:0,qty:null,unit:null,col:'strafen',spieltag:false,kabinenfest:true,kfDone:false,
      note,date:r.date,createdAt:now,createdBy:S.uid||null,paid:false,paidAt:null,auto:'fussball',round:r.no});neu.push(r)}
    else if(!ex.kfDone&&(ex.playerId!==pid||ex.note!==note||ex.date!==r.date))await S.db.doc('entries/'+id).update({playerId:pid,note,date:r.date})}
  for(const e of S.entries){const m=/^kf-fb-r(\d+)$/.exec(e.id);if(m&&+m[1]>rounds.length&&!e.kfDone)await S.db.doc('entries/'+e.id).delete()}
  return neu}

/* ---------- Kalender ---------- */
const WD_LONG=['Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag'],WD_SHORT=['Mo','Di','Mi','Do','Fr','Sa','So'];
const isMV=()=>hasRole('mannschaftsverantwortlicher');
const canTermin=()=>hasRole('trainer','admin'); // Kassenwart hat im Kalender keine Rechte
const canPlan=()=>canTermin()||isMV(); // Wochenplan melden und Treffpunkte eintragen
const tdIso=()=>isoD(bToday());
const wdIdx=d=>(new Date(d+'T12:00:00').getDay()+6)%7; // Montag = 0
const monIso=d=>isoD(monOf(new Date(d+'T12:00:00')));
const isHome=x=>x.home!==false;
const tRange=x=>x.start?(x.end?x.start+'–'+x.end:x.start):'ganztägig';
const trId=(d,start)=>'tr-'+d+'-'+start.replace(':','');
const trDoc=(d,u)=>({type:'training',date:d,start:u.start,end:u.end,title:u.title,place:null});
// Übliche Trainingszeiten: Vorlage pro Wochentag, gespeichert als Termine vom Typ „usual“ und im Kalender änderbar
const USUAL_DEFAULT=[[0,'19:00','20:30','Halle'],[1,'19:45','22:00','Kraft + Halle'],[3,'20:00','22:00','Video + Halle']];
let _us={src:null,v:null};
const usualOf=()=>{if(_us.src!==S.termine){const m={};S.termine.filter(x=>x.type==='usual').sort((a,b)=>String(a.start).localeCompare(String(b.start))).forEach(x=>(m[x.wd]??=[]).push(x));_us={src:S.termine,v:m}}return _us.v};
// Übliche Zeiten erscheinen ab heute wie normale Trainings, solange der Tag weder ein Training noch eine Absage (Typ „cancel“) hat.
// Bearbeitet ein Trainer so ein Training, werden die Trainings des Tages echt gespeichert; löscht er das letzte, bleibt der Tag leer.
// Gleiche Regel wie in wochenplan_senden() in schema.sql.
const virtualAt=d=>d<tdIso()?[]:(usualOf()[wdIdx(d)]||[]).map(u=>({id:'v~'+d+'~'+u.id,virtual:true,...trDoc(d,u)}));
const termineAt=d=>{const all=S.termine.filter(x=>x.date===d&&['training','spiel','cancel'].includes(x.type)),real=all.filter(x=>x.type!=='cancel');
  return (all.some(x=>x.type==='training'||x.type==='cancel')?real:[...real,...virtualAt(d)]).sort((a,b)=>String(a.start||'').localeCompare(String(b.start||''))||String(a.type).localeCompare(String(b.type)))};
function terminById(id){if(id.startsWith('v~')){const [,d,tid]=id.split('~');return S.termine.some(x=>x.id===tid&&x.type==='usual')?virtualAt(d).find(x=>x.id===id)||null:null}
  return S.termine.find(t=>t.id===id&&t.type!=='usual')||null}
// Treffpunkt: Heimspiele immer 1:30 h vor Beginn, bei Auswärtsspielen gibt ihn der Trainer in der Spielwoche bekannt (wie in wochenplan_senden())
function meetTxt(x){if(x.type!=='spiel'||x.date<tdIso())return '';
  if(isHome(x)){if(!x.start)return '';const [h,m]=x.start.split(':').map(Number),t=((h*60+m-90)%1440+1440)%1440;return 'Treffpunkt '+String(Math.floor(t/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0')+' Uhr (1:30 h vor Beginn)'}
  return x.meet?'Treffpunkt '+x.meet+' Uhr'+(x.meetPlace?' · '+x.meetPlace:''):'Treffpunkt wird in der Spielwoche bekannt gegeben'}
function kEvRow(x){const sp=x.type==='spiel',mt=meetTxt(x);
  return `<div class="kev tap" data-act="terminView" data-id="${esc(x.id)}" role="button" tabindex="0"><span class="t">${esc(tRange(x))}</span><div class="m"><b>${sp?'🤾':'🏃'} ${esc(x.title||(sp?'Spiel':'Training'))}${idot('poll:'+x.id)}${planDays().has(x.date)?idot('plan'):''}</b><i>${esc([sp?(isHome(x)?'Heimspiel':'Auswärts'):'',x.place||''].filter(Boolean).join(' · '))}</i>${mt?`<i class="meet">${esc(mt)}</i>`:''}</div>${I('chevR')}</div>`}
const dayExtra=(d,map)=>(wdIdx(d)===3?kfRows(monIso(d),map):'')+baelleRow(d); // Donnerstag: Kabinenfest und Bälle entharzen
const kfRows=(mon,map=kfWeekMap())=>(map[mon]||[]).map(e=>`<div class="kev"><span class="t">🎉</span><div class="m"><b>Kabinenfest: ${esc(kfWho(e)?.name||'Unbekannt')}</b>${e.kfDone?'<i>erledigt</i>':''}</div></div>`).join('');
const calNav=(act,label,prev,next)=>`<div class="calnav" style="margin-top:12px"><button class="iconbtn round" data-act="${act}" data-d="-1" aria-label="${prev}">${I('chevL')}</button><b>${label}</b><button class="iconbtn round" data-act="${act}" data-d="1" aria-label="${next}">${I('chevR')}</button></div>`;
const kday=(d,head,body)=>`<section class="kday${d===tdIso()?' today':''}"><header><b>${WD_LONG[wdIdx(d)]}<small>${esc(dDE(d).slice(0,6))}</small>${planDays().has(d)?idot('plan'):''}</b>${head}</header>${body}</section>`;
// Gibt es seit der letzten Meldung der Woche etwas Neues? Fragt die Datenbank (gleiche Regel wie beim Senden) einmal je Stand der Termine.
let _pc={src:null,mon:null,v:null};
function planChanged(mon){if(_pc.src!==S.termine||_pc.mon!==mon){const src=S.termine;if(_pc.mon!==mon)_pc.v=null;_pc.src=src;_pc.mon=mon;
    S.sb.rpc('wochenplan_geaendert',{mon}).then(({data,error})=>{if(_pc.src===src&&_pc.mon===mon&&_pc.v!==(error?true:!!data)){_pc.v=error?true:!!data;render()}})}
  return _pc.v}
function kalWoche(){
  const mon=S.kalMon||monIso(tdIso()),r=kwRange(mon),td=tdIso(),ce=canTermin(),map=kfWeekMap(),pl=S.termine.find(x=>x.id==='plan-'+mon);
  let h=calNav('kalnav',`KW ${r.kw} · ${esc(r.range)}`,'Vorherige Woche','Nächste Woche');
  for(let i=0;i<7;i++){const d=addDays(mon,i),evs=termineAt(d),kf=dayExtra(d,map);
    h+=kday(d,ce?`<button class="mini" data-act="terminNew" data-d="${d}">+ Training</button>`:'',evs.length||kf?evs.map(kEvRow).join('')+kf:`<div class="kfree">Nichts geplant</div>`)}
  if(canPlan()&&addDays(mon,6)>=td){const off=pl?.days&&planChanged(mon)!==true; // schon gemeldet und seitdem nichts geändert: Knopf grau
    h+=`<div class="kwcard" style="margin-top:4px"><div><b>Wochenplan</b> <span>${pl?`Zuletzt gemeldet am ${esc(dtDE(pl.sentAt))}${pl.by?' von '+esc(pl.by):''}.${pl.days?(off?' Seitdem nichts geändert.':' Gemeldet werden nur die geänderten Tage.'):''}`:'Trag erst alles ein und drück dann „Fertig“. Die Mannschaft bekommt eine einzige Nachricht.'}</span></div><button class="btn${off?'':' primary'}" data-act="planSend" data-mon="${mon}"${off?' disabled':''}>${S.confirmPlan===mon?'Wirklich an alle senden?':pl?'Änderungen melden':'Fertig – Mannschaft benachrichtigen'}</button></div>`;}
  return h+`<button class="btn block" style="margin-top:10px" data-act="kalIcs" data-mon="${mon}">${I('kalender')}Woche in meinen Kalender</button>`
    +(ce?`<button class="linkbtn" style="display:block;margin:6px auto 0" data-act="usualEdit">Übliche Trainingszeiten bearbeiten</button>`:'')}
// Woche als .ics: Trainings und Spiele (gleiche Liste wie in der Wochenansicht). Feste UID je Termin (Training: Tag + Beginn), damit erneutes Laden aktualisiert statt doppelt anlegt.
function weekIcs(mon){
  const tx=v=>String(v||'').replace(/[\\;,]/g,m=>'\\'+m).replace(/\r?\n/g,'\\n'),dt=(d,t)=>d.replace(/-/g,'')+'T'+t.replace(':','')+'00',
    add2=t=>{const [h,m]=t.split(':').map(Number),x=Math.min(h*60+m+120,1439);return String(Math.floor(x/60)).padStart(2,'0')+':'+String(x%60).padStart(2,'0')},
    stamp=new Date().toISOString().replace(/[-:]/g,'').slice(0,15)+'Z',ev=[];
  for(let i=0;i<7;i++){const d=addDays(mon,i);for(const x of termineAt(d)){const sp=x.type==='spiel',
      when=x.start?`DTSTART:${dt(d,x.start)}\r\nDTEND:${dt(d,x.end||add2(x.start))}`:`DTSTART;VALUE=DATE:${d.replace(/-/g,'')}\r\nDTEND;VALUE=DATE:${addDays(d,1).replace(/-/g,'')}`;
    ev.push(`BEGIN:VEVENT\r\nUID:${tx(!sp&&x.start?trId(d,x.start):x.id)}@dragons-kasse\r\nDTSTAMP:${stamp}\r\n${when}\r\nSUMMARY:${tx((sp?'🤾 ':'🏃 ')+(x.title||(sp?'Spiel':'Training')))}`
      +(x.place?`\r\nLOCATION:${tx(x.place)}`:'')+`\r\nDESCRIPTION:${tx([sp?(isHome(x)?'Heimspiel':'Auswärts'):'Training',meetTxt(x)].filter(Boolean).join('\n'))}\r\nEND:VEVENT`)}}
  // Zeilen nach RFC 5545 auf höchstens 75 Byte falten (Folgezeile beginnt mit Leerzeichen)
  const fold=l=>{let o='',n=0;for(const c of l){const b=new TextEncoder().encode(c).length;if(n+b>74){o+='\r\n ';n=1}o+=c;n+=b}return o};
  return ev.length?`BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//TSG Dragons//Kasse//DE\r\nCALSCALE:GREGORIAN\r\nX-WR-CALNAME:Dragons\r\n${ev.join('\r\n')}\r\nEND:VCALENDAR`.split('\r\n').map(fold).join('\r\n')+'\r\n':''}
function kalMonat(){
  const now=bToday(),cur=S.kalM||{y:now.getFullYear(),m:now.getMonth()},td=isoD(now),map=kfWeekMap(),cache={},ev=d=>cache[d]??=termineAt(d),last=new Date(cur.y,cur.m+1,0,12);
  let h=calNav('kalmonth',`${MONTHS[cur.m]} ${cur.y}`,'Vorheriger Monat','Nächster Monat')+(S.kalM?`<button class="btn block" style="margin-bottom:10px" data-act="kalmonth" data-d="0">Zum aktuellen Monat</button>`:'')
    +`<div class="mcal" role="grid" aria-label="Termine ${MONTHS[cur.m]} ${cur.y}">${WD_SHORT.map(x=>`<div class="cal-h">${x}</div>`).join('')}`;
  for(let d=monOf(new Date(cur.y,cur.m,1,12));d<=last;d=new Date(d.getFullYear(),d.getMonth(),d.getDate()+7,12)){const wk=isoD(d);
    for(let i=0;i<7;i++){const x=new Date(d);x.setDate(x.getDate()+i);const iso=isoD(x),evs=ev(iso),kf=i===3&&(map[wk]||[]).length,n=evs.length+(kf?1:0),
        k=[...new Set(evs.map(e=>e.type==='spiel'?(isHome(e)?'sh':'sa'):'tr')),...(kf?['kf']:[])];
      h+=`<button class="mcal-d ${x.getMonth()!==cur.m?'out':''} ${iso===td?'today':''}" data-act="kaldayopen" data-d="${iso}" aria-label="${esc(dDE(iso))}${n?', '+n+(n===1?' Termin':' Termine'):''}"><span class="dn">${x.getDate()}</span><span class="dots">${k.map(c=>`<i class="dot ${c}"></i>`).join('')}</span></button>`}}
  h+=`</div><div class="legend"><span><i class="dot tr"></i>Training</span><span><i class="dot sh"></i>Heimspiel</span><span><i class="dot sa"></i>Auswärts</span><span><i class="dot kf"></i>Kabinenfest</span></div>`;
  const mp=String(cur.m+1).padStart(2,'0'),days=[];
  for(let n=1;n<=last.getDate();n++){const iso=`${cur.y}-${mp}-${String(n).padStart(2,'0')}`,evs=ev(iso),kf=dayExtra(iso,map);
    if(iso>=td&&(evs.length||kf))days.push(kday(iso,'',evs.map(kEvRow).join('')+kf))}
  return h+`<h3 class="sub-h">Termine im ${MONTHS[cur.m]}</h3>`+(days.length?days.join(''):`<div class="empty">${isoD(last)<td?'Dieser Monat ist vorbei. Vergangene Termine werden hier nicht mehr angezeigt.':'Keine weiteren Termine in diesem Monat.'}</div>`)}
function kalSpiele(){
  const all=S.termine.filter(x=>x.type==='spiel').sort((a,b)=>(a.date+(a.start||'')).localeCompare(b.date+(b.start||''))),td=tdIso();
  const row=x=>{const [,m,d]=x.date.split('-'),mt=meetTxt(x);
    return `<div class="row tap" data-act="terminView" data-id="${esc(x.id)}" role="button" tabindex="0"><div class="kdate"><b>${+d}.</b><small>${WD_SHORT[wdIdx(x.date)]} ${esc(MONTHS[+m-1].slice(0,3))}</small></div><div class="m"><b class="wrapb">${esc(x.title)}${idot('poll:'+x.id)}${planDays().has(x.date)?idot('plan'):''}</b><i class="wrap">${esc(x.start?x.start+' Uhr':'')}${x.place?' · '+esc(x.place):''}</i>${mt?`<i class="wrap meet">${esc(mt)}</i>`:''}<div class="tags"><span class="tag ${isHome(x)?'ok':''}">${isHome(x)?'Heimspiel':'Auswärts'}</span>${x.poll&&x.date>=tdIso()&&!(x.poll.until&&Date.parse(x.poll.until)<=Date.now())&&!(S.umfrage||[]).some(a=>a.doc===x.id&&a.pid===myPid())?'<span class="tag kf">🚐 Umfrage – noch abstimmen</span>':''}</div></div>${I('chevR')}</div>`};
  const up=all.filter(x=>x.date>=td),past=all.filter(x=>x.date<td).reverse();
  return (canTermin()?`<button class="btn" style="margin:12px 0 0;width:100%" data-act="spielNew">${I('plus')}Spiel hinzufügen</button>`:'')
    +(!all.length?`<div class="empty" style="margin-top:12px">Noch keine Spiele eingetragen.</div>`:'')
    +(up.length?`<h3 class="sub-h">Nächste Spiele · ${up.length}</h3><div class="rows">${up.map(row).join('')}</div>`:'')
    +(past.length?`<h3 class="sub-h">Gespielt · ${past.length}</h3><div class="rows">${past.map(row).join('')}</div>`:'')}
function kalender(){
  const v=S.kalView||'woche';
  return `<div class="toolbar" style="margin-top:0"><div class="seg full" role="group" aria-label="Ansicht">${[['woche','Woche'],['monat','Monat'],['spiele','Spiele']].map(([k,l])=>`<button data-act="kalview" data-k="${k}" aria-pressed="${v===k}">${l}</button>`).join('')}</div></div>`+(S.status==='loading'?skel():v==='spiele'?kalSpiele():v==='monat'?kalMonat():kalWoche())}
// Bausteine der Termin-Formulare
const timePair=(a,b,x,y)=>`<div class="two"><div class="field"><label for="${a}">Von</label><input id="${a}" type="time" value="${esc(x||'')}"></div><div class="field"><label for="${b}">Bis</label><input id="${b}" type="time" value="${esc(y||'')}"></div></div>`;
const delFoot=(act,key,id,cancel,save)=>`<div class="split">${id?`<button class="btn danger" data-act="${act}" data-id="${esc(id)}">${S.confirmDel===key+id?'Wirklich löschen?':'Löschen'}</button>`:`<button class="btn" data-act="${cancel}">Abbrechen</button>`}<button class="btn primary" data-act="${save}">Speichern</button></div>`;
function usualSheet(){
  if(!canTermin())return{head:`<h2>Übliche Trainingszeiten</h2>`,body:`<div class="empty">Nur für Trainer und Admin.</div>`,foot:''};
  const um=usualOf(),days=Object.keys(um).map(Number).sort();
  const body=`<div class="hint" style="margin-bottom:12px">Diese Zeiten erscheinen im Kalender ab heute automatisch als Training. Einzelne Tage änderst du dort über das Training selbst.</div>`
    +(days.length?days.map(i=>`<h3 class="sub-h">${WD_LONG[i]}</h3><div class="rows">${um[i].map(u=>`<div class="row tap" data-act="usualItem" data-id="${esc(u.id)}" role="button" tabindex="0"><div class="m"><b>${esc(u.start)}–${esc(u.end)} · ${esc(u.title||'Training')}</b></div>${I('chevR')}</div>`).join('')}</div>`).join(''):`<div class="empty">Noch keine üblichen Zeiten.</div><button class="btn block" style="margin-top:10px" data-act="usualDefaults">Standard anlegen (Mo, Di, Do)</button>`);
  return{head:`<h2>Übliche Trainingszeiten</h2>`,body,foot:`<button class="btn primary" data-act="usualAdd">${I('plus')}Zeit hinzufügen</button>`}}
function usualItemSheet(s){const t=s.t;
  return{head:`<h2>${s.id?'Übliche Zeit bearbeiten':'Übliche Zeit hinzufügen'}</h2>`,
    body:`<div class="fields"><div class="field"><label for="uwd">Wochentag</label><select id="uwd">${WD_LONG.map((n,i)=>`<option value="${i}" ${+t.wd===i?'selected':''}>${n}</option>`).join('')}</select></div>${timePair('ustart','uend',t.start,t.end)}
    <div class="field"><label for="utitle">Titel</label><input id="utitle" maxlength="60" value="${esc(t.title||'')}" placeholder="z. B. Halle, Kraft, Video + Halle" autocomplete="off"></div></div>`,
    foot:delFoot('usualDel','us',s.id,'usualBack','usualSave')}}
function terminViewSheet(s){const x=terminById(s.id);
  if(!x)return{head:`<h2>Termin</h2>`,body:`<div class="empty">Diesen Termin gibt es nicht mehr.</div>`,foot:''};
  const sp=x.type==='spiel',mt=meetTxt(x),q=x.place?encodeURIComponent(x.place):'';
  const map=(name,url)=>`<a class="btn" style="width:100%;justify-content:center;text-align:center" href="${esc(url+q)}" target="_blank" rel="noopener">${name}</a>`;
  let body=`<div class="credbox"><div><span>Art</span><b>${sp?(isHome(x)?'Heimspiel':'Auswärtsspiel'):'Training'}</b></div>${mt?`<div><span>Treffpunkt</span><b>${esc(mt.replace(/^Treffpunkt /,''))}</b></div>`:''}${x.place?`<div><span>Ort</span><b>${esc(x.place)}</b></div>`:''}${sp&&x.travel?`<div><span>Anreise</span><b style="white-space:pre-line;text-align:right">${esc(x.travel)}</b></div>`:''}</div>`;
  // Trainer und Mannschaftsverantwortlicher: Treffpunkt (nur auswärts) und Anreise eintragen
  if(sp&&canPlan()&&x.date>=tdIso())body+=`<h3 class="sub-h">${isHome(x)?'Anreise eintragen':'Treffpunkt und Anreise eintragen'}</h3>${isHome(x)?'':`<div class="two"><div class="field"><label for="vmeet">Uhrzeit</label><input id="vmeet" type="time" value="${esc(x.meet||'')}"></div><div class="field"><label for="vmeetp">Ort</label><input id="vmeetp" maxlength="120" value="${esc(x.meetPlace||'')}" autocomplete="off"></div></div>`}<div class="field" style="margin-bottom:12px"><label for="vtravel">Anreise</label><textarea id="vtravel" rows="2" maxlength="300" placeholder="z. B. Fahrgemeinschaften ab Halle, Bus um 17:15 Uhr">${esc(x.travel||'')}</textarea></div><button class="btn primary block" data-act="meetSave" data-id="${esc(x.id)}">Speichern</button>`;
  body+=pollBlock(x);
  if(x.place)body+=`<h3 class="sub-h">Anfahrt</h3><div class="split">${map('Apple Karten','https://maps.apple.com/?q=')}${map('Google Maps','https://www.google.com/maps/search/?api=1&query=')}</div>`;
  return{head:`<h2>${esc(x.title||(sp?'Spiel':'Training'))}</h2><p>${WD_LONG[wdIdx(x.date)]}, ${esc(dDE(x.date))} · ${esc(tRange(x))}${x.start?' Uhr':''}</p>`,body,foot:canTermin()?`<button class="btn" data-act="terminEdit" data-id="${esc(x.id)}">Bearbeiten</button>`:''}}
// Umfrage bei Auswärtsfahrten: Trainer/MV/Admin starten sie, jeder wählt „Treffpunkt (Bus)“ oder „direkt“ – bis zum Spieltag änderbar
const POLL_OPTS=[['treff','🚐 Zum Treffpunkt (Bus)'],['direkt','🚗 Ich fahre direkt']];
// Vorschlag fürs Ende: Vortag 20 Uhr (für <input type="datetime-local">, Ortszeit)
const pollDefaultEnd=x=>{const d=new Date(x.date+'T20:00');d.setDate(d.getDate()-1);return isoD(d)+'T20:00'};
const pollOpen=x=>x.date>=tdIso()&&!(x.poll?.until&&Date.parse(x.poll.until)<=Date.now());
function pollBlock(x){if(x.type!=='spiel'||isHome(x))return '';const me=myPid(),can=canPlan()&&x.date>=tdIso(),open=pollOpen(x);
  if(!x.poll)return can?`<h3 class="sub-h">Umfrage</h3><div class="field" style="margin-bottom:10px"><label for="pollq">Frage an die Mannschaft</label><textarea id="pollq" rows="2" maxlength="200">Wer kommt zum Treffpunkt und braucht einen Platz im 9er-Bus?</textarea></div>
    <div class="field" style="margin-bottom:10px"><label for="pollend">Abstimmen bis</label><input id="pollend" type="datetime-local" value="${esc(pollDefaultEnd(x))}" min="${esc(new Date(Date.now()-new Date().getTimezoneOffset()*6e4).toISOString().slice(0,16))}"></div><button class="btn block" data-act="pollStart" data-id="${esc(x.id)}">🚐 Umfrage starten</button>`:'';
  const ans=(S.umfrage||[]).filter(a=>a.doc===x.id),mine=ans.find(a=>a.pid===me),who=c=>ans.filter(a=>a.choice===c).map(a=>pById(a.pid)).filter(Boolean);
  const names=l=>l.length?esc(l.map(shortName).join(', ')):'–',miss=(S.members||[]).filter(m=>m.approved&&m.player_id&&!ans.some(a=>a.pid===m.player_id)).map(m=>pById(m.player_id)).filter(Boolean); // nur wer abstimmen kann (freigeschaltetes Konto)
  const end=x.poll.until?new Date(x.poll.until):null,endTxt=end?`${WD_SHORT[(end.getDay()+6)%7]} ${dDE(isoD(end)).slice(0,6)} ${String(end.getHours()).padStart(2,'0')}:${String(end.getMinutes()).padStart(2,'0')} Uhr`:'';
  return `<h3 class="sub-h">Umfrage</h3><div class="stcard" style="margin:0"><p style="margin:0 0 4px;font-weight:600">${esc(x.poll.q)}</p><p class="note" style="margin:0 0 10px">${open?(endTxt?'Abstimmen bis '+esc(endTxt):'Abstimmen bis zum Spieltag'):'Umfrage beendet – das ist das Ergebnis.'}</p>`
    +(open&&me?`<div class="seg full" role="group" aria-label="Deine Antwort" style="margin-bottom:12px">${POLL_OPTS.map(([k,l])=>`<button data-act="pollVote" data-id="${esc(x.id)}" data-k="${k}" aria-pressed="${mine?.choice===k}">${l}</button>`).join('')}</div>`:'')
    +`<div class="rows">${POLL_OPTS.map(([k,l])=>`<div class="row"><div class="m"><b>${l} · ${who(k).length}</b><i class="wrap">${names(who(k))}</i></div></div>`).join('')}`
    +(can?`<div class="row"><div class="m"><b>Noch nicht abgestimmt · ${miss.length}</b><i class="wrap">${names(miss)}</i></div></div>`:'')+`</div>`
    +(can?`<button class="linkbtn" data-act="pollDel" data-id="${esc(x.id)}">${S.confirmDel==='pl'+x.id?'Wirklich löschen? Alle Antworten gehen verloren.':'Umfrage löschen'}</button>`:'')+`</div>`}
function terminSheet(s){const t=s.t,sp=t.type==='spiel';
  return{head:`<h2>${s.id?(sp?'Spiel bearbeiten':'Training bearbeiten'):(sp?'Spiel hinzufügen':'Training hinzufügen')}</h2>`,
    body:`<div class="fields"><div class="field"><label for="tdate">Datum</label><input id="tdate" type="date" value="${esc(t.date||'')}"></div>${timePair('tstart','tend',t.start,t.end)}
    <div class="field"><label for="ttitle">${sp?'Spiel (Heim - Gast)':'Titel (optional)'}</label><input id="ttitle" maxlength="120" value="${esc(t.title&&t.title!=='Training'?t.title:'')}" placeholder="${sp?'TSG Münster - Gegner':'z. B. Handball + Kraft'}" autocomplete="off"></div>
    <div class="field"><label for="tplace">Ort (optional)</label><input id="tplace" maxlength="120" value="${esc(t.place||'')}" autocomplete="off"></div>
    ${sp?`<div class="field"><label for="thome">Heim oder Auswärts</label><select id="thome"><option value="1" ${isHome(t)?'selected':''}>Heimspiel</option><option value="0" ${isHome(t)?'':'selected'}>Auswärts</option></select></div>
    <div class="two"><div class="field"><label for="tmeet">Treffpunkt Uhrzeit (Auswärts)</label><input id="tmeet" type="time" value="${esc(t.meet||'')}"></div><div class="field"><label for="tmeetp">Treffpunkt Ort</label><input id="tmeetp" maxlength="120" value="${esc(t.meetPlace||'')}" autocomplete="off"></div></div>
    <div class="field"><label for="ttravel">Anreise (optional)</label><textarea id="ttravel" rows="2" maxlength="300" placeholder="z. B. Fahrgemeinschaften ab Halle, Bus um 17:15 Uhr">${esc(t.travel||'')}</textarea></div>
    <div class="hint">Heimspiele: Treffpunkt ist automatisch 1:30 h vor Spielbeginn. Auswärts trägst du ihn hier in der Spielwoche ein, bis dahin steht „wird in der Spielwoche bekannt gegeben“.</div>`:''}</div>`,
    foot:delFoot('terminDel','tm',s.id,'terminCancel','terminSave')}}
// Hilfen für Speichern und Löschen: Knopf sperren, Fehler als Hinweis zeigen (true bei Erfolg); Funktion über die Datenbank (liefert {data} oder null); zweiter Tipp bestätigt
async function run(el,fn){el.disabled=true;try{await fn();return true}catch(e){toast(errMsg(e));return false}finally{el.disabled=false}}
async function rpcRun(el,name,args){el.disabled=true;const {data,error}=await S.sb.rpc(name,args);el.disabled=false;if(error)toast(error.message||'Hat nicht geklappt');return error?null:{data}}
const sure=k=>{if(S.confirmDel===k){S.confirmDel=null;return true}S.confirmDel=k;S.still=true;renderSheet(false);return false};
const toUsual=()=>{S.still=true;openSheet({type:'usual'})};
// ---------- Bälle entharzen: Plan pro Donnerstag (Termine vom Typ „baelle“: pids, doneAt, doneBy) ----------
const baelleDocs=()=>S.termine.filter(x=>x.type==='baelle').sort((a,b)=>a.date.localeCompare(b.date));
const baelleCur=()=>baelleDocs().find(x=>monIso(x.date)===monIso(tdIso()));
const bName=id=>pById(id)?shortName(pById(id)):'(gelöscht)';
const baelleNames=x=>(x.pids||[]).map(bName).join(', ');
const baelleRow=d=>{const x=S.termine.find(t=>t.type==='baelle'&&t.date===d);
  return x?`<div class="kev tap" data-act="openBaelle" role="button" tabindex="0"><span class="t">🏐</span><div class="m"><b>Bälle entharzen: ${esc(baelleNames(x))}</b>${x.doneAt?'<i>erledigt</i>':''}</div>${I('chevR')}</div>`:''};
// Immer dabei (z. B. der Kapitän): wer in jeder nicht von Hand geänderten Woche steht – ein Ersatz für ihn in einer Woche ändert das also nicht
const baelleFixed=docs=>{const b=docs.some(d=>!d.pinned)?docs.filter(d=>!d.pinned):docs;return b.length?(b[0].pids||[]).filter(p=>b.every(d=>(d.pids||[]).includes(p))):[]};
const baelleCounts=docs=>{const c={};docs.forEach(d=>(d.pids||[]).forEach(p=>c[p]=(c[p]||0)+1));return c};
const docData=x=>{const {id,...r}=x;return r};
// Ersatz-Vorschläge: wer im ganzen Plan am seltensten dran ist, möglichst nicht in der Nachbarwoche
function baelleCands(x,sel){const docs=baelleDocs(),i=docs.indexOf(x),fixed=baelleFixed(docs),c=baelleCounts(docs),adj=new Set([...(docs[i-1]?.pids||[]),...(docs[i+1]?.pids||[])]),last={};
  docs.forEach(d=>(d.pids||[]).forEach(p=>last[p]=d.date));
  return Object.keys(c).filter(p=>!fixed.includes(p)&&!sel.has(p)).sort((a,b)=>c[a]-c[b]||adj.has(a)-adj.has(b)||String(last[a]).localeCompare(String(last[b])))}
// Automatischer Ausgleich nach jeder Änderung (Tauschen, Ersatz, Hinzufügen), Reihenfolge-fair wie ein Rundlauf:
// Woche für Woche (chronologisch) kommen die dran, die bis dahin am seltensten dran waren – so ist niemand ein zweites Mal dran,
// bevor alle anderen ihren Einsatz hatten, und am Ende haben alle gleich viel. Fest bleiben: erledigte Wochen, die laufende Woche
// und von Hand festgelegte Wochen („pinned“). Bei Gleichstand: nicht direkt neben einer eigenen Woche, dann wer schon eingeplant war
// (damit sich so wenig wie möglich ändert), dann wer am längsten nicht dran war. Mitgezählt wird nur, wer noch in einer freien Woche
// steht (einmalige Aushilfen nicht). Liefert die geänderten Wochen [[id,pids],…].
function baelleFix(docs,drop=[]){
  const td=tdIso(),fixed=baelleFixed(docs).filter(p=>!drop.includes(p)),seen=baelleCounts(docs);
  const gone=d=>!d.doneAt&&d.date>=td&&(d.pids||[]).some(p=>drop.includes(p)),free=d=>gone(d)||monIso(d.date)>monIso(td)&&!d.pinned&&!d.doneAt;
  // Gelöschte Personen (drop) werden ersetzt; in festen oder laufenden Wochen nur ihr Platz, sonst wird die Woche neu besetzt.
  // Mitgezählt wird jeder aus dem Plan (auch wer gerade nur in festen Wochen steht), außer Gelöschten und einmaligen Aushilfen
  const pool=Object.keys(seen).filter(p=>!fixed.includes(p)&&!drop.includes(p)&&(seen[p]>1||docs.some(d=>free(d)&&d.pids.includes(p)))),cnt=Object.fromEntries(pool.map(p=>[p,0])),last={},out=[];
  let prev=[];
  docs.forEach((d,i)=>{const orig=d.pids||[];
    if(free(d)){const keepAll=gone(d)&&(d.pinned||monIso(d.date)===monIso(td)),here=keepAll?orig.filter(p=>!drop.includes(p)):fixed.filter(p=>orig.includes(p)),next=docs[i+1]&&!free(docs[i+1])?docs[i+1].pids||[]:[],key=p=>cnt[p]+(prev.includes(p)||next.includes(p)?.75:0);
      const pick=pool.filter(p=>!here.includes(p)).sort((a,b)=>key(a)-key(b)||orig.includes(b)-orig.includes(a)||(last[a]??-1)-(last[b]??-1)).slice(0,orig.length-here.length);
      const pids=pick.every(p=>orig.includes(p))&&!gone(d)?orig:[...here,...pick];if(pids.join()!==orig.join())out.push([d.id,pids]);d={...d,pids}}
    (d.pids||[]).forEach(p=>{if(p in cnt){cnt[p]++;last[p]=i}});prev=d.pids||[]});
  return out}
// Text für den Hinweis: „17.12. Nils Z. statt Nils S.“
const baelleDiff=list=>list.map(([id,pids])=>{const o=S.termine.find(t=>t.id===id),out=(o.pids||[]).filter(p=>!pids.includes(p)),inn=pids.filter(p=>!(o.pids||[]).includes(p));
  return `${dDE(o.date).slice(0,6)} ${inn.map(bName).join(', ')} statt ${out.map(bName).join(', ')}`}).join(' · ');
// Speichert die geänderten Wochen (von Hand festgelegt = pinned) und gleicht danach automatisch aus – alles in einem Schritt
// über baelle_speichern (ganz oder gar nicht). Gelöschte Personen werden dabei automatisch ersetzt.
const baelleGone=()=>[...new Set(baelleDocs().flatMap(d=>d.pids||[]))].filter(p=>!pById(p));
async function baelleApply(el,edits){
  const docs=baelleDocs().map(d=>edits[d.id]?{...d,pids:edits[d.id],pinned:true}:d),fix=baelleFix(docs,baelleGone()),msg=baelleDiff(fix);
  const changes=[...Object.entries(edits).map(([id,pids])=>({id,pids,pinned:true})),...fix.map(([id,pids])=>({id,pids}))];
  const r=await rpcRun(el,'baelle_speichern',{changes});
  if(r){const m=Object.fromEntries(changes.map(c=>[c.id,c]));S.termine=S.termine.map(t=>m[t.id]?{...t,pids:m[t.id].pids,...(m[t.id].pinned?{pinned:true}:{})}:t);toast(msg?'Gespeichert. Automatisch angepasst: '+msg:'Gespeichert')}
  return !!r}
// Admin öffnet den Plan: stehen noch gelöschte Personen drin, werden sie still ersetzt
function baelleCleanup(){const g=baelleGone();if(isAdmin()&&g.length&&baelleFix(baelleDocs(),g).length)baelleApply({disabled:false},{}).then(()=>{if(S.sheet?.type==='baelle'){S.still=true;renderSheet(false)}})}
function baelleSheet(){
  const docs=baelleDocs(),cur=baelleCur(),td=tdIso(),ce=isAdmin(),fixed=baelleFixed(docs),next=docs.filter(x=>x!==cur&&x.date>td),late=docs.filter(x=>x!==cur&&x.date<td&&!x.doneAt),done=docs.filter(x=>x.doneAt).reverse().slice(0,8),cnt=baelleCounts(docs);
  const chips=x=>(x.pids||[]).map(p=>`<span class="bchip ${fixed.includes(p)||x.doneAt||!ce?'fixed':''} ${S.bsel?.doc===x.id&&S.bsel?.pid===p?'sel':''}" data-doc="${esc(x.id)}" data-pid="${esc(p)}">${esc(bName(p))}</span>`).join('');
  const row=x=>`<div class="row"><div class="kdate"><b>${+x.date.slice(8)}.</b><small>Do ${esc(MONTHS[+x.date.slice(5,7)-1].slice(0,3))}</small></div><div class="m bchips">${chips(x)}</div>${ce?`<button class="iconbtn" data-act="baelleEdit" data-id="${esc(x.id)}" aria-label="Woche bearbeiten">${I('chevR')}</button>`:''}</div>`;
  const body=(cur?`<h3 class="sub-h" style="margin-top:0">Diese Woche</h3><div class="rows">${row(cur)}</div>`+(cur.doneAt?`<p class="note" style="margin:8px 4px 0">Erledigt am ${esc(dDE(cur.doneAt.slice(0,10)))}${cur.doneBy?' von '+esc(cur.doneBy):''}.</p>`:'')
    :`<div class="empty">Für diese Woche ist niemand eingeteilt.</div>`)
    +(late.length?`<h3 class="sub-h">Noch nicht abgehakt</h3><div class="rows">${late.map(x=>`<div class="row"><div class="kdate"><b>${+x.date.slice(8)}.</b><small>Do ${esc(MONTHS[+x.date.slice(5,7)-1].slice(0,3))}</small></div><div class="m"><b class="wrapb">${esc(baelleNames(x))}</b></div>${ce||(x.pids||[]).includes(myPid())?`<button class="mini" data-act="baelleDo" data-d="${x.date}">Erledigt</button>`:''}</div>`).join('')}</div>`:'')
    +(next.length?`<h3 class="sub-h">Nächste Wochen</h3><div class="rows">${next.map(row).join('')}</div>`:'')
    +(ce&&(cur||next.length)?`<p class="note" style="margin:10px 4px 0">Tauschen: eine Person auf eine Person in einer anderen Woche ziehen (am Handy kurz gedrückt halten) – oder erst die eine, dann die andere antippen. Mit dem Pfeil änderst du eine Woche, zum Beispiel wenn jemand fehlt. Danach gleicht die App die restlichen Wochen automatisch aus, damit alle gleich oft dran sind.</p>`:'')
    +(done.length?`<h3 class="sub-h">Zuletzt entharzt</h3><div class="rows">${done.map(x=>`<div class="row"><div class="m"><b>${esc(dDE(x.doneAt.slice(0,10)))}</b><i>${esc(baelleNames(x))}</i></div></div>`).join('')}</div>`:'')
    +(docs.length?`<p class="note" style="margin:10px 4px 0">Im ganzen Plan: ${Object.keys(cnt).sort((a,b)=>cnt[b]-cnt[a]||a.localeCompare(b)).map(p=>`${esc(shortName(pById(p)))} ${cnt[p]}×`).join(' · ')}</p>`:'');
  const canDo=cur&&!cur.doneAt&&(ce||(cur.pids||[]).includes(myPid()));
  return{head:`<h2>Bälle entharzen</h2><p>Jeden Donnerstag, drei Personen</p>`,body,foot:canDo?`<button class="btn primary" data-act="baelleDo" data-d="${cur.date}">🏐 Entharzt eintragen</button>`:''}}
// Eine Woche ändern: per Ersatz-Vorschlag tauschen oder von Hand antippen; danach gleicht baelleFix die restlichen Wochen aus
function baelleEditSheet(s){const x=S.termine.find(t=>t.id===s.id);if(!x||!isAdmin())return baelleSheet();const n=s.sel.size,fixed=baelleFixed(baelleDocs()),cands=baelleCands(x,s.sel),c=baelleCounts(baelleDocs()),best=cands[0];
  const miss=[...s.sel].filter(p=>!fixed.includes(p)&&best).map(p=>`<div class="row"><div class="m"><b>${esc(shortName(pById(p)))} fehlt?</b><i>Ersatz: ${esc(shortName(pById(best)))} · im Plan ${c[best]}×</i></div><button class="mini" data-act="baelleRepl" data-id="${esc(p)}" data-c="${esc(best)}">Tauschen</button></div>`).join('');
  return{head:`<h2>Do ${esc(dDE(x.date).slice(0,6))}</h2><p>Wer entharzt diese Woche?</p>`,
    body:(miss?`<h3 class="sub-h" style="margin-top:0">Fehlt jemand?</h3><div class="rows">${miss}</div><h3 class="sub-h">Oder von Hand wählen</h3>`:'')
      +`<div class="grid">`+sortedPlayers(false).map(p=>`<button class="pick" data-act="baellePick" data-id="${esc(p.id)}" aria-pressed="${s.sel.has(p.id)}">${p.role==='Spieler'&&p.number!=null?`<span class="no">${p.number}</span>`:''}${avatar(p)}<b>${esc(p.name.split(' ')[0])}</b><small>${esc(p.role==='Spieler'?p.name.split(' ').slice(1).join(' '):p.role)}</small><span class="ok">${ICONS.check}</span></button>`).join('')+`</div>`,
    foot:`<div class="split"><button class="btn" data-act="openBaelle">Zurück</button><button class="btn primary" data-act="baelleSave" ${n?'':'disabled'}>${n} ${n===1?'Person':'Personen'} speichern</button></div>`}}
// Tauschen per Ziehen: Person auf eine Person einer anderen Woche ziehen; beide Wochen bleiben so stehen, der Rest gleicht sich aus
async function baelleSwap(ia,pa,ib,pb){if(!isAdmin())return;const A=S.termine.find(t=>t.id===ia),B=S.termine.find(t=>t.id===ib);if(!A||!B||A.doneAt||B.doneAt||ia===ib)return;
  if((B.pids||[]).includes(pa)||(A.pids||[]).includes(pb))return toast('Die Person ist in dieser Woche schon dabei');
  if(await baelleApply({disabled:false},{[ia]:A.pids.map(p=>p===pa?pb:p),[ib]:B.pids.map(p=>p===pb?pa:p)})){S.still=true;renderSheet(false)}}
function openSheet(s){if(S.fromPush){S.fromPush=false;if(s.type!=='push'&&!s.back)s={...s,back:{type:'push'}}} // aus dem Verlauf geöffnet: Kreuz führt zurück
  const sb=$('#sheetRoot .sheet-b');if(sb)sb.scrollTop=0;S.sheet=s;S.confirmDel=null;S.confirmPayAll=null;S.confirmPayout=null;document.body.classList.add('locked');renderSheet(false)}
// Kreuz oben rechts: in Unterseiten einen Schritt zurück (Spiel → Fußball); aus einem Bereich (Fußball, Döner …) zurück zur Übersicht
const SHEET_PARENT={wuerfelAdd:'wuerfel',fbEdit:'fussball',fbRound:'fussball',fbGame:'fussball',trikotEdit:'trikot',gbEdit:'gb',gbPick:'gb'};
const fbFrom=()=>S.sheet&&S.sheet.type==='fbRound'?{type:'fbRound',no:S.sheet.no}:null; // Herkunft merken, damit „zurück“ in die Runde führt
function stepBack(){const s=S.sheet;if(!s)return;
  if(s.type==='anzNew'&&(s.wer||s.fid)){s.note=$('#ann')?.value??s.note;if(s.fid)s.fid=null;else s.wer=false;S.still=true;renderSheet(false);return} // Details → Strafe → Personen (Auswahl bleibt) → schließen
  if(s.back){S.still=true;openSheet(s.back);return} // z. B. Torschützen → Spiel, Spiel → Runde
  const par=SHEET_PARENT[s.type];if(par){S.still=true;openSheet({type:par});return}
  closeSheet()}
function closeSheet(){if(S.sheet&&S.sheet.preview)URL.revokeObjectURL(S.sheet.preview);S.sheet=null;$('#sheetRoot').innerHTML='';document.body.classList.remove('locked')}
function baseAmount(s){if(s.touched)return num(s.amount);const f=s.fine;return (f.base||0)+(f.per||0)*(s.qty||0)}
function fineAmount(s){return baseAmount(s)*(s.spieltag?2:1)}
const TEAM_ENT=[{id:'team-alt',name:'Team Alt',role:'Mannschaft',team:true},{id:'team-jung',name:'Team Jung',role:'Mannschaft',team:true}];
const canSpieltag=f=>(f.cat||'')!=='Beiträge & Getränke'&&f.id!=='kf-manual';
function renderSheet(refresh){
  const s=S.sheet,root=$('#sheetRoot');if(!s)return;
  if(refresh&&(s.type==='fine'||s.type==='editFine'||s.type==='editPlayer'||s.type==='bill'||s.type==='settings'||s.type==='editEntry'||s.type==='receipt'||s.type==='anzNew'||s.type==='fbEdit'||s.type==='termin'||s.type==='usualItem'))return; // Formulare nicht unter den Fingern neu bauen
  // Neue Server-Daten, während jemand in einem Feld des Fensters tippt: nicht neu aufbauen, sonst ist die Eingabe weg
  {const a=document.activeElement;if(refresh&&a&&root.contains(a)&&(a.tagName==='TEXTAREA'||a.tagName==='SELECT'||(a.tagName==='INPUT'&&!/^(checkbox|radio|button|submit)$/i.test(a.type)))){S.still=false;return}}
  if(s.type==='doener'){const t=$('#dtext'),pp=$('#dpay');if(t)s.draft=t.value;if(pp)s.pay=pp.value}
  const keepScroll=root.querySelector('.sheet-b')?.scrollTop||0;
  let head='',body='',foot='';
  const sub={menu:menuSheet,doener:doenerSheet,fussball:fussballSheet,fbEdit:fbEditSheet,fbRound:fbRoundSheet,fbGame:fbGameSheet,fbPick:fbPickSheet,push:pushSheet,trikot:trikotSheet,trikotEdit:trikotEditSheet,termin:terminSheet,terminView:terminViewSheet,usual:usualSheet,usualItem:usualItemSheet,baelle:baelleSheet,baelleEdit:baelleEditSheet,text:textSheet,gb:gbSheet,gbEdit:gbEditSheet,gbPick:gbPickSheet,kfWeekAdd:kfWeekAddSheet,roles:rolesSheet,schulden:schuldenSheet,anzNew:anzNewSheet,anzView:anzViewSheet,berichte:berichteSheet,wuerfel:wuerfelSheet,wuerfelAdd:wuerfelAddSheet}[s.type];
  if(sub){({head,body,foot}=sub(s))}
  else if(s.type==='fine'&&countFine(s.fine)){
    const d=deckeSheet(s);head=d.head;body=d.body;foot=d.foot;
  } else if(s.type==='fine'){
    const f=s.fine;
    head=`<h2>${esc(f.title)}</h2><p>${esc(priceLabel(f))}</p>`;
    body+=f.hint?`<div class="hint" style="margin-bottom:12px">${esc(f.hint)}</div>`:'';
    const allSel=sortedPlayers(false).every(p=>s.sel.has(p.id));
    body+=f.id==='f01'?`<div class="whohead"><h3 class="section-h">Wer?</h3><button class="chipbtn" id="pickall" data-act="pickall">${allSel?'Auswahl aufheben':'Alle auswählen'}</button></div><div class="grid">`:`<h3 class="section-h">Wer?</h3><div class="grid">`;
    body+=(f.id==='kf-manual'?TEAM_ENT:[]).concat(sortedPlayers(false)).map(p=>p.team?`<button class="pick teampick" data-act="pick" data-id="${esc(p.id)}" aria-pressed="${s.sel.has(p.id)}"><span class="av teamav">${p.id==='team-alt'?'A':'J'}</span><b>${esc(p.name)}${drg(p.id)}</b><small>Mannschaft</small><span class="ok">${ICONS.check}</span></button>`:`<button class="pick" data-act="pick" data-id="${esc(p.id)}" aria-pressed="${s.sel.has(p.id)}">${p.role==='Spieler'&&p.number!=null?`<span class="no">${p.number}</span>`:''}${avatar(p)}<b>${esc(p.name.split(' ')[0])}${drg(p.id)}</b><small>${esc(p.role==='Spieler'?(p.name.split(' ').slice(1).join(' ')):p.role)}</small><span class="ok">${ICONS.check}</span></button>`).join('')+`</div>`;
    body+=`<div class="fields">`;
    if(f.per)body+=`<div class="field"><label for="qty">Anzahl (${esc(f.unit||'Stück')})</label><div class="stepper"><button data-act="qty" data-d="-1" aria-label="weniger">${I('minus')}</button><input id="qty" inputmode="numeric" aria-label="Anzahl" value="${s.qty}"><button data-act="qty" data-d="1" aria-label="mehr">${I('plus')}</button></div></div>`;
    body+=`<div class="two"><div class="field"><label for="amt">Betrag pro Person (€)</label><input id="amt" inputmode="decimal" value="${String(baseAmount(s)).replace('.',',')}"></div><div class="field"><label for="dt">Datum</label><input id="dt" type="date" value="${esc(s.date)}"></div></div>`;
    if(!f.id)body+=`<div class="field"><label for="colsel">Spalte in der Übersicht</label><select id="colsel">${COLS.map(([k,l])=>`<option value="${k}" ${s.col===k?'selected':''}>${l}</option>`).join('')}</select></div>`;
    if(canSpieltag(f))body+=`<label class="check"><input type="checkbox" id="spt" ${s.spieltag?'checked':''}> Spieltag – Strafe zählt doppelt</label><p class="note" id="sptinfo" style="margin:-6px 4px 0" ${s.spieltag?'':'hidden'}></p>`;
    if(S.canWrite)body+=`<label class="check"><input type="checkbox" id="kfc" ${s.kf?'checked':''}> Zusätzlich Kabinenfest fällig</label>`;
    body+=`<div class="field"><label for="nt">Notiz (optional)</label><input id="nt" value="${esc(s.note)}" placeholder="${f.wuerfeln?'z. B. gewürfelt: 4':'z. B. Training Dienstag'}"></div>`;
    body+=`<p class="note" style="margin:0">Jede Strafe kann gewürfelt werden – das Ergebnis einfach als Betrag eintragen.</p></div>`;
    foot=`<button class="btn primary" id="submit" data-act="submitFine"></button>`;
  } else if(s.type==='person'){
    const p=pById(s.id);if(!p){closeSheet();return}
    const b=balance(p.id);const list=S.entries.filter(e=>e.playerId===p.id).sort((a,c)=>(a.paid?1:0)-(c.paid?1:0)||String(c.date).localeCompare(String(a.date)));
    head=`<div style="display:flex;gap:12px;align-items:center">${avatar(p)}<div style="min-width:0"><h2>${esc(p.name)}${drg(p.id)}${myPid()===p.id?' <span class="tag ok">du</span>':''}</h2><p>${esc(pLabel(p))}${dragons().v.has(p.id)?' · Drache des Monats':''} · ${b.net<0?`bekommt noch <b class="num" style="color:var(--good)">${eur(-b.net)}</b>`:`muss noch zahlen <b class="num" style="color:var(--owe)">${eur(b.net)}</b>`} · bezahlt ${eur(b.paid)}</p></div></div>`;
    const viaCredit=b.open>0&&b.net<=0,pa=S.confirmPayAll===p.id;
    const paSmall=b.open<=0?'Nichts offen':viaCredit?(pa?'Nochmal tippen: '+eur(b.open)+' mit Guthaben verrechnen':eur(b.open)+' offen – wird komplett mit dem Guthaben verrechnet'):b.credit?(pa?'Nochmal tippen: '+eur(b.net)+' erhalten, Rest mit Guthaben verrechnen':eur(b.net)+' zu zahlen – '+eur(b.credit)+' Guthaben wird verrechnet'):(pa?'Nochmal tippen: '+eur(b.open)+' als bezahlt markieren':eur(b.open)+' offen – alle Einträge als bezahlt markieren');
    const payAllCard=isKW()?`<button class="payall ${b.open>0?'':'done'}" data-act="payAll" data-id="${esc(p.id)}" ${b.open>0?'':'disabled'}><span class="pa-ic">${ICONS.check}</span><span class="pa-t"><b>${pa?(viaCredit?'Wirklich verrechnen?':'Wirklich alles bezahlt?'):(viaCredit?'Mit Guthaben verrechnen':'Alles bezahlt')}</b><small>${paSmall}</small></span></button>`:'';
    const credBox=b.credit?`<div class="credbox"><div><span>Offene Strafen</span><b class="num">${eur(b.open)}</b></div><div><span>Guthaben aus Rechnungen</span><b class="num">− ${eur(b.credit)}</b></div><div class="sum"><span>${b.net<0?'Bekommt noch':'Muss noch zahlen'}</span><b class="num ${b.net<0?'neg':'pos'}">${eur(Math.abs(b.net))}</b></div></div>`:'';
    const po=S.confirmPayout===p.id,payoutCard=isKW()&&b.net<0?`<button class="payall" data-act="payout" data-id="${esc(p.id)}"><span class="pa-ic">${ICONS.euro}</span><span class="pa-t"><b>${po?'Wirklich ausbezahlt?':'Guthaben ausbezahlt'}</b><small>${po?'Nochmal tippen: '+eur(b.credit)+' überwiesen – Guthaben wird 0':eur(b.credit)+' Guthaben überwiesen? Dann hier tippen'}${b.open>0?' · '+eur(b.open)+' offen bleibt offen':''}</small></span></button>`:'';
    body=credBox+payAllCard+payoutCard+payBox(p,b)+(list.length?monthGroups(p.id,list):`<div class="empty">Keine Einträge – sauber!</div>`);
    if(S.canWrite===true)foot=`<button class="btn" data-act="addFor" data-id="${esc(p.id)}">${I('plus')}Strafe</button>`;
  } else if(s.type==='kasse'){
    const k=kasseSoll(),ks=S.kstand||{},checks=ks.checks||[],lastAt=(checks[0]||{}).at||'',clog=((S.klog||{}).items||[]).filter(x=>x.at>lastAt).slice(0,10);
    if(!k||s.editStart){
      head=`<h2>Kassenstand einrichten</h2><p>Startpunkt für den Abgleich</p>`;
      body=`<div class="hint" style="margin-bottom:14px">Trag ein, wie viel Geld <b>an diesem Tag</b> insgesamt in der Kasse war – Konto, PayPal und Bargeld zusammen. Ab diesem Datum rechnet die App alle Zahlungen, Ausgaben und Erstattungen mit.</div>
        <div class="two"><div class="field"><label for="ksd">Datum</label><input id="ksd" type="date" value="${esc(ks.start?.date||today())}"></div><div class="field"><label for="ksa">Bestand (€)</label><input id="ksa" inputmode="decimal" value="${ks.start?String(ks.start.amount).replace('.',','):''}" placeholder="0,00"></div></div>`;
      foot=`${k?'<button class="btn" data-act="kasseCancel">Abbrechen</button>':''}<button class="btn primary" data-act="kasseStart">Speichern</button>`;
    } else {
      head=`<h2>Kassenstand</h2><p>Soll und Ist vergleichen</p>`;
      const line=(l,v,sign='')=>`<div><span>${l}</span><b class="num">${sign}${eur(v)}</b></div>`;
      body=`<div class="credbox">${line('Startbestand am '+dDE(k.date),k.start)}${line('Zahlungen der Spieler',k.pay,'+ ')}${k.ein?line('Sondereinzahlungen',k.ein,'+ '):''}${line('Ausgaben aus der Kasse',k.aus,'− ')}${k.erst?line('Erstattungen an Spieler',k.erst,'− '):''}<div class="sum"><span>Soll heute</span><b class="num">${eur(k.soll)}</b></div></div>
        <h3 class="sub-h">Was ist wirklich da?</h3>
        <div class="two three"><div class="field"><label for="kk">Konto</label><input id="kk" inputmode="decimal" placeholder="0,00"></div><div class="field"><label for="kp">PayPal</label><input id="kp" inputmode="decimal" placeholder="0,00"></div><div class="field"><label for="kb">Bar</label><input id="kb" inputmode="decimal" placeholder="0,00"></div></div>
        <div class="kres" id="kres"><span>Ist <b class="num" id="kist">${eur(0)}</b></span><span id="kdiff">${kasseDiffHtml(0,k.soll)}</span></div>
        <div class="field"><label for="kn">Notiz (optional)</label><input id="kn" placeholder="z. B. 20 € Bierkasse noch nicht eingezahlt"></div>
        ${clog.length?`<h3 class="sub-h">Änderungen seit dem letzten Abgleich</h3><div class="rows">${clog.map(x=>`<div class="row"><div class="m"><b>${esc(x.text)}</b><i>${esc(dtDE(x.at))}${x.by?' · '+esc(x.by):''}</i></div>${x.amount!=null?`<div class="r"><strong class="num">${eur(x.amount)}</strong></div>`:''}</div>`).join('')}</div><p class="note" style="margin:6px 4px 0">Solche Änderungen verschieben das Soll.</p>`:''}
        ${checks.length?`<h3 class="sub-h">Bisherige Abgleiche</h3><div class="rows">`+checks.slice(0,12).map(c=>{const d=r2(c.ist-c.soll);return `<div class="row"><div class="m"><b>${esc(dDE(c.at.slice(0,10)))} · Ist ${eur(c.ist)}</b><i>Soll ${eur(c.soll)}${c.by?' · '+esc(c.by):''}${c.note?' · '+esc(c.note):''}</i></div><div class="r">${d===0?'<span class="tag ok">passt</span>':`<span class="tag ${d>0?'ok':'owe'}">${d>0?'+ ':'− '}${eur(Math.abs(d))}</span>`}</div></div>`}).join('')+`</div>`:''}
        <button class="linkbtn" data-act="kasseEdit">Startbestand ändern</button>`;
      foot=`<button class="btn primary" data-act="kasseSave">Abgleich speichern</button>`;
    }
  } else if(s.type==='zr'){
    const all=zAll(),z=all.find(x=>(x.runId||x.id)===s.zid)||all[0];
    if(!z){head=`<h2>Zahltag-Rückblick</h2>`;body=`<div class="empty">Noch kein Zahltag gestartet.</div>`}
    else{
      const r=zReview(z),live=!r.over&&z.active;
      head=`<h2>Zahltag-Rückblick</h2><p>${esc(dDE(z.startedAt.slice(0,10)))} bis ${esc(dtDE(z.endsAt))}${live?' · läuft noch':z.active===false&&!r.over?' · vorzeitig beendet':''}</p>`;
      const pick=all.length>1?`<div class="chips" role="group" aria-label="Zahltag wählen" style="margin-bottom:12px">`+all.slice(0,6).map(x=>`<button class="chipbtn ${x===z?'on':''}" data-act="zsel" data-id="${esc(x.runId||x.id)}" aria-pressed="${x===z}">${esc(dDE(x.startedAt.slice(0,10)))}</button>`).join('')+`</div>`:'';
      const tile=(l,v,c)=>`<div class="kpi"><span>${l}</span><b class="num" ${c?`style="color:var(--${c})"`:''}>${v}</b></div>`;
      const tag={open:'<span class="tag owe">offen</span>',late:'<span class="tag">zu spät bezahlt</span>',ok:'<span class="tag ok">rechtzeitig</span>'};
      const line=x=>`<div class="row zrrow">${avatar(x.p)}<div class="m"><b>${esc(x.p?x.p.name:'Unbekannt')}${x.p?drg(x.p.id):''}</b><i>${x.st==='open'?`Noch offen ${eur(x.rest)}`:`${eur(x.due)} fällig`}${x.fee?` · Verzug ${eur(x.fee.amount)}${x.fee.paid?' bezahlt':''}`:''}</i><div class="tags">${tag[x.st]}${x.net<0&&x.st==='open'?'<span class="tag ok">hat Guthaben</span>':''}</div></div></div>`;
      const sect=(k,t)=>{const l=r.rows.filter(x=>x.st===k);return l.length?`<h3 class="sub-h">${t} · ${l.length}</h3><div class="rows">${l.map(line).join('')}</div>`:''};
      body=pick+`<div class="kpis">${tile('Fällig gesamt',eur(r.due))}${tile('Bezahlt',eur(r.paid+r.late),'good')}${tile('Noch offen',eur(r.open),r.open>0?'owe':'')}${tile('Verzugsstrafen',r.fees?eur(r.fees):(r.over?eur(0):'–'))}</div>
        ${r.feesOpen?`<p class="note" style="margin:8px 4px 0">Davon noch offen: ${eur(r.feesOpen)} Verzugsstrafen.</p>`:''}
        ${r.erlassen?`<p class="note" style="margin:8px 4px 0">${r.erlassen} Verzugsstrafe${r.erlassen===1?'':'n'} erlassen, weil rechtzeitig gemeldet wurde.</p>`:''}
        ${r.rows.length?`${sect('open','Noch nicht bezahlt')}${sect('late','Nach der Frist bezahlt')}${sect('ok','Rechtzeitig bezahlt')}`:`<div class="empty">Zu diesem Zahltag gab es nichts zu zahlen.</div>`}`;
      foot=r.n.open?`<button class="btn primary" data-act="zrCopy" data-id="${esc(z.runId||z.id)}">Offene für die Gruppe kopieren</button>`:'';
    }
  } else if(s.type==='confirm'){
    const g=pendingPays(),ids=Object.keys(g).sort((a,c)=>(pById(a)?.number??999)-(pById(c)?.number??999));
    head=`<h2>Zahlungen bestätigen</h2><p>${ids.length?ids.length+' gemeldet – mit PayPal und Konto vergleichen':'Nichts zu bestätigen'}</p>`;
    body=ids.length?`<div class="rows">`+ids.map(pid=>{const p=pById(pid),es=g[pid],sum=es.reduce((a,e)=>a+(e.amount||0),0),last=es.map(e=>e.reportedAt).filter(Boolean).sort().pop();
      return `<div class="mrow cf">${avatar(p)}<div class="m"><b>${esc(p.name)}${drg(p.id)}</b><i>${last?'gemeldet '+esc(dtDE(last)):'gemeldet'} · ${es.length} ${es.length===1?'Eintrag':'Einträge'}</i></div><div class="r"><strong class="num">${eur(sum)}</strong></div>
        <div class="acts"><button class="mini on" data-act="confirmPay" data-id="${esc(pid)}">${I('check')} Bestätigt</button><button class="mini" data-act="rejectPay" data-id="${esc(pid)}">Nicht erhalten</button></div></div>`}).join('')+`</div>`:`<div class="empty">Alle gemeldeten Zahlungen sind bestätigt.</div>`;
  } else if(s.type==='kf'){
    const list=kfList(),cal=s.view==='cal',canW=canKf();
    head=`<h2>Kabinenfest</h2><p>${list.length?list.length+' offen':'Alles erledigt'}</p>`;
    const seg=`<div class="seg full" role="group" aria-label="Ansicht" style="margin-bottom:12px"><button data-act="kfview" data-k="liste" aria-pressed="${!cal}">Offen</button><button data-act="kfview" data-k="cal" aria-pressed="${cal}">Kalender</button></div>`;
    if(!list.length)body=(cal?seg:'')+`<div class="empty">Keine offenen Kabinenfeste – alles erledigt.</div>`;
    else if(cal)body=seg+kfCalendar(s);
    else{const fx=kfSchedule().filter(x=>kfFixed(x.e)),q=kfQueue(),who=e=>{const p=kfWho(e);return p&&p.team?`<span class="av teamav">${p.id==='team-alt'?'A':'J'}</span>`:avatar(p)};
      const done=e=>canW?`<button class="chipbtn" data-act="kf" data-id="${esc(e.id)}">${I('check')}Erledigt</button>`:'';
      body=seg+(fx.length?`<h3 class="sub-h" style="margin-top:0">Fest eingeplant</h3><div class="rows">`+fx.map(({e,mon})=>{const p=kfWho(e),w=kwRange(mon);return `<div class="row"><span class="pos">KW ${w.kw}</span>${who(e)}<div class="m"><b>${esc(p?p.name:'Unbekannt')}${p&&!p.team?drg(p.id):''}</b><i>${esc(w.range)} · ${esc(e.note&&!/^Eingeplant für KW/.test(e.note)?e.note:e.title)}</i></div>${done(e)}</div>`}).join('')+`</div><h3 class="sub-h">Danach der Reihe nach</h3>`:'')
        +(canW&&q.length>1?`<div class="hint" style="margin-bottom:12px">Am Griff links ziehen, um die Reihenfolge zu ändern.</div>`:'')
        +(q.length?`<div class="rows" id="kflist">`+q.map((e,i)=>{const p=kfWho(e);
      return `<div class="row kfrow" data-id="${esc(e.id)}">${canW?`<span class="grip" role="button" tabindex="0" data-id="${esc(e.id)}" aria-label="Reihenfolge ändern: ${esc(p?p.name:'')}">${ICONS.grip}</span>`:''}<span class="pos">${i+1}</span>${who(e)}<div class="m"><b>${esc(p?p.name:'Unbekannt')}${p&&!p.team?drg(p.id):''}</b><i>${esc(e.title+' · '+dDE(e.date))}</i></div>${done(e)}</div>`}).join('')+`</div>`:`<div class="empty">Alle offenen Kabinenfeste sind fest eingeplant.</div>`)}
    if(canKf())foot=`<button class="btn primary" data-act="addKf">${I('plus')}Kabinenfest hinzufügen</button>`;
  } else if(s.type==='editEntry'){
    const e=S.entries.find(x=>x.id===s.id);if(!e){closeSheet();return}
    const hist=(e.history||[]).slice().reverse(),pl=(String(e.playerId).startsWith('team-')?TEAM_ENT:[]).concat(sortedPlayers(true));
    head=`<h2>Eintrag bearbeiten</h2><p>${esc(e.title)}</p>`;
    body=`<div class="fields"><div class="field"><label for="ep">Person</label><select id="ep">${pl.map(p=>`<option value="${esc(p.id)}" ${e.playerId===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select></div>
      <div class="field"><label for="et">Bezeichnung</label><input id="et" value="${esc(e.title||'')}"></div>
      <div class="two"><div class="field"><label for="ea">Betrag (€)</label><input id="ea" inputmode="decimal" value="${String(e.amount??'').replace('.',',')}"></div><div class="field"><label for="ed">Datum</label><input id="ed" type="date" value="${esc(e.date||today())}"></div></div>
      <div class="field"><label for="en">Notiz</label><input id="en" value="${esc(e.note||'')}"></div>
      ${e.paid?'<div class="hint">Dieser Eintrag ist als bezahlt markiert. Ein neuer Betrag ändert auch, was als bezahlt gilt.</div>':''}</div>
      <h3 class="section-h">Änderungsprotokoll</h3>${hist.length?`<div class="rows">`+hist.map(h=>`<div class="row"><div class="m"><b>${esc(h.by||'?')}</b><i>${esc(dtDE(h.at))}</i>${(h.c||[]).map(x=>`<div class="hlog">${esc(x)}</div>`).join('')}</div></div>`).join('')+`</div>`:`<p class="note">Noch keine Änderungen.</p>`}`;
    foot=`<div class="split"><button class="btn" data-act="editBack">Abbrechen</button><button class="btn primary" data-act="saveEntry">Speichern</button></div>`;
  } else if(s.type==='receipt'){
    head=`<h2>Beleg hochladen</h2><p>Foto von der Rechnung oder Quittung – der Kassenwart trägt sie danach ein</p>`;
    body=`<div class="fields"><label class="btn filebtn" for="rcfile">${I('camera')}${s.blob?'Anderes Foto wählen':'Foto aufnehmen oder auswählen'}</label><input id="rcfile" type="file" accept="image/*" hidden>
      ${s.preview?`<img class="rbig" src="${esc(s.preview)}" alt="Vorschau des Belegs">`:''}
      <div class="field"><label for="rcn">Wofür? (optional)</label><input id="rcn" value="${esc(s.note||'')}" placeholder="z. B. Bier für den Heimspieltag"></div>
      <div class="two"><div class="field"><label for="rca">Betrag (€, optional)</label><input id="rca" inputmode="decimal" value="${esc(s.amount||'')}"></div><div class="field"><label for="rcd">Datum</label><input id="rcd" type="date" value="${esc(s.date||today())}"></div></div></div>`;
    foot=`<button class="btn primary" id="rcsave" data-act="saveReceipt" ${s.blob?'':'disabled'}>Hochladen</button>`;
  } else if(s.type==='receiptView'){
    const r=S.receipts.find(x=>x.id===s.id);if(!r){closeSheet();return}
    const p=pById(r.playerId),canDel=S.canWrite===true||(r.uid===S.uid&&r.status!=='verbucht');
    head=`<h2>Beleg von ${esc(p?p.name:'Unbekannt')}</h2><p>${esc(dDE(r.date)+(r.amount?' · '+eur(r.amount):'')+(r.status==='verbucht'?' · verbucht':''))}</p>`;
    body=`<img class="rbig" data-path="${esc(r.path)}" alt="Beleg">${r.note?`<p class="note" style="margin-top:12px">${esc(r.note)}</p>`:''}`;
    foot=`<div class="split">${canDel?`<button class="btn danger" data-act="delReceipt" data-id="${esc(r.id)}">${S.confirmDel==='rc'+r.id?'Wirklich löschen?':'Löschen'}</button>`:''}${S.canWrite===true&&r.status!=='verbucht'&&!s.back?`<button class="btn primary" data-act="receiptToBill" data-id="${esc(r.id)}">Als Rechnung eintragen</button>`:`<button class="btn" data-act="editBack">Zurück</button>`}</div>`;
  } else if(s.type==='settings'){
    const st=S.settings;
    head=`<h2>Zahlungsdaten &amp; Zahltag</h2><p>Wohin die Mannschaft bezahlt</p>`;
    body=`<div class="fields">
      <div class="field"><label for="sdpp">PayPal für Döner (E-Mail oder PayPal.Me-Name)</label><input id="sdpp" value="${esc(st.doenerPaypal||'')}" placeholder="leer lassen = kein PayPal-Knopf bei Döner" autocomplete="off"></div>
      <div class="field"><label for="spp">PayPal-E-Mail oder PayPal.Me-Name</label><input id="spp" value="${esc(st.paypal||'')}" placeholder="kasse@beispiel.de oder paypal.me/dragonskasse" autocomplete="off"></div>
      <div class="hint">Mit einem PayPal.Me-Namen öffnet sich PayPal direkt mit dem Betrag. Bei einer E-Mail-Adresse öffnet sich PayPals Zahlungsseite mit Adresse und Betrag schon ausgefüllt.</div>
      <div class="field"><label for="siban">IBAN für Überweisungen (optional)</label><input id="siban" value="${esc(fmtIban(st.iban||''))}" autocomplete="off" inputmode="text"></div>
      <div class="field"><label for="sowner">Kontoinhaber (optional)</label><input id="sowner" value="${esc(st.owner||'')}" autocomplete="off"></div>
      <div class="field"><label for="snote">Hinweis an die Mannschaft (optional)</label><input id="snote" value="${esc(st.payNote||'')}" placeholder="z. B. Bitte als „Freunde & Familie“ senden"></div></div>`;
    foot=`<button class="btn primary" data-act="saveSettings">Speichern</button>`;
  } else if(s.type==='bill'){
    const b=s.bill,ein=b.kind==='einzahlung';
    head=`<h2>${b.id?(ein?'Sondereinzahlung bearbeiten':'Rechnung bearbeiten'):(ein?'Neue Sondereinzahlung':'Neue Rechnung')}</h2><p>${ein?'Geld, das zusätzlich in die Kasse kommt (Sponsor, Spende …)':'Ausgabe fürs Team – erscheint in der Kostenliste'}</p>`;
    body=`<div class="fields">`;
    if(!ein){const cats=billCats(),own=!!b.cat&&!cats.includes(b.cat);
      body+=`<div class="field"><label for="bc">Kategorie</label><select id="bc"><option value="">Kategorie wählen …</option>${cats.map(c=>`<option value="${esc(c)}" ${b.cat===c?'selected':''}>${esc(c)}</option>`).join('')}<option value="__other" ${own?'selected':''}>Andere …</option></select></div><div class="field" id="bcown" ${own?'':'hidden'}><label for="bco">Eigene Kategorie</label><input id="bco" value="${own?esc(b.cat):''}" placeholder="z. B. Trikots" maxlength="40"><label class="check" style="margin-top:8px"><input type="checkbox" id="bcsave" checked> Kategorie speichern – steht dann immer in der Liste</label></div>`}
    body+=`<div class="field"><label for="bt">${ein?'Von wem / wofür':'Beschreibung (optional)'}</label><input id="bt" value="${esc(b.title||'')}" placeholder="${ein?'z. B. Sponsor Horn':'z. B. 3 Kisten nach dem Heimspiel'}"></div>
      <div class="two"><div class="field"><label for="ba">Betrag (€)</label><input id="ba" inputmode="decimal" value="${b.amount?String(b.amount).replace('.',','):''}"></div><div class="field"><label for="bd">Datum</label><input id="bd" type="date" value="${esc(b.date||today())}"></div></div>`;
    if(!ein){
      body+=`<div class="field"><label for="bp">Bezahlt von</label><select id="bp"><option value="">Mannschaftskasse</option>${sortedPlayers(true).map(p=>`<option value="${esc(p.id)}" ${b.paidBy===p.id?'selected':''}>${esc(p.name)} (ausgelegt → Gutschrift)</option>`).join('')}</select></div>`;
      if(!b.id){
        body+=`<label class="check"><input type="checkbox" id="bs" ${s.split?'checked':''}> Auf Spieler umlegen (als Sonderausgabe)</label>`;
        body+=`<div id="splitbox" ${s.split?'':'hidden'}><div class="field"><label for="bpp">Betrag pro Person (€)</label><input id="bpp" inputmode="decimal" value="${esc(s.per||'')}"></div><h3 class="section-h">Wer zahlt mit?</h3><div class="grid">`+sortedPlayers(false).map(p=>`<button class="pick" data-act="billpick" data-id="${esc(p.id)}" aria-pressed="${s.sel.has(p.id)}">${p.role==='Spieler'&&p.number!=null?`<span class="no">${p.number}</span>`:''}${avatar(p)}<b>${esc(p.name.split(' ')[0])}${drg(p.id)}</b><span class="ok">${ICONS.check}</span></button>`).join('')+`</div><p class="note" id="splitinfo"></p></div>`;
      } else if(b.splitIds?.length)body+=`<div class="hint">Umgelegt auf ${b.splitIds.length} Personen × ${eur(b.perPerson)}. Die Einträge stehen bei den Personen unter „Sonderausgaben“.</div>`;
    }
    const rc=b.receiptId&&S.receipts.find(x=>x.id===b.receiptId);
    body+=`<div class="field"><label for="bn">Notiz (optional)</label><input id="bn" value="${esc(b.note||'')}"></div>${rc?`<button class="rcbtn" data-act="viewReceipt" data-id="${esc(rc.id)}" data-back="1"><img class="rthumb" data-path="${esc(rc.path)}" alt=""><span><b>Beleg angehängt</b><small>Antippen zum Ansehen</small></span></button>`:''}</div>`;
    foot=`<div class="split">${b.id?`<button class="btn danger" data-act="delBill">${S.confirmDel==='bill'?'Wirklich löschen?':'Löschen'}</button>`:''}<button class="btn primary" data-act="saveBill" id="billsave">Speichern</button></div>`;
  } else if(s.type==='editFine'){
    const f=s.fine;
    head=`<h2>${f.id?'Strafe bearbeiten':'Neue Strafe'}</h2>`;
    body=`<div class="fields">
      <div class="field"><label for="ft">Bezeichnung</label><input id="ft" value="${esc(f.title)}"></div>
      <div class="field"><label for="fc">Kategorie</label><input id="fc" list="cats" value="${esc(f.cat||'')}"><datalist id="cats">${CAT_ORDER.map(c=>`<option value="${esc(c)}">`).join('')}</datalist></div>
      <div class="two"><div class="field"><label for="fb">Grundbetrag (€)</label><input id="fb" inputmode="decimal" value="${String(f.base||0).replace('.',',')}"></div>
      <div class="field"><label for="fp">Zusatz pro Einheit (€)</label><input id="fp" inputmode="decimal" value="${String(f.per||0).replace('.',',')}"></div></div>
      <div class="field"><label for="fu">Einheit (z. B. min, Teil, Tag, Stück)</label><input id="fu" value="${esc(f.unit||'')}"></div>
      <label class="check"><input type="checkbox" id="fk" ${f.kabinenfest?'checked':''}> Kabinenfest fällig</label>
      <label class="check"><input type="checkbox" id="fw" ${f.wuerfeln?'checked':''}> Wird gewürfelt</label>
      <div class="field"><label for="fh">Erklärung (optional)</label><textarea id="fh" rows="2">${esc(f.hint||'')}</textarea></div>
      <div class="field"><label for="fo">Reihenfolge</label><input id="fo" inputmode="numeric" value="${f.order??0}"></div></div>`;
    foot=`<div class="split">${f.id?`<button class="btn danger" data-act="delFine">${S.confirmDel==='fine'?'Wirklich löschen?':'Löschen'}</button>`:''}<button class="btn primary" data-act="saveFine">Speichern</button></div>`;
  } else if(s.type==='editPlayer'){
    const p=s.player,ph=s.preview||(s.photoDel?'':p.img);
    head=`<h2>${p.id?'Person bearbeiten':'Person hinzufügen'}</h2>`;
    body=`<div class="photo-edit">${avatar({...p,img:ph},'big')}<div><label class="btn filebtn" for="pfile">${I('camera')}${ph?'Anderes Foto':'Foto hinzufügen'}</label><input id="pfile" type="file" accept="image/*" hidden>${ph?`<button class="linkbtn" data-act="photoDel">Foto entfernen</button>`:''}</div></div><div class="fields">
      <div class="field"><label for="pn">Name</label><input id="pn" value="${esc(p.name||'')}"></div>
      <div class="two"><div class="field"><label for="pr">Rolle</label><input id="pr" list="roles" value="${esc(p.role||'Spieler')}"><datalist id="roles"><option value="Spieler"><option value="Trainer"><option value="Co-Trainer"><option value="Physio"><option value="Mannschaftsverantwortlicher"></datalist></div>
      <div class="field"><label for="pno">Rückennummer</label><input id="pno" inputmode="numeric" value="${p.number??''}"></div></div>
      <label class="check"><input type="checkbox" id="pa" ${p.active!==false?'checked':''}> Aktiv (erscheint beim Eintragen)</label>
      ${p.id&&S.entries.some(e=>e.playerId===p.id)?`<div class="hint">Zu ${esc(p.name)} gibt es ${S.entries.filter(e=>e.playerId===p.id).length} Einträge. Sie bleiben gespeichert, zählen aber nirgends mehr mit. Zum bloßen Ausblenden lieber „Aktiv“ ausschalten.</div>`:''}</div>`;
    foot=`<div class="split">${p.id?`<button class="btn danger" data-act="delPlayer">${S.confirmDel==='player'?'Wirklich löschen?':'Löschen'}</button>`:''}<button class="btn primary" data-act="savePlayer">Speichern</button></div>`;
  }
  // Ist schon ein Fenster offen, wird nur der Inhalt getauscht: kein Neuaufbau, keine Einblend-Animation, kein Flackern.
  const ex=root.querySelector('.sheet[role=dialog]'),hEl=ex&&ex.querySelector('.sheet-h .t'),bEl=ex&&ex.querySelector('.sheet-b');
  if(hEl&&bEl){
    let fEl=ex.querySelector('.sheet-f');
    // Hintergrund-Aktualisierung (neue Daten vom Server) ohne sichtbare Änderung: gar nichts anfassen
    if(refresh&&hEl.__html===head&&bEl.__html===body&&(fEl?fEl.__html:'')===foot){S.still=false;return}
    if(hEl.__html!==head||!refresh){hEl.innerHTML=head;hEl.__html=head}
    bEl.innerHTML=body;bEl.__html=body;
    if(foot){if(!fEl){fEl=document.createElement('div');fEl.className='sheet-f pad';ex.appendChild(fEl)}fEl.innerHTML=foot;fEl.__html=foot}else if(fEl)fEl.remove();
  }else{
    root.innerHTML=`<div class="scrim" data-act="scrim"><div class="sheet" role="dialog" aria-modal="true"><div class="grabber" aria-hidden="true"></div><div class="sheet-h pad"><div class="t">${head}</div><button class="iconbtn round" data-act="close" aria-label="Schließen">${I('x')}</button></div><div class="sheet-b pad">${body}</div>${foot?`<div class="sheet-f pad">${foot}</div>`:''}</div></div>`;
    if(S.still)root.querySelectorAll('.scrim,.sheet').forEach(e=>e.style.animation='none');
    const h2=root.querySelector('.sheet-h .t'),b2=root.querySelector('.sheet-b'),f2=root.querySelector('.sheet-f');h2.__html=head;b2.__html=body;if(f2)f2.__html=foot;
  }
  S.still=false;
  root.querySelector('.sheet-b').scrollTop=keepScroll;
  if(s.type==='fine')updateSubmit();
  hydrateImgs();
  if(s.type==='bill')updateSplit();
}
function monthGroups(pid,list){
  const g={};for(const e of list)(g[String(e.date||'').slice(0,7)||'ohne']??=[]).push(e);
  return Object.keys(g).sort().reverse().map(mo=>{
    const es=g[mo],tot=es.reduce((a,e)=>a+(e.amount||0),0),open=es.filter(e=>!e.paid).reduce((a,e)=>a+(e.amount||0),0);
    const key=pid+'|'+mo,isOpen=key in S.mOpen?S.mOpen[key]:(mo===curMonth()||open>0);
    return `<details class="mgroup" data-key="${esc(key)}" ${isOpen?'open':''}><summary><span class="mg-t"><b>${mo==='ohne'?'Ohne Datum':esc(monthName(mo))}</b><small>${es.length} ${es.length===1?'Eintrag':'Einträge'} · ${eur(tot)}</small></span>${open>0?`<span class="tag owe num">offen ${eur(open)}</span>`:'<span class="tag ok">bezahlt</span>'}${I('chevR').replace('class="ico"','class="ico chev"')}</summary><div class="rows">${es.map(e=>entryRow(e,false)).join('')}</div></details>`}).join('');
}
/* ---------- Fußball an der Decke: erst Spieler wählen, dann Treffer pro Spieler ---------- */
const deckePer=f=>f.per||f.base||1;
function deckeMult(s){return s.spieltag&&canSpieltag(s.fine)?2:1}
const deckeUnit=f=>f.unit||'Mal';
function deckeTotal(s){const mult=deckeMult(s);let n=0;for(const pid of s.sel)n+=(s.counts[pid]||0);return n*deckePer(s.fine)*mult}
function deckeSheet(s){
  const f=s.fine;s.counts??={};
  if(s.step!=='count'){
    return{head:`<h2>${esc(f.title)}</h2><p>Spieler antippen, dann „Weiter“</p>`,
      body:`<h3 class="section-h">Wer?</h3><div class="grid">`+sortedPlayers(false).map(p=>`<button class="pick" data-act="pick" data-id="${esc(p.id)}" aria-pressed="${s.sel.has(p.id)}">${p.role==='Spieler'&&p.number!=null?`<span class="no">${p.number}</span>`:''}${avatar(p)}<b>${esc(p.name.split(' ')[0])}${drg(p.id)}</b><small>${esc(p.role==='Spieler'?(p.name.split(' ').slice(1).join(' ')):p.role)}</small><span class="ok">${ICONS.check}</span></button>`).join('')+`</div>`,
      foot:`<button class="btn primary" id="dnext" data-act="dnext">Weiter</button>`};
  }
  const ps=sortedPlayers(false).filter(p=>s.sel.has(p.id));
  return{head:`<h2>${esc(f.title)}</h2><p>${esc(COUNT_FLOW[f.id])} pro Spieler · ${eur(deckePer(f))} pro ${esc(deckeUnit(f))}</p>`,
    body:`<div class="rows">`+ps.map(p=>`<div class="row dq">${avatar(p)}<div class="m"><b>${esc(p.name)}${drg(p.id)}</b><i>${p.role==='Spieler'&&p.number!=null?'#'+p.number:esc(p.role||'')}</i></div><div class="stepper"><button data-act="dqty" data-pid="${esc(p.id)}" data-d="-1" aria-label="Weniger ${esc(COUNT_FLOW[f.id])} für ${esc(p.name)}">${I('minus')}</button><input class="dqin" inputmode="numeric" data-pid="${esc(p.id)}" value="${s.counts[p.id]||0}" aria-label="${esc(COUNT_FLOW[f.id])} von ${esc(p.name)}"><button data-act="dqty" data-pid="${esc(p.id)}" data-d="1" aria-label="Mehr ${esc(COUNT_FLOW[f.id])} für ${esc(p.name)}">${I('plus')}</button></div></div>`).join('')+`</div>
      <div class="fields"><div class="field"><label for="dt">Datum</label><input id="dt" type="date" value="${esc(s.date)}"></div>
      ${canSpieltag(f)?`<label class="check"><input type="checkbox" id="spt" ${s.spieltag?'checked':''}> Spieltag – Strafe zählt doppelt</label><p class="note" id="sptinfo" style="margin:-6px 4px 0" ${s.spieltag?'':'hidden'}></p>`:''}
      <div class="field"><label for="nt">Notiz (optional)</label><input id="nt" value="${esc(s.note)}" placeholder="z. B. Training Dienstag"></div></div>`,
    foot:`<div class="split"><button class="btn" data-act="dback">Zurück</button><button class="btn primary" id="submit" data-act="submitFine"></button></div>`};
}
function deckeUpdate(s){
  if(s.step!=='count'){const b=$('#dnext');if(!b)return;const n=s.sel.size;b.disabled=!n;b.textContent=n?`Weiter (${n})`:'Weiter';return}
  const b=$('#submit');if(!b)return;const t=deckeTotal(s),n=[...s.sel].filter(pid=>(s.counts[pid]||0)>0).length;
  b.disabled=!(t>0)||S.status!=='ready'||!canEnter(s.fine)||s.busy;
  b.textContent=t>0?`Eintragen (${n}) · ${eur(t)}`:`${COUNT_FLOW[s.fine.id]} eintragen`;
  const si=$('#sptinfo');if(si){si.hidden=!s.spieltag;si.textContent=s.spieltag?`Doppelt: alle Beträge zählen ×2.`:''}
}
async function submitDecke(){
  const s=S.sheet,f=s.fine;if(!s||!S.db)return;s.busy=true;deckeUpdate(s);
  const mult=deckeMult(s),per=deckePer(f),now=new Date().toISOString(),col=S.db.collection('entries');
  const ids=[...s.sel].filter(pid=>(s.counts[pid]||0)>0);
  try{
    const refs=await Promise.all(ids.map(pid=>{const n=s.counts[pid],r=col.doc();return r.set({playerId:pid,fineId:f.id,col:f.col||COL_BY_FINE[f.id]||'strafen',title:f.title,amount:Math.round(n*per*mult*100)/100,qty:n,unit:deckeUnit(f),
      spieltag:mult===2,kabinenfest:false,kfDone:false,note:s.note.trim(),date:s.date||today(),createdAt:now,createdBy:S.uid||null,paid:false,paidAt:null}).then(()=>r)}));
    closeSheet();
    toast(`${f.title}: ${refs.length===1?esc(pById(ids[0])?.name||''):refs.length+' Spieler'} eingetragen`,async()=>{await Promise.all(refs.map(r=>r.delete()));toast('Rückgängig gemacht')});
  }catch(e){s.busy=false;deckeUpdate(s);toast(errMsg(e))}
}
function updateSplit(){
  const s=S.sheet,i=$('#splitinfo');if(!s||!i)return;
  const n=s.sel.size,per=num(s.per);
  i.textContent=n?`${n} ${n===1?'Person':'Personen'} × ${eur(per)} = ${eur(n*per)} als Sonderausgabe`:'Personen antippen, die mitzahlen.';
}
// Kategorien für Rechnungen: feste Liste, gespeicherte eigene (settings.billCats) und alle schon benutzten
const billCats=()=>[...new Set([...BILL_CATS,...(S.settings.billCats||[]),...S.bills.map(x=>x.cat).filter(c=>c&&c!=='Gutschrift'&&c!=='Sondereinzahlung')])];
async function saveBill(){
  const s=S.sheet,b=s.bill,ein=b.kind==='einzahlung';
  const d={kind:b.kind,cat:ein?'Sondereinzahlung':((()=>{const v=$('#bc').value;return v==='__other'?$('#bco').value.trim():v})()||'Sonstiges'),title:$('#bt').value.trim()||null,amount:Math.round(num($('#ba').value)*100)/100,
    date:$('#bd').value||today(),paidBy:ein?null:($('#bp').value||null),note:$('#bn').value.trim()||null,
    refunded:!!b.refunded,credited:b.credited||0,verrechnet:!!b.verrechnet,receiptId:b.receiptId||null,splitIds:b.splitIds||[],perPerson:b.perPerson||0,createdAt:b.createdAt||new Date().toISOString(),createdBy:b.createdBy||S.uid||null};
  if(!(d.amount>0)){toast('Bitte einen Betrag eingeben');return}
  if(!ein&&$('#bc').value==='__other'&&$('#bcsave')?.checked&&$('#bco').value.trim()&&!billCats().includes(d.cat)) // eigene Kategorie merken
    S.db.doc('settings/kasse').update({billCats:[...(S.settings.billCats||[]),d.cat]}).catch(e=>toast(errMsg(e)));
  if(b.id&&(b.credited||0)>0&&(d.paidBy!==(b.paidBy||null)||d.amount<(b.credited||0))){toast(`Mit dieser Rechnung wurden schon ${eur(b.credited)} Strafen bezahlt – Person und Betrag lassen sich nicht mehr ändern. Öffne zuerst diese Strafen wieder.`);return}
  const split=!b.id&&!ein&&s.split;
  if(split){if(!s.sel.size){toast('Bitte auswählen, wer mitzahlt');return}d.splitIds=[...s.sel];d.perPerson=Math.round(num(s.per)*100)/100;if(!(d.perPerson>0)){toast('Bitte Betrag pro Person eingeben');return}}
  const btn=$('#billsave');if(btn)btn.disabled=true;
  try{
    const id=b.id||('b'+Date.now().toString(36));
    await S.db.doc('bills/'+id).set(d);
    if(d.receiptId&&!b.id){try{await S.db.doc('receipts/'+d.receiptId).update({status:'verbucht',billId:id})}catch(e){}}
    if(split){const now=new Date().toISOString();const col=S.db.collection('entries');
      await Promise.all(d.splitIds.map(pid=>col.doc().set({playerId:pid,fineId:null,billId:id,col:'sonder',title:d.title||d.cat,amount:d.perPerson,qty:null,unit:null,kabinenfest:false,kfDone:false,note:d.cat,date:d.date,createdAt:now,createdBy:S.uid||null,paid:false,paidAt:null})))}
    closeSheet();toast(split?`Rechnung gespeichert und auf ${d.splitIds.length} Personen umgelegt`:'Gespeichert');
  }catch(e){if(btn)btn.disabled=false;toast(errMsg(e))}
}
function updateSubmit(){
  if(S.sheet&&S.sheet.type==='fine'&&countFine(S.sheet.fine)){deckeUpdate(S.sheet);return}
  const s=S.sheet,b=$('#submit');if(!b||!s)return;
  const a=fineAmount(s),n=s.sel.size,np=[...s.sel].filter(i=>!String(i).startsWith('team-')).length;
  b.disabled=!n||(a<=0&&!s.kf)||S.status!=='ready'||!canEnter(s.fine)||s.busy;
  b.textContent=!n?'Person(en) auswählen':`Eintragen für ${n} ${n===1?'Person':'Personen'} · ${eur(a*np)}${s.kf?' + Kabinenfest':''}`;
  const amt=$('#amt');if(amt&&!s.touched&&document.activeElement!==amt)amt.value=String(baseAmount(s)).replace('.',',');
  const si=$('#sptinfo');if(si){si.hidden=!s.spieltag;si.textContent=s.spieltag?`Doppelt: ${eur(a)} pro Person statt ${eur(a/2)}.`:''}
}

/* ---------- Zahltag ---------- */
async function startZahltag(){
  if(!isKW()){toast('Nur Kassenwart und Admin können den Zahltag starten');return}
  if(zOpen()){toast('Es läuft schon ein Zahltag');return}
  // zuerst Guthaben verrechnen: Einträge, die das Guthaben komplett abdeckt, gelten danach als bezahlt
  let credited=0;try{const {data,error}=await S.sb.rpc('apply_credit_all');if(error)throw error;credited=data||0;await S.db.refresh('entries','bills')}catch(e){toast('Guthaben konnte nicht verrechnet werden: '+(e.message||e));return}
  const now=Date.now(),due={},entryIds=[];
  for(const p of sortedPlayers(true)){const b=balance(p.id),a=toPay(b);if(a>0){due[p.id]=a;for(const e of S.entries)if(e.playerId===p.id&&!e.paid)entryIds.push(e.id)}}
  const z={active:true,runId:'z'+now.toString(36),startedAt:new Date(now).toISOString(),endsAt:new Date(now+7*DAY).toISOString(),due,entryIds,startedBy:S.uid};
  try{await S.db.doc('zahltag/'+z.runId).set(z);toast(`Zahltag gestartet – ${Object.keys(due).length} Personen haben 7 Tage Zeit${credited?` · ${credited} Einträge mit Guthaben verrechnet`:''}`)}catch(e){toast(errMsg(e))}
}
let penBusy=false,penLast=0;
async function checkPenalties(){
  const z=zt();if(!z||z.penaltiesApplied||penBusy||!S.sb||S.status!=='ready'||Date.now()<Date.parse(z.endsAt)||Date.now()-penLast<60000)return;
  penBusy=true;penLast=Date.now();
  try{const {data,error}=await S.sb.rpc('apply_late_fees');if(!error&&data)toast(`Zahltag abgelaufen: ${data}× automatisch ${eur(LATE_FEE)} Zahlungsverzug eingetragen`)}catch(e){}finally{penBusy=false}
}
setInterval(()=>{if(zt()){render();checkPenalties()}},60000);

/* Wer rechtzeitig gemeldet hat und dessen Zahlung bestätigt wird, bekommt die Verzugsstrafe erlassen */
async function liftPenalty(pid,justPaid){
  let n=0;
  for(const pe of S.entries.filter(e=>e.auto&&e.playerId===pid&&!e.paid&&/^verzug-/.test(e.id))){
    const z=S.zahltags.find(x=>x.runId===pe.id.split('-')[1]);if(!z)continue;
    const ids=new Set(z.entryIds||[]);
    const inTime=S.entries.filter(e=>ids.has(e.id)&&e.playerId===pid).every(e=>justPaid.has(e.id)?(!!e.reportedAt&&Date.parse(e.reportedAt)<=Date.parse(z.endsAt)):!!e.paid);
    if(inTime){await S.db.doc('entries/'+pe.id).delete();n++}
  }
  return n;
}
/* ---------- Schreiben ---------- */
let toastT;
function toast(msg,undo){const t=$('#toast');t.innerHTML=`<span>${esc(msg)}</span>${undo?'<button data-act="undo">Rückgängig</button>':''}`;t.hidden=false;S.undo=undo||null;clearTimeout(toastT);toastT=setTimeout(()=>{t.hidden=true;S.undo=null},undo?7000:3500)}
function errMsg(e){const c=e&&e.code;if(e&&/schon Strafen bezahlt/.test(String(e.message)))return String(e.message);return c==='invalid_argument'?'Keine Berechtigung zum Speichern.':c==='quota_exceeded'?'Speicher voll – bitte alte Einträge löschen.':'Speichern fehlgeschlagen. Bitte noch einmal versuchen.'}
async function submitFine(){
  if(S.sheet&&S.sheet.fine&&countFine(S.sheet.fine))return submitDecke();
  const s=S.sheet;if(!s||!S.db)return;s.busy=true;updateSubmit();
  const a=Math.round(fineAmount(s)*100)/100,f=s.fine;const now=new Date().toISOString();const col=S.db.collection('entries');
  try{
    const refs=await Promise.all([...s.sel].map(pid=>{const r=col.doc();return r.set({playerId:pid,fineId:f.id||null,title:f.title,amount:String(pid).startsWith('team-')?0:a,qty:f.per?s.qty:null,unit:f.per?(f.unit||'Stück'):null,
      col:f.id?(f.col||COL_BY_FINE[f.id]||'strafen'):(s.col||'strafen'),spieltag:!!(s.spieltag&&canSpieltag(f)),kabinenfest:!!s.kf,kfDone:false,note:s.note.trim(),date:s.date||today(),createdAt:now,createdBy:S.uid||null,paid:false,paidAt:null}).then(()=>r)}));
    const n=refs.length;closeSheet();
    toast(`${f.title}: ${n===1?esc(pById([...s.sel][0])?.name||''):n+' Personen'} eingetragen`,async()=>{await Promise.all(refs.map(r=>r.delete()));toast('Rückgängig gemacht')});
  }catch(e){s.busy=false;updateSubmit();toast(errMsg(e))}
}
async function setEntry(id,patch){try{await S.db.doc('entries/'+id).update(patch)}catch(e){toast(errMsg(e))}}

/* ---------- Events ---------- */
// Bälle-Plan tauschen, zwei Wege: ziehen (Maus sofort, Finger nach kurzem Halten) oder antippen und dann die Person in der anderen Woche antippen
(function(){let d=null;
  const end=()=>{if(!d)return;clearTimeout(d.t);d.g?.remove();d.c.classList.remove('lift');document.querySelectorAll('.bchip.target').forEach(x=>x.classList.remove('target'));S.drag=false;d=null};
  const at=e=>{const t=document.elementFromPoint(e.clientX,e.clientY)?.closest('.bchip');return t&&t!==d.c&&!t.classList.contains('fixed')&&t.dataset.doc!==d.c.dataset.doc?t:null};
  const move=(x,y)=>{d.x=x;d.y=y;d.g.style.transform=`translate(${x-30}px,${y-50}px)`};
  const start=()=>{S.drag=true;d.c.classList.add('lift');d.g=Object.assign(document.createElement('div'),{className:'bghost',textContent:d.c.textContent});document.body.append(d.g);move(d.x,d.y)};
  const tap=c=>{const b=S.bsel;document.querySelectorAll('.bchip.sel').forEach(x=>x.classList.remove('sel'));
    if(!b||b.doc===c.dataset.doc&&b.pid===c.dataset.pid){S.bsel=b?null:{doc:c.dataset.doc,pid:c.dataset.pid};if(!b){c.classList.add('sel');toast('Jetzt die Person in einer anderen Woche antippen')}return}
    S.bsel=null;if(b.doc!==c.dataset.doc)baelleSwap(b.doc,b.pid,c.dataset.doc,c.dataset.pid)};
  document.addEventListener('pointerdown',e=>{const c=e.target.closest&&e.target.closest('.bchip:not(.fixed)');if(!c||e.button>0)return;end();
    d={c,id:e.pointerId,x0:e.clientX,y0:e.clientY,x:e.clientX,y:e.clientY,touch:e.pointerType==='touch'};if(d.touch)d.t=setTimeout(start,200);else e.preventDefault()});
  document.addEventListener('pointermove',e=>{if(!d||e.pointerId!==d.id)return;const far=Math.hypot(e.clientX-d.x0,e.clientY-d.y0);
    if(!S.drag){if(d.touch?far>8:far<4)return d.touch&&end();start()}
    move(e.clientX,e.clientY);document.querySelectorAll('.bchip.target').forEach(x=>x.classList.remove('target'));at(e)?.classList.add('target')});
  document.addEventListener('pointerup',e=>{if(!d||e.pointerId!==d.id)return;const drag=S.drag,t=drag&&at(e),c=d.c,far=Math.hypot(e.clientX-d.x0,e.clientY-d.y0);end();
    if(t)baelleSwap(c.dataset.doc,c.dataset.pid,t.dataset.doc,t.dataset.pid);else if(far<8)tap(c)});
  document.addEventListener('pointercancel',end);
})();
// Blauer Kopf oben: beim Runterscrollen ausblenden, beim Hochscrollen wieder einblenden
(function(){let y=scrollY;
  addEventListener('scroll',()=>{const b=document.querySelector('.appbar');if(!b)return;const c=scrollY,d=c-y;if(Math.abs(d)<6)return;
    b.classList.toggle('away',c>60&&d>0&&!document.body.classList.contains('locked'));y=c},{passive:true})})();
// Wischen nach links auf einem Verlauf-Eintrag legt den Löschen-Knopf frei; nur bei horizontaler Bewegung
(function(){let sw=null;const W=104;
  document.addEventListener('pointerdown',e=>{const r=e.target.closest&&e.target.closest('.swipe');if(!r||e.target.closest('.swipe-act'))return;
    sw={r,in:r.querySelector('.swipe-in'),x0:e.clientX,y0:e.clientY,dx:0,id:e.pointerId,lock:false,open:r.classList.contains('open')}});
  document.addEventListener('pointermove',e=>{if(!sw||e.pointerId!==sw.id)return;
    const dx=e.clientX-sw.x0,dy=e.clientY-sw.y0;
    if(!sw.lock){if(Math.abs(dx)<8&&Math.abs(dy)<8)return;if(Math.abs(dy)>Math.abs(dx)){sw=null;return}
      sw.lock=true;S.confirmDel=null;sw.in.style.transition='none';document.querySelectorAll('.swipe.open').forEach(x=>{if(x!==sw.r)x.classList.remove('open')})}
    sw.dx=Math.min(0,Math.max(-W-16,(sw.open?-W:0)+dx));sw.in.style.transform=`translateX(${sw.dx}px)`});
  const end=e=>{if(!sw||e.pointerId!==sw.id)return;const s=sw;sw=null;
    if(!s.lock){if(s.open)s.r.classList.remove('open');return}
    s.in.style.transition='';s.in.style.transform='';s.r.classList.toggle('open',s.dx<-W/2)};
  document.addEventListener('pointerup',end);document.addEventListener('pointercancel',end);
})();
(function(){let drag=null;
  document.addEventListener('pointerdown',e=>{const g=e.target.closest&&e.target.closest('.grip');if(!g)return;const row=g.closest('.kfrow'),box=$('#kflist');if(!row||!box)return;
    e.preventDefault();g.setPointerCapture(e.pointerId);row.classList.add('dragging');drag={g,row,box,sc:box.closest('.sheet-b'),id:e.pointerId}});
  document.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.id)return;const{row,box,sc}=drag;
    const r=sc.getBoundingClientRect();if(e.clientY<r.top+50)sc.scrollTop-=10;else if(e.clientY>r.bottom-90)sc.scrollTop+=10;
    const others=[...box.querySelectorAll('.kfrow')].filter(x=>x!==row);let before=null;
    for(const o of others){const b=o.getBoundingClientRect();if(e.clientY<b.top+b.height/2){before=o;break}}
    if(before!==row.nextElementSibling)box.insertBefore(row,before)});
  const end=e=>{if(!drag||e.pointerId!==drag.id)return;const{row,box}=drag;row.classList.remove('dragging');drag=null;
    const ids=[...box.querySelectorAll('.kfrow')].map(x=>x.dataset.id);kfSave(ids);box.querySelectorAll('.pos').forEach((x,i)=>x.textContent=i+1)};
  document.addEventListener('pointerup',end);document.addEventListener('pointercancel',end);
  document.addEventListener('keydown',e=>{const g=e.target.closest&&e.target.closest('.grip');if(!g||(e.key!=='ArrowUp'&&e.key!=='ArrowDown'))return;e.preventDefault();
    const ids=kfQueue().map(x=>x.id),i=ids.indexOf(g.dataset.id),j=i+(e.key==='ArrowUp'?-1:1);if(i<0||j<0||j>=ids.length)return;
    [ids[i],ids[j]]=[ids[j],ids[i]];kfSave(ids);S.still=true;renderSheet(false);const n=document.querySelector('.grip[data-id="'+g.dataset.id+'"]');if(n)n.focus()});
})();
document.addEventListener('click',async ev=>{
  const el=ev.target.closest('[data-act]');if(!el)return;const act=el.dataset.act,id=el.dataset.id;S.fromPush=el.dataset.from==='push';if(S.fromPush)setTimeout(()=>S.fromPush=false); // gilt nur für das Fenster, das dieser Klick öffnet
  if(act==='scrim'&&ev.target!==el)return;
  switch(act){
    case 'tab':goTab(el.dataset.k);break;
    case 'fine':{const f=S.fines.find(x=>x.id===id);if(f)openSheet({type:'fine',fine:f,sel:new Set(S.preselect?[S.preselect]:[]),qty:f.per&&!f.base?1:0,touched:false,amount:0,spieltag:false,kf:!!f.kabinenfest&&S.canWrite===true,note:'',date:today()});S.preselect=null;break}
    case 'free':openSheet({type:'fine',fine:{id:null,title:'Sonstiges',base:0,per:0,hint:'Freier Betrag, z. B. Würfelergebnis oder Beitrag, der nicht im Katalog steht. Beschreibe ihn in der Notiz.'},sel:new Set(S.preselect?[S.preselect]:[]),qty:0,touched:true,amount:0,spieltag:false,kf:false,note:'',date:today(),col:'strafen'});S.preselect=null;break;
    case 'fav':{const i=S.favs.indexOf(id);if(i>=0)S.favs.splice(i,1);else S.favs.push(id);saveFavs();const fl=$('#finelist');if(fl)fl.innerHTML=fineList();break}
    case 'ksort':S.ksort=el.dataset.k;try{localStorage.setItem('ksort',S.ksort)}catch(e){}render();break;
    case 'kview':S.kview=el.dataset.k;if(S.kview==='statistik')S.loadAnzRank?.();render();break;
    case 'smode':S.smode=el.dataset.k;render();break;
    case 'bmon':{S.bClosed[el.dataset.m]=!S.bClosed[el.dataset.m];render();break}
    case 'month':{const ps=periods();let i=S.month==='saison'?ps.length:ps.indexOf(S.month);i+=Number(el.dataset.d);S.month=i>=ps.length?'saison':ps[Math.max(0,i)];render();break}
    case 'editBill':{const b=id?S.bills.find(x=>x.id===id):{kind:el.dataset.k||'ausgabe',date:today()};if(b)openSheet({type:'bill',bill:{...b},sel:new Set(),split:false,per:''});break}
    case 'billpick':{const s=S.sheet;s.sel.has(id)?s.sel.delete(id):s.sel.add(id);el.setAttribute('aria-pressed',s.sel.has(id));
      if(!s.perTouched&&s.sel.size){s.per=String(Math.round(num($('#ba').value)/s.sel.size*100)/100).replace('.',',');$('#bpp').value=s.per}updateSplit();break}
    case 'saveBill':saveBill();break;
    case 'openKf':S.still=true;openSheet({type:'kf',view:'liste'});break;
    case 'kfcal':{const s=S.sheet,n=bToday(),c=s.cal||{y:n.getFullYear(),m:n.getMonth()},x=new Date(c.y,c.m+ +el.dataset.d,1);s.cal={y:x.getFullYear(),m:x.getMonth()};S.still=true;renderSheet(false);break}
    case 'kfview':S.sheet.view=el.dataset.k;S.still=true;renderSheet(false);break;
    case 'addKf':closeSheet();openSheet({type:'fine',fine:{id:'kf-manual',title:'Kabinenfest',base:0,per:0,kabinenfest:true,hint:'Kabinenfest ohne Strafbetrag eintragen. Den Grund schreibst du in die Notiz.'},sel:new Set(),qty:0,touched:true,amount:0,spieltag:false,kf:true,note:'',date:today(),col:'strafen'});break;
    case 'editSettings':openSheet({type:'settings'});break;
    case 'openZR':if(isKW())openSheet({type:'zr',zid:id});break;
    case 'zsel':S.sheet.zid=id;renderSheet(false);break;
    case 'zrCopy':{const z=zAll().find(x=>(x.runId||x.id)===id);if(!z)break;const r=zReview(z);
      const lines=r.rows.filter(x=>x.st==='open').map(x=>`${x.p?x.p.name:'?'}: ${eur(x.rest)}`);
      const txt=`Dragons Kasse – Zahltag bis ${dtDE(z.endsAt)}\n\nNoch nicht bezahlt:\n${lines.join('\n')}\n\nGesamt offen: ${eur(r.open)}`;
      try{await navigator.clipboard.writeText(txt);toast('Kopiert – jetzt in die Gruppe einfügen')}catch(e){toast('Kopieren nicht möglich')}break}
    case 'openKasse':if(isKW())openSheet({type:'kasse'});break;
    case 'rpPdf':{if(!isKW())break;const m=$('#rpm')?.value||S.rpm||'saison';S.rpm=m;printReport(m);break}
    case 'rpCsv':{if(!isKW())break;const m=$('#rpm')?.value||S.rpm||'saison';S.rpm=m;downloadFile(`dragons-kasse-${m==='saison'?'saison':m}.csv`,reportCsv(m),'text/csv;charset=utf-8');toast('Tabelle heruntergeladen – öffnet sich mit Excel');break}
    case 'kasseEdit':S.sheet.editStart=true;renderSheet(false);break;
    case 'kasseCancel':S.sheet.editStart=false;renderSheet(false);break;
    case 'kasseStart':{if(!isKW())break;const date=$('#ksd').value,amount=r2(num($('#ksa').value));
      if(!date){toast('Bitte ein Datum wählen');break}if(!/\d/.test($('#ksa').value)){toast('Bitte den Bestand eintragen');break}
      try{await S.db.doc('kasse_intern/kassenstand').set({...(S.kstand||{}),start:{date,amount,setAt:new Date().toISOString(),by:pById(myPid())?.name||null}});S.sheet.editStart=false;renderSheet(false);toast('Startbestand gespeichert')}catch(e){toast(errMsg(e))}break}
    case 'kasseSave':{if(!isKW())break;const k=kasseSoll();if(!k)break;
      if(!['kk','kp','kb'].some(id=>/\d/.test($('#'+id).value))){toast('Bitte mindestens einen Betrag eintragen');break}
      const c={at:new Date().toISOString(),soll:k.soll,ist:kasseIst(),konto:r2(num($('#kk').value)),paypal:r2(num($('#kp').value)),bar:r2(num($('#kb').value)),note:$('#kn').value.trim()||null,by:pById(myPid())?.name||null};
      try{await S.db.doc('kasse_intern/kassenstand').set({...(S.kstand||{}),checks:[c,...((S.kstand||{}).checks||[])].slice(0,50)});renderSheet(false);const d=r2(c.ist-c.soll);toast(d===0?'Gespeichert – Kasse passt genau':`Gespeichert – ${d>0?'+ ':'− '}${eur(Math.abs(d))} Abweichung`)}catch(e){toast(errMsg(e))}break}
    case 'backup':{if(!isKW()||S.busyBackup)break;S.busyBackup=true;render();
      try{const c=await makeBackup();toast(`Backup gespeichert – ${c.entries} Einträge, ${c.bills} Rechnungen${c.noStamp?' (Zeitpunkt konnte nicht vermerkt werden)':''}`)}catch(e){toast('Backup fehlgeschlagen: '+(e.message||e))}finally{S.busyBackup=false;render()}break}
    case 'saveSettings':{const ib=$('#siban').value.replace(/\s/g,'').toUpperCase();
      if(ib&&!ibanOk(ib)){toast('Die IBAN ist ungültig – bitte prüfen');break}
      const d={...S.settings,iban:ib||null,owner:$('#sowner').value.trim()||null,paypal:$('#spp').value.trim()||null,doenerPaypal:$('#sdpp').value.trim()||null,payNote:$('#snote').value.trim()||null};
      try{await S.db.doc('settings/kasse').set(d);closeSheet();toast('Gespeichert')}catch(e){toast(errMsg(e))}break}
    case 'linkMe':{try{await S.db.doc('links/'+S.uid).set({playerId:id,at:new Date().toISOString()});toast('Verknüpft – du bist '+(pById(id)?.name||''))}catch(e){toast(errMsg(e))}break}
    case 'kwConfirm':{try{await S.db.doc('settings/kasse').set({...S.settings,kassenwartPlayer:kwPid(),kassenwartUid:id});toast('Kassenwart bestätigt')}catch(e){toast(errMsg(e))}break}
    case 'kwReset':{const d={...S.settings};delete d.kassenwartUid;try{await S.db.doc('settings/kasse').set(d);toast('Kassenwart zurückgesetzt')}catch(e){toast(errMsg(e))}break}
    case 'startZahltag':startZahltag();break;
    case 'logout':try{const reg=await swReg(),sub=reg&&await reg.pushManager.getSubscription();if(sub){await S.sb.from('push_subs').delete().eq('endpoint',sub.endpoint);await sub.unsubscribe()}}catch(e){} // Gerät soll nach dem Abmelden keine Nachrichten mehr bekommen
      clearLocalData();await S.sb.auth.signOut();location.reload();break;
    case 'pushOn':{const perm=Notification.requestPermission();el.disabled=true; // Erlaubnis direkt beim Tippen anfragen (iOS verlangt das)
      try{if(await perm!=='granted'){toast('Ohne deine Erlaubnis geht es leider nicht');await pushLoad();break}
        const reg=await swReg();if(!reg)throw new Error('Service Worker fehlt');
        // öffentlichen Schlüssel vom Server holen (beim allerersten Mal richtet der Server sich kurz ein)
        let vk=null;for(let i=0;i<4&&!vk;i++){const {data}=await S.sb.rpc('push_vapid_key');vk=data;if(!vk)await new Promise(r=>setTimeout(r,2500))}
        if(!vk){toast('Push wird auf dem Server noch eingerichtet – bitte in einer Minute nochmal');await pushLoad();break}
        let sub=await reg.pushManager.getSubscription();
        if(sub&&sub.options&&sub.options.applicationServerKey&&btoa(String.fromCharCode(...new Uint8Array(sub.options.applicationServerKey))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')!==vk){await sub.unsubscribe();sub=null} // alter Schlüssel → neu anmelden
        if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64uToU8(vk)});
        const j=sub.toJSON();const {error}=await S.sb.from('push_subs').upsert({endpoint:j.endpoint,user_id:S.uid,p256dh:j.keys.p256dh,auth:j.keys.auth,prefs:{},updated_at:new Date().toISOString()});if(error)throw error;
        toast('Benachrichtigungen sind an 🔔');await pushLoad()}
      catch(e){el.disabled=false;toast('Einschalten hat nicht geklappt: '+(e.message||e))}break}
    case 'pushOff':{el.disabled=true;try{const sub=S.push?.sub;if(sub){await S.sb.from('push_subs').delete().eq('endpoint',sub.endpoint);await sub.unsubscribe()}toast('Benachrichtigungen sind aus')}catch(e){toast(errMsg(e))}await pushLoad();break}
    case 'pushTest':{el.disabled=true;const {data,error}=await S.sb.rpc('push_test');el.disabled=false;toast(error?(/nicht eingerichtet/.test(error.message)?'Push ist auf dem Server noch nicht eingerichtet':'Test hat nicht geklappt: '+error.message):data?'Test verschickt – sollte gleich ankommen':'Für dieses Konto ist kein Gerät angemeldet');break}
    case 'approve':{const m=S.members.find(x=>x.user_id===id);if(!m)break;const {error}=await S.sb.from('members').update({approved:!m.approved}).eq('user_id',id);toast(error?error.message:(m.approved?'Gesperrt':'Freigeschaltet'));break}
    case 'editRoles':{const m=S.members.find(x=>x.user_id===id);if(m)openSheet({type:'roles',uid:id,sel:rolesOf(m)});break}
    case 'saveRoles':{const s=S.sheet,sel=[...document.querySelectorAll('#sheetRoot [data-role]:checked')].map(x=>x.dataset.role);el.disabled=true;
      // es gibt nur einen Kassenwart: bei den anderen die Rolle entfernen
      let error=null;
      if(sel.includes('kassenwart'))for(const m of S.members)if(!error&&m.user_id!==s.uid&&rolesOf(m).includes('kassenwart'))({error}=await S.sb.from('members').update(splitRoles(rolesOf(m).filter(r=>r!=='kassenwart'))).eq('user_id',m.user_id));
      if(!error)({error}=await S.sb.from('members').update(splitRoles(sel)).eq('user_id',s.uid));el.disabled=false;
      if(error){toast(error.message);break}toast('Rollen gespeichert');closeSheet();break}
    case 'anzNew':openSheet({type:'anzNew'});break;
    case 'anzView':openSheet({type:'anzView',id});break;
    case 'anzSave':anzSave(el);break;
    case 'anzPick':{const s=S.sheet,l=s.pids||(s.pids=[]),i=l.indexOf(id);if(i<0)l.push(id);else l.splice(i,1);s.nr=$('#annr')?.value.trim()||s.nr||null; // antippen = auswählen / abwählen
      el.setAttribute('aria-pressed',i<0);const w=document.querySelector('[data-act="anzWeiter"]');if(w){w.disabled=!l.length;w.textContent=l.length?`Weiter mit ${l.length} ${l.length===1?'Person':'Personen'}`:'Person(en) antippen'}break}
    case 'anzWeiter':if(S.sheet.pids?.length){S.sheet.wer=true;S.still=true;renderSheet(false)}break;
    case 'anzFine':S.sheet.fid=id;S.sheet.counts={};S.still=true;renderSheet(false);break;
    case 'anzqty':{const s=S.sheet,f=S.fines.find(x=>x.id===s.fid),pid=el.dataset.pid;if(f)anzQtySet(pid,Math.max(0,Math.min(999,(s.counts?.[pid]??anzQty0(f))+Number(el.dataset.d))));break}
    case 'anzStep':{const s=S.sheet;s.note=$('#ann')?.value??s.note;if(el.dataset.k==='wer'){s.wer=false;s.fid=null}else s.fid=null;S.still=true;renderSheet(false);break}
    case 'anzOk':{const a=(S.anzeigen||[]).find(x=>x.id===id);if(a&&S.canWrite)anzOk(el,a);break}
    case 'anzNo':if(S.confirmDel!=='an'+id){S.confirmDel='an'+id;S.still=true;renderSheet(false);break}S.confirmDel=null;try{const a=(S.anzeigen||[]).find(x=>x.id===id);await S.db.doc('anzeigen/'+id).update({status:'nein',doneAt:new Date().toISOString(),path:null});
      if(a&&a.path&&!fotoGeteilt(a))try{await S.sb.storage.from('anzeigen').remove([a.path])}catch(_){} // abgelehnt: Foto nicht aufbewahren (außer andere Anzeigen brauchen es)
      closeSheet();toast('Anzeige abgelehnt')}catch(e){toast(errMsg(e))}break;
    case 'anzDel':{const a=(S.anzeigen||[]).find(x=>x.id===id);if(!a)break;if(S.confirmDel!=='ad'+id){S.confirmDel='ad'+id;S.still=true;renderSheet(false);break}S.confirmDel=null;
      try{await S.db.doc('anzeigen/'+id).delete();if(a.path&&!fotoGeteilt(a))try{await S.sb.storage.from('anzeigen').remove([a.path])}catch(_){}closeSheet();toast('Anzeige zurückgezogen')}catch(e){toast(errMsg(e))}break}
    case 'openWuerfel':S.still=true;openSheet({type:'wuerfel'});break;
    case 'wfNew':if(S.canWrite)openSheet({type:'wuerfelAdd',sel:new Set(),name:''});break;
    case 'wfPick':{const s=S.sheet;s.name=$('#wfn')?.value||'';s.sel.has(id)?s.sel.delete(id):s.sel.add(id);S.still=true;renderSheet(false);break}
    case 'wfSave':{if(!S.canWrite)break;const s=S.sheet,v=$('#wfn').value.trim().slice(0,80),now=new Date().toISOString();
      const fp=v&&S.players.find(x=>x.name.toLowerCase()===v.toLowerCase()),items=[...[...s.sel].map(id=>({name:pById(id)?.name||id,pid:id})),...(v?[{name:fp?fp.name:v,pid:fp?fp.id:null}]:[])];
      if(!items.length){toast('Bitte Spieler antippen oder einen Namen eingeben');break}el.disabled=true;
      try{await Promise.all(items.map(x=>S.db.collection('wuerfel').add({...x,createdAt:now})));toast(items.length===1?items[0].name+' muss würfeln 🎲':items.length+' müssen würfeln 🎲');S.still=true;openSheet({type:'wuerfel'})}catch(e){el.disabled=false;toast(errMsg(e))}break}
    case 'wfDone':try{await S.db.doc('wuerfel/'+id).delete();S.still=true;renderSheet(false)}catch(e){toast(errMsg(e))}break;
    case 'openBerichte':S.still=true;openSheet({type:'berichte'});break;
    case 'openSchulden':if(hasRole('kassenwart'))openSheet({type:'schulden'});break;
    case 'schuldAdd':{const name=$('#sdn').value.trim(),amount=Math.round(num($('#sda').value)*100)/100,note=$('#sdt').value.trim()||null;
      if(!name){toast('Bitte einen Namen eingeben');break}if(!(amount>0)){toast('Bitte einen Betrag eingeben');break}
      el.disabled=true;try{await S.db.collection('schulden').add({name,amount,note,done:false,createdAt:new Date().toISOString()});toast('Eingetragen');S.still=true;renderSheet(false)}catch(e){el.disabled=false;toast(errMsg(e))}break}
    case 'schuldTick':{const x=(S.schulden||[]).find(y=>y.id===id);if(!x)break;try{await S.db.doc('schulden/'+id).update({done:!x.done,doneAt:x.done?null:new Date().toISOString()});S.still=true;renderSheet(false)}catch(e){toast(errMsg(e))}break}
    case 'schuldDel':if(S.confirmDel!=='sd'+id){S.confirmDel='sd'+id;S.still=true;renderSheet(false);break}S.confirmDel=null;try{await S.db.doc('schulden/'+id).delete();S.still=true;renderSheet(false)}catch(e){toast(errMsg(e))}break;
    case 'delMember':if(S.confirmDel!=='m'+id){S.confirmDel='m'+id;render();break}S.confirmDel=null;{const {error}=await S.sb.from('members').delete().eq('user_id',id);toast(error?error.message:'Entfernt')}break;
    case 'endZahltag':if(!S.confirmEnd){S.confirmEnd=true;render();setTimeout(()=>{S.confirmEnd=false;render()},5000);break}
      S.confirmEnd=false;try{await S.db.doc('zahltag/'+zt().runId).update({active:false,cancelledAt:new Date().toISOString()});toast('Zahltag beendet – keine Strafen')}catch(e){toast(errMsg(e))}break;
    case 'ppOpened':S.ppOpened=id;setTimeout(()=>{if(S.sheet)renderSheet(false)},400);break;
    case 'selfPaid':{if(id!==myPid()&&!S.canWrite){toast('Du kannst nur für dich selbst bezahlen');break}
      if(S.confirmPaid!==id){S.confirmPaid=id;renderSheet(false);break}
      S.confirmPaid=null;const now=new Date().toISOString();const open=S.entries.filter(e=>e.playerId===id&&!e.paid);
      try{
        if(isKW()){const r=await payEntries(id,open.map(e=>e.id),'kassenwart');toast(`${r.n} Einträge als bezahlt markiert${r.used>0?` – ${eur(r.used)} mit Guthaben verrechnet`:''}`);break}
        if(!S.canWrite){const {data,error}=await S.sb.rpc('report_self_paid');if(error){toast('Konnte nicht speichern: '+error.message);break}toast(`Danke! ${data} Einträge gemeldet – der Kassenwart bestätigt die Zahlung.`);break}
        const todo=open.filter(e=>!e.reported);await Promise.all(todo.map(e=>S.db.doc('entries/'+e.id).update({reported:true,reportedAt:now,reportedBy:S.uid||null})));toast(`Danke! ${todo.length} Einträge gemeldet – der Kassenwart bestätigt die Zahlung.`)
      }catch(e){toast(errMsg(e))}break}
    case 'unreport':{if(id!==myPid()){break}
      try{if(!S.canWrite){const {error}=await S.sb.rpc('undo_self_report');if(error){toast('Konnte nicht speichern: '+error.message);break}}
        else await Promise.all(S.entries.filter(e=>e.playerId===id&&!e.paid&&e.reported).map(e=>S.db.doc('entries/'+e.id).update({reported:false})));
        toast('Meldung zurückgenommen')}catch(e){toast(errMsg(e))}break}
    case 'openConfirm':if(isKW()){markSeen(['zahlungen']);openSheet({type:'confirm'})}break;
    case 'confirmPay':{if(!isKW())break;const now=new Date().toISOString();const es=S.entries.filter(e=>e.playerId===id&&!e.paid&&e.reported);
      try{const used=(await payEntries(id,es.map(e=>e.id),'bestaetigt')).used;const lifted=await liftPenalty(id,new Set(es.map(e=>e.id)));
        toast(`Zahlung von ${pById(id)?.name||''} bestätigt${used?` – ${eur(used)} mit Guthaben verrechnet`:''}${lifted?' – Verzugsstrafe entfernt':''}`)}catch(e){toast(errMsg(e))}break}
    case 'rejectPay':{if(!isKW())break;const es=S.entries.filter(e=>e.playerId===id&&!e.paid&&e.reported);
      try{await Promise.all(es.map(e=>S.db.doc('entries/'+e.id).update({reported:false})));toast('Als nicht erhalten markiert – bleibt offen')}catch(e){toast(errMsg(e))}break}
    case 'copyTxt':{const v=el.dataset.v;try{await navigator.clipboard.writeText(v);toast('Kopiert')}catch(e){toast(v)}break}
    case 'copyPP':{const t=ppTarget();if(!t)break;try{await navigator.clipboard.writeText(t.v);toast('PayPal-Adresse kopiert')}catch(e){toast(t.v)}break}
    case 'editEntry':if(S.canWrite===true)openSheet({type:'editEntry',id,back:S.sheet});break;
    case 'editBack':rcBack(S.sheet);break;
    case 'saveEntry':saveEntry();break;
    case 'newReceipt':openSheet({type:'receipt',blob:null,preview:null,back:S.sheet});break;
    case 'saveReceipt':saveReceipt();break;
    case 'viewReceipt':{const cur=S.sheet;
      if(el.dataset.back&&cur&&cur.type==='bill'&&$('#ba')){const b=cur.bill,v=$('#bc')?.value;
        cur.bill={...b,cat:v==='__other'?($('#bco')?.value.trim()||''):(v||b.cat),title:$('#bt').value.trim()||null,amount:num($('#ba').value),date:$('#bd').value||b.date,paidBy:$('#bp')?$('#bp').value||null:b.paidBy,note:$('#bn').value.trim()||null}}
      openSheet({type:'receiptView',id,back:el.dataset.back?cur:null});break}
    case 'delReceipt':{const r=S.receipts.find(x=>x.id===id);if(!r)break;const k='rc'+id;
      if(S.confirmDel===k){try{await S.db.doc('receipts/'+id).delete();try{await S.sb.storage.from('belege').remove([r.path])}catch(e){}closeSheet();toast('Beleg gelöscht')}catch(e){toast(errMsg(e))}}
      else{S.confirmDel=k;renderSheet(false)}break}
    case 'receiptToBill':{const r=S.receipts.find(x=>x.id===id);if(!r)break;openSheet({type:'bill',bill:{kind:'ausgabe',date:r.date||today(),amount:r.amount||0,paidBy:r.playerId||null,note:r.note||null,receiptId:r.id},sel:new Set(),split:false,per:''});break}
    case 'delBill':if((S.sheet.bill.credited||0)>0){toast('Mit dieser Rechnung wurden schon Strafen bezahlt. Öffne zuerst diese Strafen wieder, dann kannst du sie löschen.');break}
      if(S.confirmDel==='bill'){const b=S.sheet.bill;try{const linked=S.entries.filter(e=>e.billId===b.id);await Promise.all(linked.map(e=>S.db.doc('entries/'+e.id).delete()));await S.db.doc('bills/'+b.id).delete();logChange(`Rechnung gelöscht: ${b.title||b.cat||'Rechnung'}`,b.amount);if(b.receiptId&&S.receipts.some(r=>r.id===b.receiptId)){try{await S.db.doc('receipts/'+b.receiptId).update({status:'neu',billId:null})}catch(_){}}closeSheet();toast(linked.length?`Rechnung und ${linked.length} umgelegte Einträge gelöscht`:'Rechnung gelöscht')}catch(e){toast(errMsg(e))}}
      else{S.confirmDel='bill';el.textContent=S.entries.some(e=>e.billId===S.sheet.bill.id)?'Inkl. umgelegter Einträge löschen?':'Wirklich löschen?'}break;
    case 'payout':{if(!isKW())break;const b=balance(id);if(S.confirmPayout!==id){S.confirmPayout=id;renderSheet(false);clearTimeout(S._pot);S._pot=setTimeout(()=>{S.confirmPayout=null;if(S.sheet)renderSheet(false)},4000);break}
      S.confirmPayout=null;try{const {data,error}=await S.sb.rpc('payout_credit',{pid:id});if(error)throw error;try{await S.db.refresh('bills')}catch(e){}
        toast(`${eur(data||b.credit)} Guthaben an ${pById(id)?.name||''} ausbezahlt`)}catch(e){toast(errMsg(e))}break}
    case 'copyMonth':{const o=S._lastOverview;if(!o)break;
      const lines=o.rows.filter(r=>r.aus||r.gut).map(r=>`${r.p.name}: ${eur(r.sum)}${r.gut?` (Ausgaben ${eur(r.aus)} − Gutschrift ${eur(r.gut)})`:''}`);
      const txt=`Mannschaftskasse – ${monthName(S.month)}\n\n${lines.join('\n')}\n\nEinnahmen: ${eur(o.einnahmen)}\nAusgaben: ${eur(o.ausgaben)}\nSondereinzahlungen: ${eur(o.sonderein)}\nNetto: ${eur(o.netto)}`;
      try{await navigator.clipboard.writeText(txt);toast('Kopiert – jetzt in die Gruppe einfügen')}catch(e){toast('Kopieren nicht möglich in dieser Ansicht')}break}
    case 'dnext':{const s=S.sheet;if(!s.sel.size)break;s.counts??={};for(const pid of s.sel)if(!(pid in s.counts))s.counts[pid]=1;s.step='count';renderSheet(false);const sb=$('.sheet-b');if(sb)sb.scrollTop=0;break}
    case 'dback':{S.sheet.step='pick';renderSheet(false);break}
    case 'dqty':{const s=S.sheet,pid=el.dataset.pid;s.counts[pid]=Math.max(0,(s.counts[pid]||0)+Number(el.dataset.d));const inp=document.querySelector(`.dqin[data-pid="${CSS.escape(pid)}"]`);if(inp)inp.value=s.counts[pid];deckeUpdate(s);break}
    case 'pickall':{const s=S.sheet,ids=sortedPlayers(false).map(p=>p.id),all=ids.every(i=>s.sel.has(i));ids.forEach(i=>all?s.sel.delete(i):s.sel.add(i));
      document.querySelectorAll('.sheet .pick').forEach(b=>b.setAttribute('aria-pressed',s.sel.has(b.dataset.id)));el.textContent=all?'Alle auswählen':'Auswahl aufheben';updateSubmit();break}
    case 'pick':{const s=S.sheet;s.sel.has(id)?s.sel.delete(id):s.sel.add(id);el.setAttribute('aria-pressed',s.sel.has(id));updateSubmit();break}
    case 'qty':{const s=S.sheet;s.qty=Math.max(0,(s.qty||0)+Number(el.dataset.d));$('#qty').value=s.qty;s.touched=false;updateSubmit();break}
    case 'submitFine':submitFine();break;
    case 'close':stepBack();break;
    case 'scrim':closeSheet();break;
    case 'openMenu':openSheet({type:'menu'});pushLoad();break;
    case 'openTrikot':case 'trikotBack':if(canTrikot()){S.still=true;openSheet({type:'trikot'})}break;
    case 'trikotEdit':if(canTrikot()){S.still=true;openSheet({type:'trikotEdit',id})}break;
    case 'trikotWash':{if(!isTrikotwart())break;const old=S.wash[id]||[],now=new Date().toISOString(),by=pById(myPid())?.name||S.email||null;
      if(old[0]&&old[0].at.slice(0,10)===now.slice(0,10)){toast('Heute schon als gewaschen eingetragen');break}
      const log=[{at:now,by},...old].slice(0,20);el.disabled=true;
      try{await S.db.doc('trikotwash/'+id).set({log});toast(`Gewaschen: ${pById(id)?.name||''} 🧺`,async()=>{if(old.length)await S.db.doc('trikotwash/'+id).set({log:old});else await S.db.doc('trikotwash/'+id).delete()});S.still=true;openSheet({type:'trikot'})}
      catch(e){el.disabled=false;toast(errMsg(e))}break}
    case 'trikotSave':{if(!isTrikotwart())break;const v=$('#gbd')?.value||'';if(!validBirth(v)){toast('Bitte ein gültiges Geburtsdatum wählen');break}
      el.disabled=true;try{await S.db.doc('geburt/'+id).set({date:v});if(S.gb[id]!==v.slice(5))await S.db.doc('geburtstage/'+id).set({md:v.slice(5)});toast('Gespeichert');S.still=true;openSheet({type:'trikot'})}catch(e){el.disabled=false;toast(errMsg(e))}break}
    case 'trikotDel':{if(!isTrikotwart())break;try{await S.db.doc('geburt/'+id).delete();toast('Geburtsdatum entfernt');S.still=true;openSheet({type:'trikot'})}catch(e){toast(errMsg(e))}break}
    case 'openGb':case 'gbBack':markSeen(['m:gb']);S.still=true;openSheet({type:'gb'});break;
    case 'gbEdit':if(isKW()){S.still=true;openSheet({type:'gbEdit',id})}break;
    case 'gbAdd':if(isKW()){S.still=true;openSheet({type:'gbPick'})}break;
    case 'gbPick':if(isKW()){S.still=true;openSheet({type:'gbEdit',id,back:{type:'gbPick'}})}break;
    case 'gbSave':{if(!isKW())break;const t=+($('#gbt')?.value||0),m=+($('#gbm')?.value||0);const md=String(m).padStart(2,'0')+'-'+String(t).padStart(2,'0');
      if(!t||!m||!validMd(md)||t>[31,29,31,30,31,30,31,31,30,31,30,31][m-1]){toast('Bitte Tag und Monat wählen');break}
      el.disabled=true;try{await S.db.doc('geburtstage/'+id).set({md});{const g=S.geburt[id];if(validBirth(g)&&g.slice(5)!==md){const nd=g.slice(0,4)+'-'+md;if(validBirth(nd))await S.db.doc('geburt/'+id).set({date:nd});else await S.db.doc('geburt/'+id).delete()}}toast('Geburtstag gespeichert 🎂');S.still=true;openSheet({type:'gb'})}catch(e){el.disabled=false;toast(errMsg(e))}break}
    case 'gbDel':{if(!isKW())break;try{await S.db.doc('geburtstage/'+id).delete();toast('Geburtstag entfernt');S.still=true;openSheet({type:'gb'})}catch(e){toast(errMsg(e))}break}
    case 'kfAddWeek':if(canKf()){S.still=true;openSheet({type:'kfWeekAdd',mon:id,pid:null,note:'',back:{type:'kf',view:'cal',cal:S.sheet&&S.sheet.cal}})}break;
    case 'kfwPick':{const s=S.sheet;s.note=$('#kfwn')?.value||'';s.pid=s.pid===id?null:id;S.still=true;renderSheet(false);break}
    case 'kfwBack':S.still=true;openSheet(S.sheet.back);break;
    case 'kfwSave':{const s=S.sheet;if(!canKf()||!s.pid)break;const note=($('#kfwn')?.value||'').trim().slice(0,120),r=kwRange(s.mon);el.disabled=true;
      try{await S.db.collection('entries').doc().set({playerId:s.pid,fineId:'kf-manual',title:'Kabinenfest',amount:0,qty:null,unit:null,col:'strafen',spieltag:false,kabinenfest:true,kfDone:false,kfWeek:s.mon,note:note||('Eingeplant für KW '+r.kw),date:today(),createdAt:new Date().toISOString(),createdBy:S.uid||null,paid:false,paidAt:null});
        toast(`Kabinenfest in KW ${r.kw}: ${kfWho({playerId:s.pid})?.name||''} 🍻`);S.still=true;openSheet(s.back)}catch(e){el.disabled=false;toast(errMsg(e))}break}
    case 'openPush':S.still=true;S.push={...(S.push||{}),ready:false};S.pushLog=null;openSheet({type:'push'});pushLoad();pushLogLoad();break;
    case 'pushView':S.pushView=el.dataset.k;S.still=true;renderSheet(false);break;
    case 'pushTab':{const k=el.dataset.k;closeSheet();if(k==='verwalten'){S.mOpen['vt-mitglieder']=true;markSeen(['vt-mitglieder'])}goTab(k);break} // aus dem Verlauf zu einem Reiter
    case 'openDoener':S.doenerNeu=!!S.dots?.has('m:doener');markSeen(['m:doener']);S.still=true;openSheet({type:'doener'});break; // Punkt im Fenster bleibt, solange es offen ist
    case 'openFussball':markSeen(['m:fussball']);S.still=true;openSheet({type:'fussball'});break;
    case 'fbBack':S.still=true;openSheet(S.sheet&&S.sheet.back||{type:'fussball'});break;
    case 'saveDoener':{const s=S.sheet,w=doenerWeek(),pid=myPid(),text=($('#dtext')?.value||'').trim().slice(0,200);
      if(!pid)break;if(!w.open){toast('Bestellschluss ist vorbei');S.still=true;renderSheet(false);break}
      if(!text){toast('Schreib kurz, was du möchtest');$('#dtext')?.focus();break}
      const id=w.tue+'_'+pid,old=S.doener.find(d=>d.id===id),now=new Date().toISOString();el.disabled=true;
      try{await S.db.doc('doener/'+id).set({week:w.tue,pid,text,at:old?.at||now,...(old?{updatedAt:now}:{})});s.draft=undefined;toast(old?'Bestellung geändert':'Du bist eingetragen 🥙');S.still=true;renderSheet(false)}
      catch(e){el.disabled=false;toast(doenerWeek().open?errMsg(e):'Bestellschluss ist vorbei')}break}
    case 'doenerPaid':{const r=await rpcRun(el,'doener_report_paid',{w:el.dataset.w});
      if(r){const oid=el.dataset.w+'_'+myPid();S.doener=S.doener.map(x=>x.id===oid?{...x,reportedAt:new Date().toISOString()}:x);toast('Danke! Der Dönerwart bekommt eine Nachricht.');S.still=true;renderSheet(false)}break}
    case 'dwPaid':{const d=S.doener.find(x=>x.id===id);if(!d||!isDoenerwart())break;
      if(await rpcRun(el,'doener_set_paid',{doc_id:id,paid:!d.paid})){S.doener=S.doener.map(x=>x.id===id?{...x,paid:!d.paid,paidAt:d.paid?null:new Date().toISOString()}:x);S.still=true;renderSheet(false)}break}
    case 'usualEdit':if(canTermin())toUsual();break;
    case 'kalIcs':{const m=el.dataset.mon,t=weekIcs(m),name=`dragons-kw${kwRange(m).kw}.ics`;if(!t){toast('In dieser Woche ist nichts geplant');break}
      // iPhone: Herunterladen öffnet direkt „Alle hinzufügen“. Android: lieber Teilen (Kalender-App wählbar), sonst Download mit Hinweis.
      if(/Android/i.test(navigator.userAgent)){const f=new File([t],name,{type:'text/calendar'});
        if(navigator.canShare?.({files:[f]})){navigator.share({files:[f],title:'Dragons · KW '+kwRange(m).kw}).catch(e=>{if(e?.name!=='AbortError')downloadFile(name,t,'text/calendar')});break}
        downloadFile(name,t,'text/calendar');toast('Datei öffnen und mit deinem Kalender importieren');break}
      downloadFile(name,t,'text/calendar');break}
    case 'usualBack':toUsual();break;
    case 'usualAdd':if(canTermin())openSheet({type:'usualItem',id:null,t:{wd:0,start:'',end:'',title:''},back:{type:'usual'}});break;
    case 'usualItem':{const x=S.termine.find(t=>t.id===id&&t.type==='usual');if(x&&canTermin())openSheet({type:'usualItem',id,t:{...x},back:{type:'usual'}});break}
    case 'usualDefaults':if(canTermin()&&await run(el,()=>Promise.all(USUAL_DEFAULT.map(([wd,start,end,title])=>S.db.doc('termine/usual-'+wd+'-'+start.replace(':','')).set({type:'usual',wd,start,end,title})))))toUsual();break;
    case 'usualSave':{if(!canTermin())break;const s=S.sheet,wd=+$('#uwd').value,start=$('#ustart').value,end=$('#uend').value,title=$('#utitle').value.trim().slice(0,60)||'Training';
      const bad=!start||!end?'Bitte Beginn und Ende wählen':end<=start?'Das Ende muss nach dem Beginn liegen':'';if(bad){toast(bad);break}
      if(await run(el,()=>S.db.doc('termine/'+(s.id||'usual-'+wd+'-'+start.replace(':','')+'-'+Date.now().toString(36))).set({type:'usual',wd,start,end,title}))){toast('Gespeichert');toUsual()}break}
    case 'usualDel':if(canTermin()&&sure('us'+id)&&await run(el,()=>S.db.doc('termine/'+id).delete())){toast('Gelöscht');toUsual()}break;
    case 'openBaelle':S.bsel=null;S.still=true;openSheet({type:'baelle'});baelleCleanup();break;
    case 'baelleEdit':{const x=S.termine.find(t=>t.id===id);if(x&&isAdmin())openSheet({type:'baelleEdit',id,sel:new Set(x.pids||[]),back:{type:'baelle'}});break}
    case 'baellePick':{const s=S.sheet;s.sel.has(id)?s.sel.delete(id):s.sel.add(id);S.still=true;renderSheet(false);break}
    case 'baelleRepl':{const s=S.sheet;s.sel.delete(id);s.sel.add(el.dataset.c);S.still=true;renderSheet(false);break}
    case 'baelleSave':{const s=S.sheet,x=S.termine.find(t=>t.id===s.id);if(!x||!isAdmin())break;
      if(await baelleApply(el,{[x.id]:[...s.sel]})){S.still=true;openSheet({type:'baelle'})}break}
    case 'baelleDo':if(await rpcRun(el,'baelle_erledigt',{d:el.dataset.d})){const d=el.dataset.d;S.termine=S.termine.map(t=>t.type==='baelle'&&t.date===d?{...t,doneAt:new Date().toISOString(),doneBy:pById(myPid())?.name||null}:t);toast('Entharzt eingetragen 🏐');S.still=true;renderSheet(false)}break;
    case 'kalview':S.kalView=el.dataset.k;render();break;
    case 'kalmonth':{const n=bToday(),c=S.kalM||{y:n.getFullYear(),m:n.getMonth()},x=new Date(c.y,c.m+ +el.dataset.d,1);S.kalM=+el.dataset.d?{y:x.getFullYear(),m:x.getMonth()}:null;render();break}
    case 'kaldayopen':S.kalMon=monIso(el.dataset.d);S.kalView='woche';render();scrollTo(0,0);break;
    case 'kalnav':S.confirmPlan=null;S.kalMon=addDays(S.kalMon||monIso(tdIso()),7*+el.dataset.d);render();break;
    case 'pollStart':{if(!canPlan())break;const q=$('#pollq').value.trim(),ev=$('#pollend').value,end=ev?new Date(ev):null;if(!q){toast('Bitte eine Frage eingeben');break}
      if(!end||isNaN(end)||end<=new Date()){toast('Bitte wählen, bis wann abgestimmt werden kann (in der Zukunft)');break}
      if(await rpcRun(el,'termin_umfrage',{doc_id:id,frage:q,bis:end.toISOString()})){S.termine=S.termine.map(t=>t.id===id?{...t,poll:{q:q.slice(0,200),at:new Date().toISOString(),until:end.toISOString()}}:t);toast('Umfrage gestartet – alle bekommen eine Nachricht');S.still=true;renderSheet(false)}break}
    case 'pollDel':if(!canPlan()||!sure('pl'+id))break;if(await rpcRun(el,'termin_umfrage',{doc_id:id,frage:''})){S.termine=S.termine.map(t=>{if(t.id!==id)return t;const {poll,...r}=t;return r});S.umfrage=(S.umfrage||[]).filter(a=>a.doc!==id);toast('Umfrage gelöscht');S.still=true;renderSheet(false)}break;
    case 'pollVote':{const me=myPid();if(!me)break;const choice=el.dataset.k;
      try{await S.db.doc('umfrage/'+id+'_'+me).set({doc:id,pid:me,choice,at:new Date().toISOString()});S.still=true;renderSheet(false)}catch(e){toast(errMsg(e))}break}
    case 'meetSave':{if(!canPlan())break;const meet=$('#vmeet')?.value||'',mp=($('#vmeetp')?.value||'').trim(),travel=$('#vtravel').value.trim().slice(0,300);
      if(await rpcRun(el,'termin_treffpunkt',{doc_id:id,meet,meet_place:mp,travel})){S.termine=S.termine.map(t=>t.id===id?{...t,meet:meet||null,meetPlace:mp||null,travel:travel||null}:t);toast('Treffpunkt gespeichert. Mit „Fertig“ im Wochenplan melden.');S.still=true;renderSheet(false);render()}break}
    case 'planSend':{if(!canPlan())break;const mon=el.dataset.mon;
      if(S.confirmPlan!==mon){S.confirmPlan=mon;render();break}
      S.confirmPlan=null;const chg=!!S.termine.find(x=>x.id==='plan-'+mon)?.days,r=await rpcRun(el,'wochenplan_senden',{mon}); // schon gemeldet: nur geänderte Tage
      if(r){S.termine=[...S.termine.filter(x=>x.id!=='plan-'+mon),{id:'plan-'+mon,type:'plan',mon,sentAt:new Date().toISOString(),by:pById(myPid())?.name||null,days:{}}];
        toast(r.data?(chg?'Änderung an die Mannschaft gesendet':'Wochenplan an die Mannschaft gesendet'):'Wochenplan gespeichert, aber auf keinem Gerät sind Benachrichtigungen an')}
      render();break}
    case 'terminNew':case 'spielNew':if(canTermin())openSheet({type:'termin',id:null,t:act==='spielNew'?{type:'spiel',date:today(),start:'',end:'',title:'TSG Münster - ',place:'',home:true}:{type:'training',date:el.dataset.d||today(),start:'',end:'',title:'',place:''}});break;
    case 'terminView':if(terminById(id)){markSeen(['poll:'+id]);openSheet({type:'terminView',id})}break;
    case 'terminEdit':{if(!canTermin())break;let x=terminById(id);if(!x)break;
      if(x.virtual){const rid=trId(x.date,x.start); // alle üblichen Trainings des Tages werden echt gespeichert
        if(!await run(el,()=>Promise.all(termineAt(x.date).filter(v=>v.virtual).map(v=>S.db.doc('termine/'+trId(v.date,v.start)).set(trDoc(v.date,v))))))break;
        x={...x,id:rid,virtual:false}}
      openSheet({type:'termin',id:x.id,t:{...x},back:{type:'terminView',id:x.id}});break}
    case 'terminCancel':closeSheet();break;
    case 'terminSave':{if(!canTermin())break;const s=S.sheet,t=s.t,sp=t.type==='spiel',date=$('#tdate').value,start=$('#tstart').value,end=$('#tend').value,title=$('#ttitle').value.trim().slice(0,120);
      const bad=!/^\d{4}-\d{2}-\d{2}$/.test(date)?'Bitte ein Datum wählen':sp&&!title?'Bitte das Spiel eintragen, z. B. TSG Münster - Gegner':start&&end&&end<=start?'Das Ende muss nach dem Beginn liegen':'';if(bad){toast(bad);break}
      const home=sp&&$('#thome').value==='1',d={type:t.type,date,start:start||null,end:end||null,title:title||(sp?'Spiel':'Training'),place:$('#tplace').value.trim().slice(0,120)||null,
        ...(sp?{home,meet:home?null:$('#tmeet').value||null,meetPlace:home?null:$('#tmeetp').value.trim().slice(0,120)||null,travel:$('#ttravel').value.trim().slice(0,300)||null}:{})};
      if(await run(el,()=>S.db.doc('termine/'+(s.id||((sp?'spiel-':'tr-')+date+'-'+Date.now().toString(36)))).set(d))){toast('Gespeichert');if(!sp)S.kalMon=monIso(date);closeSheet();render()}break}
    case 'terminDel':{const x=canTermin()&&terminById(id); // Löscht man das letzte Training eines Tages, merkt sich eine Absage den leeren Tag
      if(x&&sure('tm'+id)&&await run(el,async()=>{await S.db.doc('termine/'+id).delete();if(x.type==='training'&&!S.termine.some(t=>t.date===x.date&&t.type==='training'&&t.id!==id))await S.db.doc('termine/cx-'+x.date).set({type:'cancel',date:x.date})})){toast('Termin gelöscht');closeSheet()}break}
    case 'delDoener':{if(!id.endsWith('_'+myPid())||!sure('dn'+id))break;
      try{await S.db.doc('doener/'+id).delete();S.sheet.draft=undefined;toast('Bestellung gelöscht')}catch(e){toast(errMsg(e))}S.still=true;renderSheet(false);break}
    case 'copyDoener':{const w=doenerWeek(),l=doenerList(w.tue);
      await copyOut(`Döner-Bestellung Dienstag ${dDE(w.tue).slice(0,6)} (${l.length})\n\n`+l.map((d,i)=>`${i+1}. ${pById(d.pid)?.name||'?'}: ${d.text}`).join('\n'));break}
    case 'fbNew':if(isKW()){S.still=true;openSheet({type:'fbEdit',id:null,date:today(),goals:[],og:{jung:0,alt:0}})}break;
    case 'fbEdit':{const g=S.fussball.find(x=>x.id===id);if(g&&isKW()){const back=fbFrom();S.still=true;openSheet({type:'fbEdit',back,id,date:g.date,goals:(g.goals||[]).map(t=>({n:0,k:0,...t})),og:{jung:0,alt:0,...(g.og||{})},createdAt:g.createdAt})}break}
    case 'fbGame':{const g=S.fussball.find(x=>x.id===id);if(!g)break;const back=fbFrom();S.still=true;if(isKW())openSheet({type:'fbEdit',back,id,date:g.date,goals:(g.goals||[]).map(t=>({n:0,k:0,...t})),og:{jung:0,alt:0,...(g.og||{})},createdAt:g.createdAt});else openSheet({type:'fbGame',back,id});break}
    case 'fbPickOpen':{const s=S.sheet;S.still=true;openSheet({type:'fbPick',team:el.dataset.team,sel:new Set(),back:s});break}
    case 'fbPick':{const s=S.sheet;if(s.sel.has(id))s.sel.delete(id);else s.sel.add(id);S.still=true;renderSheet(false);break}
    case 'fbPickDone':{const s=S.sheet;for(const pid of s.sel)fbAddGoal(s.back,s.team,pid,'n',1);S.still=true;openSheet(s.back);break}
    case 'fbPickBack':S.still=true;openSheet(S.sheet.back);break;
    case 'fbRound':S.still=true;openSheet({type:'fbRound',no:+id});break;
    case 'fbGoal':fbAddGoal(S.sheet,el.dataset.team,id,el.dataset.kind,+el.dataset.d);S.still=true;renderSheet(false);break;
    case 'fbOg':{const s=S.sheet,k=el.dataset.team;s.og[k]=Math.max(0,(s.og[k]||0)+ +el.dataset.d);S.still=true;renderSheet(false);break}
    case 'fbSave':{const s=S.sheet;if(!isKW())break;const date=$('#fbd')?.value||'';if(!/^\d{4}-\d{2}-\d{2}$/.test(date)){toast('Bitte ein Datum wählen');break}
      const jung=fbPts(s,'jung'),alt=fbPts(s,'alt');
      if(!jung&&!alt){toast('Trag zuerst die Tore ein');break}
      if(jung===alt){toast('Unentschieden gibt es nicht – ein Team muss vorne liegen');break}
      const id2=s.id||('g'+Date.now().toString(36)+Math.random().toString(36).slice(2,5)),now=new Date().toISOString();el.disabled=true;
      try{await S.db.doc('fussball/'+id2).set({date,jung,alt,goals:s.goals.filter(t=>(t.n||0)+(t.k||0)>0).map(t=>({pid:t.pid,team:t.team,n:t.n||0,k:t.k||0})),og:{jung:s.og.jung||0,alt:s.og.alt||0},createdAt:s.createdAt||now,...(s.id?{updatedAt:now}:{}),by:pById(myPid())?.name||null});
        let neu=[];try{neu=await syncFbKf()}catch(e){toast('Spiel gespeichert, aber das Kabinenfest konnte nicht eingetragen werden');S.still=true;openSheet(s.back||{type:'fussball'});break}
        if(neu.length){const r=neu[neu.length-1];toast(`${teamName(r.winner)} hat ${FB_WIN} Siege! ${teamName(r.loser)} bekommt ein Kabinenfest 🍻`)}else toast(s.id?'Spiel gespeichert':'Spiel eingetragen ⚽');
        S.still=true;openSheet(s.back||{type:'fussball'})}
      catch(e){el.disabled=false;toast(errMsg(e))}break}
    case 'fbDel':{const s=S.sheet;if(S.confirmDel!=='fb'){S.confirmDel='fb';S.still=true;renderSheet(false);break}
      try{await S.db.doc('fussball/'+s.id).delete();await syncFbKf().catch(()=>{});toast('Spiel gelöscht');S.still=true;openSheet(s.back||{type:'fussball'})}catch(e){toast(errMsg(e))}break}
    case 'person':if(id===myPid())markSeen(['konto']);openSheet({type:'person',id});break;
    case 'addFor':S.preselect=id;closeSheet();S.tab='erfassen';$('#view').innerHTML='';render();toast('Strafe antippen – '+(pById(id)?.name||'')+' ist vorausgewählt');break;
    case 'paid':{const e=S.entries.find(x=>x.id===id);if(!e||!isKW())break; // einzelne Strafen abhaken nur Kassenwart/Admin; Spieler melden über „Ich habe bezahlt“ (alles)
      // wieder geöffnet: die Datenbank bucht verbrauchtes Guthaben zurück (wird erst bei der nächsten Zahlung wieder verrechnet)
      if(e.paid){try{await S.db.doc('entries/'+id).update({paid:false,paidAt:null,paidVia:null});logChange(`Bezahlt-Haken entfernt: ${pById(e.playerId)?.name||'?'} – ${e.title}`,e.amount);toast(e.creditUsed>0?'Wieder offen – Guthaben zurückgebucht':'Wieder offen')}catch(err){toast(errMsg(err))}break}
      setEntry(id,{paid:!e.paid,paidAt:e.paid?null:new Date().toISOString(),paidVia:e.paid?null:(isKW()?'kassenwart':'manuell')});break}
    case 'kf':{const e=S.entries.find(x=>x.id===id);if(e&&canKf())kfPatch(id,{kfDone:!e.kfDone}).catch(err=>toast(errMsg(err)));break}
    case 'del':if(S.confirmDel===id){S.confirmDel=null;const de=S.entries.find(x=>x.id===id);try{await S.db.doc('entries/'+id).delete();if(de&&de.paid)logChange(`Bezahlte Strafe gelöscht: ${pById(de.playerId)?.name||'?'} – ${de.title}`,de.amount);toast(de&&de.paid&&de.creditUsed>0?'Eintrag gelöscht – Guthaben zurückgebucht':'Eintrag gelöscht')}catch(e){toast(errMsg(e))}}else{S.confirmDel=id;render();if(S.sheet)renderSheet(false)}break;
    case 'payAll':{if(!isKW()){toast('Nur Kassenwart und Admin können das');break}
      if(S.confirmPayAll!==id){S.confirmPayAll=id;renderSheet(false);clearTimeout(S._pat);S._pat=setTimeout(()=>{S.confirmPayAll=null;if(S.sheet)renderSheet(false)},4000);break}
      S.confirmPayAll=null;const now=new Date().toISOString();const open=S.entries.filter(e=>e.playerId===id&&!e.paid);try{const r=await payEntries(id,open.map(e=>e.id),'kassenwart');toast(`${r.n} Einträge als bezahlt markiert${r.used>0?` – ${eur(r.used)} mit Guthaben verrechnet`:''}`)}catch(e){toast(errMsg(e))}break}
    case 'undo':{const u=S.undo;$('#toast').hidden=true;S.undo=null;if(u)try{await u()}catch(e){toast(errMsg(e))}break}
    case 'editFine':{const f=id?S.fines.find(x=>x.id===id):{title:'',cat:'',base:0,per:0,unit:'',order:(S.fines.length+1)*10};openSheet({type:'editFine',fine:{...f}});break}
    case 'saveFine':{const f=S.sheet.fine;const d={title:$('#ft').value.trim(),cat:$('#fc').value.trim()||'Sonstiges',base:num($('#fb').value),per:num($('#fp').value),unit:$('#fu').value.trim()||null,
        kabinenfest:$('#fk').checked,wuerfeln:$('#fw').checked,hint:$('#fh').value.trim()||null,order:num($('#fo').value)};
      if(!d.title){toast('Bitte eine Bezeichnung eingeben');break}
      try{await S.db.doc('fines/'+(f.id||('f'+Date.now().toString(36)))).set(d);closeSheet();toast('Gespeichert')}catch(e){toast(errMsg(e))}break}
    case 'delFine':if(S.confirmDel==='fine'){try{await S.db.doc('fines/'+S.sheet.fine.id).delete();closeSheet();toast('Strafe gelöscht – bestehende Einträge bleiben')}catch(e){toast(errMsg(e))}}else{S.confirmDel='fine';el.textContent='Wirklich löschen?'}break;
    case 'editPlayer':{const p=id?pById(id):{name:'',role:'Spieler',number:null,active:true};openSheet({type:'editPlayer',player:{...p}});break}
    case 'delPlayer':if(S.confirmDel==='player'){const pl=S.sheet.player,pid=pl.id,nm=pl.name,photo=String(pl.img||'').split('/fotos/')[1];
      try{await S.db.doc('players/'+pid).delete();if(photo)S.sb.storage.from('fotos').remove([photo]).catch(()=>{});closeSheet();toast(`${nm} gelöscht`);baelleCleanup()}catch(e){toast(errMsg(e))}}else{S.confirmDel='player';el.textContent='Wirklich löschen?'}break;
    case 'photoDel':{const s=S.sheet;keepPlayer();if(s.preview)URL.revokeObjectURL(s.preview);s.blob=s.preview=null;s.photoDel=true;renderSheet(false);break}
    case 'savePlayer':{const s=S.sheet,p=s.player;const no=$('#pno').value.trim();const d={...p,name:$('#pn').value.trim(),role:$('#pr').value.trim()||'Spieler',number:no===''?null:num(no),active:$('#pa').checked};delete d.id;
      if(!d.name){toast('Bitte einen Namen eingeben');break}
      const pid=p.id||('x'+Date.now().toString(36)),F=S.sb.storage.from('fotos'),oldPath=String(p.img||'').split('/fotos/')[1];
      if(await run(el,async()=>{if(s.blob){const path=`${pid}-${Date.now().toString(36)}.jpg`,up=await F.upload(path,s.blob,{contentType:'image/jpeg'});if(up.error)throw up.error;d.img=F.getPublicUrl(path).data.publicUrl}
          else if(s.photoDel)d.img=null;
          await S.db.doc('players/'+pid).set(d);if((s.blob||s.photoDel)&&oldPath)F.remove([oldPath]).catch(()=>{})})){closeSheet();toast('Gespeichert')}break}
  }
});
document.addEventListener('input',ev=>{
  const t=ev.target,s=S.sheet;
  if(t.id==='q'){S.q=t.value;$('#finelist').innerHTML=fineList();return}
  if(t.id==='anq'){const v=t.value.trim().toLowerCase();document.querySelectorAll('#anzfines .anzg').forEach(g=>{let n=0;g.querySelectorAll('.fine').forEach(b=>{const show=!v||b.dataset.q.includes(v);b.hidden=!show;n+=show});g.hidden=!n});return}
  if(t.classList&&t.classList.contains('anzqin')&&s&&s.type==='anzNew'){anzQtySet(t.dataset.pid,Math.max(0,Math.min(999,parseInt(t.value)||0)));return}
  if(t.id==='annr'){const v=t.value.replace(/\D/g,'');if(v!==t.value)t.value=v;let n=0;
    document.querySelectorAll('#anzgrid .pick').forEach(b=>{const show=!v||b.dataset.no===v;b.hidden=!show;n+=show});$('#anznone').hidden=n>0;return}
  if(t.id==='rpm'){S.rpm=t.value;return}
  if(s&&s.type==='doener'&&t.id==='dpay'){s.pay=t.value;const a=num(t.value),l=$('#dpaylink'),dt=ppTarget(S.settings.doenerPaypal);
    if(l&&dt){if(a>0){l.href=paypalUrl(a,'',dt,'Döner Dragons – '+(pById(myPid())?.name||''));l.target='_blank';l.rel='noopener';l.removeAttribute('aria-disabled');l.classList.remove('off');l.textContent='Mit PayPal bezahlen · '+eur(a)}
      else{l.removeAttribute('href');l.setAttribute('aria-disabled','true');l.classList.add('off');l.textContent='Mit PayPal bezahlen'}}return}
  if(s&&s.type==='fbEdit'&&t.id==='fbd'){s.date=t.value;return}
  if(s&&s.type==='kasse'&&['kk','kp','kb'].includes(t.id)){const k=kasseSoll();if(k){const ist=kasseIst();$('#kist').textContent=eur(ist);$('#kdiff').innerHTML=kasseDiffHtml(ist,k.soll)}return}
  if(s&&s.type==='bill'){
    if(t.id==='bs'){s.split=t.checked;$('#splitbox').hidden=!t.checked;updateSplit()}
    else if(t.id==='bpp'){s.per=t.value;s.perTouched=true;updateSplit()}
    else if(t.id==='ba'&&!s.perTouched&&s.sel.size){s.per=String(Math.round(num(t.value)/s.sel.size*100)/100).replace('.',',');$('#bpp').value=s.per;updateSplit()}
    return}
  if(s&&s.type==='fine'&&t.id==='colsel'){s.col=t.value;return}
  if(s&&s.type==='fine'&&t.classList&&t.classList.contains('dqin')){s.counts[t.dataset.pid]=Math.max(0,parseInt(t.value)||0);deckeUpdate(s);return}
  if(!s||s.type!=='fine')return;
  if(t.id==='amt'){s.touched=true;s.amount=t.value;updateSubmit()}
  else if(t.id==='qty'){s.qty=Math.max(0,parseInt(t.value)||0);s.touched=false;updateSubmit()}
  else if(t.id==='nt')s.note=t.value;
  else if(t.id==='dt')s.date=t.value;
  else if(t.id==='kfc'){s.kf=t.checked;updateSubmit()}
  else if(t.id==='spt'){s.spieltag=t.checked;updateSubmit()}
});
document.addEventListener('change',async ev=>{const t=ev.target;
  if(t.id==='pfile'&&S.sheet&&S.sheet.type==='editPlayer'){const s=S.sheet,f=t.files&&t.files[0];if(!f)return;keepPlayer();
    const b=await shrinkImage(f,400);if(!b||b.size>1048576){toast(b?'Das Foto ist zu groß (höchstens 1 MB)':'Das Foto konnte nicht gelesen werden');return}
    if(s.preview)URL.revokeObjectURL(s.preview);s.blob=b;s.preview=URL.createObjectURL(b);s.photoDel=false;renderSheet(false);return}
  if(t.id==='anfile'&&S.sheet&&S.sheet.type==='anzNew'){const s=S.sheet,f=t.files&&t.files[0];if(!f)return;s.note=$('#ann')?.value||'';
    const b=await shrinkImage(f);if(!b){toast('Das Foto konnte nicht gelesen werden');return}if(s.preview)URL.revokeObjectURL(s.preview);s.blob=b;s.preview=URL.createObjectURL(b);renderSheet(false);return}
  if(t.id==='rcfile'&&S.sheet&&S.sheet.type==='receipt'){const s=S.sheet,f=t.files&&t.files[0];if(!f)return;
    s.note=$('#rcn')?.value||'';s.amount=$('#rca')?.value||'';s.date=$('#rcd')?.value||today();
    const b=await shrinkImage(f);if(!b){toast('Das Foto konnte nicht gelesen werden');return}
    if(s.preview)URL.revokeObjectURL(s.preview);s.blob=b;s.preview=URL.createObjectURL(b);renderSheet(false);return}
  const s=S.sheet;if(!s)return;
  if(s.type==='push'&&t.dataset.pk&&S.push?.row){const pr={...(S.push.row.prefs||{}),[t.dataset.pk]:t.checked};const {error}=await S.sb.from('push_subs').update({prefs:pr,updated_at:new Date().toISOString()}).eq('endpoint',S.push.row.endpoint);if(error){t.checked=!t.checked;toast(errMsg(error))}else S.push.row.prefs=pr;return}
  if(s.type==='fine'&&t.id==='kfc'){s.kf=t.checked;updateSubmit()}
  if(s.type==='fine'&&t.id==='spt'){s.spieltag=t.checked;updateSubmit()}
  if(s.type==='fine'&&t.id==='colsel')s.col=t.value;
  if(s.type==='bill'&&t.id==='bc'){const o=$('#bcown');o.hidden=t.value!=='__other';if(!o.hidden)$('#bco').focus()}
  if(s.type==='bill'&&t.id==='bs'){s.split=t.checked;$('#splitbox').hidden=!t.checked;updateSplit()}});
document.addEventListener('toggle',e=>{const d=e.target;if(d&&d.classList&&(d.classList.contains('mgroup')||d.classList.contains('vtile'))){S.mOpen[d.dataset.key]=d.open;if(d.open)markSeen([d.dataset.key])}},true);
['gesturestart','gesturechange','gestureend'].forEach(g=>document.addEventListener(g,e=>e.preventDefault()));
document.addEventListener('touchmove',e=>{if(e.touches.length>1||S.drag)e.preventDefault()},{passive:false});
document.addEventListener('keydown',ev=>{if(ev.key==='Escape'&&S.sheet)stepBack();if((ev.key==='Enter'||ev.key===' ')&&ev.target.matches&&(ev.target.matches('.row.tap')||ev.target.matches('[role=button][data-act]:not(button)'))&&!ev.target.closest('.grip')){ev.preventDefault();ev.target.click()}});

/* ---------- Start ---------- */
render();
/* ---------- Supabase-Anbindung ---------- */
function makeDb(sb){
  const subs={};
  const norm=e=>({code:/row-level security|permission|42501/i.test(String(e.message)+String(e.code))?'invalid_argument':'unavailable',message:e.message});
  const toDoc=(id,data)=>({id,exists:data!=null,data:()=>data??undefined,metadata:{fromCache:false,hasPendingWrites:false}});
  function table(t){
    if(subs[t])return subs[t];
    const st=subs[t]={rows:new Map(),ls:new Set(),loaded:false},ck=cacheKey(t);let sv;
    // letzter Stand vom Handy: sofort anzeigen, bis die frischen Daten da sind
    try{const c=JSON.parse(localStorage.getItem(ck)||'null');if(Array.isArray(c)){st.rows=new Map(c);st.loaded=true;S.cached.add(t);S.refreshing=true}}catch(e){}
    const save=()=>{clearTimeout(sv);sv=setTimeout(()=>{if(S.noSave)return;try{localStorage.setItem(ck,JSON.stringify([...st.rows]))}catch(e){}},1000)};
    const emit=e=>{if(!e&&st.loaded)save();for(const f of st.ls)f(e)};
    const load=async()=>{const all=[];for(let from=0;;from+=1000){const {data,error}=await sb.from(t).select('id,data').order('id').range(from,from+999);if(error){emit(error);return}all.push(...data);if(data.length<1000)break}
      st.rows=new Map(all.map(r=>[r.id,r.data]));st.loaded=true;if(S.cached.delete(t)&&!S.cached.size){S.refreshing=false;renderSoon()}emit()};
    let tm;const reload=()=>{clearTimeout(tm);tm=setTimeout(load,200)};
    sb.channel('rt-'+t).on('postgres_changes',{event:'*',schema:'public',table:t},pl=>{
      if(pl.eventType==='DELETE')st.rows.delete(pl.old.id);else st.rows.set(pl.new.id,pl.new.data);if(st.loaded)emit()}).subscribe(x=>{if(x==='SUBSCRIBED'&&st.loaded)reload()});
    st.load=load;st.reload=reload;load();
    return st;
  }
  // Zurück aus dem Hintergrund: nur nach mehr als einer Minute alles neu laden (sonst reicht die Live-Verbindung; reißt sie ab, lädt das Wiederverbinden ohnehin neu)
  let hiddenAt=0;document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){hiddenAt=Date.now();return}if(Date.now()-hiddenAt>60000)for(const t in subs)subs[t].reload()});
  const local=(t,id,d)=>{const st=subs[t];if(st){if(d===null)st.rows.delete(id);else st.rows.set(id,d);for(const f of st.ls)f()}};
  function docRef(t,id){id=id||(Date.now().toString(36)+Math.random().toString(36).slice(2,10));
    return{id,path:t+'/'+id,
      async get(){const {data,error}=await sb.from(t).select('data').eq('id',id).maybeSingle();if(error)throw norm(error);return toDoc(id,data?data.data:null)},
      async set(d){const {error}=await sb.from(t).upsert({id,data:d,updated_at:new Date().toISOString()});if(error)throw norm(error);local(t,id,d)},
      async update(pt){const {error}=await sb.rpc('doc_patch',{t,doc_id:id,patch:pt});if(error)throw norm(error);const st=subs[t];if(st&&st.rows.has(id))local(t,id,{...st.rows.get(id),...pt})},
      async delete(){const {error}=await sb.from(t).delete().eq('id',id);if(error)throw norm(error);local(t,id,null)},
      onSnapshot(next,err){const st=table(t);const f=e=>{if(e){err&&err(norm(e));return}if(st.loaded)next(toDoc(id,st.rows.get(id)??null))};st.ls.add(f);if(st.loaded)f();return()=>st.ls.delete(f)}}}
  function coll(t){return{orderBy(){return this},doc(id){return docRef(t,id)},async add(d){const r=docRef(t);await r.set(d);return r},
    onSnapshot(next,err){const st=table(t);const f=e=>{if(e){err&&err(norm(e));return}if(!st.loaded)return;const docs=[...st.rows].map(([id,d])=>toDoc(id,d));next({docs,size:docs.length,empty:!docs.length,metadata:{fromCache:false,hasPendingWrites:false}})};st.ls.add(f);if(st.loaded)f();return()=>st.ls.delete(f)}}}
  // lädt Tabellen neu, z. B. nach einer serverseitigen Buchung (RPC), die den lokalen Zwischenspeicher nicht kennt
  async function refresh(...ts){await Promise.all(ts.map(t=>subs[t]&&subs[t].load?subs[t].load():null))}
  return{collection:coll,refresh,doc(p){const [t,id]=p.split('/');return docRef(t,id)}};
}

/* ---------- Anmeldung ---------- */
function authScreen(mode,msg){
  S.status='auth';$('#tabs').innerHTML='';
  const v=$('#view');const err=msg?`<div class="banner">${esc(msg)}</div>`:'';
  if(mode==='login'||mode==='signup')v.innerHTML=`<div class="auth">${err}<h2>${mode==='login'?'Anmelden':'Konto erstellen'}</h2>
    <form id="authForm" class="fields" data-mode="${mode}">
      <div class="field"><label for="aMail">${mode==='login'?'Name':'Dein Name'}</label><input id="aMail" type="text" autocomplete="username" autocapitalize="words" placeholder="Vorname Nachname" required></div>
      <div class="field"><label for="aPw">Passwort${mode==='signup'?' (mind. 8 Zeichen)':''}</label><input id="aPw" type="password" autocomplete="${mode==='login'?'current-password':'new-password'}" minlength="${mode==='signup'?8:1}" required></div>
      <button class="btn primary" type="submit">${mode==='login'?'Anmelden':'Konto erstellen'}</button></form>
    <div class="toolbar">${mode==='login'?`<button class="btn" data-act="authMode" data-k="signup">Neu hier? Konto erstellen</button><button class="btn" data-act="authReset">Passwort vergessen</button>`:`<button class="btn" data-act="authMode" data-k="login">Ich habe schon ein Konto</button>`}</div></div>`;
  else if(mode==='newpw')v.innerHTML=`<div class="auth">${err}<h2>Neues Passwort</h2><form id="pwForm" class="fields"><div class="field"><label for="nPw">Neues Passwort (mind. 8 Zeichen)</label><input id="nPw" type="password" autocomplete="new-password" minlength="8" required></div><button class="btn primary" type="submit">Speichern</button></form></div>`;
  else if(mode==='link'){
    // passt der eingegebene Name zu einem Spieler, steht er vorne und ist hervorgehoben; alle anderen sind grau
    const free=sortedPlayers(true).filter(p=>!S.taken||!S.taken.has(p.id)),mine=free.find(p=>loginMail(p.name)===S.email);
    v.innerHTML=`<div class="auth">${err}<h2>Wer bist du?</h2><p class="note">${mine?'Das bist du, oder? Tippe auf deinen Namen.':'Tippe auf deinen eigenen Namen. Namen, die schon jemand gewählt hat, sind ausgeblendet.'} Der Admin schaltet dich danach frei.</p><div class="grid">${(mine?[mine,...free.filter(p=>p!==mine)]:free).map(p=>`<button class="pick" data-act="claim" data-id="${esc(p.id)}" ${mine?(p===mine?'aria-pressed="true"':'disabled'):''}>${p.role==='Spieler'&&p.number!=null?`<span class="no">${p.number}</span>`:''}${avatar(p)}<b>${esc(p.name.split(' ')[0])}${drg(p.id)}</b><span class="note" style="font-size:11px;margin-top:-4px">${esc(p.role==='Spieler'?p.name.split(' ').slice(1).join(' '):p.role)}</span></button>`).join('')}</div><div class="toolbar"><button class="btn" data-act="logout">Abmelden</button></div></div>`;}
  else if(mode==='pending')v.innerHTML=`<div class="auth">${err}<h2>Fast geschafft</h2><p>Dein Konto ist angelegt und mit <b>${esc(pById(S.me&&S.me.player_id)?.name||'dir')}</b> verknüpft. Sobald der Admin dich freischaltet, siehst du hier die Kasse.</p><div class="toolbar"><button class="btn primary" data-act="recheck">Neu prüfen</button><button class="btn" data-act="logout">Abmelden</button></div></div>`;
}
document.addEventListener('submit',async ev=>{
  const f=ev.target;if(f.id!=='authForm'&&f.id!=='pwForm')return;ev.preventDefault();const sb=S.sb;
  const btn=f.querySelector('button[type=submit]');btn.disabled=true;
  try{
    if(f.id==='pwForm'){const {error}=await sb.auth.updateUser({password:$('#nPw').value});if(error)throw error;history.replaceState(null,'',location.pathname);return boot()}
    const email=loginMail($('#aMail').value),password=$('#aPw').value;if(!email)throw new Error('Bitte deinen Namen eingeben.');
    if(f.dataset.mode==='login'){const {error}=await sb.auth.signInWithPassword({email,password});if(error)throw error;return boot()}
    const {data,error}=await sb.auth.signUp({email,password,options:{emailRedirectTo:location.origin+location.pathname}});if(error)throw error;
    if(!data.session)return authScreen('login','Konto angelegt, aber Supabase verlangt noch eine E-Mail-Bestätigung. Bitte dem Admin Bescheid geben.');return boot();
  }catch(e){btn.disabled=false;const m=String(e.message||e);
    authScreen(f.id==='pwForm'?'newpw':f.dataset.mode,/Invalid login/i.test(m)?'E-Mail oder Passwort stimmt nicht.':/already registered/i.test(m)?'Für diesen Namen gibt es schon ein Konto – melde dich an.':/Email not confirmed/i.test(m)?'Bitte bestätige zuerst deine E-Mail (Link im Postfach).':m)}
});
document.addEventListener('click',async ev=>{
  const el=ev.target.closest('[data-act]');if(!el)return;const a=el.dataset.act;
  if(a==='authMode')authScreen(el.dataset.k);
  else if(a==='authReset'){const email=($('#aMail')||{}).value;if(!email||!email.includes('@')){authScreen('login','Passwort vergessen? Sag dem Admin Bescheid, er setzt es dir zurück.');return}
    const {error}=await S.sb.auth.resetPasswordForEmail(email.trim(),{redirectTo:location.origin+location.pathname});authScreen('login',error?error.message:'Wir haben dir einen Link zum Zurücksetzen geschickt.')}
  else if(a==='claim'){const {data:{user}}=await S.sb.auth.getUser();const {error}=await S.sb.from('members').insert({user_id:user.id,email:user.email,player_id:el.dataset.id});if(error){const {data:tk}=await S.sb.rpc('taken_players');S.taken=new Set(tk||[]);authScreen('link',/duplicate|unique/i.test(error.message)?'Diesen Namen hat schon jemand gewählt. Tippe auf deinen eigenen Namen.':error.message);return}boot()}
  else if(a==='recheck')boot();
});

// Anmeldung mit Namen: Supabase braucht eine E-Mail-Adresse, die App bildet sie aus dem Namen (z. B. „Lennart Liebeck“ → lennart.liebeck@…).
// Die Endung .invalid ist reserviert, an solche Adressen wird nie eine Mail verschickt. Alte Konten melden sich weiter mit ihrer E-Mail an.
const LOGIN_DOMAIN='spieler.dragons-kasse.invalid';
const loginMail=v=>{v=String(v||'').trim();if(v.includes('@'))return v.toLowerCase();
  const n=v.toLowerCase().replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'.').replace(/^\.+|\.+$/g,'');
  return n?n+'@'+LOGIN_DOMAIN:''};
const isNameMail=e=>String(e||'').endsWith('@'+LOGIN_DOMAIN);
let started=false;
async function boot(){
  const sb=S.sb;
  const {data:{session}}=await sb.auth.getSession();
  if(!session){authScreen('login');return}
  S.uid=session.user.id;S.email=session.user.email;S.favs=loadFavs();
  let me=null,error=null;const mk='me:'+S.uid;try{me=JSON.parse(localStorage.getItem(mk)||'null')}catch(e){}
  const fresh=sb.from('members').select('*').eq('user_id',S.uid).maybeSingle().then(r=>{if(r.data&&!S.noSave)try{localStorage.setItem(mk,JSON.stringify(r.data))}catch(e){}return r});
  // freigeschaltet und schon einmal gespeichert: sofort starten, Rolle/Freischaltung prüft loadMembers gleich danach
  if(!me||!me.approved){({data:me,error}=await fresh)}
  if(error){authScreen('login','Verbindung fehlgeschlagen: '+error.message);return}
  if(!me||!me.approved){const {data:pl}=await sb.from('players').select('id,data');S.players=(pl||[]).map(r=>({id:r.id,...r.data}));S.me=me||null;if(!me){const {data:tk}=await sb.rpc('taken_players');S.taken=new Set(tk||[])}authScreen(me?'pending':'link');return}
  S.me=me;setPerms();clearBadge();
  if(started){render();return}started=true;S.status='loading';
  const db=makeDb(sb);S.db=db;$('#view').innerHTML='';render();
  const timer=setTimeout(()=>{S.stale=true;if(S.status==='loading')S.status='ready';render()},10000);
  const done=k=>{S.got[k]=1;if(S.got.p&&S.got.f&&S.got.e&&S.got.b){S.status='ready';S.stale=false;clearTimeout(timer)}render()};
  const fail=()=>{clearTimeout(timer);S.stale=true;S.status='ready';render()};
  db.collection('players').onSnapshot(s=>{S.players=s.docs.map(d=>({id:d.id,...d.data()}));done('p')},fail);
  db.collection('fines').onSnapshot(s=>{S.fines=s.docs.map(d=>({id:d.id,...d.data()}));done('f')},fail);
  db.collection('entries').onSnapshot(s=>{S.entries=s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));done('e')},fail);
  db.collection('receipts').onSnapshot(s=>{S.receipts=s.docs.map(d=>({id:d.id,...d.data()}));renderSoon()},()=>{});
  db.collection('bills').onSnapshot(s=>{S.bills=s.docs.map(d=>({id:d.id,...d.data()}));done('b')},fail);
  db.doc('settings/kasse').onSnapshot(d=>{S.settings=d.exists?d.data():{};renderSoon()},()=>{});
  const startKw=()=>{if(S.kwSubs||!isKW())return;S.kwSubs=true;
  db.doc('kasse_intern/kassenstand').onSnapshot(d=>{S.kstand=d.exists?d.data():{};renderSoon();if(S.sheet&&S.sheet.type==='kasse'&&!document.activeElement?.closest?.('.sheet input'))renderSheet(false)},()=>{});
  db.doc('kasse_intern/backup').onSnapshot(d=>{S.backup=d.exists?d.data():{};renderSoon()},()=>{});
  db.doc('kasse_intern/protokoll').onSnapshot(d=>{S.klog=d.exists?d.data():{};if(S.sheet&&S.sheet.type==='kasse')renderSheet(false)},()=>{});
  db.doc('kasse_intern/gb_done').onSnapshot(d=>{S.gbDone=d.exists?d.data():{};S.gbDoneLoaded=true;renderSoon()},()=>{});
  if(hasRole('kassenwart'))db.collection('schulden').onSnapshot(s=>{S.schulden=s.docs.map(d=>({id:d.id,...d.data()}));renderSoon();if(S.sheet&&S.sheet.type==='schulden')renderSheet(true)},()=>{});
  };
  const startTk=()=>{if(S.tkSubs||!canTrikot())return;S.tkSubs=true; // Trikots: Kassenwart, Admin, Trikotwart
  db.collection('geburt').onSnapshot(s=>{S.geburt=Object.fromEntries(s.docs.map(d=>[d.id,d.data().date]));renderSoon()},()=>{});
  db.collection('trikotwash').onSnapshot(s=>{S.wash=Object.fromEntries(s.docs.map(d=>[d.id,d.data().log||[]]));renderSoon()},()=>{});
  };S.startKw=()=>{startKw();startTk()};S.startKw();
  db.collection('zahltag').onSnapshot(s=>{S.zahltags=s.docs.map(d=>({id:d.id,...d.data()}));renderSoon()},()=>{});
  sb.rpc('doener_cleanup').then(()=>{},()=>{}); // alte Döner-Bestellungen (älter als gestern) entfernen
  db.collection('termine').onSnapshot(s=>{S.termine=s.docs.map(d=>({id:d.id,...d.data()}));renderSoon()},()=>{});
  db.collection('doener').onSnapshot(s=>{S.doener=s.docs.map(d=>({id:d.id,...d.data()}));renderSoon()},()=>{});
  db.collection('geburtstage').onSnapshot(s=>{S.gb=Object.fromEntries(s.docs.map(d=>[d.id,d.data().md]));S.gbLoaded=true;renderSoon()},()=>{});
  const loadAnzRank=()=>sb.rpc('anzeigen_rangliste').then(({data})=>{if(data){S.anzRank=data;renderSoon()}},()=>{});
  // Rangliste „Anzeigenhauptmeister“: Spieler sehen fremde Anzeigen nicht live – beim Öffnen der Statistik und jede Minute, solange sie offen ist, neu laden
  S.loadAnzRank=loadAnzRank;setInterval(()=>{if(document.visibilityState==='visible'&&S.tab==='uebersicht'&&S.kview==='statistik')loadAnzRank()},60000);
  db.collection('anzeigen').onSnapshot(s=>{S.anzeigen=s.docs.map(d=>({id:d.id,...d.data()}));loadAnzRank();renderSoon();if(S.sheet&&S.sheet.type==='anzView')renderSheet(true)},()=>{});
  db.collection('umfrage').onSnapshot(s=>{S.umfrage=s.docs.map(d=>({id:d.id,...d.data()}));renderSoon()},()=>{});
  db.collection('wuerfel').onSnapshot(s=>{S.wuerfel=s.docs.map(d=>({id:d.id,...d.data()}));renderSoon();if(S.sheet&&S.sheet.type==='wuerfel')renderSheet(true)},()=>{});
  db.collection('berichte').onSnapshot(s=>{S.berichte=s.docs.map(d=>({id:d.id,...d.data()}));renderSoon()},()=>{});
  db.collection('fussball').onSnapshot(s=>{S.fussball=s.docs.map(d=>({id:d.id,...d.data()}));renderSoon()},()=>{});
  const loadMembers=async()=>{const {data}=await sb.from('members').select('*');S.members=data||[];const mine=S.members.find(m=>m.user_id===S.uid);
    if(data&&!mine){clearLocalData();return location.reload()} // Konto entfernt: gespeicherten Stand verwerfen
    if(mine&&!S.noSave)try{localStorage.setItem('me:'+S.uid,JSON.stringify(mine))}catch(e){}
    // neue Rolle oder gesperrt: gespeicherte Daten verwerfen und neu laden, damit Abos und Daten zur Rolle passen
    if(mine&&(rolesOf(mine).join()!==rolesOf(S.me).join()||!mine.approved)){clearLocalData();try{localStorage.setItem('me:'+S.uid,JSON.stringify(mine))}catch(e){}return location.reload()}
    render()};

  loadMembers();sb.channel('rt-members').on('postgres_changes',{event:'*',schema:'public',table:'members'},loadMembers).subscribe();
  // Die Live-Verbindung reißt im Hintergrund ab (iOS): beim Zurückkehren in die App und beim Öffnen von „Verwalten“ neu laden
  S.loadMembers=loadMembers;document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')loadMembers()});
}
(function init(){
  swReg(); // App-Dateien auf dem Handy speichern (und Push)
  const C=window.KASSE_CONFIG||{};
  if(!window.supabase||!C.url||!C.key){S.status='nodb';render();return}
  S.sb=window.supabase.createClient(C.url,C.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  S.sb.auth.onAuthStateChange((ev)=>{if(ev==='PASSWORD_RECOVERY')setTimeout(()=>authScreen('newpw'),0);if(ev==='SIGNED_OUT'&&started)location.reload()});
  if(/type=recovery/.test(location.hash))return;
  boot();
})();
})();
