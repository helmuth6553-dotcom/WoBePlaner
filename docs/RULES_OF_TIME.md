# Regelwerk für Zeitberechnung (Single Source of Truth)

Dieses Dokument definiert die verbindlichen Regeln für die Berechnung von Arbeitszeiten, Urlauben und Krankenständen. Es dient als Referenz für die Entwicklung und Qualitätssicherung.

**Status:** Final definiert vom User
**Datum:** 09.12.2025

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
