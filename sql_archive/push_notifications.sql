-- ===========================================
-- Push Notifications Schema
-- ===========================================

-- 1. Create table for push subscriptions
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    -- Prevent duplicate subscriptions for the same browser endpoint
    UNIQUE(endpoint)
);

-- 2. RLS Policies
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Allow users to read their own subscriptions (needed?)
CREATE POLICY "Users can read own subscriptions" ON public.push_subscriptions
    FOR SELECT USING ((select auth.uid()) = user_id);

-- Allow users to insert their own subscriptions
CREATE POLICY "Users can insert own subscriptions" ON public.push_subscriptions
    FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

-- Allow users to delete their own subscriptions (e.g. logout)
CREATE POLICY "Users can delete own subscriptions" ON public.push_subscriptions
    FOR DELETE USING ((select auth.uid()) = user_id);

-- Service Role (Edge Function) needs full access, which it has by default (bypasses RLS)

SELECT 'Created push_subscriptions table' as status;
