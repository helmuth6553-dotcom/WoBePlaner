-- =========================================================
-- Migration: Fix Audit Log RLS Policies
-- Created: 2025-12-07
-- Description: Explicitly allows INSERT for admins on admin_actions
-- =========================================================

-- 1. Drop the old ambiguous policy
DROP POLICY IF EXISTS admin_actions_admin_all ON public.admin_actions;

-- 2. Create specific SELECT policy for Admins (Read all)
CREATE POLICY admin_actions_admin_select ON public.admin_actions
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- 3. Create specific INSERT policy for Admins (Write)
CREATE POLICY admin_actions_admin_insert ON public.admin_actions
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- 4. Verify Policy Existence (Optional select to confirm execution)
SELECT count(*) FROM pg_policies WHERE tablename = 'admin_actions';
