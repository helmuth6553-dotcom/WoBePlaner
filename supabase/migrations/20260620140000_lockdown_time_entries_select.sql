-- =====================================================
-- Migration: time_entries SELECT auf eigene + Admin beschraenken (DSGVO, Stage 2/4)
-- Datum: 2026-06-20
-- Issue: #223
-- Zweck: time_entries hatte SELECT TO authenticated USING(true) -> jeder
--        eingeloggte User konnte per API/F12 die Arbeitszeiten (actual_start/end,
--        Notizen) aller Kolleg:innen lesen.
--
-- Voraussetzung erfuellt: Stage 1 (#227/PR #228) ist gemergt + deployt -> die
-- mitarbeiter-seitige "Kollegen Uebersicht" (loadBalanceHistory) ist jetzt
-- Admin-only. Lueckenlose Leser-Pruefung: ALLE Cross-User-Reads von time_entries
-- liegen in Admin-Kontexten (AdminTimeTracking, AdminOverview, RosterFeed
-- fetchAdminTeamData + loadBalanceHistory[isAdmin]). Kein Mitarbeiter-Feature
-- liest fremde Eintraege -> Lockdown ist sicher, kein Client-Change noetig.
--
-- Hinweis: Ein frueherer Versuch (PR #226) wurde zurueckgerollt, WEIL Stage 1
-- damals noch fehlte. Jetzt ist die Voraussetzung erfuellt.
--
-- Idempotenz/Drift: Die permissive SELECT-Policy heisst je nach Umgebung
-- unterschiedlich -> auf Prod 'ALLOW_SELECT_TIME_ENTRIES_ALL' (aus altem
-- Archiv-Skript), bei frischem Migrations-Replay 'time_entries_select'
-- (aus 20260314100000_rls_realtime_select.sql). Daher BEIDE Namen droppen,
-- bevor die restriktive Policy (Name 'time_entries_select') erstellt wird.
-- =====================================================

DROP POLICY IF EXISTS "ALLOW_SELECT_TIME_ENTRIES_ALL" ON public.time_entries;
DROP POLICY IF EXISTS "time_entries_select" ON public.time_entries;

CREATE POLICY "time_entries_select" ON public.time_entries
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'
    )
  );
