-- Reset Application Data (Soft Reset) - VERSION 3
-- Behält: User, Profile, Roster Months
-- Löscht: Bewegungsdaten
-- Reset: Schichten werden geleert und Dringlichkeit entfernt.

BEGIN;

-- 1. Tabellen leeren
DELETE FROM public.time_entries;
DELETE FROM public.signatures;
DELETE FROM public.shift_logs;
DELETE FROM public.shift_interests;
DELETE FROM public.absences;

-- 2. Schichten zurücksetzen
-- assigned_to -> NULL (Niemand eingeteilt)
-- urgent_since -> NULL (Dringlichkeit entfernt)
UPDATE public.shifts 
SET 
  assigned_to = NULL,
  urgent_since = NULL;

COMMIT;

-- Check
SELECT 
  (SELECT count(*) FROM public.time_entries) as time_entries,
  (SELECT count(*) FROM public.shifts WHERE assigned_to IS NOT NULL) as assigned_shifts,
  (SELECT count(*) FROM public.shifts WHERE urgent_since IS NOT NULL) as urgent_shifts;
