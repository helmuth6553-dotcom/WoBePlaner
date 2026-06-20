-- =====================================================
-- Migration: time_entries SELECT auf eigene + Admin beschraenken (DSGVO, Phase 1/3)
-- Datum: 2026-06-20
-- Issue: #223
-- Zweck: time_entries hatte die Policy ALLOW_SELECT_TIME_ENTRIES_ALL mit
--        SELECT TO authenticated USING(true) -> JEDER eingeloggte User (oder
--        ein gekapertes Konto) konnte per direktem API-Call die Arbeitszeiten
--        aller Kolleg:innen auslesen. (Vibe-Pentest Muster #1.)
--
-- Abhaengigkeitsanalyse: KEIN Mitarbeiter-Feature liest fremde time_entries
--   - eigene Daten: useTimeEntries.js, ProfileStats.jsx (.eq('user_id', ...))
--   - fremde Daten: ausschliesslich Admin (AdminTimeTracking, AdminOverview,
--     RosterFeed-Admin-Pfad)
-- -> Restriktion auf eigene + Admin bricht kein Feature, kein Client-Change.
--
-- Hinweis: absences (Krankmeldungen) wird NICHT hier behandelt, sondern in
-- Issue #224 (Phase 2) ueber eine redigierte View geloest, damit Kolleg:innen
-- weiterhin "abwesend" (ohne Grund) sehen koennen.
-- =====================================================

DROP POLICY IF EXISTS "ALLOW_SELECT_TIME_ENTRIES_ALL" ON public.time_entries;

CREATE POLICY "time_entries_select" ON public.time_entries
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'
    )
  );
