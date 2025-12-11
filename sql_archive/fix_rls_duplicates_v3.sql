-- ===========================================
-- RLS PERFORMANCE FIX V3 - ATOMIC & SAFE
-- Dienstplan-App - 11.12.2025
-- ===========================================
-- Dieses Script wird in einer TRANSACTION ausgeführt.
-- Das bedeutet: Entweder alles funktioniert perfekt, oder NICHTS wird geändert.
-- Es gibt keinen "halben" Zustand.
-- ===========================================

BEGIN;

-- ===========================================
-- 1. ADMIN ACTIONS (Bereinigung)
-- ===========================================

-- Versuche alte Policies zu löschen (mit und ohne Quotes zur Sicherheit)
DROP POLICY IF EXISTS "admin_actions_admin_select" ON public.admin_actions;
DROP POLICY IF EXISTS admin_actions_admin_select ON public.admin_actions;

DROP POLICY IF EXISTS "admin_actions_user_read" ON public.admin_actions;
DROP POLICY IF EXISTS admin_actions_user_read ON public.admin_actions;

-- Falls V2 schon erstellt wurde, löschen wir sie kurz um sie sauber neu zu erstellen
DROP POLICY IF EXISTS "admin_actions_select" ON public.admin_actions;

-- NEU ERSTELLEN (Optimized)
CREATE POLICY "admin_actions_select" ON public.admin_actions
    FOR SELECT TO public
    USING (
        (target_user_id = (select auth.uid())) 
        OR 
        (EXISTS (SELECT 1 FROM profiles WHERE id = (select auth.uid()) AND role = 'admin'))
    );


-- ===========================================
-- 2. MONTHLY REPORTS (Bereinigung SELECT)
-- ===========================================

DROP POLICY IF EXISTS "Admins view all reports" ON public.monthly_reports;
DROP POLICY IF EXISTS "Users view own reports" ON public.monthly_reports;

-- Lösche auch die neue V2 Policy falls existent
DROP POLICY IF EXISTS "monthly_reports_select" ON public.monthly_reports;

-- NEU ERSTELLEN (Optimized)
CREATE POLICY "monthly_reports_select" ON public.monthly_reports
    FOR SELECT TO public
    USING (
        (user_id = (select auth.uid()))
        OR 
        (EXISTS (SELECT 1 FROM profiles WHERE id = (select auth.uid()) AND role = 'admin'))
    );


-- ===========================================
-- 3. MONTHLY REPORTS (Bereinigung UPDATE)
-- ===========================================

DROP POLICY IF EXISTS "Admins update all reports" ON public.monthly_reports;
DROP POLICY IF EXISTS "Users update own reports" ON public.monthly_reports;

-- Lösche auch die neue V2 Policy falls existent
DROP POLICY IF EXISTS "monthly_reports_update" ON public.monthly_reports;

-- NEU ERSTELLEN (Optimized)
CREATE POLICY "monthly_reports_update" ON public.monthly_reports
    FOR UPDATE TO public
    USING (
        (user_id = (select auth.uid()))
        OR 
        (EXISTS (SELECT 1 FROM profiles WHERE id = (select auth.uid()) AND role = 'admin'))
    );

COMMIT;

-- ===========================================
-- 4. PRÜFUNG (Select existing policies names to console)
-- ===========================================

SELECT tablename, policyname 
FROM pg_policies 
WHERE tablename IN ('admin_actions', 'monthly_reports')
ORDER BY tablename, policyname;


-- ===========================================
-- 4. PRÜFUNG (Select existing policies names to console)
-- ===========================================

SELECT tablename, policyname 
FROM pg_policies 
WHERE tablename IN ('admin_actions', 'monthly_reports')
ORDER BY tablename, policyname;
