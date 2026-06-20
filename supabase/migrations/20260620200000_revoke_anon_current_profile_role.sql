-- =====================================================
-- Migration: current_profile_role() von anon EXECUTE entziehen (Nachzug zu #237)
-- Datum: 2026-06-20
-- Issue: #236
-- Zweck: Migration 20260620190000 nutzte `REVOKE EXECUTE ... FROM PUBLIC` (so vom
--        gitar-bot vorgeschlagen). Das blieb wirkungslos: Supabase vergibt per
--        Default Privileges eine DIREKTE EXECUTE-Grant an `anon` beim CREATE FUNCTION
--        (ACL-Eintrag `anon=X/...`), die ein REVOKE FROM PUBLIC nicht entfernt.
--
--        Live verifiziert: anon konnte `/rest/v1/rpc/current_profile_role` aufrufen
--        (Rueckgabe NULL, da auth.uid() leer -> kein Datenleck, aber inkonsistent zur
--        SECURITY-DEFINER-Haertungs-Baseline 20260619200000 und Security-Advisor).
--
-- Fix: explizit FROM anon revoken. Danach ist die ACL identisch zu is_admin()
--      ({postgres, authenticated, service_role}) und anon erhaelt 401
--      "permission denied for function current_profile_role".
-- =====================================================

REVOKE EXECUTE ON FUNCTION public.current_profile_role() FROM anon;
