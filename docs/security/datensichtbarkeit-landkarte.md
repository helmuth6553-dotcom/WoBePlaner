# Datensichtbarkeits-Landkarte (Stand 2026-06-20)

Vollständige Bestandsaufnahme: wer kann welche Tabelle **lesen** (SELECT), wie
sensibel sind die Daten, und was bricht, wenn man auf `eigene + Admin`
einschränkt. Erstellt als Entscheidungsgrundlage „fixen vs. neu bauen".

**Grundbefund:** RLS ist auf allen 20 Tabellen aktiv. `anon` (nicht eingeloggt)
ist überall effektiv gesperrt (alle `USING(true)`-Policies sind `TO authenticated`;
die `{public}`-Policies haben `auth.uid()`-Bedingungen, die für anon leer sind).
Schreibrechte (INSERT/UPDATE/DELETE) sind durchgängig korrekt auf `eigene + Admin`
beschränkt. **Das einzige Problem ist Lesesicht (SELECT) bei wenigen Tabellen.**

## 🔴 Sensibel + zu offen (Fix nötig) — 3 Tabellen

| Tabelle | Sensible Spalten | Aktuelle SELECT-Sicht | Cross-User-Leser (Client) | Bricht bei Restriktion → Lösung |
|---|---|---|---|---|
| **profiles** | email, initial_balance, weekly_hours, vacation_days_per_year, start_date, username | **alle authenticated** (`USING(true)`) | Namen im Roster (DayCard); Kollegen-Salden (weekly_hours/start_date/initial_balance/vacation_days) | Roster-Namen → **View `team_members`** (nur id/Name/role). Salden → **Edge Function** (server-seitig rechnen) |
| **absences** | type=**Krank** (Gesundheit, Art. 9), planned_hours | **alle authenticated** (`USING(true)`) | Roster „Abwesend"-Marker (DayCard); Urlaubs-Überschneidung (AbsencePlanner); Kollegen-Salden (Urlaubsstunden) | „Abwesend"-Anzeige → **View `team_absences`** (Grund redigiert). Salden → **Edge Function** |
| **time_entries** | actual_start/end (Kommt/Geht), admin_note, employee_note | **alle authenticated** (`USING(true)`) | Nur Kollegen-Salden (calculated_hours) | Salden → **Edge Function** (genaue Zeiten verlassen DB nie). Sonst kein Mitarbeiter-Leser |

## 🟡 Offen, aber gering/operativ sensibel (prüfen, vermutlich OK)

| Tabelle | SELECT-Sicht | Bewertung |
|---|---|---|
| **shift_interests** | alle authenticated (`USING(true)`) | „Wer ist in welchem Dienst eingetragen" = der Dienstplan selbst. Teamweit **gewollt**. Enthält `availability_preference`, `is_training` (minimal). Restriktion würde den Roster zerstören → **so lassen** |
| **coverage_votes** | alle authenticated (`USING(true)`) | Soli-Abstimmungen (user_id, availability_preference). Feature **deaktiviert** (`USE_COVERAGE_VOTING=false`). Bei Aktivierung für Employees anonymisiert. → niedrige Prio |
| **coverage_requests** | alle authenticated (`USING(true)`) | Nur shift_id/status. Feature aus. Unkritisch |

## 🟢 Korrekt beschränkt oder unkritisch (OK) — kein Handlungsbedarf

| Tabelle | SELECT-Sicht | Warum OK |
|---|---|---|
| **signatures** | eigene Signatur OR eigene Abwesenheit OR Admin | sauber scoped ✓ |
| **monthly_reports** | eigene OR Admin | sauber ✓ |
| **balance_corrections** | eigene OR Admin | sauber ✓ |
| **admin_actions** | eigene (als Ziel) OR Admin | sauber ✓ (Audit-Log) |
| **calendar_tokens** | eigene | sauber ✓ |
| **push_subscriptions** | eigene | sauber ✓ |
| **notification_preferences** | eigene | sauber ✓ |
| **invitations** | nur Admin | sauber ✓ (enthält email/Salär neuer MA) |
| **roster_templates** | nur Admin | sauber ✓ |
| **shift_logs** | nur Admin | sauber ✓ |
| **shifts** | alle (außer Typ `MITARBEITERGESPRAECH` = eigene/Admin) | Dienste sind teamweit; der sensible Typ ist bereits geschützt ✓ |
| **shift_time_configs** | alle authenticated | reine Konfiguration, unkritisch ✓ |
| **roster_months** | alle authenticated | nur offen/sichtbar-Flags, unkritisch ✓ |
| **teams** | alle authenticated | Team-Konfiguration, unkritisch ✓ |

## Fazit

- **Echte Verletzungen: genau 3 Tabellen** (profiles, absences, time_entries) — alle bekannt, alle mit klarer Lösung.
- **Alles andere ist entweder korrekt beschränkt oder unkritisch.** Kein einziger weiterer „F12-Leak" von Personaldaten.
- **Schreibrechte & anon-Zugriff: sauber.** Die Sicherheits-Grundstruktur (RLS überall, rollenbasiert) steht.

## Bounded Fix (kein Rewrite nötig)

3 Bausteine lösen alle 3 Verletzungen:
1. **View `team_members`** (id, full_name, display_name, role) → Roster-Namen.
2. **View `team_absences`** (Datum + „Abwesend" statt Grund) → Roster-Abwesenheit + Urlaubs-Überschneidung.
3. **Edge Function `team-balances`** (importiert `balanceHelpers.js`, rechnet server-seitig) → Kollegen-Salden ohne Rohdaten.

Danach: `profiles`, `absences`, `time_entries` SELECT → `eigene + Admin`.
Ergebnis: keine Personaldaten mehr per API/F12, alle Features bleiben funktional.
