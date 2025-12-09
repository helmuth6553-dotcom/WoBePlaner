-- Check actual status values in absences table
SELECT 
    id,
    user_id,
    type,
    status,
    start_date,
    end_date,
    created_at
FROM public.absences
ORDER BY created_at DESC
LIMIT 20;

-- Check distinct status values
SELECT DISTINCT status, COUNT(*) as count
FROM public.absences
GROUP BY status
ORDER BY count DESC;
