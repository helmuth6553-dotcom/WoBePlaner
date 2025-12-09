-- Reset Application Data (Soft Reset)
-- Behält: User, Profile, Roster Months (Struktur)
-- Löscht: Alle Bewegungsdaten (Eintragungen, Urlaube, Zeiten)

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

-- 6. Schichten zurücksetzen (nicht löschen!)
-- Wir entfernen nur die Zuweisung, damit sie wieder "frei" sind.
UPDATE public.shifts 
SET assigned_to = NULL;

-- Optional: Wenn es Schichten gibt, die keine "Leerschichten" sind (also reine User-Schichten ohne Roster-Planung?), 
-- könnten diese theoretisch gelöscht werden. 
-- Aber in unserem Modell basieren Schichten meist auf einem Plan. 
-- Falls "Zusatzschichten" existieren, bleiben sie jetzt erhalten, aber leer. 
-- Das ist sicherer als Löschen.

COMMIT;

-- Überprüfung
SELECT 
  (SELECT count(*) FROM public.time_entries) as time_entries_count,
  (SELECT count(*) FROM public.signatures) as signatures_count,
  (SELECT count(*) FROM public.absences) as absences_count,
  (SELECT count(*) FROM public.shifts WHERE assigned_to IS NOT NULL) as assigned_shifts_count;
