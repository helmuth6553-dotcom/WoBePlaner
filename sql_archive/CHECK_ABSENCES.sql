-- CHECK ABSENCES IN DB
-- Run this in Supabase SQL Editor to see what absences exist

SELECT 
    a.id,
    a.user_id,
    p.full_name,
    a.start_date,
    a.end_date,
    a.status,
    a.type,
    a.planned_hours
FROM absences a
LEFT JOIN profiles p ON a.user_id = p.id
ORDER BY a.start_date DESC
LIMIT 20;
