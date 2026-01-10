# 🔒 IT-Review - Dienstplan-App (WoBePlaner)

**Version:** 1.0.0  
**Datum:** 28.12.2025  
**Erstellt für:** IT-Abteilung

---

## 📋 Inhalt

1. [Projektübersicht](#1-projektübersicht)
2. [Technologie-Stack](#2-technologie-stack)
3. [Sicherheitsarchitektur](#3-sicherheitsarchitektur)
4. [Test-Zugangsdaten](#4-test-zugangsdaten)
5. [Dokumentation](#5-dokumentation)
6. [Bekannte Einschränkungen](#6-bekannte-einschränkungen)
7. [Kontakt](#7-kontakt)

---

## 1. Projektübersicht

### Was ist die App?
Eine mobile-first Web-Anwendung zur **Dienstplanung und Zeiterfassung** für die WoBe-Wohngemeinschaft (Soziale Einrichtung).

### Wer nutzt sie?
- **~10 Mitarbeiter** (Betreuer/innen)
- **2 Admins** (Leitung)
- Läuft auf **privaten Mobilgeräten** (BYOD)

### Kernfunktionen
| Funktion | Beschreibung |
|----------|--------------|
| Dienstplan | Monatsansicht, Schichtplanung, Interesse bekunden |
| Zeiterfassung | Arbeitszeiten mit Überstundenberechnung |
| Urlaub/Krankmeldung | Digitale Anträge, Genehmigungsworkflow |
| PDF-Export | Monatliche Stundenberichte mit SHA-256 Signatur |
| Push-Benachrichtigungen | Krankmeldungs-Alerts für Kollegen |

---

## 2. Technologie-Stack

| Komponente | Technologie | Anmerkung |
|------------|-------------|-----------|
| **Frontend** | React 18 + Vite | Single Page Application (SPA) |
| **Styling** | Tailwind CSS | Utility-first CSS Framework |
| **Backend/DB** | Supabase | PostgreSQL + Auth + Realtime |
| **Auth** | Supabase Auth | JWT, bcrypt-Hashing |
| **Hosting** | Cloudflare Pages | Edge-Deployment, kostenlos |
| **Push** | Web Push (VAPID) | Keine Drittanbieter (kein Firebase) |

### Warum diese Stack-Entscheidungen?
- **Supabase statt eigenem Backend:** Managed Service mit eingebautem RLS, Auth, und Backups
- **Cloudflare Pages:** Automatische HTTPS, DDoS-Schutz, global verteilte Edge-Server
- **Web Push ohne Firebase:** Maximale Datenhoheit, DSGVO-konform

### Lokales Setup

**Voraussetzungen:** Node.js v18+

```bash
npm install
npm run dev
```

Die App läuft dann auf **http://localhost:5173**

**Weitere Befehle:**
- `npm test` - Tests ausführen
- `npm run build` - Production-Build erstellen

**Hinweis:** Die `.env` Datei mit Produktions-Credentials ist bereits enthalten.

---

## 3. Sicherheitsarchitektur

### 3.1 Authentifizierung
| Merkmal | Implementierung |
|---------|-----------------|
| Auth-Provider | Supabase Auth (Hosted) |
| Passwort-Hashing | bcrypt (Supabase-Standard) |
| Session-Token | JWT (expires in 1h, auto-refresh) |
| Passwort-Policy | Minimum 6 Zeichen (Supabase Default) |
| Login-Methoden | Email + Passwort, Magic Link |

### 3.2 Autorisierung (Row Level Security)
**Alle** Datenbank-Tabellen haben Row Level Security (RLS) aktiviert:

```sql
-- Beispiel: time_entries Tabelle
CREATE POLICY "Users see only own entries"
ON time_entries FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins see all entries"
ON time_entries FOR SELECT
USING (is_admin(auth.uid()));
```

Vollständige RLS-Policies: siehe `docs/RLS_POLICIES.md`

### 3.3 Datenschutz (DSGVO)
| Anforderung | Umsetzung |
|-------------|-----------|
| Datensparsamkeit | Push-Nachrichten enthalten KEINE Gesundheitsdaten |
| Anonymisierung | Kollegen sehen nur "Abwesend", nicht "Krank" |
| Löschkonzept | Soft-Delete mit `deleted_at` Timestamp |
| Audit-Trail | Admin-Aktionen werden protokolliert |
| Verschlüsselung | HTTPS erzwungen, Push E2E-verschlüsselt |

### 3.4 Frontend-Sicherheit
| Risiko | Mitigation |
|--------|------------|
| XSS | React JSX Auto-Escaping, kein `dangerouslySetInnerHTML` |
| CSRF | Supabase verwendet HTTPOnly Cookies |
| Secrets im Code | Nur `anon` Key im Frontend (by design, RLS schützt) |
| Input-Validation | Server-side durch RLS + Constraints |

---

## 4. Test-Zugangsdaten

### Live-URL
```
https://wobe-planer.pages.dev
```

### Test-Accounts
> ⚠️ **ACHTUNG:** Diese Zugangsdaten werden separat und verschlüsselt übermittelt!

| Rolle | Email | Passwort |
|-------|-------|----------|
| Admin | (separat mitgeteilt) | (separat mitgeteilt) |
| User | (separat mitgeteilt) | (separat mitgeteilt) |

---

## 5. Dokumentation

| Dokument | Pfad | Beschreibung |
|----------|------|--------------|
| IT-Review Zusammenfassung | `docs/IT_REVIEW_SUMMARY.md` | Technische Übersicht, Audit-Ergebnisse |
| Datenbank-Schema | `docs/DATABASE_SCHEMA.md` | Alle Tabellen und Beziehungen |
| RLS-Policies | `docs/RLS_POLICIES.md` | Vollständige Security-Policies |
| Secure Onboarding | `docs/SECURE_ONBOARDING.md` | Einladungs- und Auth-Workflow |
| Push Notifications | `docs/PUSH_NOTIFICATIONS_SETUP.md` | Web Push Architektur |
| Deployment | `docs/DEPLOYMENT.md` | Cloudflare Pages Setup |

---

## 6. Bekannte Einschränkungen

### Akzeptierte ESLint-Warnungen
Die Codebase hat **18 stilistische ESLint-Warnungen** (keine Sicherheitsrisiken):
- `no-unused-vars` in Test-Dateien
- `react-refresh/only-export-components` (React-Pattern)

### Offene Punkte
| Punkt | Status | Begründung |
|-------|--------|------------|
| CI/CD Pipeline | ❌ | Manuelles Deployment via Cloudflare CLI |
| Sicherheits-Header | ⚠️ | Cloudflare-Defaults, keine custom `_headers` |
| Accessibility Audit | ⚠️ | Basic A11y vorhanden, volles Audit ausstehend |

---

## 7. Kontakt

Bei Fragen zum IT-Review:

| Rolle | Person | Kontakt |
|-------|--------|---------|
| Entwicklung | [Name] | [Email/Telefon] |
| Projektleitung | [Name] | [Email/Telefon] |

---

*Dieses Dokument wurde erstellt am 28.12.2025 für das IT-Review.*
