# 🔍 VOLLSTÄNDIGE SYSTEM-ANALYSE: Schicht-Logik

## Übersicht

Diese Analyse dokumentiert ALLE Stellen im Code, wo Schicht-Typen verwendet werden,
und welche speziellen Regeln für jeden Typ gelten.

**Ziel:** Verstehen, was in die Datenbank muss, BEVOR wir Code ändern.

---

## 1. Schicht-Typen und ihre speziellen Eigenschaften

### TD1 (Tagdienst 1)
| Eigenschaft | Wert |
|-------------|------|
| Standard-Zeit | 07:30 - 14:30 |
| Wochenende/Feiertag | 09:30 - 14:30 |
| Besonderheit | Kombinierbar mit TD2 (durchgehend ohne Pause) |
| Bereitschaftszeit | Nein |

### TD2 (Tagdienst 2)
| Eigenschaft | Wert |
|-------------|------|
| Standard-Zeit | 14:00 - 19:30 |
| Wochenende/Feiertag | Gleich |
| Besonderheit | Kombinierbar mit TD1 |
| Bereitschaftszeit | Nein |

### ND (Nachtdienst) ⚠️ KOMPLEX
| Eigenschaft | Wert |
|-------------|------|
| Standard-Zeit | 19:00 - 08:00 (+1 Tag) |
| Freitag/Samstag | 19:00 - 10:00 (+1 Tag) |
| Spans Midnight | JA |
| **Bereitschaftszeit** | 00:30 - 06:00 |
| Bereitschaft Wertung | 50% (passive Zeit) |
| Unterbrechungen | Werden auf min. 30 Min. "inflated" |
| Unterbrechungen Wertung | 100% (aktive Zeit) |

**Kritische Logik in `timeCalculations.js`:**
```javascript
// Readiness Window (hardcoded!)
readinessStart.setHours(0, 30, 0, 0)  // 00:30
readinessEnd.setHours(6, 0, 0, 0)      // 06:00

// Passive time = 50%
passiveReadinessMinutes * 0.5
```

### DBD (Doppeltbesetzter Dienst)
| Eigenschaft | Wert |
|-------------|------|
| Standard-Zeit | 20:00 - 00:00 (+1 Tag) |
| Spans Midnight | JA |
| Bereitschaftszeit | Nein (?) - KLÄREN! |
| Besonderheit | Zwei Mitarbeiter gleichzeitig |

### TEAM (Teamsitzung)
| Eigenschaft | Wert |
|-------------|------|
| Standard-Zeit | 09:30 - 11:30 |
| Bereitschaftszeit | Nein |
| Coverage Required | Nein (alle nehmen teil) |

### FORTBILDUNG
| Eigenschaft | Wert |
|-------------|------|
| Standard-Zeit | 09:00 - 17:00 |
| Bereitschaftszeit | Nein |
| Coverage Required | Nein |

---

## 2. Wo werden Schicht-Typen im Code verwendet?

### A. `shiftDefaults.js` - Zeitdefinitionen
**Verwendung:** Automatisches Ausfüllen von Start/Ende bei Schicht-Erstellung
**Stellen:**
- `if (type === 'DBD')` (Zeile 39)
- `if (type === 'ND')` (Zeile 50)
- `if (type === 'TD1')` (Zeile 72)
- `if (type === 'TD2')` (Zeile 86)
- `if (type === 'TEAM')` (Zeile 93)
- `if (type === 'FORTBILDUNG')` (Zeile 107)

### B. `timeCalculations.js` - Stundenberechnung
**Verwendung:** Berechnung der tatsächlichen Arbeitsstunden

**Kritische Stellen:**
1. **Zeile 55:** `if (type !== 'ND')` - Einfache Berechnung für alle außer ND
2. **Zeile 59-76:** Bereitschaftsfenster (nur für ND)
3. **Zeile 78-145:** Unterbrechungslogik (nur für ND)

**⚠️ WICHTIG:** Die Bereitschaftszeiten (00:30-06:00) sind HARDCODED!

### C. `balanceHelpers.js` - Saldoberechnung
**Verwendung:** Monatliche Saldoübersicht

**Kritische Stellen:**
1. **Zeile 36-40:** Typumwandlung `NACHT` → `ND`
2. **Zeile 74-86:** TD1+TD2 Kombination (durchgehende Schicht)
3. **Zeile 190-202:** Gleiche TD1+TD2 Logik für Carryover

### D. `AdminOverview.jsx` - Statistiken
**Verwendung:** Dashboard-Statistiken

**Stellen:**
- Zeile 218: `s.type === 'ND'` - Nachtdienst-Zählung
- Zeile 428: `s.type === 'ND'` - Mitarbeiter-Nachtdienst-Statistik

### E. `timeReportPdfGenerator.js` - PDF-Export
**Verwendung:** Monatsnachweis PDF

**Stellen:**
- Zeile 266: `shiftType?.toLowerCase().includes('bereit')` - Bereitschaftserkennung
- Zeile 284-289: Separate Spalten für Bereitschaftsdienste
- Zeile 344-385: Bereitschaftsstunden-Zusammenfassung (÷2 Regel)

---

## 3. Spezialregeln die in der DB abgebildet werden müssen

### A. Bereitschaftszeit (nur ND aktuell)
```json
{
  "has_standby": true,
  "standby_start": "00:30",
  "standby_end": "06:00",
  "standby_factor": 0.5,
  "interruption_min_minutes": 30
}
```

### B. Spans Midnight
```json
{
  "spans_midnight": true
}
```

### C. Wochenend-/Feiertags-Varianten
```json
{
  "weekday_rules": {
    "saturday": { "start": "09:30", "end": "14:30" },
    "sunday": { "start": "09:30", "end": "14:30" },
    "holiday": { "start": "09:30", "end": "14:30" },
    "friday": { "end": "10:00" }  // Nur für ND Ende
  }
}
```

### D. TD1+TD2 Kombinationsregel
```json
{
  "combinable_with": ["TD2"],  // TD1 kann mit TD2 kombiniert werden
  "combine_no_break": true      // Keine Pause zwischen den Schichten
}
```

### E. Coverage Required
```json
{
  "requires_coverage": true,   // Muss besetzt sein (Vertretung nötig)
  "applies_to_all": false      // Gilt nicht für alle (TEAM ist anders)
}
```

---

## 4. Empfohlenes erweitertes DB-Schema

```sql
ALTER TABLE shift_templates ADD COLUMN IF NOT EXISTS 
    has_standby BOOLEAN DEFAULT false;

ALTER TABLE shift_templates ADD COLUMN IF NOT EXISTS 
    standby_start TIME;

ALTER TABLE shift_templates ADD COLUMN IF NOT EXISTS 
    standby_end TIME;

ALTER TABLE shift_templates ADD COLUMN IF NOT EXISTS 
    standby_factor DECIMAL(3,2) DEFAULT 0.5;

ALTER TABLE shift_templates ADD COLUMN IF NOT EXISTS 
    interruption_min_minutes INTEGER DEFAULT 30;

ALTER TABLE shift_templates ADD COLUMN IF NOT EXISTS 
    combinable_with TEXT[];  -- Array von Codes

ALTER TABLE shift_templates ADD COLUMN IF NOT EXISTS 
    requires_coverage BOOLEAN DEFAULT true;

ALTER TABLE shift_templates ADD COLUMN IF NOT EXISTS 
    applies_to_all BOOLEAN DEFAULT false;
```

---

## 5. Offene Fragen (VOR Fortfahren klären!)

1. **DBD:** Hat der Doppeltbesetzte Dienst auch Bereitschaftszeit?
2. **DBD:** Warum 20:00-00:00? Ist das korrekt?
3. **Weitere Schichttypen:** Gibt es noch andere die fehlen?
4. **TD1+TD2 Regel:** Ist die "keine Pause"-Regel für alle Teams gleich?
5. **Bereitschaftsfenster:** Ist 00:30-06:00 fix oder teamabhängig?

---

## 6. Zusammenfassung der Abhängigkeiten

```
shiftDefaults.js (Eingabe)
        │
        ▼
   shifts Tabelle
        │
        ├──► timeCalculations.js (Berechnung)
        │           │
        │           ├──► TimeTracking.jsx (Anzeige)
        │           ├──► AdminTimeTracking.jsx (Admin)
        │           └──► balanceHelpers.js (Saldo)
        │
        ├──► RosterFeed.jsx (Kalender)
        │
        ├──► AdminOverview.jsx (Statistik)
        │
        └──► timeReportPdfGenerator.js (PDF)
```

**Fazit:** Die Bereitschaftszeit-Logik in `timeCalculations.js` ist der kritischste Teil.
Sie muss entweder:
- A) Weiterhin hardcoded bleiben (einfacher)
- B) Aus shift_templates geladen werden (flexibler, mehr Aufwand)

**Empfehlung:** Für die erste Version von Multi-Tenancy die Bereitschaftslogik 
hardcoded lassen. Erst wenn ein Team andere Bereitschaftszeiten braucht, erweitern.
