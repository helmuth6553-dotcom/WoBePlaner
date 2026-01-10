# 🚀 GO-LIVE STRATEGY & OPERATIONS MANUAL

> **Rolle:** Release Manager
> **Ziel:** Reibungsloser Start & Sicherer Betrieb
> **Status:** Vorlage für Launch

## 1. ⚖️ DSGVO-Checkliste (Datenschutz)

Diese Punkte müssen in der Datenschutzerklärung der Einrichtung ergänzt werden, da personenbezogene Daten verarbeitet werden.

### Technische Infrastruktur (Auftragsverarbeiter)
*   **Supabase (DB & Auth):**
    *   Wir nutzen Supabase (gehostet auf AWS in Frankfurt/EU oder Irland/EU - *bitte in Supabase Settings prüfen!*).
    *   Zweck: Speicherung von Stammdaten, Dienstplänen und Arbeitszeiten.
    *   Rechtsgrundlage: Vertrag zur Auftragsverarbeitung (AVV) mit Supabase ist nötig.
*   **Cloudflare (Hosting):**
    *   Die Web-App wird via Cloudflare ausgeliefert (CDN).
    *   Zweck: Auslieferung der Anwendung, DDoS-Schutz.

### Verarbeitete Daten
*   **Stammdaten:** Name, E-Mail (für Login).
*   **Arbeitsdaten:** Schichtzeiten, Krankmeldungen (Gesundheitsdaten nach Art. 9 DSGVO! - *Hohes Schutzniveau nötig*).
*   **Log-Daten:** IP-Adresse bei Login/Signatur (Sicherheitsinteresse).

### Betroffenenrechte
*   Erklären, wie Mitarbeiter Auskunft erhalten (Export-Funktion im Profil).
*   Löschkonzept: Wann werden Daten gelöscht? (z.B. 10 Jahre Aufbewahrungspflicht für Arbeitszeitnachweise).

---

## 2. 🆘 Support & Kommunikation

### A. Template: "Willkommen beim WoBePlaner" (E-Mail)

**Betreff:** Einladung zum neuen digitalen Dienstplan (WoBePlaner)

Hallo [Name],

es ist soweit: Wir verabschieden uns vom Papierchaos! Ab sofort findest du deinen Dienstplan, deine Urlaubsanträge und deine Zeiterfassung in unserer neuen Web-App **WoBePlaner**.

**Deine ersten Schritte:**

1.  Du erhältst gleich eine separate E-Mail von "WoBePlaner" (Absender: noreply@...).
2.  Klicke dort auf den Link ("Einladung annehmen").
3.  Du wirst sofort eingeloggt.
4.  **WICHTIG:** Setze bitte direkt dein persönliches Passwort! (Das Fenster öffnet sich automatisch).

**So erreichst du die App:**
📱 Am Handy: Öffne `https://wobeplaner.pages.dev` und speichere sie "Zum Startbildschirm hinzu" (iPhone: Teilen -> Zum Home-Bildschirm).
💻 Am PC: Einfach im Browser als Lesezeichen speichern.

Bei Fragen melde dich gerne direkt bei mir oder wirf einen Blick in die FAQ unten.

Viele Grüße,
[Dein Name]

---

### B. Mini-FAQ (Für den Pausenraum-Aushang)

**Q: Ich habe mein Passwort vergessen!**
A: Kein Problem. Klicke im Login-Screen auf "Passwort vergessen? Login per E-Mail". Du bekommst einen Link, der dich sofort einloggt. Danach kannst du im Profil ein neues Passwort setzen.

**Q: Ich bekomme keine Push-Benachrichtigungen bei Änderungen.**
A: Das liegt meist an den Browser-Einstellungen.
1. Öffne die App.
2. Gehe auf dein Profil.
3. Schalte "Benachrichtigungen" einmal AUS und wieder AN.
4. Wenn der Browser fragt "Darf WoBePlaner Nachrichten senden?": Klicke auf "Erlauben".
*(Hinweis: Auf dem iPhone funktioniert das nur, wenn die App auf dem Homescreen installiert ist!)*

**Q: Ich habe kein Internet. Geht die App trotzdem?**
A: Du kannst den Dienstplan ansehen, wenn du ihn vorher einmal geladen hast. Aber Änderungen (z.B. Zeiten stempeln) gehen nur mit Internet.

---

## 3. 📅 Launch-Day-Protokoll (Tag X)

### Phase 1: Vorbereitung (08:00 - 10:00)
- [ ] **Backup:** Manueller SQL-Dump der aktuellen DB (falls Testdaten drin waren).
- [ ] **Wipe (Optional):** Testdaten löschen (`TRUNCATE time_entries, shifts...`), falls "Clean Start" gewünscht.
- [ ] **Config Check:**
    - `SITE_URL` in Supabase auf Production URL gesetzt?
    - `SMTP` Settings für E-Mails geprüft?
    - RLS Policies aktiv?

### Phase 2: Onboarding (10:00 - 12:00)
- [ ] **Admin Accounts:** Alle Teamleitungen einladen & Passwörter setzen lassen.
- [ ] **Mitarbeiter Import:** Entweder manuell anlegen oder Skript laufen lassen.
- [ ] **Einladungs-Welle:** Mails (siehe oben) versenden.

### Phase 3: Go-Live (12:00)
- [ ] **Monitoring:** Sentry Dashboard öffnen. Auf Fehler achten.
- [ ] **Support-Kanal:** Sicherstellen, dass jemand für Rückfragen erreichbar ist (Telefon/Slack).

---

## 4. 🛠 Wartungsplan & Updates

### Update-Strategie
Da wir eine **Web-App (PWA)** sind, ist das Updaten einfach:
*   Wir deployen neuen Code auf Cloudflare Pages.
*   Nutzer bekommen das Update beim nächsten Neuladen der Seite automatisch.

### Kommunikation von Wartungsfenstern (Downtime)
Falls wir die Datenbank stoppen müssen (sehr selten):

1.  **Ankündigung:** 24h vorher per E-Mail / WhatsApp-Gruppe ("Wartung am Dienstag 22:00 - 23:00").
2.  **Locking:** Admin setzt den aktuellen Monat manuell auf `is_open = false` (sperrt Schreibzugriffe), um Datenchaos zu verhindern.
3.  **Nach Wartung:** Monat wieder öffnen.

### Backup-Routine
*   Supabase macht **tägliche Backups** automatisch.
*   **Zusätzlich:** 1x pro Monat vor der Abrechnung einen manuellen Dump ziehen und lokal speichern (Compliance!).
