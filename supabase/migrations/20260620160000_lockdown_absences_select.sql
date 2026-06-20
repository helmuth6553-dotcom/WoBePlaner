-- =====================================================
-- Migration: absences SELECT auf eigene + Admin beschraenken (DSGVO, Stage 3b/4)
-- Datum: 2026-06-20
-- Issue: #224
-- Zweck: absences hatte SELECT TO authenticated USING(true) -> jeder eingeloggte
--        User konnte per API/F12 die Krankmeldungen (Gesundheitsdaten, Art. 9),
--        Gruende und planned_hours aller Kolleg:innen lesen.
--
-- Voraussetzung erfuellt: Stage 3a (#224/PR #230) ist gemergt + deployt -> die
-- View team_absences liefert die redigierte Team-Sicht ("Abwesend" statt Grund),
-- RosterFeed + AbsencePlanner lesen daraus. Lueckenlose Leser-Pruefung der rohen
-- absences-Tabelle: alle Cross-User-Reads sind Admin-only (Admin*-Komponenten,
-- RosterFeed fetchAdminTeamData/loadBalanceHistory[isAdmin], useAdminBadgeCounts
-- [if !isAdmin return]); alle Mitarbeiter-Reads sind eigene (.eq user_id).
--
-- Die View team_absences laeuft mit Owner-Rechten (security_invoker=false) und
-- umgeht diese RLS bewusst -> sie liefert weiterhin die redigierte Team-Sicht.
--
-- Namens-Drift: permissive Policy heisst auf Prod 'ALLOW_SELECT_ABSENCES_ALL'
-- (altes Archiv-Skript), bei frischem Replay 'absences_select'
-- (20260314100000_rls_realtime_select.sql). Daher BEIDE Namen droppen.
--
-- Hinweis: Realtime respektiert RLS -> Mitarbeiter erhalten danach keine
-- Live-Updates mehr fuer fremde Abwesenheiten (Aktualisierung bei Refresh).
-- =====================================================

DROP POLICY IF EXISTS "ALLOW_SELECT_ABSENCES_ALL" ON public.absences;
DROP POLICY IF EXISTS "absences_select" ON public.absences;

CREATE POLICY "absences_select" ON public.absences
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'
    )
  );
