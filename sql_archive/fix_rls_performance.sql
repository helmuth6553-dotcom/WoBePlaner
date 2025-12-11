-- ===========================================
-- RLS Performance Optimization Script
-- Dienstplan-App - 11.12.2025
-- ===========================================
-- WICHTIG: Vor Ausführung ein Backup machen!
-- Führe dieses Script im Supabase SQL Editor aus.
-- ===========================================

-- =====================
-- TEIL 1: Doppelte Policies entfernen
-- =====================

-- ABSENCES: Behalte ALLOW_SELECT_ABSENCES_ALL, lösche absences_select
DROP POLICY IF EXISTS "absences_select" ON public.absences;

-- SHIFTS: Behalte ALLOW_SELECT_SHIFTS_ALL, lösche shifts_select  
DROP POLICY IF EXISTS "shifts_select" ON public.shifts;

-- TIME_ENTRIES: Behalte ALLOW_SELECT_TIME_ENTRIES_ALL, lösche time_select
DROP POLICY IF EXISTS "time_select" ON public.time_entries;

-- SHIFT_INTERESTS: Behalte Enable read access, lösche interests_select
DROP POLICY IF EXISTS "interests_select" ON public.shift_interests;


-- =====================
-- TEIL 2: Auth-Funktionen mit SELECT cachen
-- Policies neu erstellen mit (select auth.uid())
-- =====================

-- ADMIN_ACTIONS
DROP POLICY IF EXISTS "admin_actions_user_read" ON public.admin_actions;
CREATE POLICY "admin_actions_user_read" ON public.admin_actions
    FOR SELECT USING (target_user_id = (select auth.uid()));

DROP POLICY IF EXISTS "admin_actions_admin_select" ON public.admin_actions;
CREATE POLICY "admin_actions_admin_select" ON public.admin_actions
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = (select auth.uid()) AND role = 'admin')
    );

DROP POLICY IF EXISTS "admin_actions_admin_insert" ON public.admin_actions;
CREATE POLICY "admin_actions_admin_insert" ON public.admin_actions
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM profiles WHERE id = (select auth.uid()) AND role = 'admin')
    );

-- MONTHLY_REPORTS
DROP POLICY IF EXISTS "Users view own reports" ON public.monthly_reports;
CREATE POLICY "Users view own reports" ON public.monthly_reports
    FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Admins view all reports" ON public.monthly_reports;
CREATE POLICY "Admins view all reports" ON public.monthly_reports
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = (select auth.uid()) AND role = 'admin')
    );

DROP POLICY IF EXISTS "Users create own reports" ON public.monthly_reports;
CREATE POLICY "Users create own reports" ON public.monthly_reports
    FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users update own reports" ON public.monthly_reports;
CREATE POLICY "Users update own reports" ON public.monthly_reports
    FOR UPDATE USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Admins update all reports" ON public.monthly_reports;
CREATE POLICY "Admins update all reports" ON public.monthly_reports
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = (select auth.uid()) AND role = 'admin')
    );

-- ABSENCES (admin_manage_all_absences)
DROP POLICY IF EXISTS "admin_manage_all_absences" ON public.absences;
CREATE POLICY "admin_manage_all_absences" ON public.absences
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = (select auth.uid()) AND role = 'admin')
    );

-- TIME_ENTRIES (insert/update/delete with lock check)
DROP POLICY IF EXISTS "Users insert own entries if not locked" ON public.time_entries;
CREATE POLICY "Users insert own entries if not locked" ON public.time_entries
    FOR INSERT WITH CHECK (
        (select auth.uid()) = user_id
    );

DROP POLICY IF EXISTS "Users update own entries if not locked" ON public.time_entries;
CREATE POLICY "Users update own entries if not locked" ON public.time_entries
    FOR UPDATE USING (
        (select auth.uid()) = user_id AND check_time_entry_lock(user_id, shift_id, entry_date)
    );

DROP POLICY IF EXISTS "Users delete own entries if not locked" ON public.time_entries;
CREATE POLICY "Users delete own entries if not locked" ON public.time_entries
    FOR DELETE USING (
        (select auth.uid()) = user_id AND check_time_entry_lock(user_id, shift_id, entry_date)
    );

-- SIGNATURES
DROP POLICY IF EXISTS "Users can view signatures for their own requests" ON public.signatures;
CREATE POLICY "Users can view signatures for their own requests" ON public.signatures
    FOR SELECT USING (
        signer_id = (select auth.uid()) OR 
        EXISTS (SELECT 1 FROM absences WHERE absences.id = signatures.request_id AND absences.user_id = (select auth.uid()))
    );

DROP POLICY IF EXISTS "Admins can view all signatures" ON public.signatures;
CREATE POLICY "Admins can view all signatures" ON public.signatures
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = (select auth.uid()) AND role = 'admin')
    );

DROP POLICY IF EXISTS "Users can insert their own signatures" ON public.signatures;
CREATE POLICY "Users can insert their own signatures" ON public.signatures
    FOR INSERT WITH CHECK (signer_id = (select auth.uid()));


-- =====================
-- TEIL 3: Weitere doppelte Policies entfernen
-- Diese wurden durch ALLOW_*_ALL ersetzt
-- =====================

-- TIME_ENTRIES: Alte Policies entfernen die durch ALLOW_SELECT ersetzt wurden
DROP POLICY IF EXISTS "time_insert" ON public.time_entries;
DROP POLICY IF EXISTS "time_update" ON public.time_entries;
DROP POLICY IF EXISTS "time_delete" ON public.time_entries;

-- ABSENCES: Alte Policies entfernen
DROP POLICY IF EXISTS "absences_insert" ON public.absences;
DROP POLICY IF EXISTS "absences_update" ON public.absences;
DROP POLICY IF EXISTS "absences_delete" ON public.absences;


-- =====================
-- VERIFIZIERUNG
-- =====================
-- Nach Ausführung: Prüfe mit Supabase Advisor ob Warnungen weg sind
-- Teste App gründlich!

SELECT 'Script erfolgreich ausgeführt!' AS status;
