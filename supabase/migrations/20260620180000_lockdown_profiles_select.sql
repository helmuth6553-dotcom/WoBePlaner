-- =====================================================
-- Migration: profiles SELECT auf eigene + Admin beschraenken (DSGVO, Stage 4b/4)
-- Datum: 2026-06-20
-- Issue: #225
-- Zweck: profiles_select hatte USING(true) -> jeder eingeloggte User konnte per
--        API/F12 die kompletten Profile aller Kolleg:innen lesen: email,
--        initial_balance, weekly_hours, vacation_days_per_year, start_date.
--
-- Voraussetzung erfuellt: Stage 4a (#232) + Nachzug (#233) gemergt + deployt ->
-- View team_members liefert Name/Rolle cross-user; ALLE employee-seitigen
-- profiles-Reads sind jetzt entweder eigene (.eq id) oder ueber team_members
-- (RosterFeed, ProfileStats, AbsencePlanner, SwapShiftModal, SoliPunktePanel).
-- Alle Cross-User-Rohzugriffe sind Admin-only.
--
-- WICHTIG (Rekursionsschutz): Die SELECT-Policy der profiles-Tabelle darf den
-- Admin NICHT per Inline-"EXISTS (SELECT ... FROM profiles ...)" pruefen — das
-- wuerde die profiles-SELECT-Policy rekursiv auf sich selbst anwenden
-- (infinite recursion in policy). public.is_admin() ist SECURITY DEFINER und
-- liest profiles unter Owner-Rechten (umgeht RLS) -> keine Rekursion.
--
-- Die View team_members laeuft mit Owner-Rechten und liefert die Namen
-- weiterhin, auch nachdem die Rohtabelle hier dichtgemacht wird.
--
-- profiles_select ist konsistent benannt (kein ALLOW_*-Drift) -> 1 Name droppen.
-- =====================================================

DROP POLICY IF EXISTS "profiles_select" ON public.profiles;

CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR public.is_admin()
  );
