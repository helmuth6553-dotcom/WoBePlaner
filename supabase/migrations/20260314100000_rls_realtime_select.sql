-- =====================================================
-- Migration: RLS SELECT Policies für Supabase Realtime
-- Datum: 2026-03-14
-- Zweck: Supabase Realtime liefert nur Events an Clients,
--        die per RLS SELECT-Berechtigung auf die Tabelle haben.
--        Ohne SELECT-Policy kommen keine Realtime-Events an.
-- =====================================================

-- Idempotent: Nur erstellen wenn noch keine SELECT-Policy existiert

DO $$
BEGIN
  -- shift_interests: Jeder authentifizierte User darf lesen
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'shift_interests' AND cmd = 'SELECT'
  ) THEN
    EXECUTE 'CREATE POLICY "shift_interests_select" ON public.shift_interests FOR SELECT TO authenticated USING (true)';
    RAISE NOTICE 'Created SELECT policy for shift_interests';
  ELSE
    RAISE NOTICE 'shift_interests already has a SELECT policy';
  END IF;

  -- profiles: Jeder authentifizierte User darf Profile lesen
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'profiles' AND cmd = 'SELECT'
  ) THEN
    EXECUTE 'CREATE POLICY "profiles_select" ON public.profiles FOR SELECT TO authenticated USING (true)';
    RAISE NOTICE 'Created SELECT policy for profiles';
  ELSE
    RAISE NOTICE 'profiles already has a SELECT policy';
  END IF;

  -- roster_months: Jeder authentifizierte User darf Monatsstatus lesen
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'roster_months' AND cmd = 'SELECT'
  ) THEN
    EXECUTE 'CREATE POLICY "roster_months_select" ON public.roster_months FOR SELECT TO authenticated USING (true)';
    RAISE NOTICE 'Created SELECT policy for roster_months';
  ELSE
    RAISE NOTICE 'roster_months already has a SELECT policy';
  END IF;

  -- absences: Jeder authentifizierte User darf Abwesenheiten lesen
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'absences' AND cmd = 'SELECT'
  ) THEN
    EXECUTE 'CREATE POLICY "absences_select" ON public.absences FOR SELECT TO authenticated USING (true)';
    RAISE NOTICE 'Created SELECT policy for absences';
  ELSE
    RAISE NOTICE 'absences already has a SELECT policy';
  END IF;

  -- time_entries: Jeder authentifizierte User darf Zeiteinträge lesen
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'time_entries' AND cmd = 'SELECT'
  ) THEN
    EXECUTE 'CREATE POLICY "time_entries_select" ON public.time_entries FOR SELECT TO authenticated USING (true)';
    RAISE NOTICE 'Created SELECT policy for time_entries';
  ELSE
    RAISE NOTICE 'time_entries already has a SELECT policy';
  END IF;
END $$;

-- Verification
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND cmd = 'SELECT'
ORDER BY tablename, policyname;
