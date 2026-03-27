# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projekt

Interne Workforce-Management-App für ein Sozialdienstleistungsteam (11 MA, Innsbruck/Österreich). Kein öffentlicher Zugang, keine externen Nutzer. Deployment: Cloudflare Pages.

## Workflow

- **Branch-Strategie**: `main` = Production. Features/Fixes in eigenen Branches (`feature/...`, `fix/...`)
- **CI**: GitHub Actions prüft Lint, Build, Tests bei jedem PR (`.github/workflows/ci.yml`)
- **Deployment**: Automatisch via Cloudflare Pages Git-Integration bei Merge in `main`
- **Preview**: Jeder Branch/PR bekommt ein Preview-Deployment auf Cloudflare
- **Tracking**: GitHub Issues für Features und Bugs. PRs referenzieren Issues (`fixes #42`)
- **Issues automatisch**: Vor Arbeitsbeginn prüfen ob ein passendes Issue existiert — wenn nicht, eines erstellen. PRs immer mit `fixes #XX` verknüpfen. Bei neuen Bugs/Problemen die während der Arbeit auffallen, ebenfalls Issues erstellen. Ausnahme: Triviale Änderungen (Typos, Einzeiler) brauchen kein Issue.
- **Merge nur auf Anweisung**: Claude Code erstellt Branches, Issues und PRs selbstständig — aber nie eigenständig in `main` mergen. Der Merge-Button bleibt beim Menschen.
- **Commit-Messages**: Semantisches Format — `feat:`, `fix:`, `chore:`, `refactor:`, `test:`, `docs:`. Issue-Nummer anhängen wenn vorhanden. Beispiele: `fix: Fairness-Linie bricht auf Mobile (#51)`, `feat: Soli-Punkte auf 6-Monats-Fenster`, `chore: Dependabot Updates`
- **Squash Merge**: Repo ist auf Squash Merge konfiguriert — die PR-Titel-Message landet auf `main`, einzelne Commits werden zusammengefasst. PR-Titel daher immer semantisch formulieren.
- **Verfügbare MCPs**:
  - `mcp__github__*` — Issues, PRs, Branches direkt aus Claude (bevorzugt gegenüber `gh` CLI)
  - `mcp__sentry__*` — Fehler-Monitoring, Issues analysieren, Sentry-Projekte verwalten
  - `mcp__supabase__*` — Datenbank-Queries, Migrations, Edge Functions, Logs direkt aus Claude
  - `mcp__playwright__*` — Browser-Automatisierung für E2E-Tests und manuelle UI-Verifikation

## Commands

```bash
npm run dev          # Start dev server (http://localhost:5173)
npm run build        # Production build -> dist/
npm run lint         # ESLint
npm test             # Vitest unit tests (watch mode)
npm run test:e2e     # Playwright E2E tests (requires dev server)
npm run test:e2e:ui  # Playwright with UI
```

Run a single unit test file:
```bash
npx vitest run src/utils/timeCalculations.test.js
```

E2E tests load credentials from `.env.test` (not committed).

## Environment

Requires a `.env` file with:
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

## Architecture

**Single-Page App** (React 19 + Vite) with Supabase (PostgreSQL + Auth + Realtime) as BaaS. No custom backend — all business logic runs client-side.

### Navigation / Tab structure

`App.jsx` manages a single `activeTab` state (`roster` | `times` | `absences` | `profile` | `admin`). Heavy tabs are lazy-loaded. Navigation is rendered as a bottom bar on mobile (`BottomNav`) and a sidebar on desktop (`Sidebar`).

### Auth & roles

`AuthContext.jsx` wraps the app and exposes `{ user, role, isAdmin, passwordSet }`. Role comes from `profiles.role` in Supabase (`'admin'` or `'employee'`). New users go through `SetPassword` before accessing the app.

### Context providers (in order, outermost first)

`ErrorBoundary > ToastProvider > AuthProvider > ShiftTemplateProvider`

`ShiftTemplateContext` holds the shift templates (hardcoded for single-team / WoBe-Team). Multi-tenancy was paused Dec 2025 — templates are not loaded from DB.

### Key utility modules (`src/utils/`)

| File | Purpose |
|---|---|
| `timeCalculations.js` | Core work-hour calculation: handles standby windows, interruptions (inflated + merged), DST |
| `balanceHelpers.js` | Overtime/undertime balance: Soll vs. Ist, recursive carryover from employment start |
| `security.js` | SHA-256 hash for monthly report integrity verification (versioned: currently `v1`) |
| `pdfGenerator.js` / `timeReportPdfGenerator.js` / `vacationPdfGenerator.js` | PDF export via jsPDF |
| `rosterRules.js` | Roster validation/rules |
| `adminAudit.js` | Writes to `admin_actions` audit log |
| `holidays.js` | Austrian public holidays calculation |

### Custom hooks (`src/utils/use*.js`)

Data-fetching hooks for Supabase: `useShifts`, `useAbsences`, `useTimeEntries`, `useHolidays`, `useMonthStatus`.

### Admin section

`AdminDashboard.jsx` composes sub-panels from `src/components/admin/`: `AdminOverview`, `AdminEmployees`, `AdminAbsences`, `AdminSickLeaves`, `AdminVacationCalendar`, `AdminVacationStats`, `AdminAuditLog`.

Admin also gets `AdminTimeTracking` (instead of employee `TimeTracking`) on the times tab.

### PWA

Vite PWA plugin with `injectManifest` strategy. Custom service worker at `src/sw.js`. Uses `autoUpdate` + `clientsClaim` + `skipWaiting`.

### Realtime

Supabase Realtime channels are used in `App.jsx` for badge counts (absences, shifts, coverage_requests) and subscribe/unsubscribe on mount/unmount.

## Database key concepts

- `profiles.role`: `'admin'` | `'employee'` — drives all RLS policies
- `profiles.password_set`: `false` for new invited users, triggers `SetPassword` flow
- `monthly_reports`: locked summaries with SHA-256 `data_hash` — do not modify time entries for a locked month without unlocking
- `admin_actions`: append-only audit log — never delete rows

## Neuen Diensttyp hinzufügen — Checkliste

Es gibt zwei Kategorien: **regulär** (Slot-basiert, Einzelperson, wie TD1/ND/AST) und **spezial** (Karten-Layout, Multi-Teilnehmer, opt-in, wie FORTBILDUNG/SUPERVISION).

### Immer (beide Kategorien)

| # | Datei | Was |
|---|---|---|
| 1 | `src/contexts/ShiftTemplateContext.jsx` | Template in `SHIFT_TEMPLATES` Array |
| 2 | `src/utils/balanceHelpers.js` | `SHIFT_TYPE_KEYS` Array + ggf. `normalizeShiftType` Alias |
| 3 | `src/utils/shiftDefaults.js` | Standardzeiten (if-Block) |
| 4 | `src/components/ProfileStats.jsx` | `SHIFT_TYPE_LABELS` + `SHIFT_TYPE_COLORS` |
| 5 | `src/components/ProfileSickLeave.jsx` | `SHIFT_TYPE_SHORT` + `SHIFT_TAG_COLORS` |
| 6 | `src/utils/calendarExport.js` | `SHIFT_TYPE_NAMES` |
| 7 | `src/utils/pdfGenerator.js` | `PDF_DIENST_LABELS` (Kurzlabel für >8 Zeichen) |
| 8 | `src/utils/timeReportPdfGenerator.js` | `DIENST_LABELS` (Kurzlabel für Zeitbericht-PDF) |
| 9 | `src/components/admin/AdminOverview.jsx` | `shiftHours`, `sickHours`, `shiftLabels`, `shiftColors`, `sickColors` Objekte |

### Nur reguläre Typen (wie TD1, ND, AST)

| # | Datei | Was |
|---|---|---|
| 10 | `src/components/DayCard.jsx` | `getShiftForSlot()` Case + `renderShiftRow()` Aufruf + Coverage-Voting Array + Add-Menü Array |
| 11 | `src/utils/rosterRules.js` | Konfliktregel (z.B. AST+ND nicht kombinierbar) |
| 12 | `src/utils/coverageEligibility.js` | Coverage-Konflikte |

### Nur speziale Typen (wie FORTBILDUNG, SUPERVISION)

| # | Datei | Was |
|---|---|---|
| 10 | `src/components/DayCard.jsx` | `specialTypes` Arrays (2×), `SPECIAL_EVENT_CONFIG`, `SPECIAL_TYPES`, `isSpecialOptIn`, `specialLabel` im Add-Menü |
| 11 | `src/hooks/useShifts.js` | `GROUP_SHIFT_TYPES` |
| 12 | `src/components/TimeTracking.jsx` | `GROUP_SHIFT_TYPES` |
| 13 | `src/components/AdminTimeTracking.jsx` | `GROUP_SHIFT_TYPES` |
| 14 | `src/components/admin/AdminOverview.jsx` | `SPECIAL_TYPES` + alle Inline-Arrays mit Spezialtypen |

### Verifikation

1. `npm run build` — keine Fehler
2. `npm test` — alle Tests grün
3. Manuell: Admin "+" Button, Stundenberechnung, Zeiterfassung, Profil Statistik, AdminOverview, PDF-Export

## Design-System

**Styling**: Tailwind CSS v4.1+ — kein UI-Framework (kein MUI, Shadcn etc.). Alle Komponenten custom-built.

**Primärfarbe**: Teal `#00C2CB` — aktive Navigation, primäre Buttons (`bg-teal-500` / `bg-teal-600`)

**Farbschema** (semantisch):
- Grün: Genehmigt/Erfolg (`green-600/700`)
- Gelb/Amber: Ausstehend/Warnung (`yellow-500/600`, `amber-50`)
- Rot: Dringend/Fehler (`red-500/600`)
- Blau: Info/Eingereicht (`blue-500/600`)
- Grau: Neutral/Hintergrund (`gray-50` App-BG, `gray-100/200` Borders)

**Typografie**: System-Font-Stack (kein Google Fonts). Hierarchie über `font-bold`/`font-black` + Tailwind-Größen (`text-xs` bis `text-3xl`). Vereinzelt Custom: `text-[10px]`, `text-[9px]`.

**Icons**: Lucide React (SVG) — ausschließlich.

**UI-Stil**:
- Light mode only (kein Dark Mode)
- Dicht/kompakt, besonders auf Mobile
- Buttons: `rounded-xl` bis `rounded-2xl`, `active:scale-95`
- Cards: `bg-white rounded-2xl border border-gray-100 shadow-sm`
- Modals: `bg-black/50` Backdrop, `rounded-[1.5rem]` Container, `shadow-[0_8px_30px_rgb(0,0,0,0.12)]`
- Inputs: `border border-gray-200 p-3 rounded-xl`, Focus: `ring-2 ring-black`
- Mobile: Bottom-Nav (`bg-white/80 backdrop-blur-xl`), Desktop: Sidebar (`w-64`)

**Modale Komponenten**: `AlertModal.jsx`, `ConfirmModal.jsx`, `ActionSheet.jsx` (Mobile-Bottom-Drawer)

## Konventionen

- **UI-Sprache: ausschließlich Deutsch** — keine englischen Labels, Buttons oder Platzhalter in der UI
- **Keine pastelligen Farben, kein kindlicher Look** — professionell, dicht, erwachsen
- **Komponentennamen**: PascalCase (React-Standard)
- **Utility-Dateien**: camelCase
- Neue UI-Elemente müssen zum bestehenden Tailwind-Stil passen (siehe Design-System) — kein generisches CSS
- `AlertModal`/`ConfirmModal` statt native `alert()`/`confirm()` verwenden
- **Keine neuen npm-Pakete ohne explizite Freigabe**
- **DSGVO**: Personenbezogene Daten (Krankmeldungen, Arbeitszeiten, Abwesenheiten) sind schützenswert — keine Änderungen an Logging, Datensichtbarkeit oder RLS-Policies ohne explizite Rückfrage

## Bekannte Probleme / Tech Debt

- **AdminOverview Fairness-Linie**: `calc(72px + (100% - 72px - 40px) * ...)` nimmt feste Label/Badge-Breiten an — bricht bei Responsive/Mobile
- **38× native `alert()`/`confirm()`**: Müssen durch `AlertModal`/`ConfirmModal` ersetzt werden (größte Altlast, siehe `AdminTimeTracking`, `AdminEmployees`, `AdminAbsences` etc.)
- **PDF-Export unvollständig**: `vacationData: null` und `balanceData: null` in `AdminTimeTracking.jsx:756-757` + `TimeTracking.jsx:804-805`
- **Cross-Month Sickness**: `balanceHelpers.js:225-256` — SSOT-basierte Stundenzuordnung bei monatsübergreifender Krankheit unzuverlässig
- **Zombie Time Entries**: DB-Einträge ohne gültigen Shift werden versteckt statt bereinigt (`AdminTimeTracking.jsx:297`)
- **Pre-Holiday Nachtdienst**: `shiftDefaults.js:56` — Ende 10:00 bei Vorfeiertag nicht implementiert
- **TimeTrackingV2**: Alternative Implementierung existiert, aber deaktiviert (`USE_NEW_TIME_TRACKING = false`)

## Einspring/Soli-System (Coverage)

Komplexestes Feature — verwaltet Dienstübernahmen bei Krankmeldungen mit fairness-basiertem Voting.

### Flow

1. **Krankmeldung** → `SickReportModal` → `RosterFeed.handleSickReport()` erstellt Abwesenheit + `mark_shifts_urgent()` RPC
2. **Edge Function** `notify-sickness` → erstellt `coverage_requests` + `coverage_votes` für eligible User → Web Push
3. **Voting** → `CoverageVotingPanel` auf DayCard: 3 Stufen (`available` / `reluctant` / `emergency_only`)
4. **Auflösung** → Admin klickt "Optimal besetzen" → Greedy-Algorithmus → `assign_coverage()` RPC → `shift_interest` mit `is_flex=true`

### Soli-Punkte (Fairness-Index)

```
Punkte = (Flex-Einsätze × 10) + (Abstimmungs-Teilnahmen × 2)
```
- 6-Monats-Fenster (rollierend)
- Niedrigste Punkte + beste Präferenz = wird empfohlen (⭐)
- Sichtbar für alle (anonymisiert für Employees, volle Namen für Admins)

### Key Files

| Datei | Zweck |
|---|---|
| `src/utils/fairnessIndex.js` | Soli-Punkte Berechnung |
| `src/utils/coverageEligibility.js` | Wer darf einspringen (Konfliktregel: ND+TD2 ✗, AST+ND ✗, etc.) |
| `src/components/CoverageVotingPanel.jsx` | Voting-UI auf Shift-Karte |
| `src/components/SoliPunktePanel.jsx` | Profil-Panel mit Fairness-Slider |
| `src/components/RosterFeed.jsx` | Orchestrierung: Krankmeldung, Voting, Auflösung |
| `supabase/functions/notify-sickness/index.ts` | Edge Function: Push + DB-Records |

### DB-Tabellen

- `coverage_requests`: `shift_id`, `status` (open/assigned/expired), `assigned_to`
- `coverage_votes`: `shift_id`, `user_id`, `was_eligible`, `responded`, `availability_preference`
- `shift_interests.is_flex`: `true` = Coverage-Zuweisung

## SonarCloud — Autonomer Code-Review-Workflow

**Projekt**: `helmuth6553-dotcom_WoBePlaner` auf SonarCloud
**MCP**: `mcp__sonarqube__*` Tools für Issue-Abfrage und Status-Änderungen
**Lokaler Scan**: `npx sonar-scanner` (braucht `SONAR_TOKEN` als Umgebungsvariable)

### Workflow bei Code-Änderungen
1. Code schreiben/ändern
2. `npm run build && npm test` — muss bestehen
3. `npx sonar-scanner` — lokalen Scan ausführen
4. Bei fehlgeschlagenem Quality Gate:
   - Issues via `mcp__sonarqube__search_sonar_issues_in_projects` lesen
   - Jedes Issue bewerten: **Echtes Problem** → fixen | **False Positive** → via `mcp__sonarqube__change_sonar_issue_status` markieren | **Won't Fix** → als ACCEPTED markieren mit Begründung
   - Fixen und erneut scannen (Schritt 2-3 wiederholen)
5. Erst zurückmelden wenn Quality Gate bestanden ist

### Regeln
- **Kein blindes Fixen** — jedes Issue im Kontext des Codes bewerten
- **Cognitive Complexity**: Nur refactoren wenn Lesbarkeit sich tatsächlich verbessert
- **Props Validation (S6774)**: Als ACCEPTED markieren — Projekt nutzt weder TypeScript noch PropTypes
- **Security Hotspots**: Immer prüfen, nie automatisch als SAFE markieren ohne Code-Review

## Feature flags

```js
// src/featureFlags.js
export const USE_COVERAGE_VOTING = false  // Set true to enable Soli/Coverage Voting system

// src/App.jsx
const USE_NEW_TIME_TRACKING = false  // Set true to test TimeTrackingV2
```

### USE_COVERAGE_VOTING (Beta)

Steuert das gesamte Soli/Coverage-Voting-System. Wenn `false`:
- **CoverageVotingPanel** auf DayCards ausgeblendet (Mitarbeiter tragen sich per Klick auf "DRINGEND"-Shift ein)
- **SoliPunktePanel** im Profil hidden
- **Soli-Punkte** in Admin-Übersicht hidden
- **Coverage-Banner** ("X Dienste brauchen deine Antwort") deaktiviert
- **Fairness-Index-Berechnung** + zugehörige DB-Queries übersprungen
- **Push-Nachricht** vereinfacht (kein Fairness-Text, nur "Kannst du den Dienst übernehmen?")
- Edge Function erstellt weiterhin `coverage_requests`/`coverage_votes` (werden client-seitig ignoriert)

**Reaktivierung**: `USE_COVERAGE_VOTING = true` in `src/featureFlags.js` — kein weiterer Code-Change nötig.
