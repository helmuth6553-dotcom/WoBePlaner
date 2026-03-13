-- =====================================================
-- Migration: Security Audit Fix
-- Datum: 2026-03-13
-- Zweck: Sicherstellen dass ALLE Tabellen RLS aktiviert haben
--        und nur authentifizierte User Daten lesen können
-- =====================================================

-- 1. RLS auf allen Tabellen sicherstellen (idempotent - schadet nicht wenn schon aktiv)
ALTER TABLE IF EXISTS public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.shift_interests ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.absences ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.coverage_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.shift_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.admin_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.balance_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.monthly_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.coverage_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.roster_months ENABLE ROW LEVEL SECURITY;

-- 2. Teams-Tabelle: Policies erstellen (falls noch keine existieren)
DO $$
BEGIN
  -- SELECT Policy für authentifizierte User
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'teams' AND policyname = 'teams_read_authenticated'
  ) THEN
    EXECUTE 'CREATE POLICY "teams_read_authenticated" ON public.teams FOR SELECT TO authenticated USING (true)';
  END IF;

  -- Admin-ALL Policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'teams' AND policyname = 'teams_admin_all'
  ) THEN
    EXECUTE 'CREATE POLICY "teams_admin_all" ON public.teams FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = ''admin''))';
  END IF;
END $$;

-- 3. Verification: Zeige alle Tabellen und ihren RLS-Status
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
