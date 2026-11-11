# Dragons Strafenkasse

Mannschaftskasse der TSG Münster Dragons (1. Herren): Strafen eintragen, Monatsübersicht,
Rechnungen, Zahltag mit PayPal/Überweisung und automatischer Verzugsstrafe.

- **Frontend:** eine statische Seite (`index.html`), gehostet über GitHub Pages
- **Daten & Login:** Supabase (E-Mail + Passwort, Row-Level-Security)

## Rollen
| Rolle | darf |
|---|---|
| Spieler | Kasse ansehen, bezahlen, „Ich habe bezahlt“ melden |
| Kassenwart | + Strafen/Rechnungen eintragen, **als Einziger** den Zahltag starten |
| Admin | + Strafen/Rechnungen eintragen, Katalog, Kader, Zahlungsdaten, Mitglieder freischalten |

Neue Konten wählen bei der Registrierung ihren Namen und sehen die Kasse erst nach Freischaltung durch einen Admin.

## Einrichtung
1. `supabase/schema.sql` im Supabase SQL-Editor ausführen.
2. Projekt-URL und anon/publishable key in `config.js` eintragen.
3. In Supabase unter *Authentication → URL Configuration* die GitHub-Pages-Adresse als Site URL eintragen.
