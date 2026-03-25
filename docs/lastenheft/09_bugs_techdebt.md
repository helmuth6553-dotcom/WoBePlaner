# 9. Bekannte Bugs & Tech Debt

Dieses Kapitel dokumentiert alle zum Zeitpunkt der Erstellung bekannten Fehler, technischen Schulden und offenen Aufgaben im WoBePlaner. Die Eintraege stammen aus der `CLAUDE.md` sowie aus `TODO`-, `FIXME`- und `HACK`-Kommentaren im Quellcode (`src/`).

---

## 9.1 Kritische Probleme

### BUG-001: Cross-Month Sickness (Monatsuebergreifende Krankheit)

- **Beschreibung**: Die Stundenberechnung fuer Krankenstaende, die ueber einen Monatswechsel gehen, ist unzuverlaessig. Der Code in `balanceHelpers.js` (Zeilen 220-256) enthaelt ausfuehrliche Kommentare, die das Problem dokumentieren: Die SSOT-basierte (Single Source of Truth) Zuordnung von Krankheitsstunden auf einzelne Monate funktioniert nicht korrekt. Der Code faellt auf einen "Direct Use"-Ansatz zurueck, der bei Monatsuebergaengen zu Doppelzaehlungen oder fehlenden Stunden fuehren kann.
- **Betroffener Bereich**: Saldo-Berechnung (Soll/Ist-Abgleich), betrifft alle Mitarbeiter-Salden bei laengeren Krankenstaenden
- **Schweregrad**: kritisch
- **Auswirkung**: Falsche Ueberstunden-/Minusstunden-Salden bei Mitarbeitern mit monatsuebergreifenden Krankenstaenden. Da der Saldo kumulativ berechnet wird, pflanzt sich der Fehler in alle Folgemonate fort.

### BUG-002: Zombie Time Entries (Verwaiste Zeiteintraege)

- **Beschreibung**: In der Datenbank existieren Zeiterfassungs-Eintraege, die keinem gueltigen Dienst mehr zugeordnet sind (z.B. nach Dienstloeschung). Diese werden in `AdminTimeTracking.jsx` (Zeile 297) lediglich ausgeblendet (`validHours <= 0` wird gefiltert), aber nicht aus der Datenbank entfernt. Der Kommentar im Code bezeichnet sie als "Zombie (historical artifact)".
- **Betroffener Bereich**: Zeiterfassung (Admin-Ansicht), Datenbank-Integritaet
- **Schweregrad**: kritisch
- **Auswirkung**: Die Datenbank akkumuliert ueber die Zeit ungueltige Eintraege. Diese koennten bei Aenderungen an der Filter-Logik ploetzlich wieder sichtbar werden und zu falschen Stundenberechnungen fuehren. Ausserdem erschweren sie Datenbank-Analysen und -Migrationen.

### BUG-003: PDF-Export unvollstaendig (fehlende Urlaubs- und Saldodaten)

- **Beschreibung**: Beim PDF-Export der Zeitberichte werden die Felder `vacationData` und `balanceData` fest auf `null` gesetzt. Betroffen sind zwei Stellen:
  - `AdminTimeTracking.jsx`, Zeilen 756-757: `vacationData: null, // TODO: Add vacation data if available`
  - `TimeTracking.jsx`, Zeilen 804-805: `balanceData: null // TODO: Add balance data if available`
- **Betroffener Bereich**: PDF-Export fuer Zeitberichte (Admin- und Mitarbeiter-Ansicht)
- **Schweregrad**: kritisch
- **Auswirkung**: Exportierte PDF-Zeitberichte enthalten keine Urlaubs- und Saldo-Informationen. Da diese PDFs als offizielle Arbeitszeitdokumentation dienen, fehlen wesentliche Informationen fuer die Lohnverrechnung und Arbeitszeitnachweise.

---

## 9.2 Mittlere Probleme

### BUG-004: 37 native alert()/confirm()-Aufrufe statt modaler Dialoge

- **Beschreibung**: Im gesamten Frontend werden 28 `alert()`- und 9 `confirm()`-Aufrufe (insgesamt 37) verwendet, obwohl eigene modale Komponenten (`AlertModal.jsx`, `ConfirmModal.jsx`) existieren. Die nativen Browser-Dialoge blockieren den JavaScript-Thread und sind nicht gestaltbar.
- **Betroffene Dateien** (mit Anzahl der Aufrufe):

  | Datei | alert() | confirm() | Summe |
  |---|---|---|---|
  | `AdminTimeTracking.jsx` | 10 | 3 | 13 |
  | `AdminEmployees.jsx` | 6 | 2 | 8 |
  | `ProfileSettings.jsx` | 4 | 0 | 4 |
  | `NotificationToggle.jsx` | 2 | 0 | 2 |
  | `AdminAbsences.jsx` | 1 | 1 | 2 |
  | `DayCard.jsx` | 1 | 0 | 1 |
  | `EmployeeManager.jsx` | 1 | 1 | 2 |
  | `TimeTracking.jsx` | 1 | 0 | 1 |
  | `TimeTrackingV2.jsx` | 1 | 0 | 1 |
  | `pdfGenerator.js` | 1 | 0 | 1 |
  | `AbsencePlanner.jsx` | 0 | 1 | 1 |
  | `RosterFeed.jsx` | 0 | 1 | 1 |

- **Betroffener Bereich**: Gesamte Benutzeroberflaeche (Fehlermeldungen, Bestaetigungen, Erfolgsmeldungen)
- **Schweregrad**: mittel
- **Auswirkung**: Inkonsistentes Nutzererlebnis. Native Dialoge sind nicht im App-Design gestaltet, koennen nicht angepasst werden und verhalten sich auf Mobile-Geraeten je nach Browser unterschiedlich. PWA-Nutzer erhalten ein uneinheitliches Erscheinungsbild.

### BUG-005: Pre-Holiday Nachtdienst-Ende nicht implementiert

- **Beschreibung**: In `shiftDefaults.js` (Zeile 56) steht der Kommentar: `// Pre-Holiday -> Holiday Morning (End 10:00) - TODO: Add Pre-Holiday check if strictly needed`. Die aktuelle Logik setzt das Nachtdienst-Ende nur bei Freitag und Samstag auf 10:00 Uhr. An Vorabenden von Feiertagen (z.B. Mittwoch vor Fronleichnam) bleibt es bei 08:00 Uhr.
- **Betroffener Bereich**: Dienstplanung (Nachtdienst-Standardzeiten), Zeiterfassung
- **Schweregrad**: mittel
- **Auswirkung**: Bei Nachtdiensten vor Feiertagen werden 2 Stunden zu wenig berechnet (08:00 statt 10:00 Ende). Dies betrifft die Soll-Stunden-Berechnung und fuehrt zu inkorrekten Salden fuer die betroffenen Nachtdienste. Da oesterreichische Feiertage auf verschiedene Wochentage fallen koennen, tritt das Problem mehrmals pro Jahr auf.

### BUG-006: AdminOverview Fairness-Linie bricht bei Responsive/Mobile

- **Beschreibung**: Die Durchschnittslinie in der Soli-Punkte-Visualisierung (`AdminOverview.jsx`, Zeile 1162) verwendet eine CSS-Berechnung mit festen Pixel-Werten: `calc(72px + (100% - 72px - 40px) * ...)`. Die 72px und 40px entsprechen den angenommenen Breiten fuer Name-Labels und Badge-Elemente. Bei anderen Schriftgroessen, Bildschirmbreiten oder laengeren/kuerzeren Namen stimmen diese festen Werte nicht mehr.
- **Betroffener Bereich**: Admin-Dashboard (Uebersicht), Soli-Punkte-Anzeige
- **Schweregrad**: mittel
- **Auswirkung**: Auf Mobilgeraeten oder bei veraenderten Schriftgroessen ist die Durchschnittslinie falsch positioniert. Die visuelle Darstellung der Fairness-Verteilung wird dadurch irrefuehrend.

---

## 9.3 Niedrige Probleme / Tech Debt

### BUG-007: TimeTrackingV2 deaktiviert aber im Code vorhanden

- **Beschreibung**: In `App.jsx` (Zeile 29) existiert ein Feature-Flag `USE_NEW_TIME_TRACKING = false`, das eine alternative Zeiterfassungs-Komponente (`TimeTrackingV2.jsx`) steuert. Die V2-Implementierung ist komplett vorhanden, wird aber nicht verwendet. In `App.jsx` Zeile 204 wird die Komponente bedingt geladen: `USE_NEW_TIME_TRACKING ? <TimeTrackingV2 /> : <TimeTracking />`.
- **Betroffener Bereich**: Zeiterfassung (Mitarbeiter-Ansicht), Code-Organisation
- **Schweregrad**: niedrig
- **Auswirkung**: Toter Code erhoehrt die Wartungskomplexitaet. Aenderungen an der Zeiterfassung muessen potenziell in zwei Komponenten nachgezogen werden. Die V2-Komponente enthaelt ebenfalls native `alert()`-Aufrufe und wird nicht durch Tests abgedeckt, da sie im Normalfall nie geladen wird.

### BUG-008: PDF-Segmentierung als "HACK" gekennzeichnet

- **Beschreibung**: In `timeCalculations.js` (Zeile 284) ist die Funktion `getShiftSegments()` mit dem Kommentar `PDF SEGMENTATION HACK` ueberschrieben. Die Funktion zerlegt Dienste in Zeitsegmente (Arbeitszeit, Bereitschaft, Unterbrechungen) fuer die PDF-Darstellung. Der "HACK"-Kommentar deutet darauf hin, dass die Implementierung als provisorisch betrachtet wird.
- **Betroffener Bereich**: PDF-Export (Zeitsegment-Darstellung in Zeitberichten)
- **Schweregrad**: niedrig
- **Auswirkung**: Die Funktion funktioniert derzeit korrekt, ist aber als provisorische Loesung markiert. Bei Aenderungen an Diensttypen oder Bereitschaftsregeln koennte die Segmentierung fehlerhaft werden.

### BUG-009: Mehrfach duplizierte Shift-Type-Konfigurationen

- **Beschreibung**: Diensttyp-Labels, Farben und Kuerzel sind in mindestens 9 verschiedenen Dateien definiert (siehe Checkliste "Neuen Diensttyp hinzufuegen" in CLAUDE.md). Es gibt keine zentrale Konfigurationsdatei. Jede Datei pflegt eigene Mapping-Objekte wie `SHIFT_TYPE_LABELS`, `SHIFT_TYPE_COLORS`, `SHIFT_TYPE_SHORT`, `PDF_DIENST_LABELS`, `DIENST_LABELS`, `shiftHours`, `shiftLabels`, `shiftColors` etc.
- **Betroffener Bereich**: Gesamte Anwendung (ueberall wo Diensttypen dargestellt werden)
- **Schweregrad**: niedrig
- **Auswirkung**: Beim Hinzufuegen eines neuen Diensttyps muessen mindestens 9 Dateien manuell angepasst werden. Die Wahrscheinlichkeit, eine Stelle zu vergessen, ist hoch. Inkonsistenzen zwischen den Definitionen sind schwer zu erkennen.

---

## 9.4 Zusammenfassung

| ID | Bereich | Schweregrad | Kurzbeschreibung |
|---|---|---|---|
| BUG-001 | Saldo-Berechnung | kritisch | Cross-Month Sickness: fehlerhafte Stundenzuordnung bei monatsuebergreifender Krankheit |
| BUG-002 | Zeiterfassung / DB | kritisch | Zombie Time Entries: verwaiste DB-Eintraege werden versteckt statt bereinigt |
| BUG-003 | PDF-Export | kritisch | Urlaubs- und Saldodaten fehlen im PDF-Zeitbericht (`null`) |
| BUG-004 | UI (gesamt) | mittel | 37 native alert()/confirm() statt AlertModal/ConfirmModal |
| BUG-005 | Dienstplanung | mittel | Nachtdienst-Ende 10:00 an Vorfeiertagen nicht implementiert |
| BUG-006 | Admin-Dashboard | mittel | Fairness-Linie mit festen Pixel-Werten bricht bei Responsive |
| BUG-007 | Code-Organisation | niedrig | TimeTrackingV2 deaktiviert, toter Code im Repository |
| BUG-008 | PDF-Export | niedrig | getShiftSegments() als "HACK" markiert |
| BUG-009 | Code-Organisation | niedrig | Diensttyp-Konfiguration ueber 9+ Dateien verstreut statt zentral |

**Gesamt**: 3 kritisch, 3 mittel, 3 niedrig

Die kritischen Probleme (BUG-001 bis BUG-003) betreffen die Korrektheit von Berechnungen und Datenintegritaet. Sie sollten bei einer Neuentwicklung priorisiert adressiert werden -- idealerweise durch serverseitige Berechnung und eine zentrale Business-Logic-Schicht, die im aktuellen rein clientseitigen Ansatz fehlt.
