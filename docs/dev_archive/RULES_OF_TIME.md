# Regelwerk für Zeitberechnung (Single Source of Truth)

Dieses Dokument definiert die verbindlichen Regeln für die Berechnung von Arbeitszeiten, Urlauben und Krankenständen. Es dient als Referenz für die Entwicklung und Qualitätssicherung.

**Status:** Final definiert vom User
**Letzte Aktualisierung:** 13.12.2025

---

## 1. Urlaub (Vacation)

### Grundregel
Urlaub dient dazu, die vertragliche Arbeitszeit zu reduzieren. Er wird pauschal berechnet.

*   **Tage:** Zählt ausschließlich von **Montag bis Freitag**.
*   **Wert:** Jeder Urlaubstag hat den Wert `Wochenstunden / 5`. (Beispiel: 20h Vertrag -> 4h pro Tag).
*   **Geplante Schichten:** Werden ignoriert. Urlaub "überschreibt" jede Planung.

### Ausnahmen & Spezialfälle
*   **Wochenende (Sa/So):** Zählt niemals als Urlaub. Wert: **0h**.
*   **Feiertage:** Zählen niemals als Urlaub, auch wenn sie auf einen Werktag (Mo-Fr) fallen. Sie sind wie Sonntage zu behandeln. Wert im Kontext "Urlaub": **0h**.
*   **Dienstfrei:** Ob der Mitarbeiter an diesem Tag laut Plan frei gehabt hätte (z.B. Teilzeitkraft hat freitags immer frei), ist irrelevant. Ein Urlaubstag am Freitag zählt trotzdem mit dem Durchschnittswert.

---

## 2. Krankenstand (Sick Leave)

### Grundregel: Das Ausfallprinzip
Krankenstand soll den Mitarbeiter so stellen, als hätte er gearbeitet. Es werden keine pauschalen Stunden gutgeschrieben, sondern konkrete Ausfälle kompensiert.

### Regel A: Dienst war geplant
Wenn an diesem Tag eine Schicht im Dienstplan eingetragen ist (egal ob Wochentag, Wochenende oder Feiertag):
*   **Wert:** Es wird der **berechnete Wert** der geplanten Schicht gutgeschrieben.
*   **Nachtdienst (ND):** Es zählt nicht die Anwesenheitszeit (z.B. 15h), sondern die Arbeitszeit minus Bereitschaftsabzug (z.B. 12,25h), genau so, als wäre der Dienst geleistet worden.

### Regel B: KEIN Dienst geplant
Wenn für diesen Tag **keine** Schicht im Plan steht (z.B. freier Tag, oder Büro-Mitarbeiter ohne expliziten Dienstplan):
*   **Wert:** **0 Stunden**.
*   **Erklärung:** Wer nicht eingeteilt ist, hat keinen Arbeitsausfall. Es gibt keine "Pauschal-Gutschrift" für Krankheitstage ohne Dienst.

---

## 3. Zusammenfassung Matrix

| Situation | Montag (Werktag) | Montag (Feiertag) | Samstag / Sonntag |
| :--- | :--- | :--- | :--- |
| **Urlaub** (immer) | **Ø Tag** (z.B. 4h) | **0h** | **0h** |
| **Krank** (Dienst geplant: 8h) | **8h** (Planwert) | **8h** (Planwert) | **8h** (Planwert) |
| **Krank** (Kein Dienst) | **0h** | **0h** | **0h** |

### Legende
*   **Ø Tag:** `Wochenstunden / 5`
*   **Planwert:** Die Stunden, die die Schicht wert gewesen wäre (inkl. ND-Abzüge).

---

## 4. Gesamtberechnung des Stundensaldos

Die Hauptfunktion `calculateGenericBalance()` in `src/utils/balanceHelpers.js` berechnet den Stundensaldo.

### Formel

```
Total = (Ist + Korrektur + Urlaub) - Soll + Übertrag

Wobei:
- Ist = Tatsächlich geleistete Arbeitsstunden (aus time_entries oder Schichtberechnung)
- Korrektur = Admin-Korrekturen für den aktuellen Monat
- Urlaub = Urlaubsstunden gemäß Regel 1
- Soll = Zielstunden (Arbeitstage × Wochenstunden/5)
- Übertrag = Saldo vom Vormonat + initial_balance
```

### Berechnungsschritte

1. **Soll (Target):** Werktage (Mo-Fr ohne Feiertage) × `weekly_hours / 5`
2. **Ist (Actual):** Summe aller `calculated_hours` aus `time_entries`, oder falls keine vorhanden, aus Schichtberechnung
3. **Urlaub (Vacation):** Gemäß Regel 1 berechnet
4. **Korrektur:** Summe aller `balance_corrections.correction_hours` für diesen Monat
5. **Übertrag (Carryover):** Rekursive Berechnung aller Vormonate seit `start_date` + `initial_balance`

### Parameter der Funktion

```javascript
calculateGenericBalance(
  profile,         // Benutzerprofil mit weekly_hours, start_date, initial_balance
  historyShifts,   // Alle Schichten des Users
  historyAbsences, // Alle genehmigten Abwesenheiten
  timeEntries,     // Alle time_entries für exakte Stundenberechnungen
  currentDate,     // Das Datum/Monat für die Berechnung
  corrections      // Admin-Korrekturen (balance_corrections)
)
```

---

## 5. Admin-Korrekturen (Balance Corrections)

### Zweck
Ermöglicht Administratoren, Stundensalden nachträglich zu korrigieren, z.B. nach Buchhaltungsprüfung.

### Datenbank-Tabelle: `balance_corrections`

| Spalte | Typ | Beschreibung |
|--------|-----|--------------|
| id | UUID | Primärschlüssel |
| user_id | UUID | Betroffener Mitarbeiter |
| correction_hours | DECIMAL | Korrekturwert (positiv oder negativ) |
| effective_month | DATE | Monat, für den die Korrektur gilt |
| reason | TEXT | Pflichtfeld: Begründung |
| created_by | UUID | Admin, der die Korrektur erstellt hat |
| created_at | TIMESTAMP | Erstellungszeitpunkt |

### Workflow für Admins

1. Admin öffnet "Zeitenkontrolle" → Mitarbeiter + Monat wählen
2. Klickt "Korrektur erstellen"
3. **Sieht aktuellen berechneten Übertrag** (z.B. -25h)
4. **Gibt korrekten Wert von Buchhaltung ein** (z.B. -29h)
5. System berechnet automatisch die Differenz (-4h) und speichert diese
6. Die Korrektur wird zum **Ist** addiert und beeinflusst so auch den Übertrag für Folgemonate

### Berechnung

Die Korrektur wird direkt zum `actual` (Ist) addiert:
```
correctedActual = actual + correctionHours
```

Dies bewirkt, dass die Korrektur auch den Übertrag für Folgemonate beeinflusst.

---

## 6. Anfangssaldo (initial_balance)

### Zweck
Für Mitarbeiter, die vor App-Einführung bereits einen Stundensaldo hatten, kann ein Startwert hinterlegt werden.

### Speicherort
`profiles.initial_balance` (DECIMAL, kann negativ sein)

### Berechnung
Der `initial_balance` wird zum **Übertrag** addiert:
```
totalCarryover = calculatedCarryover + initialBalance
```

Dies erfolgt, weil der Anfangssaldo konzeptionell die "historische Vergangenheit" repräsentiert.

---

## 7. Feiertage

### Soll-Reduktion (Keine Gutschrift)
Feiertage, die auf Werktage (Mo-Fr) fallen, reduzieren das monatliche Soll.

*   Sie zählen **nicht** als Arbeitstage in der Soll-Berechnung.
*   Es erfolgt **keine** automatische Zeitgutschrift.
*   Wer an einem Feiertag frei hat, hat an diesem Tag einfach kein Soll zu erfüllen.

### Implementation
Die Berechnung verwendet die Funktion `isHoliday()` aus `src/utils/holidays.js`. Feiertage werden bei der Zählung der `workDays` für das `targetMinutes` ausgeschlossen.

---

## 8. Technische Details

### Dateien

| Datei | Beschreibung |
|-------|--------------|
| `src/utils/balanceHelpers.js` | Hauptlogik für `calculateGenericBalance()` |
| `src/utils/timeCalculations.js` | Schichtberechnung, Unterbrechungen, Nachtdienstabzüge |
| `src/utils/holidays.js` | Feiertagsberechnung für Österreich |

### Verwendung in Komponenten

- **RosterFeed.jsx:** Zeigt Mitarbeiter seinen eigenen Saldo
- **TeamPanel.jsx:** Zeigt Admin alle Mitarbeitersalden
- **SidebarBalances.jsx:** Desktop-Sidebar mit Saldenübersicht
- **AdminTimeTracking.jsx:** Admin-Kontrolle mit Korrekturmöglichkeit

### Debugging

Bei Problemen mit der Zeitberechnung:
1. Konsole öffnen (F12)
2. Nach `[DEBUG balanceHelpers]` suchen (falls aktiviert)
3. Prüfen: Werden alle Corrections geladen? Stimmt das Datum-Matching?

---

## 9. Vollständiges Beispiel: Max im Januar

Dieses Beispiel zeigt den kompletten Ablauf für einen Mitarbeiter namens **Max**.

### Ausgangssituation

| Eigenschaft | Wert |
|-------------|------|
| Mitarbeiter | Max |
| Wochenstunden | 40h |
| Start-Datum | 01.01.2024 |
| initial_balance | 0h |
| Monat | Januar 2025 |

### Schritt 1: Soll-Berechnung

**Januar 2025 hat:**
- 31 Tage total
- 23 Werktage (Mo-Fr)
- 2 Feiertage (1. Jan = Neujahr, 6. Jan = Heilige Drei Könige)
- → **21 Arbeitstage** (23 - 2)

**Berechnung:**
Feiertage zählen einfach **nicht** als Arbeitstage. Das Soll wird nur anhand der tatsächlichen Arbeitstage berechnet.

```
Soll = 21 Arbeitstage × (40h / 5) = 21 × 8h = 168h
```

| Zwischenstand | Wert |
|---------------|------|
| Soll | 168h |
| Ist | 0h |
| **Diff** | -168h |

---

### Schritt 2: Dienstplan-Schichten

Max hat folgende Schichten im Januar geplant:

| Datum | Schicht | Berechnung | Stunden |
|-------|---------|------------|---------|
| 02.01. | Tagdienst (08:00-16:00) | 8h | 8h |
| 03.01. | Tagdienst | 8h | 8h |
| 07.01. | Tagdienst | 8h | 8h |
| 08.01. | Nachtdienst (20:00-08:00) | 12h - 2.75h Abzug = 9.25h | 9.25h |
| ... | (weitere 16 Schichten) | ... | 128h |
| **Summe** | | | **161.25h** |

**Jetzt (vor Zeiterfassung):**

| Zwischenstand | Wert |
|---------------|------|
| Soll | 168h |
| Ist (aus Plan) | 161.25h |
| **Diff** | -6.75h |

---

### Schritt 3: Mitarbeiter erfasst Zeiten

Der Monat ist vorbei. Max erfasst seine tatsächlichen Zeiten.

**Abweichungen vom Plan:**

| Datum | Geplant | Tatsächlich | Differenz |
|-------|---------|-------------|-----------|
| 02.01. | 08:00-16:00 | 08:00-16:30 | +0.5h |
| 15.01. | 08:00-16:00 | Krank (8h geplant) | 0h (wie geplant) |
| 20.01. | 08:00-16:00 | 08:00-15:00 | -1h |
| **Summe Abweichungen** | | | **-0.5h** |

```
Ist nach Erfassung = 161.25h - 0.5h = 160.75h
```

**Nach Erfassung:**

| Zwischenstand | Wert |
|---------------|------|
| Soll | 168h |
| Ist (erfasst) | 160.75h |
| **Diff** | -7.25h |

Max reicht den Monat ein → Status: **"Eingereicht"**

---

### Schritt 4: Admin kontrolliert

Admin prüft die Einträge und entdeckt:
- Am 08.01. hat Max eine Pause von 45 Minuten nicht erfasst

**Admin korrigiert:**
```
Ist = 160.75h - 0.75h = 160h
```

Admin genehmigt → Status: **"Genehmigt"**

**Nach Genehmigung:**

| Zwischenstand | Wert |
|---------------|------|
| Soll | 168h |
| Ist (genehmigt) | 160h |
| **Diff (Januar)** | -8h |
| Übertrag (Dezember) | 0h |
| **Total** | **-8h** |

---

### Schritt 5: Buchhaltung korrigiert

Die Buchhaltung prüft und stellt fest:
- Max hat am 10.01. einen externen Kurs besucht (4h) der nicht erfasst war
- Der korrekte Übertrag sollte **-4h** sein

**Admin führt Korrektur durch:**

1. Öffnet "Zeitenkontrolle" → Max → Januar 2025
2. Klickt "Korrektur erstellen"
3. Sieht: **Aktueller Übertrag: -8h**
4. Gibt ein: **Korrekter Übertrag: -4h**
5. System berechnet: **Korrektur: +4h**
6. Begründung: "Externer Kurs am 10.01. nachgetragen"
7. Speichert

**Nach Buchhaltungs-Korrektur:**

| Endstand Januar | Wert |
|-----------------|------|
| Soll | 168h |
| Ist (korrigiert) | 164h (+4h Korrektur) |
| **Diff (Januar)** | -4h |
| Übertrag (Dezember) | 0h |
| **Total** | **-4h** ✅ |

---

### Schritt 6: Auswirkung auf Februar

Max startet Februar mit **-4h Übertrag**.

| Februar Start | Wert |
|---------------|------|
| Übertrag aus Januar | -4h |
| Soll (18 Arbeitstage) | 144h |
| Ist (noch 0) | 0h |
| **Total aktuell** | -4h - 144h = **-148h** |

→ Der Übertrag wird automatisch korrekt in alle Folgemonate übernommen!

---

### Zusammenfassung: Max's Stundensaldo-Verlauf (Korrigiert)

```
┌─────────────────────────────────────────────────────────────────────┐
│                    MAX - STUNDENSALDO JANUAR 2025                   │
├─────────────────────┬───────────┬───────────────────────────────────┤
│ Schritt             │ Diff      │ Beschreibung                      │
├─────────────────────┼───────────┼───────────────────────────────────┤
│ 1. Soll berechnet   │ -168h     │ 21 Arbeitstage x 8h (kein Ft.)    │
│ 2. Plan eingepflegt │ -6.75h    │ 161.25h geplant                   │
│ 3. Zeiten erfasst   │ -7.25h    │ 160.75h tatsächlich               │
│ 4. Admin genehmigt  │ -8h       │ 160h nach Prüfung                 │
│ 5. Buchhaltung korr.│ -4h ✅    │ +4h Korrektur für Kurs            │
└─────────────────────┴───────────┴───────────────────────────────────┘
```
