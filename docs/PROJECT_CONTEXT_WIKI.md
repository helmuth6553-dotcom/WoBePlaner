# 📘 PROJECT CONTEXT WIKI: Dienstplan-App (WoBePlaner)

## 1. PROJEKT-STATUS & METADATEN

*   **Projekt:** Dienstplan-App (Webanwendung für soziale Einrichtungen).
*   **Tech Stack:**
    *   **Frontend:** React (Vite), Tailwind CSS.
    *   **Backend:** Supabase (PostgreSQL, Auth, Edge Functions, Realtime).
    *   **Sprache:** JavaScript (JSX) / TypeScript (nur für Edge Functions & Tests).
    *   **Node Version:** v18+.
*   **Aktuelle Phase:** **Pre-Production / Security Hardening**.
    *   Kürzlich abgeschlossenes Feature: **Secure Onboarding v2.0** (Admin-Only Invite mit Password-Enforcement).
    *   Status: Stabil, getestet auf Localhost & Cloudflare Pages.

## 2. SUPABASE SCHEMA & DATENBANK

### Wichtige Tabellen

| Tabelle | Beschreibung & Wichtige Spalten | RLS (Row Level Security) |
| :--- | :--- | :--- |
| **`public.profiles`** | Benutzerprofile (erweitert `auth.users`).<br>- `id` (PK, FK zu auth.users)<br>- `role` ('admin', 'user')<br>- `full_name`, `display_name`<br>- `weekly_hours` (Soll-Stunden)<br>- `vacation_days_per_year`<br>- **`password_set`** (boolean, neu in v2) | **Public Read:** Jeder Auth-User.<br>**Update:** User eigene, Admin alle.<br>**Insert:** Nur via Edge Function/Admin. |
| **`public.shifts`** | Dienstplan-Schichten.<br>- `date`<br>- `user_id` (FK)<br>- `shift_type_id`<br>- `is_freigabe` (Urgent Shift) | **Read:** Alle authentifizierten.<br>**Write:** Nur Admins. |
| **`public.time_entries`** | Zeiterfassung (Ist-Zeiten).<br>- `date`, `start_time`, `end_time`<br>- `break_duration`<br>- `type` ('Arbeit', 'Krank', 'Urlaub', 'Fortbildung')<br>- `status` ('entwurf', 'eingereicht', 'genehmigt') | **Read:** User eigene, Admin alle.<br>**Write:** User eigene (bestimmte Status), Admin alle. |
| **`public.absences`** | Abwesenheiten & Urlaubsanträge.<br>- `start_date`, `end_date`<br>- `type` ('Urlaub', 'Krank', etc.)<br>- `status` ('beantragt', 'genehmigt', 'abgelehnt') | **Read:** User eigene, Admin alle (anonymisiert für Kollegen).<br>**Write:** User insert, Admin update. |
| **`public.admin_actions`** | Audit Log.<br>- `action` (z.B. 'create_user')<br>- `target_user_id`, `admin_id` | **Read/Write:** Nur Admins. |

### Edge Functions
*   **`create-user`**:
    *   **Pfad:** `supabase/functions/create-user/index.ts`
    *   **Funktion:** Erstellt User via `inviteUserByEmail`, legt Profil an, loggt Audit-Action.
    *   **Trigger:** Manuell via `AdminDashboard` aufgerufen.
    *   **Auth:** Benötigt Admin-Token + Service Role Key (intern).

### Authentifizierung
*   **Flow:** Admin-Only Invite.
*   **Signup:** `Allow new users to sign up` ist in Supabase **deaktiviert**.
*   **Login:** E-Mail/Passwort oder Magic Link.
*   **Rollen:** Gesteuert über `profiles.role`.

## 3. FRONTEND ARCHITEKTUR

### Struktur
*   **Root:** `src/App.jsx` (Routing & Global State Wrapper).
*   **Auth:** `src/AuthContext.jsx`
    *   Stellt `user`, `role`, `isAdmin`, **`passwordSet`** bereit.
*   **Haupt-Komponenten:**
    *   `src/components/Login.jsx`: Login-Screen (PW + Magic Link).
    *   **`src/components/SetPassword.jsx`**: Zwingt neue User beim ersten Login zum Setzen eines Passworts.
    *   `src/components/RosterFeed.jsx`: Hauptansicht Dienstplan (~804 Zeilen).
    *   `src/components/TimeTracking.jsx`: Zeiterfassung für Mitarbeiter (~996 Zeilen).
    *   **`src/components/AdminDashboard.jsx`**: Tab-Container (~49 Zeilen nach Refactoring 14.12.2025).
    *   `src/components/AdminTimeTracking.jsx`: Kontrolle der Stunden durch Admins.
    *   `src/components/Profile.jsx`: User-Profil, PW-Änderung, Stats.

### Admin-Komponenten (Extrahiert 14.12.2025)
*   `src/components/admin/AdminEmployees.jsx` (490 Zeilen): Mitarbeiter-Verwaltung, Einladungen.
*   `src/components/admin/AdminAbsences.jsx` (310 Zeilen): Urlaubsanträge genehmigen, PDF-Export.
*   `src/components/admin/AdminSickLeaves.jsx` (72 Zeilen): Krankmeldungen anzeigen.
*   `src/components/admin/AdminAuditLog.jsx` (120 Zeilen): Audit-Trail Ansicht.
*   `src/components/admin/AdminRoster.jsx` (21 Zeilen): Dienstplan-Navigation.

### Modal-Komponenten (Extrahiert 14.12.2025)
*   `src/components/SickReportModal.jsx` (61 Zeilen): Krankmeldungs-Modal.
*   `src/components/MonthSettingsModal.jsx` (92 Zeilen): Admin Monats-Einstellungen.

### State Management
*   **React Context:** `AuthContext` für User-Session.
*   **Local State:** `useState/useEffect` in Komponenten für Data-Fetching (Supabase Client).

### Routing
*   `/`: Hauptanwendung (geschützt via `Login` Check).
*   `/impressum`: Öffentlich.
*   `/datenschutz`: Öffentlich.
*   *Internes Tab-System:* `AppContent` rendert bedingt Komponenten basierend auf `activeTab` ('roster', 'times', 'absences', 'profile', 'admin').

## 4. FEATURE FORTSCHRITT

| Modul | Status | Details |
| :--- | :--- | :--- |
| **Dienstplan** | ✅ Feature Complete | Schichten anzeigen, filtern, Urgent-Shifts Logik. |
| **Zeiterfassung** | ✅ Feature Complete | Kommen/Gehen, Pausen, Krankmeldungen, Überstundenberechnung. |
| **Urlaub** | ✅ Feature Complete | Beantragung, Genehmigungsworkflow, Kalenderansicht. |
| **Mitarbeiter-Portal** | ✅ Feature Complete | Eigene Schichten, Stundenkonto, Profil, PW-Änderung. |
| **Admin** | ✅ Feature Complete | User einladen (Secure v2), Rollen, Stunden korrigieren. |
| **Onboarding** | ✅ **NEU / FINAL** | Secure Invite Flow integriert & gehärtet. |
| **PDF-Export** | ⚠️ In Arbeit | Basis-Signaturen vorhanden, Layout-Optimierung noch Thema. |

## 5. DOKUMENTATIONS-REFERENZ

*   **`docs/SECURE_ONBOARDING.md`**: **(NEU)** Dokumentiert den kompletten Invite-Flow, Edge Function Nutzung und Troubleshooting für Login-Probleme. **MUSS GELESEN WERDEN.**
*   **`docs/RLS_POLICIES.md`**: Referenz für Datenbank-Zugriffsrechte. Wichtig bei Permission-Errors.
*   **`docs/TECHNICAL_DOCS.md`**: Generelle Architektur und Glossar.

## 6. OFFENE PUNKTE & BUGS (Current Issues)

*   **PDF Design:** Das Layout der generierten PDFs (Stundennachweise) benötigt ggf. noch Feinschliff bzgl. Seitenumbrüchen und Signatur-Platzierung.
*   **Login Redirects:** Sicherstellen, dass die `Site URL` in Supabase für Production (`https://wobeplaner.pages.dev`) und Dev korrekt gesetzt bleibt.

## 7. NEUE FEATURES (Diese Session)

*   ✅ **3-Step Onboarding Wizard** (`SetPassword.jsx`):
    1. Willkommen & Features (Dienstplan, Urlaub, Zeit)
    2. Daten & Sicherheit (Was speichern wir? Wer sieht was?)
    3. Passwort setzen
*   ✅ **Re-Authentication für Admin-Erstellung**: Beim Erstellen eines neuen Admins muss der aktuelle Admin sein Passwort eingeben.

## 8. FEATURE REQUESTS (Für spätere Sessions)

*   **🔮 Beobachter-Rolle ("Observer")**: 
    *   Neuer Rollentyp neben Admin & Mitarbeiter
    *   Nur Lese-Zugriff auf Dienstplan und Urlaubsplan
    *   Keine eigene Zeiterfassung
    *   Use Case: Teamleiter anderer Abteilungen, Betriebsrat, Praktikanten
    *   Aufwand: Mittel (1-2 Stunden)

## 9. PLAN FÜR DIE NÄCHSTE SITZUNG

**Fokus:** **PDF Refinement & Optional Observer-Rolle**

1.  **PDF Layout Check:** Prüfen, ob die generierten PDFs korrekt formatieren.
2.  **Beobachter-Rolle:** Falls gewünscht, implementieren (DB-Migration + Frontend).
3.  **Deployment:** Änderungen auf Production pushen.

**Kontext für die KI:**
Die Anwendung ist funktional vollständig und sicherheitstechnisch gehärtet. Der Onboarding-Flow (`SetPassword.jsx`) hat jetzt 3 Schritte mit Datenschutz-Infos. Die Admin-Erstellung erfordert Passwort-Bestätigung ("Re-Auth"). Änderungen am Auth-Flow sollten nur mit äußerster Vorsicht vorgenommen werden.

## 10. NEUE FEATURES (Session 13.12.2025)

*   ✅ **Balance Corrections (Admin-Korrekturen):**
    *   Neue Tabelle `balance_corrections`.
    *   Admin-Workflow: Übertrag korrigieren (Soll vs. Ist Vergleich aus Buchhaltung).
    *   Automatische Berechnung der Differenz.
    *   Auswirkung auf aktuellen Monat und laufenden Übertrag.
*   ✅ **Status-Indikatoren in Admin-UI:**
    *   Dropdown-Menü zeigt jetzt Status des Monats (✅, 🟡, ⚪).
*   ✅ **Dokumentation:**
    *   `docs/RULES_OF_TIME.md` massiv erweitert (Feiertage, Gesamtformel, Beispiele).

## 11. DEPLOYMENT

Der Deployment-Prozess ist via Workflow-Skript automatisiert (`.agent/workflows/deploy.md`).

**Manueller Befehl (Cloudflare Pages):**
```bash
npx wrangler pages deploy dist --project-name=wobeapp
```
*Achtung: Projekt-Name ist `wobeapp`, nicht `wobeplaner`!*

## 12. AUDIT & RELEASE READINESS (17.12.2025)

**Gesamtstatus:** ✅ Produktionsbereit

*   ✅ **Release Tag:** `v1.0.0-stable` gesetzt (17.12.2025) - sicherer Rollback-Punkt
*   ✅ **SEO:** `robots.txt` korrekt, Meta-Tags vollständig, Open Graph Tags vorhanden. **Lighthouse SEO: 100/100**
*   ✅ **CI/CD:** GitHub Actions Pipeline grün (Lint, Build, Test, Security). 
*   ✅ **Tests:** **196 Tests** (Unit, Component, Edge Cases, Error Scenarios) - alle bestanden.
*   ✅ **Security:** RLS, Auth & Secrets sind stabil. Dependabot aktiv. Rafter-Findings gefixt.
*   ✅ **Funktionalität:** Core-Features & Admin-Tools abgenommen.
*   ✅ **Error-Tracking:** Sentry.io integriert (DSGVO-konform).
*   ✅ **Performance:** Lighthouse Audit Workflow eingerichtet. Splash Screen optimiert.
*   ✅ **Error Handling:** Zentraler Error Handler mit Toast-Notifications implementiert.

### Test Coverage (17.12.2025)
| Kategorie | Anzahl |
|-----------|--------|
| Unit Tests (Logik) | ~120 |
| Component Tests (UI) | ~29 |
| Error Scenario Tests | 19 |
| Edge Case Tests | 23 |
| Holiday Tests | 14 |
| **Gesamt** | **196** |

👉 *Details siehe `docs/IT_REVIEW_SUMMARY.md`*


## 13. REFACTORING (Session 14.12.2025)

**Ziel:** Reduktion der Dateigröße durch Extraktion von Subkomponenten für bessere Wartbarkeit.

### AdminDashboard.jsx Refactoring
| Vorher | Nachher | Einsparung |
|--------|---------|------------|
| 1013 Zeilen | 49 Zeilen | **-964 Zeilen (-95%)** |

**Extrahierte Komponenten:**
*   `admin/AdminAuditLog.jsx` - Audit-Log Ansicht
*   `admin/AdminSickLeaves.jsx` - Krankmeldungs-Übersicht
*   `admin/AdminRoster.jsx` - Dienstplan-Tab (Placeholder)
*   `admin/AdminEmployees.jsx` - Mitarbeiter-Verwaltung inkl. Einladungen
### Nicht refactored (zu riskant ohne Unit-Tests)
*   `TimeTracking.jsx` (996 Zeilen) - Monolithische Struktur, enge State-Kopplung
*   `AdminTimeTracking.jsx` (1165 Zeilen) - Ähnliche Problematik

**Empfehlung für Zukunft:** Vor Refactoring dieser Komponenten Unit-Tests schreiben (Done: 196 Tests vorhanden).


## 14. MULTI-TENANCY (Status: ARCHIVIERT - 21.12.2025)

> [!CAUTION]
> Dieses Feature wurde pausiert und der Frontend-Code bereinigt.

**Ursprüngliches Ziel:** Transformation zu "Enterprise Plattform" für mehrere Teams.

### Was noch in der DB existiert:
*   `teams` Tabelle (kann später reaktiviert werden)
*   `shift_templates` Tabelle (mit 9 Templates für WoBe-Team)

### Was bereinigt wurde (21.12.2025):
*   ❌ `featureFlags.js` **entfernt** (nicht mehr benötigt)
*   ✅ `ShiftTemplateContext.jsx` **vereinfacht** (nur lokale Templates, keine DB-Abfrage)
*   ✅ Debug-Logs entfernt aus `AdminTimeTracking.jsx` und `NotificationToggle.jsx`

### Warum pausiert:
Das Sozialarbeiter-Team hat **deutlich komplexere Berechnungsregeln**:
- Rufbereitschaft mit unterschiedlichen Faktoren (vor/nach 22:00, Werktag/Wochenende)
- Funktionszeiten als Overlay
- Komplett andere Arbeitszeitmodelle

**Entscheidung:** Erst in 3-5 Monaten relevant. Fokus jetzt auf WoBe-Team App.

### Rollback-Punkt:
- **Git Tag:** `v1.0.0-stable`
- Schichtdefinitionen sind jetzt in `ShiftTemplateContext.jsx` (Single Source of Truth)

👉 *Details siehe `docs/ROADMAP_2.0_IMPLEMENTATION.md` (ARCHIVIERT) und `docs/SHIFT_LOGIC_ANALYSIS.md`*



## 15. VERBESSERUNGSVORSCHLÄGE für WoBe-Team App

### Priorität 1: Usability & UX
*   [ ] **Offline-Modus verbessern:** PWA funktioniert offline, aber ohne Feedback
*   [x] **Ladezeiten optimieren:** ~~Code-Splitting~~ Lazy Loading für PDF-Generator ✅
*   [x] **Pull-to-Refresh:** `PullToRefresh.jsx` implementiert, in RosterFeed integriert ✅

### Priorität 2: Features
*   [ ] **Schichtübernahme vereinfachen:** 1-Klick-Übernahme bei freigewordenen Schichten
*   [x] **Kalender-Export:** iCal Export in `calendarExport.js` implementiert ✅
*   [x] **Monatsübersicht drucken:** PDF-Export via `timeReportPdfGenerator.js` ✅
*   [ ] **Erinnerungen:** Push-Notification X Stunden vor Schichtbeginn (nur Krankmeldungen aktiv)

### Priorität 3: Admin-Features
*   [x] **~~Schichtplan-Vorlage:~~** Nicht nötig - Schichten werden automatisch in Supabase generiert ✅
*   [ ] **Statistik-Dashboard:** Basis-Stats in AdminOverview, aber nicht vollständig
*   [ ] **Audit-Log erweitern:** Filtermöglichkeiten, Export

### Priorität 4: Wartung & Stabilität
*   [x] **Lint-Warnings aufräumen:** Von 53 auf ~10 reduziert ✅
*   [x] **Mehr Unit-Tests:** 196 Tests vorhanden ✅
*   [ ] **E2E-Tests erweitern:** Playwright Setup existiert, wenige Tests

**Stand: 21.12.2025** – 7 von 14 Features erledigt (1 als "nicht nötig" gestrichen)


