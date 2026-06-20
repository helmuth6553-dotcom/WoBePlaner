-- =====================================================
-- Migration: View team_absences — redigierte Team-Sicht auf Abwesenheiten
-- Datum: 2026-06-20
-- Issue: #224 (Stage 3a/4 — ADDITIV, kein Lockdown)
-- Zweck: Mitarbeiter sollen im Dienstplan sehen, dass jemand "abwesend" ist
--        (Verfuegbarkeit), aber NICHT den Grund (krank). RLS kann nur Zeilen,
--        nicht Spalten maskieren -> daher diese redigierte View.
--
-- Verhalten (pro Aufrufer):
--   - eigene Zeilen ODER Admin -> echter type (volle Info)
--   - fremde Krank/Krankenstand -> type = 'Abwesend' (Grund verborgen)
--   - fremde sonstige (Urlaub etc.) -> echter type
-- Exponiert NUR: id, user_id, Datum, status, (redigierter) type, Namen.
-- KEINE E-Mail, kein Grund/Notiz, keine planned_hours.
--
-- Sicherheit: security_invoker = false -> die View laeuft mit Owner-Rechten
-- und umgeht damit bewusst die (spaeter restriktive) RLS auf absences. Die
-- View SELBST ist die Zugriffskontrolle: sie gibt nur unkritische/redigierte
-- Spalten heraus. auth.uid() liefert weiterhin den aufrufenden User (liest
-- die Request-JWT-Claims, unabhaengig von der ausfuehrenden Rolle).
-- (Supabase-Advisor 0010 'security_definer_view' ist hier erwartet/akzeptiert.)
--
-- Nur fuer 'authenticated', nicht 'anon'.
-- Stage 3b (separat) macht danach absences SELECT -> eigene + Admin dicht.
-- =====================================================

CREATE OR REPLACE VIEW public.team_absences
WITH (security_invoker = false)
AS
SELECT
  a.id,
  a.user_id,
  a.start_date,
  a.end_date,
  a.status,
  CASE
    WHEN a.user_id = (SELECT auth.uid()) OR public.is_admin()
      THEN a.type
    WHEN a.type IN ('Krank', 'Krankenstand')
      THEN 'Abwesend'
    ELSE a.type
  END AS type,
  p.full_name,
  p.display_name
FROM public.absences a
LEFT JOIN public.profiles p ON p.id = a.user_id;

-- Least-Privilege: Supabase-Default-Privilegien geben 'authenticated' sonst
-- ALL auf neue Objekte. Erst ALLES entziehen (anon + authenticated), dann
-- gezielt nur SELECT fuer authenticated. (Schreibzugriff auf die JOIN-View
-- ist ohnehin nicht moeglich, aber Least-Privilege gehoert sauber gesetzt.)
REVOKE ALL ON public.team_absences FROM anon;
REVOKE ALL ON public.team_absences FROM authenticated;
GRANT SELECT ON public.team_absences TO authenticated;
