-- =====================================================
-- Migration: View team_members — unkritische Team-Sicht auf Profile
-- Datum: 2026-06-20
-- Issue: #225 (Stage 4a/4 — ADDITIV, kein Lockdown)
-- Zweck: Mitarbeiter brauchen von Kolleg:innen nur Name + Rolle (Anzeige im
--        Dienstplan: wer ist in welchem Dienst). NICHT E-Mail, Salden,
--        Wochenstunden, Urlaubstage, Eintrittsdatum.
--
-- Da RLS nur Zeilen (nicht Spalten) maskiert und Admin + Mitarbeiter sich die
-- DB-Rolle 'authenticated' teilen (Spalten-GRANTs koennten Admin nicht
-- ausnehmen), kommt diese minimale View. Sie exponiert ausschliesslich
-- unkritische Felder; die sensiblen Spalten bleiben in der Rohtabelle, die
-- Stage 4b auf eigene + Admin beschraenkt.
--
-- security_invoker = false (Owner-Rechte): die View liefert die Namen weiterhin,
-- auch nachdem die Rohtabelle dichtgemacht wurde. Sie gibt aber nur
-- unkritische Spalten heraus -> bewusst akzeptierter Advisor 'security_definer_view'.
-- Nur GRANT SELECT TO authenticated (nicht anon).
-- =====================================================

DROP VIEW IF EXISTS public.team_members;

CREATE VIEW public.team_members
WITH (security_invoker = false)
AS
SELECT
  p.id,
  p.full_name,
  p.display_name,
  p.role,
  p.is_active
FROM public.profiles p;

REVOKE ALL ON public.team_members FROM anon;
REVOKE ALL ON public.team_members FROM authenticated;
GRANT SELECT ON public.team_members TO authenticated;
