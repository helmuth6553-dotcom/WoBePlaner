-- Reset Application Data (Soft Reset) - KORRIGIERT
-- Behält: User, Profile, Roster Months (Struktur)
-- Löscht: Alle Bewegungsdaten (Eintragungen, Urlaube, Zeiten)
-- Reset: Setzt alle Schichten auf "Ursprungszustand" (unbesetzt, nicht dringend)

BEGIN;

-- 1. Zeiterfassung löschen
DELETE FROM public.time_entries;

-- 2. Signaturen löschen
DELETE FROM public.signatures;

-- 3. Logs löschen
DELETE FROM public.shift_logs;

-- 4. Schicht-Interessen (Bewerbungen) löschen
DELETE FROM public.shift_interests;

-- 5. Abwesenheiten (Urlaub/Krank) löschen
DELETE FROM public.absences;

-- 6. Schichten zurücksetzen
UPDATE public.shifts 
SET 
  assigned_to = NULL,
  is_urgent = FALSE;  -- WICHTIG: Dringlichkeit entfernen, da niemand mehr krank ist

COMMIT;

-- Überprüfung
SELECT 
  (SELECT count(*) FROM public.time_entries) as time_entries,
  (SELECT count(*) FROM public.absences) as absences,
  (SELECT count(*) FROM public.shifts WHERE assigned_to IS NOT NULL) as assigned_shifts,
  (SELECT count(*) FROM public.shifts WHERE is_urgent IS TRUE) as urgent_shifts;
