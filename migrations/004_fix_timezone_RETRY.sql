-- =========================================================
-- FIX: Timezone Correction (Subtract 1 hour from all times)
-- Reason: Times were stored as UTC but meant as German time
-- 
-- BEFORE: 09:30 UTC → shows 10:30 German ❌
-- AFTER:  08:30 UTC → shows 09:30 German ✅
-- =========================================================

-- 1. Fix SHIFTS table
UPDATE shifts 
SET 
    start_time = start_time - INTERVAL '1 hour',
    end_time = end_time - INTERVAL '1 hour'
WHERE start_time >= '2025-01-01';

-- 2. Fix TIME_ENTRIES table
UPDATE time_entries 
SET 
    actual_start = actual_start - INTERVAL '1 hour',
    actual_end = actual_end - INTERVAL '1 hour'
WHERE actual_start >= '2025-01-01';

-- 3. Fix INTERRUPTIONS (breaks) inside time_entries
UPDATE time_entries
SET interruptions = (
    SELECT jsonb_agg(
        jsonb_build_object(
            'start', (int->>'start')::timestamptz - INTERVAL '1 hour',
            'end', (int->>'end')::timestamptz - INTERVAL '1 hour',
            'notes', int->>'notes' -- Preserve notes
        )
    )
    FROM jsonb_array_elements(interruptions) as int
)
WHERE interruptions IS NOT NULL 
  AND jsonb_array_length(interruptions) > 0
  AND actual_start >= '2025-01-01';

-- 4. VERIFY: Check if times look "German" now
-- (e.g. 08:30 UTC instead of 09:30 UTC for a 09:30 shift)
SELECT 
    type,
    start_time as utc_time,
    start_time AT TIME ZONE 'Europe/Berlin' as german_time_shown_in_ui
FROM shifts
WHERE start_time >= '2025-12-01'
ORDER BY start_time
LIMIT 5;
