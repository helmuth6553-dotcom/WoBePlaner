-- =====================================================
-- Migration: Consolidate coverage + teams RLS policies
-- Datum: 2026-03-13
-- Fixes:
--   1. auth_rls_initplan: auth.uid() → (select auth.uid())
--   2. multiple_permissive_policies on coverage_votes, coverage_requests, teams
-- Strategy: Drop ALL existing policies, recreate clean non-overlapping ones
-- =====================================================

-- =====================================================
-- 1. coverage_votes: clean slate
-- =====================================================
DROP POLICY IF EXISTS "Anyone can read coverage_votes" ON public.coverage_votes;
DROP POLICY IF EXISTS "Users can update own votes" ON public.coverage_votes;
DROP POLICY IF EXISTS "coverage_votes_admin_write" ON public.coverage_votes;
DROP POLICY IF EXISTS "Service can manage coverage_votes" ON public.coverage_votes;

-- SELECT: all authenticated users can read
CREATE POLICY "coverage_votes_select" ON public.coverage_votes
    FOR SELECT TO authenticated
    USING (true);

-- UPDATE: users can update own votes (with initplan optimization)
CREATE POLICY "coverage_votes_update_own" ON public.coverage_votes
    FOR UPDATE TO authenticated
    USING (user_id = (SELECT auth.uid()));

-- INSERT: admin only
CREATE POLICY "coverage_votes_insert_admin" ON public.coverage_votes
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'admin')
    );

-- DELETE: admin only
CREATE POLICY "coverage_votes_delete_admin" ON public.coverage_votes
    FOR DELETE TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'admin')
    );

-- =====================================================
-- 2. coverage_requests: clean slate
-- =====================================================
DROP POLICY IF EXISTS "Anyone can read coverage_requests" ON public.coverage_requests;
DROP POLICY IF EXISTS "coverage_requests_admin_write" ON public.coverage_requests;
DROP POLICY IF EXISTS "Service can manage coverage_requests" ON public.coverage_requests;

-- SELECT: all authenticated users can read
CREATE POLICY "coverage_requests_select" ON public.coverage_requests
    FOR SELECT TO authenticated
    USING (true);

-- INSERT: admin only
CREATE POLICY "coverage_requests_insert_admin" ON public.coverage_requests
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'admin')
    );

-- UPDATE: admin only
CREATE POLICY "coverage_requests_update_admin" ON public.coverage_requests
    FOR UPDATE TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'admin')
    );

-- DELETE: admin only
CREATE POLICY "coverage_requests_delete_admin" ON public.coverage_requests
    FOR DELETE TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'admin')
    );

-- =====================================================
-- 3. teams: remove duplicate SELECT policies
-- =====================================================
DROP POLICY IF EXISTS "authenticated_read_teams" ON public.teams;
DROP POLICY IF EXISTS "teams_admin_all" ON public.teams;
DROP POLICY IF EXISTS "teams_read_authenticated" ON public.teams;

-- SELECT: all authenticated users can read
CREATE POLICY "teams_select" ON public.teams
    FOR SELECT TO authenticated
    USING (true);

-- INSERT/UPDATE/DELETE: admin only
CREATE POLICY "teams_admin_write" ON public.teams
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'admin')
    );

CREATE POLICY "teams_admin_update" ON public.teams
    FOR UPDATE TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'admin')
    );

CREATE POLICY "teams_admin_delete" ON public.teams
    FOR DELETE TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'admin')
    );
