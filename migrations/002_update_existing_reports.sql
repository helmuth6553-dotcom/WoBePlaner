-- Quick Test: Update existing Christopher report to v1
-- Run this AFTER the main migration

-- Update Christopher's December report to have hash_version
UPDATE public.monthly_reports 
SET hash_version = 'v1' 
WHERE year = 2025 
  AND month = 12
  AND hash_version IS NULL;

-- Verify it worked
SELECT 
    user_id,
    year,
    month,
    status,
    hash_version,
    submitted_at
FROM public.monthly_reports
WHERE year = 2025 AND month = 12;
