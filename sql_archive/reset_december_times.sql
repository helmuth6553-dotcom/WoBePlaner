-- RESET SCRIPT (Complete Reset for Dec 2025)

-- 1. Reset actual times in time_entries to match the planned shift times
-- This corrects any "Admin edits" or "Hack attempts"
UPDATE public.time_entries te
SET 
    actual_start = s.start_time,
    actual_end = s.end_time,
    calculated_hours = EXTRACT(EPOCH FROM (s.end_time - s.start_time)) / 3600
FROM public.shifts s
WHERE te.shift_id = s.id
AND te.actual_start >= '2025-12-01' 
AND te.actual_start <= '2026-01-01';

-- 2. Delete the monthly report
-- This removes the signature/hash and allows the user to submit again.
DELETE FROM public.monthly_reports 
WHERE year = 2025 AND month = 12;

-- 3. (Optional) Ensure status is back to 'approved' for entries if they were stuck in submitted?
-- Usually handling the report deletion is enough as the UI derives status from it.
