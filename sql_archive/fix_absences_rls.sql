-- ===========================================
-- FIX RLS: Restore User Permissions for Absences
-- ===========================================
-- Problem: The previous performance script removed the ability for 
-- regular users to insert/update/delete their own absences.
-- This script restores those permissions.

-- 1. Drop potentially conflicting old policies (just to be safe)
DROP POLICY IF EXISTS "absences_insert" ON public.absences;
DROP POLICY IF EXISTS "absences_update" ON public.absences;
DROP POLICY IF EXISTS "absences_delete" ON public.absences;

DROP POLICY IF EXISTS "absences_insert_own" ON public.absences;
DROP POLICY IF EXISTS "absences_update_own" ON public.absences;
DROP POLICY IF EXISTS "absences_delete_own" ON public.absences;

-- 2. Create policies for users to manage THEIR OWN absences

-- INSERT: User can create an absence if the user_id matches their own ID
CREATE POLICY "absences_insert_own" ON public.absences
    FOR INSERT WITH CHECK (
        (select auth.uid()) = user_id
    );

-- UPDATE: User can update their own absence (e.g. change dates)
CREATE POLICY "absences_update_own" ON public.absences
    FOR UPDATE USING (
        (select auth.uid()) = user_id
    );

-- DELETE: User can delete their own absence
CREATE POLICY "absences_delete_own" ON public.absences
    FOR DELETE USING (
        (select auth.uid()) = user_id
    );

SELECT 'Fixed absence RLS policies' as status;
