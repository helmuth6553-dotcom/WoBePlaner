-- =========================================================================
-- RESET ALL DATA (Supabase)
--
-- Löscht alle Einträge und setzt den Dienstplan komplett zurück.
-- Profile (Benutzerkonten) bleiben erhalten!
--
-- Ausführen im Supabase SQL Editor:
--   Dashboard → SQL Editor → New Query → Einfügen → Run
-- =========================================================================

BEGIN;

-- 1. Abhängige Tabellen zuerst (Foreign Keys)
DELETE FROM coverage_votes;
DELETE FROM shift_interests;
DELETE FROM coverage_requests;
DELETE FROM shift_logs;
DELETE FROM shifts;
DELETE FROM roster_months;

-- 2. Zeiterfassung & Berichte
DELETE FROM time_entries;
DELETE FROM monthly_reports;
DELETE FROM balance_corrections;

-- 3. Abwesenheiten & Signaturen
DELETE FROM signatures;
DELETE FROM absences;

-- 4. Admin & Audit
DELETE FROM admin_actions;

-- 5. Einladungen
DELETE FROM invitations;

-- 6. Benachrichtigungen
DELETE FROM notification_preferences;
DELETE FROM push_subscriptions;

COMMIT;

-- =========================================================================
-- NICHT gelöscht (absichtlich):
--   - profiles        → Benutzerkonten bleiben erhalten
--   - auth.users      → Supabase Auth bleibt erhalten
--
-- Falls auch Profile zurückgesetzt werden sollen (VORSICHT!):
--   UPDATE profiles SET password_set = false;
-- =========================================================================
