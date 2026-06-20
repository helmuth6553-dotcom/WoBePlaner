-- =====================================================
-- Migration: profiles UPDATE/INSERT/DELETE Policies rekursionsfrei machen
-- Datum: 2026-06-20
-- Issue: #236
-- Zweck: Stage 4b (#225, Migration 20260620180000) hat die profiles-SELECT-Policy
--        auf `id = auth.uid() OR public.is_admin()` umgestellt. Dadurch rekursieren
--        die UPDATE/INSERT/DELETE-Policies, die `profiles` INLINE lesen
--        (`EXISTS (SELECT 1 FROM profiles ...)` bzw. `(SELECT role FROM profiles ...)`):
--        jedes profiles-DML wirft jetzt
--        42P17 "infinite recursion detected in policy for relation profiles".
--
--        Live verifiziert (REST-API als Test-Mitarbeiter, Rolle 'user'):
--          - SELECT eigene Zeile         -> OK
--          - PATCH role=admin (Angriff)  -> blockiert, ABER 42P17 statt sauberem Reject
--          - PATCH display_name (legitim)-> 42P17  => ProfileSettings "Speichern" kaputt
--        Weitere betroffene Pfade: SetPassword (password_set bleibt false),
--        Admin-Loeschen von Profilen (profiles_delete liest profiles inline).
--
-- Fix: Inline-profiles-Reads in den Policies durch SECURITY-DEFINER-Funktionen
--      ersetzen (is_admin() + neue current_profile_role()), die profiles unter
--      Owner-Rechten lesen (RLS-Bypass) -> keine Rekursion. Identisches, bereits
--      bewaehrtes Muster wie die rekursionsfreie SELECT-Policy aus Stage 4b.
--
-- Sicherheit UNVERAENDERT: Die role-Spalte bleibt fuer Nicht-Admins eingefroren
--      (role muss == current_profile_role() bleiben) -> keine Privilege Escalation.
--      anon kann weiterhin nichts (TO authenticated + auth.uid() IS NULL).
-- =====================================================

-- Gespeicherte Rolle des Aufrufers, RLS-umgehend (analog zu is_admin()).
-- Liest nur die EIGENE Zeile (auth.uid()) -> auch fuer anon harmlos (liefert NULL).
CREATE OR REPLACE FUNCTION public.current_profile_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
STABLE
AS $$
  SELECT role FROM public.profiles WHERE id = (SELECT auth.uid())
$$;

-- SECURITY-DEFINER-Haertungs-Baseline (Migration 20260619200000): SECURITY-DEFINER-
-- Funktionen duerfen NICHT von anon aufrufbar sein (Security Advisor + /rest/v1/rpc).
REVOKE EXECUTE ON FUNCTION public.current_profile_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_profile_role() TO authenticated;

-- UPDATE: eigene Zeile (role eingefroren) ODER Admin
DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR public.is_admin()
  )
  WITH CHECK (
    public.is_admin()
    OR (
      id = (SELECT auth.uid())
      AND role = public.current_profile_role()
    )
  );

-- INSERT: NUR Admin (gleicher Rekursionsgrund wie UPDATE, hier mitgefixt).
-- Profile werden regulaer per handle_new_user() (SECURITY DEFINER, umgeht Policies)
-- angelegt; es gibt KEINEN client-seitigen profiles-INSERT im Code. Die fruehere
-- Self-Insert-Erlaubnis (id = auth.uid()) war ungenutzt UND eroeffnete eine schmale
-- Eskalation: nach Admin-DELETE der eigenen Zeile koennte der noch eingeloggte User
-- sich per INSERT role='admin' neu anlegen. Daher Client-INSERT auf Admin beschraenkt.
DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
CREATE POLICY "profiles_insert" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK ( public.is_admin() );

-- DELETE: nur Admin
DROP POLICY IF EXISTS "profiles_delete" ON public.profiles;
CREATE POLICY "profiles_delete" ON public.profiles
  FOR DELETE TO authenticated
  USING ( public.is_admin() );
