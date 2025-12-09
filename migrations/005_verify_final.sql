-- =========================================================
-- FINAL VERIFICATION
-- Check one example of each shift type to ensure times are correct
-- =========================================================

SELECT 
    type,
    start_time as utc_stored,
    start_time AT TIME ZONE 'Europe/Berlin' as german_ui_time
FROM shifts
WHERE start_time >= '2025-12-01'
-- Get distinct types to check them all
AND id IN (
    SELECT MIN(id) 
    FROM shifts 
    WHERE start_time >= '2025-12-01' 
    GROUP BY type
)
ORDER BY type;

-- CHECKLISTE SOLL-ZUSTAND (Deutsche Zeit):
-- DBD         → 20:00
-- FORTBILDUNG → 10:00
-- ND          → 19:00
-- TD1         → 07:30
-- TEAM        → 09:30 or 10:30 (je nach Plan)
