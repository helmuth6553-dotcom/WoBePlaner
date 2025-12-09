-- =========================================================
-- Timezone Diagnosis & Fix Script
-- =========================================================

-- 1. DIAGNOSE: Check current times in database
-- This shows what's actually stored
SELECT 
    'SHIFTS' as table_name,
    id,
    type,
    start_time,
    end_time,
    -- Show what time it is in German timezone
    start_time AT TIME ZONE 'Europe/Berlin' as start_german,
    end_time AT TIME ZONE 'Europe/Berlin' as end_german
FROM shifts
WHERE start_time >= '2025-12-01' AND start_time < '2026-01-01'
ORDER BY start_time
LIMIT 10;

-- Expected Result Analysis:
-- If TEAM meeting should be 09:30-11:30 German time:
--   ✅ CORRECT: start_time = '2025-12-10T08:30:00+00:00' (UTC)
--               start_german = '2025-12-10 09:30:00'
--   
--   ❌ WRONG:   start_time = '2025-12-10T09:30:00+00:00' (UTC)
--               start_german = '2025-12-10 10:30:00' (shown as 10:30!)

-- =========================================================

-- 2. DIAGNOSE: Check time_entries too
SELECT 
    'TIME_ENTRIES' as table_name,
    id,
    actual_start,
    actual_end,
    calculated_hours,
    actual_start AT TIME ZONE 'Europe/Berlin' as start_german,
    actual_end AT TIME ZONE 'Europe/Berlin' as end_german
FROM time_entries
WHERE actual_start >= '2025-12-01' AND actual_start < '2026-01-01'
ORDER BY actual_start
LIMIT 10;

-- =========================================================

-- 3. FIX OPTION A: If times are 1 hour TOO LATE (stored as UTC but meant as German time)
-- EXAMPLE: DB has 09:30 UTC but should be 08:30 UTC (to show as 09:30 German)
-- Uncomment to execute:

/*
-- Fix shifts
UPDATE shifts 
SET 
    start_time = start_time - INTERVAL '1 hour',
    end_time = end_time - INTERVAL '1 hour'
WHERE start_time >= '2025-01-01';

-- Fix time_entries
UPDATE time_entries 
SET 
    actual_start = actual_start - INTERVAL '1 hour',
    actual_end = actual_end - INTERVAL '1 hour'
WHERE actual_start >= '2025-01-01';

-- Fix interruptions (JSONB array)
UPDATE time_entries
SET interruptions = (
    SELECT jsonb_agg(
        jsonb_set(
            jsonb_set(
                int,
                '{start}',
                to_jsonb((int->>'start')::timestamp - INTERVAL '1 hour')
            ),
            '{end}',
            to_jsonb((int->>'end')::timestamp - INTERVAL '1 hour')
        )
    )
    FROM jsonb_array_elements(interruptions) as int
)
WHERE interruptions IS NOT NULL 
  AND interruptions != '[]'::jsonb
  AND actual_start >= '2025-01-01';
*/

-- =========================================================

-- 4. VERIFY: After fix, check again
/*
SELECT 
    type,
    start_time,
    start_time AT TIME ZONE 'Europe/Berlin' as should_show_in_ui
FROM shifts
WHERE start_time >= '2025-12-01'
ORDER BY start_time
LIMIT 5;
*/

-- =========================================================
-- DECISION TREE:
-- =========================================================
-- 
-- Run STEP 1 & 2 first. Then:
--
-- Is start_german showing CORRECT times? (e.g. 09:30 for TEAM meeting)
--   ✅ YES → No fix needed! The "+1 hour" display is correct UTC→German conversion
--   ❌ NO  → Times are wrong. Run FIX OPTION A (uncomment section 3)
--
-- After fix: Run STEP 4 to verify
--
