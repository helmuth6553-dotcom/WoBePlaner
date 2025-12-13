# Sicheres Onboarding & Authentifizierung v2.0

Dieses Dokument beschreibt den implementierten sicheren Onboarding-Prozess für die Dienstplan-App. Das System wurde so konzipiert, dass **keine öffentliche Registrierung** möglich ist und Mitarbeiter ausschließlich durch Administratoren eingeladen werden können.

## 🚀 Übersicht des neuen Flows

1.  **Admin lädt Mitarbeiter ein** (via Admin Dashboard).
2.  **System erstellt Account** (via Supabase Edge Function).
3.  **Mitarbeiter erhält E-Mail** mit einem Magic Link.
4.  **Mitarbeiter klickt Link** und wird sofort eingeloggt.
5.  **Passwort-Zwang:** Beim ersten Login erscheint ein Fenster, das den Mitarbeiter zwingt, ein Passwort zu setzen.
6.  **Zugriff:** Erst nach Setzen des Passworts wird der Zugriff auf die App freigeschaltet.

---

## 🛠 Technische Implementierung

### 1. Supabase Edge Function (`create-user`)
Die Funktion `create-user` wurde so umgebaut, dass sie die Atomarität und Sicherheit gewährleistet:
*   Nutzt `supabaseAdmin.auth.admin.inviteUserByEmail()`.
*   Erstellt den Auth-User und sendet **automatisch** die Einladungs-E-Mail.
*   Erstellt das Benutzerprofil in `public.profiles`.
*   Setzt das Feld `password_set = false` initial.

### 2. Datenbank-Erweiterung (`password_set`)
Die Tabelle `public.profiles` wurde um ein Feld erweitert:
```sql
ALTER TABLE profiles ADD COLUMN password_set BOOLEAN DEFAULT true;
```
*   Neue User haben `false`.
*   Nach dem ersten Passwort-Setzen wird es auf `true` gesetzt.

### 3. Frontend-Sicherheitsmechanismen

#### Login & Recovery
*   **Standard:** Login mit E-Mail & Passwort.
*   **Vergessen:** "Passwort vergessen" Button sendet einen Magic Link. Damit kommt der User immer in seinen Account (sofern er Zugriff auf die E-Mail hat) und kann im Profil ein neues Passwort setzen.

#### Passwort-Erzwingung (`SetPassword.jsx`)
In der `App.jsx` gibt es einen globalen Check:
```javascript
if (!passwordSet) {
  return <SetPassword /> // Blockiert den Rest der App
}
```
Dies garantiert, dass kein eingeladener User ohne Passwort im System "herumgeistern" kann.

---

## 🔒 Sicherheits-Checkliste für Production

Damit das System sicher ist, müssen folgende Einstellungen im Supabase Dashboard aktiv sein:

1.  **Signups deaktivieren:**
    *   [Authentication -> Settings](https://supabase.com/dashboard/project/snxhcaruybvfyvcxtnrw/auth/policies)
    *   `Allow new users to sign up`: **DEAKTIVIERT** ❌

2.  **Site URL korrekt setzen:**
    *   [Authentication -> URL Configuration](https://supabase.com/dashboard/project/snxhcaruybvfyvcxtnrw/auth/url-configuration)
    *   Dev: `http://localhost:5173`
    *   Prod: `https://wobeplaner.pages.dev` (oder deine Custom Domain)

---

## 📧 E-Mail Templates
Die Standard-Templates von Supabase ("Invite User" und "Magic Link") werden verwendet.
*   Der Link führt immer zur konfigurierten `Site URL`.
*   Der User landet in der App, wird durch das Token authentifiziert und sieht, falls nötig, den "Passwort setzen" Screen.

---

## ❓ FAQ & Troubleshooting

**Q: Ein Mitarbeiter hat sein Passwort vergessen.**
A: Er soll im Login-Screen auf "Passwort vergessen? Login per E-Mail Link" klicken. Er erhält einen Link, wird eingeloggt und kann im Profil unter "Sicherheit" ein neues Passwort setzen.

**Q: Kann sich jemand Fremdes registrieren?**
A: Nein, da `Allow new users to sign up` deaktiviert ist. Nur Admins können via Edge Function User anlegen.

**Q: Der Link in der E-Mail funktioniert nicht ("Connection refused").**
A: Überprüfe die `Site URL` im Supabase Dashboard. Sie muss exakt mit der Adresse übereinstimmen, unter der die App erreichbar ist (Wichtig: Port beachten bei Localhost!).
