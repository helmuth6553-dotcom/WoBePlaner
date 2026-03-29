-- =====================================================
-- Cron Jobs for Push Notifications
-- Created: 2025-12-21
-- 
-- IMPORTANT: pg_cron must be enabled in Supabase Dashboard
-- Go to: Database → Extensions → Enable pg_cron
-- =====================================================

-- To run these, you need to be in the Supabase SQL Editor
-- and replace YOUR_PROJECT_REF with your actual project ID

-- 1. Shift Reminder: Every 5 minutes
-- Checks for shifts starting in 10-15 minutes
SELECT cron.schedule(
    'shift-reminder-cron',
    '*/5 * * * *',  -- Every 5 minutes
    $$
    SELECT net.http_post(
        url := 'https://snxhcaruybvfyvcxtnrw.supabase.co/functions/v1/notify-shift-reminder',
        headers := '{"Content-Type": "application/json", "Authorization": "Bearer PASTE_YOUR_SERVICE_ROLE_KEY_HERE"}'::jsonb,
        body := '{}'::jsonb
    ) as request_id;
    $$
);

-- 2. Monthly Closing Reminder: Last day of month at 15:00 Vienna time (DST-aware)
-- Fires at 13:00 UTC (= 15:00 CEST, summer) AND 14:00 UTC (= 15:00 CET, winter)
-- The function itself checks if Vienna time is 15:xx and skips otherwise
SELECT cron.schedule(
    'monthly-closing-cron',
    '0 13,14 L * *',  -- 13:00 + 14:00 UTC on last day (covers CET and CEST)
    $$
    SELECT net.http_post(
        url := 'https://snxhcaruybvfyvcxtnrw.supabase.co/functions/v1/notify-monthly-closing',
        headers := '{"Content-Type": "application/json", "Authorization": "Bearer PASTE_YOUR_SERVICE_ROLE_KEY_HERE"}'::jsonb,
        body := '{}'::jsonb
    ) as request_id;
    $$
);

-- =====================================================
-- VERIFICATION COMMANDS
-- =====================================================

-- Check scheduled jobs
SELECT * FROM cron.job;

-- Check recent job runs
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;

-- =====================================================
-- TO DELETE JOBS (if needed)
-- =====================================================

-- SELECT cron.unschedule('shift-reminder-cron');
-- SELECT cron.unschedule('monthly-closing-cron');
