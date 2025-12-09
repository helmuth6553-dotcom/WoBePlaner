-- ACHTUNG: DIESES SKRIPT LÖSCHT ALLE DIENSTPLAN-DATEN!
-- Es bleiben nur die Benutzer-Profile (Mitarbeiter & Admins) erhalten.

BEGIN;

-- 1. Abhängige Tabellen leeren
DELETE FROM shift_interests;
DELETE FROM time_entries;
DELETE FROM absences;

-- Versuche shift_logs zu leeren (falls Tabelle existiert)
DO $$ 
BEGIN 
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'shift_logs') THEN
        DELETE FROM shift_logs;
    END IF;
END $$;

-- 2. Haupttabellen leeren
DELETE FROM shifts;
DELETE FROM roster_months;

COMMIT;

-- Bestätigung
SELECT 'Daten erfolgreich zurückgesetzt. Benutzerprofile sind noch vorhanden.' as status;
