-- =====================================================
-- Update Monthly Closing Cron for DST correctness
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor)
-- =====================================================
--
-- Problem: '0 15 L * *' fires at 15:00 UTC which is
--   16:00 CET (winter) or 17:00 CEST (summer) — never 15:00 Vienna time.
--
-- Fix: Fire at 13:00 AND 14:00 UTC on last day of month.
--   The Edge Function itself checks Vienna time and only sends at 15:xx.
--   13:00 UTC = 15:00 CEST (summer), 14:00 UTC = 15:00 CET (winter)
-- =====================================================

SELECT cron.unschedule('monthly-closing-cron');

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

-- Verify:
SELECT jobname, schedule, command FROM cron.job WHERE jobname = 'monthly-closing-cron';
