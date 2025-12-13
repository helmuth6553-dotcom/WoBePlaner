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
    *   **`src/components/SetPassword.jsx`**: (NEU) Zwingt neue User beim ersten Login zum Setzen eines Passworts.
    *   `src/components/RosterFeed.jsx`: Hauptansicht Dienstplan.
    *   `src/components/TimeTracking.jsx`: Zeiterfassung für Mitarbeiter.
    *   `src/components/AdminDashboard.jsx`: User-Management (ruft Edge Function).
    *   `src/components/AdminTimeTracking.jsx`: Kontrolle der Stunden durch Admins.
    *   `src/components/Profile.jsx`: User-Profil, PW-Änderung, Stats.

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
