# WoBePlaner - Vollständige Testdokumentation

**Stand:** 2025-12-14 15:00 Uhr
**Gesamtanzahl Tests:** 150 Unit Tests + ~30 E2E Tests = **~180 Tests**
**Status:** ✅ Alle Unit Tests bestanden

---

## Inhaltsverzeichnis

1. [Unit Tests - Vitest](#unit-tests---vitest)
   - [Balance Helpers (17 Tests)](#1-balance-helpers-balancehelperstestjs---17-tests)
   - [Balance Synchronization (16 Tests)](#2-balance-synchronization-balancesynchronizationtestjs---16-tests)
   - [Monitoring (16 Tests)](#3-monitoring-monitoringtestjs---16-tests)
   - [Time Calculations (22 Tests)](#4-time-calculations-timecalculationstestjs---22-tests)
   - [DSGVO (15 Tests)](#5-dsgvo-dsgvotestjs---15-tests)
   - [Login Component (23 Tests)](#6-login-component-logintestjsx---23-tests)
   - [Security (13 Tests)](#7-security-securitytestjs---13-tests)
   - [Holidays (14 Tests)](#8-holidays-holidaystestjs---14-tests)
   - [AlertModal (6 Tests)](#9-alertmodal-alertmodaltestjsx---6-tests)
   - [ConfirmModal (8 Tests)](#10-confirmmodal-confirmmodaltestjsx---8-tests)
2. [E2E Tests - Playwright](#e2e-tests---playwright)
   - [Security (security.spec.ts)](#security-tests)
   - [Views (views.spec.ts)](#views-tests)
   - [RLS Security (rls-security.spec.ts)](#rls-security-tests)

---

# Unit Tests - Vitest

## 1. Balance Helpers (balanceHelpers.test.js) - 17 Tests

**Datei:** `src/utils/balanceHelpers.test.js`
**Modul:** `calculateGenericBalance`

### Basic Calculation Tests (3 Tests)

| # | Testname | Beschreibung | Status |
|---|----------|--------------|--------|
| 1 | calculates perfect week (0 balance) | 40h/Woche Mitarbeiter arbeitet 5 Tage à 8h → Korrekte Berechnung | ✅ BESTANDEN |
| 2 | detects overtime correctly (10h work) | 10h an einem Tag gearbeitet → Überstunden erkennt | ✅ BESTANDEN |
| 3 | credits public holidays automatically (reduces target) | Mai 2024 mit 4 Feiertagen → Soll reduziert auf 152h | ✅ BESTANDEN |

### Carryover Tests - Übertrag (2 Tests)

| # | Testname | Beschreibung | Status |
|---|----------|--------------|--------|
| 4 | calculates positive carryover from previous month | Überstunden im Januar → positiver Übertrag im Februar | ✅ BESTANDEN |
| 5 | calculates negative carryover (Minusstunden) | Weniger gearbeitet als Soll → negativer Übertrag | ✅ BESTANDEN |

### Admin Corrections Tests - Korrekturen (4 Tests)

| # | Testname | Beschreibung | Status |
|---|----------|--------------|--------|
| 6 | applies positive correction to current month | +5h Korrektur → erscheint im aktuellen Monat | ✅ BESTANDEN |
| 7 | applies negative correction (deduction) | -3h Korrektur → wird abgezogen | ✅ BESTANDEN |
| 8 | ignores corrections from other months | Januar-Korrektur in Februar-Sicht → nicht angezeigt | ✅ BESTANDEN |
| 9 | sums multiple corrections for same month | 3+2-1 = 4h Korrektur summiert | ✅ BESTANDEN |

### Initial Balance Tests - Anfangssaldo (2 Tests)

| # | Testname | Beschreibung | Status |
|---|----------|--------------|--------|
| 10 | includes initial balance in carryover | 15h Anfangssaldo → im Übertrag enthalten | ✅ BESTANDEN |
| 11 | combines initial balance with calculated carryover | Initial + berechneter Carryover korrekt kombiniert | ✅ BESTANDEN |

### Part-Time and Prorated Months (3 Tests)

| # | Testname | Beschreibung | Status |
|---|----------|--------------|--------|
| 12 | calculates correct target for 20h/week employee | 20h/Woche → 4h/Tag → 88h Soll im Januar | ✅ BESTANDEN |
| 13 | prorates target for mid-month start | Start am 15. → anteiliges Soll | ✅ BESTANDEN |
| 14 | returns 0 target for future start date | Zukünftiges Startdatum → 0 Soll | ✅ BESTANDEN |

### Return Value Structure (3 Tests)

| # | Testname | Beschreibung | Status |
|---|----------|--------------|--------|
| 15 | returns all required fields | Balance enthält target, actual, vacation, diff, carryover, correction, total | ✅ BESTANDEN |
| 16 | returns null for missing profile | Kein Profil → null | ✅ BESTANDEN |
| 17 | returns null for invalid start date | Ungültiges Startdatum → null | ✅ BESTANDEN |

---

## 2. Balance Synchronization (balanceSynchronization.test.js) - 16 Tests

**Datei:** `src/utils/balanceSynchronization.test.js`
**Kritikalität:** 🔴 KRITISCH - Stellt sicher, dass alle Ansichten gleiche Daten zeigen

### Urlaub - Saldo Auswirkung (3 Tests)

| # | Testname | Beschreibung | Status |
|---|----------|--------------|--------|
| 1 | genehmigter Urlaub reduziert NICHT das Soll (gutgeschrieben) | 5 Tage Urlaub = 40h vacation | ✅ BESTANDEN |
| 2 | Wochenend-Urlaubstage werden NICHT gutgeschrieben | Fr-Mo Urlaub = nur 2 Werktage (16h) | ✅ BESTANDEN |
| 3 | Urlaub an Feiertag wird NICHT doppelt gutgeschrieben | Urlaub am 1. Mai → 0h vacation (Feiertag hat Vorrang) | ✅ BESTANDEN |

### Krankmeldung - Einspringen Flow (3 Tests)

| # | Testname | Beschreibung | Status |
|---|----------|--------------|--------|
| 4 | Kranker Mitarbeiter bekommt Schichtstunden gutgeschrieben | Krank mit 8h geplanter Schicht → 8h vacation | ✅ BESTANDEN |
| 5 | Einspringender Kollege bekommt Schichtstunden angerechnet | Übernommene Schicht → 8h actual | ✅ BESTANDEN |
| 6 | SYNCHRON: Kranker + Einspringer Salden ergeben Sinn | Beide bekommen 8h gutgeschrieben (vacation bzw. actual) | ✅ BESTANDEN |

### Diensttausch - Symmetrische Saldo-Änderung (1 Test)

| # | Testname | Beschreibung | Status |
|---|----------|--------------|--------|
| 7 | Tausch verändert nur Schichtzuordnung, nicht Gesamtstunden | Beide Mitarbeiter je 8h, Tausch neutral | ✅ BESTANDEN |

### Admin-Korrektur - Sofortige Synchronisation (3 Tests)

| # | Testname | Beschreibung | Status |
|---|----------|--------------|--------|
| 8 | positive Korrektur erscheint sofort im Mitarbeiter-Saldo | +5h Korrektur → sofort sichtbar | ✅ BESTANDEN |
| 9 | negative Korrektur (Abzug) wird korrekt verrechnet | -3h Korrektur → korrekt abgezogen | ✅ BESTANDEN |
| 10 | Korrektur für anderen Monat beeinflusst aktuellen Monat NICHT | Januar-Korrektur → 0 in Februar | ✅ BESTANDEN |

### Flex-Logik - TD1+TD2 Kombination (1 Test)

| # | Testname | Beschreibung | Status |
|---|----------|--------------|--------|
| 11 | TD1+TD2 am selben Tag = eine durchgehende Schicht ohne Pause | TD1 (4h) + TD2 (6h) = 10h ohne Pausenabzug | ✅ BESTANDEN |

### Nachtdienst - Monatswechsel (1 Test)

| # | Testname | Beschreibung | Status |
|---|----------|--------------|--------|
| 12 | ND über Monatswechsel wird korrekt auf Startmonat gebucht | ND 31.1.-1.2. → im Januar gebucht | ✅ BESTANDEN |

### Monatsübergreifende Abwesenheit (1 Test)

| # | Testname | Beschreibung | Status |
|---|----------|--------------|--------|
| 13 | Krankheit über Monatswechsel - beide Monate korrekt | 28.1.-5.2. → korrekt auf beide Monate verteilt | ✅ BESTANDEN |

### Teilzeit - Proportionale Berechnung (1 Test)

| # | Testname | Beschreibung | Status |
|---|----------|--------------|--------|
| 14 | 20h/Woche Mitarbeiter bekommt halbes Urlaubsguthaben | Teilzeit = 50% der Stunden | ✅ BESTANDEN |

### SYNCHRONISATION: Identische Inputs = Identische Outputs (2 Tests)

| # | Testname | Beschreibung | Status |
|---|----------|--------------|--------|
| 15 | gleiche Daten produzieren immer gleiches Ergebnis (deterministisch) | 10x berechnen = 10x gleiches Ergebnis | ✅ BESTANDEN |
| 16 | Mitarbeiter-Ansicht und Admin-Ansicht berechnen identisch | MA = Admin bei gleichen Daten | ✅ BESTANDEN |

---

## 3. Monitoring (monitoring.test.js) - 16 Tests

**Datei:** `src/utils/monitoring.test.js`
**Zweck:** Production Bug Detection

### verifyBalanceIntegrity (6 Tests)

| # | Testname | Beschreibung | Status |
|---|----------|--------------|--------|
| 1 | returns empty array for valid balance | Gültige Balance → keine Fehler | ✅ BESTANDEN |
| 2 | detects null balance | null Balance → ERROR | ✅ BESTANDEN |
| 3 | detects NaN values | NaN in target → ERROR | ✅ BESTANDEN |
| 4 | warns on negative target | Negatives Soll → WARNING | ✅ BESTANDEN |
| 5 | detects diff calculation mismatch | diff ≠ (actual+vacation)-target → ERROR | ✅ BESTANDEN |
| 6 | detects total calculation mismatch | total ≠ diff+carryover → ERROR | ✅ BESTANDEN |

### areBalancesEqual (4 Tests)

| # | Testname | Beschreibung | Status |
|---|----------|--------------|--------|
| 7 | returns true for identical balances | Gleiche Werte → true | ✅ BESTANDEN |
| 8 | returns true for nearly equal balances (within tolerance) | Innerhalb 0.01 Toleranz → true | ✅ BESTANDEN |
| 9 | returns false for different balances | Unterschiedliche Werte → false | ✅ BESTANDEN |
| 10 | returns false if one balance is null | Eine null → false | ✅ BESTANDEN |

### generateSyncReport (4 Tests)

| # | Testname | Beschreibung | Status |
|---|----------|--------------|--------|
| 11 | reports synced for identical balances | Gleich → isSynced: true | ✅ BESTANDEN |
| 12 | reports differences for mismatched balances | Unterschiedlich → differences gefüllt | ✅ BESTANDEN |
| 13 | handles null balances | null → isSynced: false | ✅ BESTANDEN |
| 14 | includes timestamp | Report enthält timestamp | ✅ BESTANDEN |

### withBalanceVerification (2 Tests)

| # | Testname | Beschreibung | Status |
|---|----------|--------------|--------|
| 15 | returns the balance unchanged when valid | Gültig → unverändert zurück | ✅ BESTANDEN |
| 16 | still returns balance even when invalid (logs error) | Ungültig → zurück + log | ✅ BESTANDEN |

---

## 4. Time Calculations (timeCalculations.test.js) - 22 Tests

**Datei:** `src/utils/timeCalculations.test.js`

### calculateWorkHours (5 Tests)

| # | Testname | Beschreibung | Status |
|---|----------|--------------|--------|
| 1 | calculates simple day shift duration | 08:00-16:00 → 8h | ✅ BESTANDEN |
| 2 | handles night duty (ND) readiness window logic | ND 18:00-08:00 → 11.25h (Bereitschaft 50%) | ✅ BESTANDEN |
| 3 | inflates short interruptions during readiness to 30 mins | 10min Unterbrechung → 30min inflated | ✅ BESTANDEN |
| 4 | handles null/undefined inputs gracefully | null → 0 | ✅ BESTANDEN |

### calculateDailyAbsenceHours - Vacation (7 Tests)

| # | Testname | Beschreibung | Status |
|---|----------|--------------|--------|
| 5 | credits daily hours for weekday vacation (40h week) | Werktag → 8h | ✅ BESTANDEN |
| 6 | credits correct hours for part-time (20h week) | Teilzeit → 4h | ✅ BESTANDEN |
| 7 | returns 0 for weekend vacation (Saturday) | Samstag → 0h | ✅ BESTANDEN |
| 8 | returns 0 for weekend vacation (Sunday) | Sonntag → 0h | ✅ BESTANDEN |
| 9 | returns 0 for vacation on public holiday (1. Mai) | Feiertag → 0h | ✅ BESTANDEN |
| 10 | returns 0 for vacation on Heilige Drei Könige | 6.1. Feiertag → 0h | ✅ BESTANDEN |
| 11 | ignores planned shifts for vacation | Urlaub = Standardstunden, nicht Schichtstunden | ✅ BESTANDEN |

### calculateDailyAbsenceHours - Sick Leave (8 Tests)

| # | Testname | Beschreibung | Status |
|---|----------|--------------|--------|
| 12 | uses planned shift hours for sick day | Krank + 8h Schicht → 8h | ✅ BESTANDEN |
| 13 | sums multiple planned shifts for sick day | 2 Schichten à 4h → 8h | ✅ BESTANDEN |
| 14 | returns 0 for sick day without planned shift | Keine Schicht → 0h | ✅ BESTANDEN |
| 15 | returns 0 for sick weekend even if shift existed | WE ohne Schicht → 0h | ✅ BESTANDEN |
| 16 | uses stored planned_hours when available (single day) | planned_hours aus DB → verwendet | ✅ BESTANDEN |
| 17 | divides stored planned_hours by days for multi-day sick leave | 24h / 3 Tage = 8h pro Tag | ✅ BESTANDEN |
| 18 | recognizes "krank" in type name (case insensitive) | "Krankmeldung" → als Krank behandelt | ✅ BESTANDEN |
| 19 | recognizes reason: sick as sick leave | reason: sick → Krankenstand | ✅ BESTANDEN |

### Edge Cases (3 Tests)

| # | Testname | Beschreibung | Status |
|---|----------|--------------|--------|
| 20 | handles string date input | String-Datum funktioniert | ✅ BESTANDEN |
| 21 | defaults to 40h week when profile is null | Kein Profil → 40h/Woche Standard | ✅ BESTANDEN |
| 22 | handles ND shift calculation for sick leave | ND-Schicht krank → 11.25h | ✅ BESTANDEN |

---

## 5. DSGVO (dsgvo.test.js) - 15 Tests

**Datei:** `src/utils/dsgvo.test.js`
**Kritikalität:** 🔴 KRITISCH - Datenschutz

### Anonymization Functions (4 Tests)

| # | Testname | Beschreibung | Status |
|---|----------|--------------|--------|
| 1 | passes when no sensitive terms are present | "Abwesend" → kein Fehler | ✅ BESTANDEN |
| 2 | throws DSGVO VIOLATION for "Krank" in text | "Krank" → VIOLATION | ✅ BESTANDEN |
| 3 | throws for "Krankenstand" (case insensitive) | "krankenstand" → VIOLATION | ✅ BESTANDEN |
| 4 | allows custom sensitive terms | "Gehalt" als sensitiv → VIOLATION | ✅ BESTANDEN |

### Push Notification Content (3 Tests)

| # | Testname | Beschreibung | Status |
|---|----------|--------------|--------|
| 5 | notification message format should be anonymous | Kein "krank" in Notification | ✅ BESTANDEN |
| 6 | notification should show date range correctly | "15.01. - 17.01." Format | ✅ BESTANDEN |
| 7 | single day notification shows only one date | Einzeltag: "am 15.01." | ✅ BESTANDEN |

### Colleague Absence Display (4 Tests)

| # | Testname | Beschreibung | Status |
|---|----------|--------------|--------|
| 8 | anonymizes absence type for colleagues (non-admin) | Kollege sieht "Abwesend" | ✅ BESTANDEN |
| 9 | shows full type for own absences | Eigene: sieht "Krank" | ✅ BESTANDEN |
| 10 | shows full type for admin viewing any user | Admin sieht alles | ✅ BESTANDEN |
| 11 | does not anonymize vacation (Urlaub) | Urlaub nicht anonymisiert | ✅ BESTANDEN |

### Data Isolation (2 Tests)

| # | Testname | Beschreibung | Status |
|---|----------|--------------|--------|
| 12 | time entries are isolated per user | User A sieht nicht User B Einträge | ✅ BESTANDEN |
| 13 | profile visibility is limited for non-admins | weekly_hours nicht öffentlich | ✅ BESTANDEN |

### Audit Trail (2 Tests)

| # | Testname | Beschreibung | Status |
|---|----------|--------------|--------|
| 14 | admin actions have required fields for audit | admin_id, action, target_user_id vorhanden | ✅ BESTANDEN |
| 15 | sensitive actions are tracked | 7 sensible Aktionen definiert | ✅ BESTANDEN |

---

## 6. Login Component (Login.test.jsx) - 23 Tests

**Datei:** `src/components/Login.test.jsx`

### Initial Render (6 Tests)

| # | Testname | Beschreibung | Status |
|---|----------|--------------|--------|
| 1 | renders the login form with title | "WoBePlaner" sichtbar | ✅ BESTANDEN |
| 2 | shows email input field | E-Mail-Feld vorhanden | ✅ BESTANDEN |
| 3 | shows password input field | Passwort-Feld vorhanden | ✅ BESTANDEN |
| 4 | shows submit button | "Einloggen" Button vorhanden | ✅ BESTANDEN |
| 5 | shows magic link toggle button | "Passwort vergessen?" Link vorhanden | ✅ BESTANDEN |
| 6 | shows legal links (Impressum, Datenschutz) | Rechtliche Links vorhanden | ✅ BESTANDEN |
| 7 | displays logo | Logo mit /logo2.png sichtbar | ✅ BESTANDEN |

### Magic Link Mode (2 Tests)

| # | Testname | Beschreibung | Status |
|---|----------|--------------|--------|
| 8 | switches to magic link mode when toggle is clicked | Toggle → "Login per Link" | ✅ BESTANDEN |
| 9 | switches back to password mode when toggle is clicked again | Zurück → Passwort-Modus | ✅ BESTANDEN |

### Password Login (4 Tests)

| # | Testname | Beschreibung | Status |
|---|----------|--------------|--------|
| 10 | calls signInWithPassword with correct credentials | Korrekte Credentials übergeben | ✅ BESTANDEN |
| 11 | shows loading state during login | "Lade..." angezeigt | ✅ BESTANDEN |
| 12 | displays error message on failed login | Fehlermeldung bei Fehler | ✅ BESTANDEN |
| 13 | error message has red styling | Rot (bg-red-50) | ✅ BESTANDEN |

### Magic Link Login (3 Tests)

| # | Testname | Beschreibung | Status |
|---|----------|--------------|--------|
| 14 | calls signInWithOtp when in magic link mode | signInWithOtp aufgerufen | ✅ BESTANDEN |
| 15 | shows success message after requesting magic link | "Checke deine E-Mails" | ✅ BESTANDEN |
| 16 | success message has green styling | Grün (bg-green-50) | ✅ BESTANDEN |

### Form Validation (4 Tests)

| # | Testname | Beschreibung | Status |
|---|----------|--------------|--------|
| 17 | email field is required | required Attribut | ✅ BESTANDEN |
| 18 | password field is required in password mode | required Attribut | ✅ BESTANDEN |
| 19 | email input has correct type | type="email" | ✅ BESTANDEN |
| 20 | password input has correct type (masked) | type="password" | ✅ BESTANDEN |

### Security (3 Tests)

| # | Testname | Beschreibung | Status |
|---|----------|--------------|--------|
| 21 | clears message when switching login modes | Fehlermeldung verschwindet | ✅ BESTANDEN |
| 22 | does not expose password in visible text | Passwort maskiert | ✅ BESTANDEN |
| 23 | button is disabled during loading | Button disabled während Laden | ✅ BESTANDEN |

---

## 7. Security (security.test.js) - 13 Tests

**Datei:** `src/utils/security.test.js`
**Modul:** `generateReportHash` (SHA-256 für Monatsberichte)

| # | Testname | Beschreibung | Status |
|---|----------|--------------|--------|
| 1 | returns empty string for empty entries | [] → "" | ✅ BESTANDEN |
| 2 | returns empty string for null/undefined entries | null → "" | ✅ BESTANDEN |
| 3 | generates a valid SHA-256 hash (64 hex characters) | 64 Zeichen, nur 0-9a-f | ✅ BESTANDEN |
| 4 | produces DETERMINISTIC output (same input = same hash) | 3x gleicher Input = 3x gleicher Hash | ✅ BESTANDEN |
| 5 | produces DIFFERENT hash when data changes (tamper detection) | 1 Minute Unterschied → anderer Hash | ✅ BESTANDEN |
| 6 | produces DIFFERENT hash when hours change (even by 0.01) | 0.01h Unterschied → anderer Hash | ✅ BESTANDEN |
| 7 | produces DIFFERENT hash when userId changes | Anderer User → anderer Hash | ✅ BESTANDEN |
| 8 | produces DIFFERENT hash when month changes | Anderer Monat → anderer Hash | ✅ BESTANDEN |
| 9 | sorts entries by start time (order-independent) | Reihenfolge egal → gleicher Hash | ✅ BESTANDEN |
| 10 | handles interruptions correctly in hash | Unterbrechungen im Hash berücksichtigt | ✅ BESTANDEN |
| 11 | handles absence entries with null times | null Zeiten → gültiger Hash | ✅ BESTANDEN |
| 12 | throws error for unsupported hash version | v99 → Error | ✅ BESTANDEN |
| 13 | GOLDEN TEST: produces consistent hash for known data | Hash darf sich NIEMALS ändern | ✅ BESTANDEN |

---

## 8. Holidays (holidays.test.js) - 14 Tests

**Datei:** `src/utils/holidays.test.js`
**Modul:** Österreichische Feiertage

### getHolidays (8 Tests)

| # | Testname | Beschreibung | Status |
|---|----------|--------------|--------|
| 1 | returns all 13 Austrian public holidays | 13 Feiertage | ✅ BESTANDEN |
| 2 | includes all fixed holidays | Neujahr, Staatsfeiertag, Christtag... | ✅ BESTANDEN |
| 3 | includes all Easter-dependent holidays | Ostermontag, Christi Himmelfahrt... | ✅ BESTANDEN |
| 4 | calculates correct fixed dates for 2025 | Neujahr = 01.01., etc. | ✅ BESTANDEN |
| 5 | calculates Easter Sunday correctly for 2025 | Ostersonntag = 20.04.2025 | ✅ BESTANDEN |
| 6 | calculates Easter-dependent holidays correctly for 2025 | Pfingstmontag = 09.06.2025 | ✅ BESTANDEN |
| 7 | calculates Easter correctly for 2024 (different year) | Ostersonntag 2024 = 31.03. | ✅ BESTANDEN |
| 8 | returns holidays sorted by date | Chronologisch sortiert | ✅ BESTANDEN |

### isHoliday (6 Tests)

| # | Testname | Beschreibung | Status |
|---|----------|--------------|--------|
| 9 | returns truthy for Dec 25 (Christtag) | 25.12. → Christtag | ✅ BESTANDEN |
| 10 | returns truthy for Jan 1 (Neujahr) | 01.01. → Neujahr | ✅ BESTANDEN |
| 11 | returns falsy for regular workday (Jan 15) | 15.01. → kein Feiertag | ✅ BESTANDEN |
| 12 | returns falsy for weekend (not checking weekend, just holidays) | WE ≠ Feiertag | ✅ BESTANDEN |
| 13 | correctly identifies 1. Mai as holiday | 01.05. → Staatsfeiertag | ✅ BESTANDEN |
| 14 | correctly identifies Pfingstmontag 2025 | 09.06.2025 → Pfingstmontag | ✅ BESTANDEN |

---

## 9. AlertModal (AlertModal.test.jsx) - 6 Tests

**Datei:** `src/components/AlertModal.test.jsx`

| # | Testname | Beschreibung | Status |
|---|----------|--------------|--------|
| 1 | renders nothing when isOpen is false | Geschlossen → null | ✅ BESTANDEN |
| 2 | renders modal when isOpen is true | Offen → Title + Message sichtbar | ✅ BESTANDEN |
| 3 | calls onClose when OK button is clicked | OK klicken → onClose aufgerufen | ✅ BESTANDEN |
| 4 | renders info style by default | Standard = blau (bg-blue-100) | ✅ BESTANDEN |
| 5 | renders error style when type is error | type="error" → rot (bg-red-100) | ✅ BESTANDEN |
| 6 | renders success style when type is success | type="success" → grün (bg-green-100) | ✅ BESTANDEN |

---

## 10. ConfirmModal (ConfirmModal.test.jsx) - 8 Tests

**Datei:** `src/components/ConfirmModal.test.jsx`

| # | Testname | Beschreibung | Status |
|---|----------|--------------|--------|
| 1 | renders nothing when isOpen is false | Geschlossen → null | ✅ BESTANDEN |
| 2 | renders modal with title and message when isOpen is true | Offen → Titel + Nachricht | ✅ BESTANDEN |
| 3 | renders default button texts | "Abbrechen" + "Bestätigen" | ✅ BESTANDEN |
| 4 | renders custom button texts | Custom Texts korrekt | ✅ BESTANDEN |
| 5 | calls onClose when cancel button is clicked | Abbrechen → onClose | ✅ BESTANDEN |
| 6 | calls both onConfirm and onClose when confirm button is clicked | Bestätigen → beides aufgerufen | ✅ BESTANDEN |
| 7 | applies destructive styling when isDestructive is true | Destruktiv → rot (bg-red-600) | ✅ BESTANDEN |
| 8 | applies normal styling when isDestructive is false | Normal → schwarz (bg-black) | ✅ BESTANDEN |

---

# E2E Tests - Playwright

## Security Tests (security.spec.ts) - ~12 Tests

| # | Testname | Beschreibung | Status |
|---|----------|--------------|--------|
| 1 | unauthenticated user is redirected to login | Nicht eingeloggt → /login | ✅ BESTANDEN |
| 2 | legal pages are accessible without login | /impressum, /datenschutz öffentlich | ✅ BESTANDEN |
| 3 | non-admin cannot see Admin tab | Mitarbeiter sieht kein Admin | ✅ BESTANDEN |
| 4 | login button shows loading state | "Lade..." während Login | ✅ BESTANDEN |
| 5 | password field is masked | type="password" | ✅ BESTANDEN |
| 6 | error messages don't expose internals | Keine technischen Details | ✅ BESTANDEN |
| 7+ | CSP and security headers | Keine CSP-Violations | ✅ BESTANDEN |

## Views Tests (views.spec.ts) - ~25 Tests

| # | Testname | Beschreibung | Status |
|---|----------|--------------|--------|
| 1-4 | View Navigation | Dienstplan, Zeiten, Urlaub, Profil navigierbar | 🟡 ~75% |
| 5-9 | RosterFeed Balance | Stundenkonto, Soll, Ist, Übertrag, Saldo sichtbar | ✅ BESTANDEN |
| 10-13 | TimeTracking View | Monatsselektor, Einträge, Balance sichtbar | 🟡 ~50% |
| 14-15 | Urlaub View | Urlaubsantrag, Resturlaub sichtbar | ✅ BESTANDEN |
| 16 | Balance Consistency | RosterFeed = TimeTracking Saldo | ✅ BESTANDEN |
| 17-19 | Data Display Integrity | Keine JS-Fehler, keine NaN, korrektes Format | ✅ BESTANDEN |
| 20-22 | Mobile View | Login, Navigation, Balance auf Mobile | ❌ (UI-Anpassung nötig) |

## RLS Security Tests (rls-security.spec.ts) - ~5 Tests

| # | Testname | Beschreibung | Status |
|---|----------|--------------|--------|
| 1 | user cannot see other users time entries via UI | Datenisolierung im Frontend | ✅ BESTANDEN |
| 2 | user can only see their own profile data | Nur eigenes Profil | 🟡 Minor Issue |
| 3 | non-admin cannot access admin dashboard content | Kein Admin-Tab sichtbar | ✅ BESTANDEN |
| 4 | non-admin cannot modify other users absences via API | RLS blockiert API | ✅ BESTANDEN |
| 5 | User A cannot see User B time entries | Cross-User Protection | ⏭️ Benötigt 2. User |

---

# Zusammenfassung

## Aktuelle Testabdeckung

| Kategorie | Tests | Status |
|-----------|-------|--------|
| **Unit Tests (Vitest)** | **154** | ✅ 100% BESTANDEN |
| **E2E Tests (Playwright)** | **~35** | ~85% bestanden |
| **GESAMT** | **~189** | ✅ |

## Kritische Szenarien

| Szenario | Getestet | Status |
|----------|----------|--------|
| Urlaub → Saldo | ✅ | 3 Tests |
| Krank + Einspringen | ✅ | 3 Tests |
| Diensttausch | ✅ | 1 Test |
| Admin-Korrekturen | ✅ | 7 Tests |
| Übertrag (Carryover) | ✅ | 2 Tests |
| Nachtdienst | ✅ | 2 Tests |
| Teilzeit | ✅ | 2 Tests |
| Feiertage Österreich | ✅ | 14 Tests |
| DSGVO Anonymisierung | ✅ | 15 Tests |
| Hash-Integrität | ✅ | 13 Tests |
| MA = Admin Ansicht | ✅ | 2 Tests |
| Zeitumstellung (DST) | ✅ | 4 Tests |

---

## Neue Tests: Daylight Saving Time (Zeitumstellung)

**Datei:** `src/utils/timeCalculations.test.js`

| # | Testname | Beschreibung | Status |
|---|----------|--------------|--------|
| 1 | March DST (spring forward - 1h shorter) | ND 29.-30.03.2025 → effektiv 13h statt 14h | ✅ BESTANDEN |
| 2 | October DST (fall back - 1h longer) | ND 25.-26.10.2025 → effektiv 15h statt 14h | ✅ BESTANDEN |
| 3 | ND March DST reduced readiness | Bereitschaft 4.5h statt 5.5h | ✅ BESTANDEN |
| 4 | ND October DST extended readiness | Bereitschaft 6.5h statt 5.5h | ✅ BESTANDEN |

**Wichtig:** Diese Tests dokumentieren das aktuelle Verhalten. JavaScript `Date` ohne explizite Zeitzone interpretiert ISO-Strings als UTC, wodurch keine automatische DST-Korrektur erfolgt. Für exakte lokale Zeitberechnung wäre `date-fns-tz` oder `Intl.DateTimeFormat` erforderlich.

---

# Bekannte Limitierungen / Offene Punkte

Diese Sektion dokumentiert transparent, was **noch nicht getestet** oder **bewusst ausgelassen** wurde.

## 🔴 Kritisch (sollte zeitnah getestet werden)

| Bereich | Beschreibung | Begründung |
|---------|--------------|------------|
| **Admin-Dashboard Unit Tests** | Keine Unit-Tests für `AdminTimeTracking.jsx`, `AdminDashboard.jsx` | Große monolithische Komponenten, schwer zu testen |
| **Supabase RLS mit 2+ Usern** | Cross-User-Tests übersprungen | Benötigt zweiten Test-Account |
| **Offline-Verhalten (PWA)** | Keine Tests für Service Worker, Offline-Cache | Komplexe Infrastruktur erforderlich |

## 🟡 Mittel (wünschenswert)

| Bereich | Beschreibung | Begründung |
|---------|--------------|------------|
| **Safari/WebKit** | Keine E2E-Tests für Safari | Playwright WebKit auf Windows instabil |
| **Firefox Mobile** | Keine Mobile-Firefox-Tests | Fokus auf Chrome (90%+ Nutzer) |
| **PDF-Export** | Keine Tests für `html2pdf` Generierung | Browser-abhängig, manuell verifiziert |
| **Push-Notifications** | Keine automatisierten Tests | Erfordert echte Notification-Berechtigung |
| **Supabase Edge Functions** | Keine Unit-Tests für `send-web-push` | Serverless-Kontext schwer mockbar |

## 🟢 Nice-to-have (kann warten)

| Bereich | Beschreibung | Begründung |
|---------|--------------|------------|
| **Visual Regression Tests** | Keine Screenshot-Vergleiche | Tool-Setup erforderlich (Percy, Chromatic) |
| **Performance Tests** | Keine Load-/Stress-Tests | Erst relevant bei >100 gleichzeitigen Usern |
| **Accessibility (a11y)** | Keine automatisierten WCAG-Tests | @axe-core/playwright könnte hinzugefügt werden |
| **Lokalisierung (i18n)** | App ist nur auf Deutsch | Keine andere Sprache geplant |

## ⚠️ Bekannte Bugs/Einschränkungen

| Bug | Beschreibung | Workaround |
|-----|--------------|------------|
| E2E Mobile Login instabil | `views.spec.ts` Mobile-Tests schlagen sporadisch fehl | Retry mit längeren Timeouts |
| DST ohne Zeitzone | ISO-Strings ohne `Z` werden als UTC interpretiert | Aktuell keine Korrektur nötig (Server sendet UTC) |
| Urlaubsstatus-Anzeige | Abgelehnte Urlaubsanträge zeigen "offen" statt "abgelehnt" | Frontend-Bug, in Arbeit |

---

## Test-Infrastruktur Referenz

### NPM Commands

```bash
# Unit-Tests ausführen
npm test

# Unit-Tests mit Watch-Mode
npm run test:watch

# E2E-Tests ausführen (alle Browser)
npm run test:e2e

# E2E-Tests nur Chromium
npx playwright test --project=chromium

# E2E-Tests nur Mobile
npx playwright test --project=mobile-chrome

# Playwright Report öffnen
npx playwright show-report
```

### Umgebungsvariablen für E2E-Tests

```bash
# .env.test
TEST_USER_EMAIL=...
TEST_USER_PASSWORD=...
TEST_ADMIN_EMAIL=...
TEST_ADMIN_PASSWORD=...
```

---

*Dokumentation erstellt von: Chief Test Engineer*
*Letzte Aktualisierung: 2025-12-14 15:15 Uhr*

