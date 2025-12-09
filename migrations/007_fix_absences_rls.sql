-- =========================================================
-- Migration: Fix Absences RLS Policies
-- Created: 2025-12-07
-- Description: Grants generic FULL access to Admins on absences table
-- =========================================================

-- 1. Drop existing admin policies to avoid conflicts (if they were named predictably)
-- "IF EXISTS" makes this safe even if they don't exist
DROP POLICY IF EXISTS absences_admin_all ON public.absences;
DROP POLICY IF EXISTS admin_all_absences ON public.absences;
DROP POLICY IF EXISTS admin_manage_absences ON public.absences;

-- 2. Create a comprehensive Admin Policy for ALL operations
CREATE POLICY admin_manage_all_absences ON public.absences
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- 3. Verify Policy
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'absences';
