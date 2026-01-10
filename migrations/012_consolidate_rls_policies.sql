-- =====================================================
-- Migration 012: Consolidate RLS Policies for Performance
-- Created: 2026-01-08
-- Purpose: Fix "Multiple Permissive Policies" warnings by
--          consolidating duplicate policies into single policies
-- =====================================================

-- =====================================================
-- 1. FIX: absences table (DELETE, INSERT, UPDATE)
-- =====================================================

-- Drop the overlapping policies
DROP POLICY IF EXISTS "absences_delete_own" ON public.absences;
DROP POLICY IF EXISTS "admin_manage_absences_delete" ON public.absences;
DROP POLICY IF EXISTS "absences_insert_own" ON public.absences;
DROP POLICY IF EXISTS "admin_manage_absences_write" ON public.absences;
DROP POLICY IF EXISTS "absences_update_own" ON public.absences;
DROP POLICY IF EXISTS "admin_manage_absences_update" ON public.absences;
DROP POLICY IF EXISTS "admin_manage_all_absences" ON public.absences;

-- Create consolidated policies for absences
CREATE POLICY "absences_delete_consolidated" ON public.absences
    FOR DELETE
    USING (
        user_id = (SELECT auth.uid())
        OR 
        EXISTS (SELECT 1 FROM profiles WHERE id = (SELECT auth.uid()) AND role = 'admin')
    );

CREATE POLICY "absences_insert_consolidated" ON public.absences
    FOR INSERT
    WITH CHECK (
        user_id = (SELECT auth.uid())
        OR 
        EXISTS (SELECT 1 FROM profiles WHERE id = (SELECT auth.uid()) AND role = 'admin')
    );

CREATE POLICY "absences_update_consolidated" ON public.absences
    FOR UPDATE
    USING (
        user_id = (SELECT auth.uid())
        OR 
        EXISTS (SELECT 1 FROM profiles WHERE id = (SELECT auth.uid()) AND role = 'admin')
    );

-- =====================================================
-- 2. FIX: balance_corrections table (SELECT)
-- =====================================================

-- Drop the overlapping policies
DROP POLICY IF EXISTS "Admins can manage corrections" ON public.balance_corrections;
DROP POLICY IF EXISTS "Users can view own corrections" ON public.balance_corrections;

-- Create consolidated SELECT policy
CREATE POLICY "balance_corrections_select_consolidated" ON public.balance_corrections
    FOR SELECT
    USING (
        user_id = (SELECT auth.uid())
        OR 
        EXISTS (SELECT 1 FROM profiles WHERE id = (SELECT auth.uid()) AND role = 'admin')
    );

-- Keep admin-only write policies (these are fine as-is)
-- Re-create admin INSERT/UPDATE/DELETE if they were dropped
CREATE POLICY "balance_corrections_admin_write" ON public.balance_corrections
    FOR INSERT
    WITH CHECK (
        EXISTS (SELECT 1 FROM profiles WHERE id = (SELECT auth.uid()) AND role = 'admin')
    );

CREATE POLICY "balance_corrections_admin_update" ON public.balance_corrections
    FOR UPDATE
    USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = (SELECT auth.uid()) AND role = 'admin')
    );

CREATE POLICY "balance_corrections_admin_delete" ON public.balance_corrections
    FOR DELETE
    USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = (SELECT auth.uid()) AND role = 'admin')
    );

-- =====================================================
-- 3. FIX: time_entries table (UPDATE)
-- =====================================================

-- Drop the overlapping UPDATE policies
DROP POLICY IF EXISTS "Admins update all time entries" ON public.time_entries;
DROP POLICY IF EXISTS "Users update own entries if not locked" ON public.time_entries;

-- Create consolidated UPDATE policy
-- Note: Admins can always update, users can only update if not locked
CREATE POLICY "time_entries_update_consolidated" ON public.time_entries
    FOR UPDATE
    USING (
        -- Admin can update any entry
        EXISTS (SELECT 1 FROM profiles WHERE id = (SELECT auth.uid()) AND role = 'admin')
        OR 
        -- User can update own entry if month is not locked
        (
            user_id = (SELECT auth.uid())
            AND NOT public.is_month_locked(
                (SELECT auth.uid()), 
                (SELECT date(start_time) FROM public.shifts WHERE id = shift_id)
            )
        )
    );

-- =====================================================
-- 4. FIX: Function search_path (Security Warning)
-- =====================================================

ALTER FUNCTION public.update_notification_preferences_updated_at() 
SET search_path = '';

-- =====================================================
-- 5. Verification
-- =====================================================

SELECT 'RLS Policy Consolidation Complete' as status;

-- List all policies on affected tables for verification
SELECT 
    schemaname,
    tablename,
    policyname,
    cmd as action
FROM pg_policies 
WHERE tablename IN ('absences', 'balance_corrections', 'time_entries')
ORDER BY tablename, cmd, policyname;
