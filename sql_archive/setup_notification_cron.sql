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

-- 2. Monthly Closing Reminder: Last day of month at 15:00
-- Reminds employees to submit their time entries
SELECT cron.schedule(
    'monthly-closing-cron',
    '0 15 L * *',  -- 15:00 on last day of month (L = last day)
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
