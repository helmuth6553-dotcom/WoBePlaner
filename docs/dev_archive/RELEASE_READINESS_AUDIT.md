# 🛡️ Release Readiness & Hardening Audit

> **Rolle:** System Lead / Security Engineer
> **Ziel:** Enterprise-Readiness für öffentlichen Launch garantieren.
> **Status:** DRAFT (Zu prüfen vor Go-Live)

## 1. 🔒 RLS & Datenisolation (Exploit-Testing)

**Ziel:** Verifizieren, dass *niemand* Daten sehen kann, die ihm nicht gehören.

### Test-Szenarien
- [ ] **ID-Enumeration Attack:**
    - Logge dich als normaler `User A` ein.
    - Besorge dir (z.B. aus Network Tab bei einem legitimen Request) die `user_id` eines Kollegen (`User B`).
    - Versuche manuell via Supabase Client (Browser Konsole) Daten von `User B` abzufragen:
      ```javascript
      await supabase.from('time_entries').select('*').eq('user_id', 'UUID-VON-USER-B')
      ```
    - **Erwartung:** Leeres Array `[]` oder Error (je nach Policy Design). Darf KEINE Daten liefern.
- [ ] **Admin-Impersonation:**
    - Versuche als normaler User einen `admin_actions` Eintrag zu erstellen:
      ```javascript
      await supabase.from('admin_actions').insert({ action: 'hack', admin_id: 'MEINE-ID' })
      ```
    - **Erwartung:** Permission Denied (403).
- [ ] **Profile-Leak:**
    - Prüfe, ob `auth.users` Informationen (Email, Phone) via `profiles` Tabelle lecken, die nicht öffentlich sein sollten (z.B. private Handynummer, falls gespeichert).

## 2. 🔏 Integritäts-Audit (Hash-Manipulation)

**Ziel:** Beweisen, dass das "Digitale Siegel" (FES) bei Manipulation bricht.

### Schritt-für-Schritt Anleitung (Der "Bruch-Test")
1.  **Status Quo:** Ein User reicht einen Antrag ein (z.B. Urlaub). Das System generiert Hash `123abc...` basierend auf `{"start":"2024-01-01", ...}`.
2.  **Der Angriff (Admin-Level):**
    - Gehe ins Supabase Dashboard (Table Editor).
    - Suche den Eintrag in der `signatures` Tabelle.
    - **Ändere NICHT den Hash**, sondern den *Payload* oder den verknüpften Datensatz (z.B. ändere Datum in `absences` Tabelle von `01.01.` auf `05.01.`).
3.  **Die Verifikation (Frontend):**
    - Öffne den Antrag im Admin-Dashboard / User-Ansicht.
    - Klicke auf "Signatur prüfen" (oder beobachte die automatische Validierung).
    - **Erwartung:** Das Frontend berechnet den Hash der *jetzt manipulierten* Daten (`2024-05-01`) neu -> Hash ist nun `999xyz...`.
    - Vergleich mit gespeichertem Hash `123abc...` schlägt fehl.
    - **UI-Reaktion:** 🔴 FETTE WARNUNG "Datenintegrität verletzt / Signatur ungültig".

## 3. ⏱️ Concurrency & Locking (Race Conditions)

**Ziel:** Verhindern, dass "Monatsabschluss" umgangen wird.

### Stress-Test Szenario
- [ ] **Der "Last Second" Write:**
    - Ein Admin schließt den Monat Januar (`is_open = false`).
    - *Gleichzeitig* (Skript oder zweiter Browser) versucht ein User einen Zeiteintrag für Januar zu erstellen.
- [ ] **Race-Condition Skript:**
    - Schreibe ein kleines Skript, das 10 `insert`-Requests parallel feuert, während 1 Request den Monat schließt.
    - **Erwartung:** Die Datenbank-Funktion `check_time_entry_lock` muss als *Trigger* VOR dem Insert laufen und atomar ablehnen.
    - Prüfe: Sind "Zombie-Einträge" entstanden, die *nach* dem Schließen timestamped sind?

## 4. 💣 Edge-Case Szenarien (Logik-Härtung)

**Ziel:** Die Berechnungs-Engine (CEIL, ND) zum Absturz bringen.

### Die "Bösartigen" Inputs
- [ ] **Der "25-Stunden-Tag":**
    - Schicht über Zeitumstellung (März/Oktober).
    - Input: `2024-10-27T01:00` bis `2024-10-27T04:00` (die Nacht, in der 1h wiederholt wird).
    - Prüfe: Berechnet `date-fns` korrekte Stunden (Effektivzeit)?
- [ ] **Der "Null-Minuten-Dienst":**
    - Start = Ende (`12:00` - `12:00`). Crasht die Division durch Null?
- [ ] **Der "Rückwärts-Dienst":**
    - Ende *vor* Start (`12:00` - `10:00`). Wird das abgefangen oder entstehen negative Stunden?
- [ ] **Massive Überlappung:**
    - 3 Schichten im selben Zeitraum (`08-10`, `09-11`, `08-12`).
    - Zählt die Summe > Realzeit? (Double-Counting Bug).
- [ ] **ND-Extrem:**
    - Start `18:59` (1 Min vor ND-Start) bis `06:01` (1 Min nach ND-Ende).
    - Greift die Logik exakt an den Grenzen 19:00 und 06:00?

## 5. 📡 PWA & Netzstabilität (Der "Tunnel-Test")

**Ziel:** Datenverlust bei schlechtem Netz verhindern.

### Das "U-Bahn Szenario"
1.  Öffne "Krankmeldung" Formular.
2.  Fülle alles aus.
3.  Setze Browser-Netzwerk auf "Offline" oder "GPRS" (sehr langsam).
4.  Klicke "Senden".
5.  **Erwartung:**
    - UI darf nicht endlos spinnen -> Timeout oder "Pending" Status.
    - Wenn Netz weg: UI muss sagen "Keine Verbindung. Bitte später versuchen." (Da wir keine Offline-Queue für Writes haben).
    - **Fehlerfall:** User denkt es ist gesendet, schließt App -> Daten weg.
    - **Fix:** Validieren, ob User Feedback bekommt ("Konnte nicht gesendet werden").

## 6. 🚀 Performance-Audit (Scale Testing)

**Ziel:** >1000 Einträge dürfen die UI nicht freezen.

### Bottleneck-Kandidaten
- [ ] **PDF-Export (Jahresbericht):**
    - Generiere einen PDF-Report für *alle* Mitarbeiter für *ein ganzes Jahr*.
    - Beobachte Memory-Usage im Browser. Stürzt der Tab ab?
- [ ] **RosterFeed Rendering:**
    - Lade einen Monat mit 50 Mitarbeitern à 30 Schichten (1500 DOM-Elemente).
    - Scrolle schnell. Ruckelt es? (Virtualisierung nötig?)
- [ ] **AdminAuditLog:**
    - Wenn `admin_actions` 10.000 Zeilen hat. Lädt das Dashboard noch? (Pagination ist hier Pflicht).

## ✅ Abnahme-Kriterien
Das System gilt als "Enterprise Ready", wenn:
1.  Kein RLS-Bypass möglich ist.
2.  Integritäts-Verletzungen im Frontend rot angezeigt werden.
3.  Keine negativen Stunden entstehen.
4.  Netzwerk-Fehler dem User klar kommuniziert werden (kein "Silent Fail").
