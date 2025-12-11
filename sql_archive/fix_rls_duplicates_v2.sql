-- ===========================================
-- RLS PERFORMANCE FIX V2 - CONSOLIDATION
-- Dienstplan-App - 11.12.2025
-- ===========================================
-- Dieses Script behebt die "Multiple Permissive Policies" Warnungen,
-- indem überlappende Policies zu einer einzigen Policy mit OR-Logik zusammengefasst werden.
-- ===========================================

-- 1. ADMIN ACTIONS (SELECT)
-- Warnung: admin_actions_admin_select UND admin_actions_user_read überlappen
DROP POLICY IF EXISTS "admin_actions_admin_select" ON public.admin_actions;
DROP POLICY IF EXISTS "admin_actions_user_read" ON public.admin_actions;

CREATE POLICY "admin_actions_select" ON public.admin_actions
    FOR SELECT TO public
    USING (
        (target_user_id = (select auth.uid())) 
        OR 
        (EXISTS (SELECT 1 FROM profiles WHERE id = (select auth.uid()) AND role = 'admin'))
    );


-- 2. MONTHLY REPORTS (SELECT)
-- Warnung: Admins view all reports UND Users view own reports überlappen
DROP POLICY IF EXISTS "Admins view all reports" ON public.monthly_reports;
DROP POLICY IF EXISTS "Users view own reports" ON public.monthly_reports;

CREATE POLICY "monthly_reports_select" ON public.monthly_reports
    FOR SELECT TO public
    USING (
        (user_id = (select auth.uid()))
        OR 
        (EXISTS (SELECT 1 FROM profiles WHERE id = (select auth.uid()) AND role = 'admin'))
    );


-- 3. MONTHLY REPORTS (UPDATE)
-- Warnung: Admins update all reports UND Users update own reports überlappen
DROP POLICY IF EXISTS "Admins update all reports" ON public.monthly_reports;
DROP POLICY IF EXISTS "Users update own reports" ON public.monthly_reports;

CREATE POLICY "monthly_reports_update" ON public.monthly_reports
    FOR UPDATE TO public
    USING (
        (user_id = (select auth.uid()))
        OR 
        (EXISTS (SELECT 1 FROM profiles WHERE id = (select auth.uid()) AND role = 'admin'))
    );


-- 4. SIGNATURES (SELECT)
-- Warnung: Admins can view all signatures UND Users can view signatures... überlappen
DROP POLICY IF EXISTS "Admins can view all signatures" ON public.signatures;
DROP POLICY IF EXISTS "Users can view signatures for their own requests" ON public.signatures;

CREATE POLICY "signatures_select" ON public.signatures
    FOR SELECT TO public
    USING (
        (signer_id = (select auth.uid()))
        OR
        (EXISTS (SELECT 1 FROM absences WHERE absences.id = signatures.request_id AND absences.user_id = (select auth.uid())))
        OR
        (EXISTS (SELECT 1 FROM profiles WHERE id = (select auth.uid()) AND role = 'admin'))
    );


-- 5. ABSENCES (SELECT conflict)
-- Warnung: ALLOW_SELECT_ABSENCES_ALL (SELECT=true) und admin_manage_all_absences (ALL=admin)
-- Lösung: Wir entfernen SELECT aus der Admin-Policy, da ALLOW_SELECT_ABSENCES_ALL das bereits erlaubt.
DROP POLICY IF EXISTS "admin_manage_all_absences" ON public.absences;

-- Neue Policy NUR für Write-Operationen (Insert, Update, Delete)
CREATE POLICY "admin_manage_absences_write" ON public.absences
    FOR INSERT TO public
    WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = (select auth.uid()) AND role = 'admin'));

CREATE POLICY "admin_manage_absences_update" ON public.absences
    FOR UPDATE TO public
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = (select auth.uid()) AND role = 'admin'));

CREATE POLICY "admin_manage_absences_delete" ON public.absences
    FOR DELETE TO public
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = (select auth.uid()) AND role = 'admin'));

-- Hinweis: Admin SELECT läuft jetzt über die existierende "ALLOW_SELECT_ABSENCES_ALL" Policy


-- ABSCHLUSS
SELECT 'RLS Performance V2 Fixes successfully applied' as status;
