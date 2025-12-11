-- ===========================================
-- CHECK PUSH SUBSCRIPTIONS
-- ===========================================

-- 1. Check if there are ANY subscriptions
SELECT count(*) as total_subscriptions FROM public.push_subscriptions;

-- 2. Check details of subscriptions (with user names)
SELECT 
    ps.id,
    ps.created_at,
    p.full_name,
    p.username,
    ps.user_id,
    substring(ps.endpoint from 1 for 30) || '...' as endpoint_preview
FROM 
    public.push_subscriptions ps
LEFT JOIN 
    public.profiles p ON ps.user_id = p.id;

-- 3. Check recent executions of the webhook (NOTE: This table might not be visible to you depending on permissions)
-- SELECT * FROM net.http_request_queue ORDER BY created_at DESC LIMIT 5;
