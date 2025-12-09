-- =========================================================
-- Reset December 2025 Report
-- Purpose: Delete submission so user can re-submit with new hash version
-- =========================================================

-- Delete the monthly report for December 2025
-- This allows Christopher to submit again with the new hash_version field
DELETE FROM public.monthly_reports 
WHERE year = 2025 
  AND month = 12;

-- Optional: Also reset the time_entry times to original shift times
-- (Only if you want to test from a completely clean slate)
-- Uncomment if needed:
/*
UPDATE public.time_entries te
SET 
    actual_start = s.start_time,
    actual_end = s.end_time,
    calculated_hours = EXTRACT(EPOCH FROM (s.end_time - s.start_time)) / 3600
FROM public.shifts s
WHERE te.shift_id = s.id
  AND te.actual_start >= '2025-12-01' 
  AND te.actual_start < '2026-01-01';
*/

-- Verify deletion
SELECT 
    COUNT(*) as remaining_reports,
    year,
    month
FROM public.monthly_reports
WHERE year = 2025
GROUP BY year, month;

-- Expected: No rows for December 2025
