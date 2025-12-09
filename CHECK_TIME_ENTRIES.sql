-- FIND CORRUPTED TIME ENTRIES
-- Looking for entries with impossible times or wrong hours

SELECT 
    te.id,
    te.user_id,
    p.full_name,
    te.entry_date,
    te.actual_start,
    te.actual_end,
    te.calculated_hours,
    te.absence_id,
    a.type as absence_type,
    a.status as absence_status
FROM time_entries te
LEFT JOIN profiles p ON te.user_id = p.id
LEFT JOIN absences a ON te.absence_id = a.id
WHERE te.user_id IN (SELECT id FROM profiles WHERE full_name LIKE '%Christopher%')
ORDER BY te.entry_date DESC
LIMIT 30;
