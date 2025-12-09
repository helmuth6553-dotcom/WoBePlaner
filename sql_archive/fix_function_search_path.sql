-- Fix: Set search_path for security-sensitive functions

-- Fix handle_updated_at function
ALTER FUNCTION public.handle_updated_at() SET search_path = '';

-- Fix is_month_locked function  
ALTER FUNCTION public.is_month_locked(user_uuid uuid, entry_shift_id uuid, entry_date date) SET search_path = '';

-- Verify the changes
SELECT 
    p.proname AS function_name,
    pg_get_function_arguments(p.oid) AS arguments,
    p.prosecdef AS security_definer,
    p.proconfig AS config_settings
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' 
  AND p.proname IN ('handle_updated_at', 'is_month_locked');
