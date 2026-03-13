-- =====================================================
-- Migration: Fix Supabase Linter Warnings
-- Datum: 2026-03-13
-- Fixes:
--   1. function_search_path_mutable: assign_coverage
--   2. rls_policy_always_true: coverage_votes + coverage_requests
-- =====================================================

-- 1. Fix assign_coverage: Set search_path to prevent mutable path
CREATE OR REPLACE FUNCTION public.assign_coverage(
    p_shift_id integer,
    p_user_id uuid,
    p_resolved_by uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- 1. Create or update the shift interest (marks the shift as taken)
    INSERT INTO public.shift_interests (shift_id, user_id, is_flex)
    VALUES (p_shift_id, p_user_id, true)
    ON CONFLICT (shift_id, user_id) DO UPDATE SET is_flex = true;

    -- 2. Mark the coverage request as assigned
    UPDATE public.coverage_requests
    SET status = 'assigned',
        assigned_to = p_user_id,
        resolved_by = p_resolved_by,
        resolved_at = now()
    WHERE shift_id = p_shift_id;
END;
$$;

-- 2. Fix overly permissive "Service can manage" policies
-- These used FOR ALL USING (true) which allows ANY user full access.
-- Replace with admin-only write policies.

-- coverage_votes: drop the permissive policy, add admin-only write
DROP POLICY IF EXISTS "Service can manage coverage_votes" ON public.coverage_votes;
CREATE POLICY "coverage_votes_admin_write" ON public.coverage_votes
    FOR ALL
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'admin')
    );

-- coverage_requests: drop the permissive policy, add admin-only write
DROP POLICY IF EXISTS "Service can manage coverage_requests" ON public.coverage_requests;
CREATE POLICY "coverage_requests_admin_write" ON public.coverage_requests
    FOR ALL
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'admin')
    );
