# STABLE VERSION CHECKPOINT
## Datum: 2024-12-10 00:00 Uhr

Dieser Stand der App ist **stabil und getestet**.

---

## Funktionierende Features:

### ✅ Dienstplan (RosterFeed)
- Schichten anzeigen und zuweisen
- Urlaub/Krank Badges werden korrekt angezeigt
- Team Panel zeigt alle Mitarbeiter mit korrekten Stunden

### ✅ Zeiterfassung (TimeTracking)
- Schichten werden korrekt aufgelistet
- Krank/Urlaub Tage werden mit korrekten Stunden angezeigt
- Mehrtägige Krankmeldungen teilen planned_hours korrekt auf

### ✅ Admin Zeitenkontrolle (AdminTimeTracking)
- Alle Mitarbeiter Zeiten sichtbar
- Keine Zombie-Einträge (Feiertage werden gefiltert)
- Krankmeldungen mit korrekten Stunden

### ✅ Team Panel
- Synchron mit "Mein Stundenkonto"
- Lädt shift_interests UND assigned_to Schichten
- Zeigt actual + vacation als "Ist"

---

## Bekannte Issues (nicht kritisch):

1. `monthly_reports` Tabelle fehlt (406 Error) - Monatsberichte Funktion
2. Auth timeout Warnung beim Laden (funktioniert trotzdem)

---

## Wichtige Dateien (diese sichern!):

```
src/
├── components/
│   ├── AdminTimeTracking.jsx
│   ├── TimeTracking.jsx
│   ├── RosterFeed.jsx
│   ├── TeamPanel.jsx
│   ├── DayCard.jsx
│   └── ...
├── utils/
│   ├── timeCalculations.js      ← SSOT für Stundenberechnung
│   ├── balanceHelpers.js        ← Saldo-Berechnung
│   └── holidays.js              ← Feiertage
└── ...
```

---

## SQL Scripts (bei DB-Problemen):

- `FIX_RLS.sql` - Leserechte für Team Panel
- `FIX_RLS_V2.sql` - Aggressive RLS Korrektur
- `CHECK_ABSENCES.sql` - Absences debuggen
- `CHECK_TIME_ENTRIES.sql` - Time Entries debuggen

---

## Wiederherstellung:

Falls die App kaputt geht:
1. Kopiere die gesicherten `src/` Dateien zurück
2. Führe `npm install` aus
3. Führe die SQL Scripts aus (falls DB-Rechte fehlen)
4. Starte mit `npm run dev`

---

## Git Installation (empfohlen für Zukunft):

1. Lade Git herunter: https://git-scm.com/download/win
2. Installiere mit Standard-Einstellungen
3. Öffne neues Terminal und führe aus:
   ```
   git init
   git add .
   git commit -m "Stable checkpoint 2024-12-10"
   ```

Dann kannst du jederzeit zu diesem Stand zurück.
