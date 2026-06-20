# Schreibrechte- & Integritäts-Befunde (Stand 2026-06-20)

> **Status: NUR DOKUMENTIERT — bewusst (noch) nicht gefixt.**
> Auf Wunsch festgehalten als Entscheidungsgrundlage. Keine Code-/RLS-Änderung erfolgt.

## Kontext & Abgrenzung

Das DSGVO-Audit (siehe [datensichtbarkeit-landkarte.md](datensichtbarkeit-landkarte.md)) und die anschließende Angriffsflächen-Prüfung deckten **Vertraulichkeit** (wer kann *lesen*) vollständig ab. Diese Datei hält die **Schreib-/Integritäts-Seite** fest: Manipulation durch einen **eingeloggten Mitarbeiter**, der per direktem API-Call (REST/F12) an der UI vorbei seine *eigenen* Datensätze fälscht.

**Wichtige Einordnung:**
- Das sind **keine Daten-Lecks** (kein fremder Datensatz wird sichtbar) — sondern **Integritäts-/Betrugs-Vektoren**.
- Voraussetzung: ein **authentifizierter, böswilliger Insider** (kein externer/anonymer Angreifer).
- Für ein vertrautes 11-Personen-Team ist die Eintrittswahrscheinlichkeit gering → einige Punkte sind ggf. „akzeptiertes Risiko". Finding A hat das größte reale Betrugspotenzial.

## Befunde

### 🔴 A — Mitarbeiter kann eigene Gehalts-/HR-Felder ändern (EMPIRISCH BESTÄTIGT)

**Schweregrad: Medium-High**

Die `profiles`-UPDATE-Policy friert per WITH CHECK nur die `role`-Spalte ein:
```
is_admin() OR (id = auth.uid() AND role = current_profile_role())
```
Es gibt **keinen** Guard auf die übrigen privilegierten Spalten. Ein Mitarbeiter kann seine eigene Zeile updaten und dabei frei setzen:
- `initial_balance` — Überstunden-Startsaldo (= Zeit/Geld, fließt in `balanceHelpers.js`)
- `vacation_days_per_year` — Urlaubsanspruch
- `weekly_hours` — Soll-Wochenstunden (Basis der Saldo-Berechnung)
- `start_date` — Beschäftigungsbeginn

**Beweis** (Testkonto `wobetestmitarbeiter`, Rolle `user`, REST-API, sofort zurückgesetzt):
```
PATCH /rest/v1/profiles initial_balance 0 → 500        → HTTP 204 (übernommen)
PATCH /rest/v1/profiles vacation_days_per_year 25 → 99 → HTTP 200 (übernommen)
```
→ Ein Mitarbeiter kann sich **stillschweigend Überstunden gutschreiben oder Urlaubstage erhöhen** — ohne Admin-Freigabe, ohne Audit-Eintrag.

**Fix-Skizze (für später):** `profiles_update` WITH CHECK für Nicht-Admins auf die unkritischen Spalten beschränken — analog zum `role`-Freeze die privilegierten Spalten gegen `current_*()`-Helper (SECURITY DEFINER, RLS-Bypass) auf den gespeicherten Wert festnageln, **oder** einen `BEFORE UPDATE`-Trigger, der Änderungen an diesen Spalten durch Nicht-Admins ablehnt. (Spaltenweise WITH-CHECK-Freeze braucht je einen rekursionsfreien Helper wie `current_profile_role()`.)

### 🟠 B — Mitarbeiter kann eigenen Urlaub selbst genehmigen (Policy-bestätigt)

**Schweregrad: Medium**

`absences`-UPDATE-Policy (USING = WITH CHECK):
```
user_id = auth.uid() OR is_admin()
```
Kein Guard auf die `status`-Spalte; **kein** `BEFORE UPDATE`-Trigger (nur `trigger_sync_absence` AFTER UPDATE). Ein Mitarbeiter kann den eigenen Antrag per `PATCH /rest/v1/absences status='genehmigt'` **selbst genehmigen** und so die Admin-Freigabe umgehen. (Nicht destruktiv getestet — würde echte Records + `sync_absence_to_time_entries` auslösen — aber die Policy lässt es zu.)

Hinweis: Der `create_signed_absence`-RPC erzwingt für Nicht-Admins korrekt `status='beantragt'`. Der direkte Tabellen-UPDATE umgeht das.

**Fix-Skizze:** `status`-Übergänge für Nicht-Admins per `BEFORE UPDATE`-Trigger einschränken (nur Admin darf `status` ändern), oder WITH-CHECK-Guard.

### 🟡 C — `monthly_reports` Eigen-UPDATE ohne Lock-Guard

**Schweregrad: Low-Medium**

`monthly_reports`-UPDATE erlaubt `user_id = auth.uid() OR admin` (kein Lock-Check). Einziger Trigger ist `monthly_reports_updated_at` (setzt nur `updated_at`). Ein Mitarbeiter könnte den eigenen, signierten Monatsabschluss nachträglich verändern (z.B. `data_hash`). Tragweite hängt davon ab, was `is_month_locked()` genau aus `monthly_reports` liest — potenzieller Self-Unlock-Pfad (nicht abschließend verifiziert).

**Fix-Skizze:** UPDATE auf `monthly_reports` nach dem Abschluss auf Admin beschränken bzw. `data_hash`/Lock-Felder gegen Eigen-Änderung schützen.

### 🟡 D — `time_entries` INSERT ohne Lock-Check

**Schweregrad: Low-Medium**

`time_entries`-INSERT WITH CHECK: `user_id = auth.uid() AND NOT is_viewer()` — **kein** `is_month_locked`-Check (nur UPDATE/DELETE prüfen den Lock). Ein Mitarbeiter könnte **neue** Zeiteinträge in einen bereits gesperrten Monat einfügen, die nicht im signierten `data_hash` enthalten sind.

**Fix-Skizze:** `is_month_locked(...)`-Bedingung auch in die INSERT-WITH-CHECK aufnehmen.

## Sauber bestätigt (kein Handlungsbedarf)

- **Stored XSS:** kein `dangerouslySetInnerHTML`/`innerHTML`/`document.write` im Produktionscode → kein Sink.
- **`admin_actions`:** keine UPDATE/DELETE-Policy → Audit-Log ist append-only (auch Admins können nicht löschen/ändern).
- **Alle übrigen Schreib-Policies** (`shifts`, `roster_months`, `coverage_*`, `balance_corrections`, `signatures`, `push_subscriptions`, `notification_preferences`, `calendar_tokens`, `teams`, `roster_templates`, `shift_time_configs`, `shift_interests`): korrekt `eigene OR Admin` + `NOT is_viewer()`.

## Noch nicht getestete Flächen (separat)

- **Account-Takeover:** Passwort-Reset-Flow, kein MFA, Login-Rate-Limiting (Brute-Force). Supabase-Auth-Standard, größtenteils Config. (Leaked Password Protection separat aktiviert.)
- **Dependency-Vulns:** Dependabot meldet 16 (1 high) — Supply-Chain.
- **GraphQL `/graphql/v1`:** gleiche RLS wie REST → durch das Lese-Audit abgedeckt.
- **Realtime Broadcast/Presence:** `postgres_changes` ist RLS-gated; Broadcast/Presence nicht geprüft.
