-- =====================================================
-- Migration: Absences DELETE + UPDATE RLS Policies
-- Datum: 2026-03-29
-- Zweck: Mitarbeiter dürfen eigene Krankmeldungen löschen
--        und kürzen (end_date anpassen).
--        Admins dürfen alle Einträge bearbeiten.
-- Idempotent: DROP IF EXISTS vor CREATE
-- =====================================================

-- Alte/doppelte Policies entfernen (aus sql_archive, falls bereits aktiv)
DROP POLICY IF EXISTS "absences_delete_consolidated" ON public.absences;
DROP POLICY IF EXISTS "absences_update_consolidated" ON public.absences;
DROP POLICY IF EXISTS "absences_delete_own"           ON public.absences;
DROP POLICY IF EXISTS "absences_update_own"           ON public.absences;
DROP POLICY IF EXISTS "absences_delete_policy"        ON public.absences;
DROP POLICY IF EXISTS "absences_update_policy"        ON public.absences;

-- DELETE: eigene Einträge + Admin-Override
CREATE POLICY "absences_delete_policy" ON public.absences
    FOR DELETE
    USING (
        user_id = (SELECT auth.uid())
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = (SELECT auth.uid()) AND role = 'admin'
        )
    );

-- UPDATE: eigene Einträge + Admin-Override
CREATE POLICY "absences_update_policy" ON public.absences
    FOR UPDATE
    USING (
        user_id = (SELECT auth.uid())
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = (SELECT auth.uid()) AND role = 'admin'
        )
    )
    WITH CHECK (
        user_id = (SELECT auth.uid())
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = (SELECT auth.uid()) AND role = 'admin'
        )
    );
