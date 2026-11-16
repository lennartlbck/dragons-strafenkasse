# Push-Benachrichtigungen einrichten (einmalig beim Live-Gang)

Alles läuft im **kostenlosen** Supabase-Plan: Web Push, eine Edge Function, `pg_net` und `pg_cron`.
**Es muss kein geheimer Schlüssel eingetippt werden.** Die Datenbank erzeugt das Geheimnis selbst (Tabelle `push_config`),
die Edge Function erzeugt die VAPID-Schlüssel beim ersten Aufruf selbst, und die App holt sich den öffentlichen Schlüssel vom Server.

## Reihenfolge

1. **SQL ausführen:** Supabase → SQL Editor → `supabase/schema.sql` ausführen.
2. **Edge Function anlegen oder aktualisieren:** Edge Functions → `push` → Code → Inhalt von `supabase/functions/push/index.ts` einfügen → Deploy.
3. **Einmal in den Einstellungen der Funktion „Verify JWT“ ausschalten** (Sicherheitseinstellung, bewusst manuell). Die Funktion prüft stattdessen das Geheimnis aus `push_config`.
4. **Geburtstage eintragen:** `supabase/seed-geburtstage.sql` im SQL Editor ausführen. Genauso `supabase/seed-doener-paypal.sql`. Beide Dateien sind lokal und nicht im Repo.
5. **App hochladen:** `index.html`, `app.js`, `sw.js`, `config.js`, die Ordner `vendor/` (Supabase-Bibliothek) und `fonts/` (Schriften). Ändert sich `app.js`, den Wert hinter `app.js?v=` in `index.html` anpassen, damit Handys nicht kurz die alte Version laden.
6. **Test:** Kasse vom Home-Bildschirm öffnen → ☰ → Benachrichtigungen → einschalten → „Test senden“.

## Wer bekommt was

| Ereignis | Empfänger |
|---|---|
| Neue Strafe | der betroffene Spieler |
| Zahltag gestartet | jeder, der etwas zahlen muss |
| Zahltag endet in < 24 h (18 Uhr) | wer noch offen ist und nicht gemeldet hat |
| Dienstag 17 Uhr | alle, die noch keinen Döner bestellt haben |
| Neues Fußballspiel / Runde vorbei | alle |
| „Ich habe bezahlt“ gemeldet | Kassenwart und Admin |
| Döner: „Ich habe bezahlt“ | der Dönerwart (Rolle „Dönerwart“ unter Verwalten → Mitglieder & Rollen) |
| Mittwoch 12 Uhr | alle, die am Dienstag Döner bestellt haben und noch nicht als bezahlt abgehakt sind |
| Kalender: „Fertig“ im Wochenplan | alle (eine Nachricht pro Woche, kein Einzel-Alarm je Eintrag) |
| Geburtstag (9 Uhr) | Glückwunsch an das Geburtstagskind, Info an alle anderen; dazu automatisch ein Kabinenfest |

Jeder kann jedes Thema pro Gerät abschalten. Beim Abmelden wird das Gerät automatisch abgemeldet.

## Grenzen im Free-Plan

Die Edge Function hat 500.000 Aufrufe pro Monat frei. Sie wird nur aufgerufen, wenn wirklich eine Nachricht rausgeht, also grob ein paar Hundert Mal im Monat. Der stündliche Zeitplan läuft in der Datenbank und kostet nichts extra.
