-- =====================================================
-- Migration: Privilege Escalation + Anon-Leserechte fixen
-- Datum: 2026-06-19
-- Zweck: RLS-Pentest hat 3 Probleme aufgedeckt:
--   1. KRITISCH: Employee kann eigene Rolle auf 'admin' ändern
--      (profiles_update ohne WITH CHECK auf role-Spalte)
--   2. MITTEL: Anon kann alle Profile lesen
--      (profiles_select USING(true) für PUBLIC statt authenticated)
--   3. MITTEL: Anon kann roster_months lesen
--      (roster_select USING(true) für PUBLIC statt authenticated)
-- =====================================================

-- 1. KRITISCH: profiles_update — WITH CHECK verhindert Rollenänderung
DROP POLICY IF EXISTS "profiles_update" ON public.profiles;

CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE
  USING (
    (SELECT auth.uid()) = id
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin')
  )
  WITH CHECK (
    -- Admin darf alles ändern
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin')
    OR
    -- Non-Admin: eigene Zeile, aber role muss unverändert bleiben
    (
      (SELECT auth.uid()) = id
      AND role = (SELECT p.role FROM profiles p WHERE p.id = (SELECT auth.uid()))
    )
  );

-- 2. MITTEL: profiles_select — nur authenticated, nicht anon
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;

CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT TO authenticated
  USING (true);

-- 3. MITTEL: roster_select — nur authenticated, nicht anon
DROP POLICY IF EXISTS "roster_select" ON public.roster_months;

CREATE POLICY "roster_select" ON public.roster_months
  FOR SELECT TO authenticated
  USING (true);
