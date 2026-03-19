# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

## Feature flags

```js
// App.jsx
const USE_NEW_TIME_TRACKING = false  // Set true to test TimeTrackingV2
```
