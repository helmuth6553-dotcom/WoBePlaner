-- =========================================================
-- FIX: Timezone Correction (Subtract 1 hour from all times)
-- Reason: Times were stored as UTC but meant as German time
-- 
-- BEFORE: 09:30 UTC → shows 10:30 German ❌
-- AFTER:  08:30 UTC → shows 09:30 German ✅
-- =========================================================

-- BACKUP FIRST! (Optional but recommended)
-- CREATE TABLE shifts_backup AS SELECT * FROM shifts;
-- CREATE TABLE time_entries_backup AS SELECT * FROM time_entries;

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
            'note', int->>'note'
        )
    )
    FROM jsonb_array_elements(interruptions) as int
)
WHERE interruptions IS NOT NULL 
  AND interruptions != '[]'::jsonb
  AND actual_start >= '2025-01-01';

-- 4. VERIFY: Check results
SELECT 
    'AFTER_FIX' as status,
    type,
    start_time as utc_time,
    start_time AT TIME ZONE 'Europe/Berlin' as german_time_shown_in_ui
FROM shifts
WHERE start_time >= '2025-12-01'
ORDER BY start_time
LIMIT 5;

-- Expected result:
-- TEAM: 08:30:00+00 → 09:30 German ✅
-- FORTBILDUNG: 09:00:00+00 → 10:00 German ✅
