# Responsible

Gemeinsam Termine, Aufträge und To-dos organisieren – für Familien **und** Teams. Reine Web-App (HTML/CSS/JS ohne Build-Tools) als PWA, gehostet über GitHub Pages; Backend ist die Supabase Edge Function `responsible`.

Live: https://saschahoffmannsh-gif.github.io/responsible/

## Funktionen
- **Konten** wie bei HopfenMatch: Name + Passwort (PBKDF2-SHA256, 100 000 Iterationen), Bearer-Sitzungen, Sperre nach Fehlversuchen, Schnellwahl der zuletzt genutzten Konten. Konto-Seite: Name, Passwort, Profilbild ändern, abmelden, Konto löschen.
- **Gruppen** (Familie oder Team), mehrere je Person mit Umschalter, Rollen Besitzer/Admin/Mitglied, Einladungslinks (`#/join/<token>`, Teilen oder Kopieren), Einladungen zurückziehen, Mitglieder entfernen, Besitz übergeben, Gruppenbild.
- **Home – Meine Termine & Aufträge**: Begrüßung, Zähler für 7 Tage, eigene Einträge inkl. Müll, abhaken mit Rückgängig.
- **Kalender**: Monatsansicht (Pfeile/Wischen), mehrtägige Termine, Tagesansicht, Termin/Auftrag für ein oder mehrere Mitglieder oder Alle, 6 Terminarten. Jedes Mitglied hat eine **selbst gewählte Farbe** (Einstellungen), im Kalender gibt es keine Avatare.
- **Müll & Gemeinsam**: zweiter Kalender für alle – ICS-Datei hochladen, ICS-Link abonnieren (täglich per Cron aktualisiert), eigene Müll-Termine; „rausgestellt“ mit Namen bestätigen.
- **To-do**: offener Pool, Übernehmen (Datum oder schon erledigt), Einkaufsliste mit Produktkatalog (Emoji-Erkennung).
- Synchronisierung per Polling (6 s) und bei Fokus, optimistische Anzeige, Konflikterkennung über Revisionen.

## Entwicklung
`python3 -m http.server 8000` in diesem Ordner. Nach Änderungen an JS/CSS die Version in `sw.js`, `index.html` und `js/core.js` erhöhen.
Server: siehe `server/` (Schema `schema.sql`, Function `supabase/functions/responsible/index.ts`).
Deploy: `supabase functions deploy responsible --project-ref wlujgkbtpjxuekwsgnmg --no-verify-jwt --use-api`
