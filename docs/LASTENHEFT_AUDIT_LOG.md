# Lastenheft: Audit Log System - Dienstplan App

**Version:** 1.0
**Datum:** 07.03.2026
**Autor:** Entwicklung / Claude Code
**Status:** Entwurf

---

## 1. Ausgangslage und Problemanalyse

### 1.1 IST-Zustand

Das aktuelle Audit-Log-System erfasst **11 Admin-Aktionen** in der Tabelle `admin_actions`. Die Tabelle hat folgende Struktur:

| Spalte | Typ | Beschreibung |
|---|---|---|
| id | UUID | Primaerschluessel |
| admin_id | UUID | FK auf auth.users (ausfuehrender Admin) |
| action | TEXT | Aktionstyp (z.B. 'shift_created') |
| target_user_id | UUID | FK auf betroffenen Mitarbeiter (nullable) |
| target_resource_type | TEXT | Ressourcentyp (z.B. 'shift', 'absence_request') |
| target_resource_id | TEXT | ID der betroffenen Ressource |
| changes | JSONB | Aenderungsdetails |
| metadata | JSONB | Zusaetzliche Kontextdaten |
| created_at | TIMESTAMPTZ | Zeitstempel |

### 1.2 Aktuell erfasste Aktionen

| # | Aktion | Datei | Erfasste Daten | Bewertung |
|---|---|---|---|---|
| 1 | absence_genehmigt | AbsencePlanner.jsx | Status vorher/nachher | Unvollstaendig |
| 2 | absence_genehmigt/abgelehnt | AdminAbsences.jsx | Status vorher/nachher | Unvollstaendig |
| 3 | absence_storniert | AdminAbsences.jsx | Status vorher/nachher | Unvollstaendig |
| 4 | deactivate_user | AdminEmployees.jsx | is_active vorher/nachher | Unvollstaendig |
| 5 | reactivate_user | AdminEmployees.jsx | is_active vorher/nachher | Unvollstaendig |
| 6 | create_correction | AdminTimeTracking.jsx | Stunden, Grund, Vorheriger Saldo | Akzeptabel |
| 7 | approve_report | AdminTimeTracking.jsx | Status vorher/nachher, Jahr/Monat | Akzeptabel |
| 8 | reject_report | AdminTimeTracking.jsx | Status vorher/nachher, Jahr/Monat | Unvollstaendig |
| 9 | shift_created | RosterFeed.jsx | Datum, Typ, Start/Ende | OK |
| 10 | shift_updated | RosterFeed.jsx | Update-Payload (nur neue Werte!) | Kritisch |
| 11 | shift_deleted | RosterFeed.jsx | Geloeschte Schichtdaten | OK |

### 1.3 Identifizierte Maengel

#### A) Fehlende Vorher/Nachher-Vergleiche (Kritisch)

- **Schicht bearbeitet (shift_updated):** Speichert NUR die neuen Werte (`updatePayload`), NICHT die alten Werte. Bei einem Rechtsstreit kann nicht nachgewiesen werden, was der Admin geaendert hat.
- **Mitarbeiter bearbeitet (handleUpdateUser):** Wird GAR NICHT geloggt (siehe unten).

#### B) Komplett fehlende Audit-Eintraege (Kritisch)

| Aktion | Datei | Risiko |
|---|---|---|
| **Mitarbeiter einladen/erstellen** | AdminEmployees.jsx:119 (handleInvite) | Hoch - Wer hat wann welchen Zugang erstellt? |
| **Mitarbeiterdaten bearbeiten** | AdminEmployees.jsx:175 (handleUpdateUser) | Kritisch - Aenderung von Wochenstunden, Rolle, Eintrittsdatum, Urlaubstagen, Anfangssaldo wird nicht protokolliert |
| **Krankmeldung erfassen** | RosterFeed.jsx:599 (handleSickReport) | Hoch - Loescht Schichtzuweisungen, erstellt Abwesenheit, markiert Schichten als dringend |
| **Korrektur loeschen** | AdminTimeTracking.jsx:531 (handleDeleteCorrection) | Kritisch - Admin kann Stundenkorrektur spurlos loeschen |
| **Zeiteintrag genehmigen/bearbeiten** | AdminTimeTracking.jsx:640 (handleApproveEntry) | Hoch - Admin aendert erfasste Arbeitszeiten |
| **Schichtzuweisung aendern** | Diverse Stellen | Mittel - Wer wurde einer Schicht zugewiesen/entfernt |
| **Coverage Request / Abstimmung** | RosterFeed.jsx | Mittel - Vertretungsanfragen erstellen/abschliessen |

#### C) Unzureichende Kontextdaten

| Problem | Betroffene Aktionen |
|---|---|
| Kein Mitarbeitername in `changes` | Alle Aktionen (nur User-ID, Name muss per JOIN geladen werden) |
| Keine Abwesenheitsdaten (von/bis, Typ) | absence_genehmigt/abgelehnt/storniert |
| Kein `target_user_id` bei Schichten | shift_created/updated/deleted (immer null) |
| Keine IP-Adresse | Alle Aktionen |
| Kein Grund bei Ablehnung | absence_abgelehnt, reject_report |
| Keine Session-ID | Alle Aktionen |

---

## 2. Anforderungen

### 2.1 Rechtliche Grundlage

Im oesterreichischen Arbeitsrecht (AZG - Arbeitszeitgesetz, ASchG - ArbeitnehmerInnenschutzgesetz) und der DSGVO gelten folgende Anforderungen:

- **Arbeitszeitaufzeichnungen** muessen nachvollziehbar und manipulationssicher sein
- **Aenderungen an Arbeitszeitdaten** muessen dokumentiert werden (wer, wann, was, vorher/nachher)
- Fuer **Urlaubs- und Krankheitsaufzeichnungen** gilt erhoehte Dokumentationspflicht
- Bei **Rechtsstreitigkeiten** (z.B. Arbeitsgerichtsverfahren) muss der Arbeitgeber nachweisen koennen, welche administrativen Aenderungen vorgenommen wurden

### 2.2 Funktionale Anforderungen

#### FA-01: Vollstaendige Erfassung aller Admin-Mutationen

**Jede schreibende Admin-Aktion muss geloggt werden.** Nachfolgende Tabelle definiert alle zu erfassenden Aktionen:

##### Kategorie: Schichtverwaltung

| ID | Aktion | action_type | Zu erfassende Daten in `changes` |
|---|---|---|---|
| S-01 | Schicht erstellen | shift_created | after: { type, start_time, end_time, title, assigned_to } |
| S-02 | Schicht bearbeiten | shift_updated | before: { alle alten Werte }, after: { alle neuen Werte } |
| S-03 | Schicht loeschen | shift_deleted | before: { kompletter Schichtdatensatz inkl. Zuweisungen } |
| S-04 | Schichtzuweisung aendern | shift_assignment_changed | before: { assigned_to }, after: { assigned_to }, shift_info: { date, type } |

##### Kategorie: Abwesenheitsverwaltung

| ID | Aktion | action_type | Zu erfassende Daten in `changes` |
|---|---|---|---|
| A-01 | Abwesenheit genehmigen | absence_approved | before: { status }, after: { status }, context: { type, start_date, end_date, days, planned_hours } |
| A-02 | Abwesenheit ablehnen | absence_rejected | before: { status }, after: { status }, context: { type, start_date, end_date }, reason (Pflichtfeld!) |
| A-03 | Abwesenheit stornieren | absence_cancelled | before: { status }, after: { status: 'storniert' }, context: { type, start_date, end_date, days } |
| A-04 | Krankmeldung erfassen | sick_report_created | after: { start_date, end_date, planned_hours, affected_shifts[], shifts_marked_urgent[] } |

##### Kategorie: Mitarbeiterverwaltung

| ID | Aktion | action_type | Zu erfassende Daten in `changes` |
|---|---|---|---|
| M-01 | Mitarbeiter erstellen/einladen | employee_created | after: { email, full_name, weekly_hours, start_date, vacation_days, role, initial_balance } |
| M-02 | Mitarbeiterdaten bearbeiten | employee_updated | before: { alle alten Werte }, after: { alle neuen Werte } (Diff!) |
| M-03 | Mitarbeiter deaktivieren | employee_deactivated | before: { is_active: true }, after: { is_active: false }, context: { employee_name, email } |
| M-04 | Mitarbeiter reaktivieren | employee_reactivated | before: { is_active: false }, after: { is_active: true }, context: { employee_name } |

##### Kategorie: Zeiterfassung & Stundenkonto

| ID | Aktion | action_type | Zu erfassende Daten in `changes` |
|---|---|---|---|
| Z-01 | Zeiteintrag genehmigen | time_entry_approved | before: { actual_start, actual_end, interruptions, calculated_hours, status }, after: { actual_start, actual_end, interruptions, calculated_hours, status: 'approved', admin_note } |
| Z-02 | Zeiteintrag bearbeiten (Admin) | time_entry_modified | before: { alle alten Werte }, after: { alle neuen Werte }, context: { shift_date, shift_type, employee_name } |
| Z-03 | Stundenkorrektur erstellen | balance_correction_created | after: { correction_hours, reason, effective_month, previous_total, target_total } |
| Z-04 | Stundenkorrektur loeschen | balance_correction_deleted | before: { correction_hours, reason, effective_month } |

##### Kategorie: Monatsberichte

| ID | Aktion | action_type | Zu erfassende Daten in `changes` |
|---|---|---|---|
| B-01 | Monatsbericht abschliessen | report_finalized | after: { status: 'genehmigt', year, month, data_hash, total_hours, entry_count } |
| B-02 | Monatsbericht wiedereroeffnen | report_reopened | before: { status, approved_at }, after: { status: 'abgelehnt' }, reason (Pflichtfeld!) |

##### Kategorie: Vertretungsmanagement

| ID | Aktion | action_type | Zu erfassende Daten in `changes` |
|---|---|---|---|
| V-01 | Vertretungsanfrage erstellen | coverage_request_created | after: { shift_id, shift_date, shift_type, reason } |
| V-02 | Vertretung manuell zuweisen | coverage_manually_assigned | after: { shift_id, assigned_to, method: 'manual' } |

#### FA-02: Vorher/Nachher-Vergleich (Before/After Diff)

Fuer alle Aenderungsaktionen (update) MUSS der vollstaendige Zustand **vor** und **nach** der Aenderung erfasst werden. Das Format:

```json
{
  "before": { "weekly_hours": 30, "role": "employee" },
  "after":  { "weekly_hours": 40, "role": "admin" }
}
```

**Implementierungshinweis:** Vor dem `supabase.update()` muss ein `supabase.select()` die alten Werte laden, BEVOR die Mutation ausgefuehrt wird.

#### FA-03: Pflichtfeld "Grund" bei ablehnenden/zuruecknehmenden Aktionen

Bei folgenden Aktionen MUSS der Admin einen Grund angeben, der im Audit-Log gespeichert wird:

- Abwesenheit ablehnen (A-02)
- Abwesenheit stornieren (A-03)
- Monatsbericht wiedereroeffnen (B-02)
- Stundenkorrektur loeschen (Z-04)

#### FA-04: Erweiterte Metadaten

Jeder Audit-Eintrag soll zusaetzlich zu `timestamp` und `userAgent` erfassen:

| Feld | Quelle | Pflicht |
|---|---|---|
| timestamp | automatisch (ISO 8601) | Ja |
| userAgent | navigator.userAgent | Ja |
| ip_address | Supabase Edge Function oder Request Header | Optional (DSGVO-konform) |
| session_id | Supabase Auth Session | Optional |
| app_version | import.meta.env.VITE_APP_VERSION oder package.json | Ja |

#### FA-05: Unveraenderbarkeit (Immutability)

- Die Tabelle `admin_actions` darf KEINE UPDATE- oder DELETE-Rechte haben (bereits umgesetzt via RLS)
- Es duerfen nur INSERT-Operationen moeglich sein
- Kein Admin darf eigene Audit-Eintraege loeschen oder aendern koennen
- **Neu:** Auch die RPC-Funktion `mark_shifts_urgent` sollte einen Audit-Eintrag erzeugen (serverseitig via Trigger oder in der RPC-Funktion selbst)

#### FA-06: Anzeige im AdminAuditLog

Die bestehende Anzeige-Komponente (`AdminAuditLog.jsx`) muss erweitert werden:

| Verbesserung | Beschreibung |
|---|---|
| Vorher/Nachher-Diff-Ansicht | Farbcodierte Darstellung: Rot = entfernt, Gruen = hinzugefuegt |
| Vollstaendige Aktionstypen | Alle neuen action_types muessen uebersetzt und farbcodiert werden |
| Mitarbeitername bei Schichten | Zugewiesener Mitarbeiter soll bei Schichtaktionen angezeigt werden |
| Abwesenheitsdetails | Typ, Zeitraum und Tage bei Abwesenheitsaktionen anzeigen |
| Grund-Anzeige | Bei Ablehnungen/Stornierungen den erfassten Grund anzeigen |
| Erweiterte Filter | Filter nach Ressourcentyp (Schicht/Abwesenheit/Mitarbeiter/Bericht) |
| Suche | Volltextsuche in Aktionen (nach Mitarbeitername, Aktionstyp, Datum) |
| Detailansicht | Klick auf Eintrag oeffnet Detailmodal mit allen JSONB-Daten formatiert |

#### FA-07: CSV/PDF-Export fuer Rechtsstreitigkeiten

- **CSV-Export** (bereits vorhanden): Muss alle neuen Felder enthalten
- **PDF-Export** (neu): Offizielles Dokument mit:
  - Firmenlogo/Header
  - Filterkriterien als Ueberschrift
  - Tabellarische Darstellung aller Eintraege
  - SHA-256 Hash der exportierten Daten zur Integritaetspruefung
  - Generierungsdatum und -uhrzeit
  - Seitenzahlen

---

## 3. Priorisierung

### Prioritaet 1 - Kritisch (sofort umsetzen)

| ID | Beschreibung | Aufwand |
|---|---|---|
| M-02 | Mitarbeiterdaten bearbeiten loggen (weekly_hours, role, start_date, vacation_days, initial_balance) | Klein |
| M-01 | Mitarbeiter erstellen/einladen loggen | Klein |
| S-02 | shift_updated: Alte Werte VOR dem Update laden und mitspeichern | Mittel |
| Z-04 | Stundenkorrektur loeschen loggen (derzeit spurlos!) | Klein |
| Z-01 | Zeiteintrag genehmigen/bearbeiten loggen | Klein |
| A-04 | Krankmeldung erfassen loggen (loescht Schichten, erstellt Abwesenheit) | Mittel |

### Prioritaet 2 - Hoch (zeitnah umsetzen)

| ID | Beschreibung | Aufwand |
|---|---|---|
| FA-02 | Vorher/Nachher-Diff fuer alle Update-Aktionen | Mittel |
| FA-03 | Pflichtfeld "Grund" bei Ablehnungen/Stornierungen | Mittel (UI-Aenderung) |
| A-01..03 | Abwesenheitsdetails (Typ, Zeitraum, Tage) in changes erfassen | Klein |
| FA-06 | Diff-Ansicht und Detailmodal in AdminAuditLog | Mittel |

### Prioritaet 3 - Mittel (naechste Iteration)

| ID | Beschreibung | Aufwand |
|---|---|---|
| S-04 | Schichtzuweisungsaenderungen loggen (toggleInterest Admin) | Mittel |
| S-05 | FLEX-Status Aenderungen loggen | Klein |
| S-06 | Schichttausch loggen (handleSwapRequest) | Mittel |
| V-01 | Vertretungsanfragen-Aufloesung loggen (Bulk-Operation!) | Mittel |
| R-01 | Monatsstatus aendern loggen (oeffnen/schliessen des Monats) | Klein |
| FA-04 | Erweiterte Metadaten (IP, Session, App-Version) | Klein |
| FA-06 | Suche und erweiterte Filter | Mittel |
| FA-07 | PDF-Export mit Integritaets-Hash | Gross |

### Prioritaet 4 - Nice-to-have

| ID | Beschreibung | Aufwand |
|---|---|---|
| - | Audit-Dashboard mit Statistiken (Aktionen pro Admin, pro Tag) | Mittel |
| - | E-Mail-Benachrichtigung bei kritischen Aktionen (Mitarbeiter deaktiviert, Rolle geaendert) | Gross |
| - | Datenbank-Trigger fuer serverseitige Auditierung (zusaetzliche Sicherheitsschicht) | Gross |
| - | Retention Policy (automatische Archivierung nach X Jahren) | Mittel |

---

## 4. Technische Umsetzungshinweise

### 4.1 logAdminAction erweitern

Die bestehende Funktion `logAdminAction()` in `adminAudit.js` ist bereits gut strukturiert. Folgende Anpassungen:

```javascript
// Neuer Helper: Alten Zustand laden vor Update
export async function fetchBeforeState(table, id, fields = '*') {
    const { data } = await supabase.from(table).select(fields).eq('id', id).single()
    return data
}

// Erweiterte Metadaten automatisch hinzufuegen
metadata.app_version = import.meta.env.VITE_APP_VERSION || 'unknown'
```

### 4.2 Pattern fuer Before/After bei Updates

```javascript
// VORHER (aktuell - nur neue Werte):
await supabase.from('shifts').update(updatePayload).eq('id', shiftId)
await logAdminAction('shift_updated', null, 'shift', shiftId, { changes: updatePayload })

// NACHHER (korrekt - alte UND neue Werte):
const before = await fetchBeforeState('shifts', shiftId)
await supabase.from('shifts').update(updatePayload).eq('id', shiftId)
await logAdminAction('shift_updated', before.assigned_to, 'shift', shiftId, {
    before: { start_time: before.start_time, end_time: before.end_time, type: before.type, title: before.title },
    after: updatePayload
})
```

### 4.3 Standardisierung der action_types

Alle action_types sollen dem Schema `{ressource}_{verb}` folgen:

- shift_created, shift_updated, shift_deleted
- absence_approved, absence_rejected, absence_cancelled
- employee_created, employee_updated, employee_deactivated, employee_reactivated
- time_entry_approved, time_entry_modified
- balance_correction_created, balance_correction_deleted
- report_finalized, report_reopened
- sick_report_created
- coverage_request_created, coverage_manually_assigned

**Hinweis:** Die bisherigen deutschen action_types (absence_genehmigt, absence_abgelehnt) sollten in der Anzeige weiterhin unterstuetzt werden (Rueckwaertskompatibilitaet), aber neue Eintraege sollen die englischen Bezeichnungen verwenden.

---

## 5. Zusammenfassung der Luecken

### Komplett fehlende Audit-Eintraege (12 Aktionen):

| # | Aktion | Datei | Funktion | Risiko |
|---|---|---|---|---|
| 1 | Mitarbeiter einladen/erstellen | AdminEmployees.jsx | handleInvite | Kritisch |
| 2 | Mitarbeiterdaten bearbeiten | AdminEmployees.jsx | handleUpdateUser | Kritisch |
| 3 | Krankmeldung erfassen | RosterFeed.jsx | handleSickReport | Hoch |
| 4 | Stundenkorrektur loeschen | AdminTimeTracking.jsx | handleDeleteCorrection | Kritisch |
| 5 | Zeiteintrag genehmigen/bearbeiten | AdminTimeTracking.jsx | handleApproveEntry | Kritisch |
| 6 | Schichtzuweisung aendern (Admin fuer User) | RosterFeed.jsx | toggleInterest | Hoch |
| 7 | FLEX-Status aendern | RosterFeed.jsx | toggleFlex | Mittel |
| 8 | Vertretungsanfragen aufloesung | RosterFeed.jsx | resolveAllCoverageRequests | Hoch |
| 9 | Monatsstatus aendern (oeffnen/schliessen) | RosterFeed.jsx | updateMonthSettings | Mittel |
| 10 | Schichttausch durchfuehren | RosterFeed.jsx | handleSwapRequest | Hoch |
| 11 | Mitarbeiterdaten bearbeiten (EmployeeManager) | EmployeeManager.jsx | saveEdit | Kritisch |
| 12 | Abwesenheit im Kalender erstellen (Admin) | AbsencePlanner.jsx | diverse | Mittel |

### Unvollstaendige Audit-Eintraege (5 Aktionen):

1. **shift_updated** - Kein Vorher-Zustand, kein target_user_id
2. **absence_genehmigt/abgelehnt** - Kein Abwesenheitstyp, kein Zeitraum, keine Tage
3. **absence_storniert** - Kein Abwesenheitstyp, kein Zeitraum
4. **deactivate_user** - Kein Mitarbeitername, keine E-Mail
5. **reject_report** - Kein Ablehnungsgrund

### Vollstaendige Uebersicht aller 24 Admin-Aktionen

| # | Aktion | Datei | Tabelle | Geloggt? | Before/After? |
|---|---|---|---|---|---|
| 1 | Mitarbeiter erstellen | AdminEmployees.jsx | auth.users, profiles | NEIN | - |
| 2 | Mitarbeiterdaten bearbeiten | AdminEmployees.jsx | profiles | NEIN | - |
| 3 | Mitarbeiter deaktivieren | AdminEmployees.jsx | profiles | JA | JA |
| 4 | Mitarbeiter reaktivieren | AdminEmployees.jsx | profiles | JA | JA |
| 5 | Abwesenheit genehmigen | AdminAbsences.jsx | absences | JA | Teilweise |
| 6 | Abwesenheit ablehnen | AdminAbsences.jsx | absences | JA | Teilweise |
| 7 | Abwesenheit stornieren | AdminAbsences.jsx | absences | JA | Teilweise |
| 8 | Zeiteintrag bearbeiten | AdminTimeTracking.jsx | time_entries | NEIN | - |
| 9 | Stundenkorrektur erstellen | AdminTimeTracking.jsx | balance_corrections | JA | JA |
| 10 | Stundenkorrektur loeschen | AdminTimeTracking.jsx | balance_corrections | NEIN | - |
| 11 | Monatsbericht abschliessen | AdminTimeTracking.jsx | monthly_reports | JA | JA |
| 12 | Monatsbericht wiedereroeffnen | AdminTimeTracking.jsx | monthly_reports | JA | Teilweise |
| 13 | Krankmeldung erfassen | RosterFeed.jsx | absences, shift_interests | NEIN | - |
| 14 | Schicht erstellen | RosterFeed.jsx | shifts | JA | JA |
| 15 | Schicht bearbeiten | RosterFeed.jsx | shifts | JA | NUR After! |
| 16 | Schicht loeschen | RosterFeed.jsx | shifts | JA | JA |
| 17 | Schichtzuweisung aendern | RosterFeed.jsx | shift_interests | NEIN | - |
| 18 | FLEX-Status aendern | RosterFeed.jsx | shift_interests | NEIN | - |
| 19 | Vertretungs-Abstimmung | RosterFeed.jsx | coverage_votes | NEIN | - |
| 20 | Vertretung aufloesen (Bulk) | RosterFeed.jsx | shifts, shift_interests | NEIN | - |
| 21 | Monatsstatus aendern | RosterFeed.jsx | roster_months | NEIN | - |
| 22 | Schichttausch | RosterFeed.jsx | shift_interests | NEIN | - |
| 23 | Abwesenheit (Kalender-Admin) | AbsencePlanner.jsx | absences | JA | Teilweise |
| 24 | Mitarbeiter bearbeiten (Manager) | EmployeeManager.jsx | profiles | NEIN | - |

**Ergebnis: 12 von 24 Aktionen (50%) werden NICHT geloggt. Von den 12 geloggten Aktionen haben 4 unvollstaendige Daten.**

### Fehlende Funktionalitaet in der Anzeige:

1. Kein Vorher/Nachher-Diff sichtbar (selbst wenn Daten vorhanden)
2. Keine Detailansicht per Klick
3. Kein PDF-Export
4. Keine Volltextsuche
5. Rohe JSON-Daten bei geloeschten Schichten statt formatierter Anzeige
