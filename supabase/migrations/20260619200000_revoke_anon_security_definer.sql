-- =====================================================
-- Migration: SECURITY DEFINER Funktionen für anon sperren
-- Datum: 2026-06-19
-- Zweck: Supabase Security Advisor hat 10 SECURITY DEFINER
--        Funktionen identifiziert, die von der anon-Rolle
--        (unauthentifiziert) via /rest/v1/rpc/ aufrufbar sind.
--        Alle werden nur im authentifizierten Kontext genutzt.
--        Fix: EXECUTE von PUBLIC revoken, nur authenticated erlauben.
--        Zusätzlich: search_path auf handle_new_user fixieren.
-- =====================================================

-- 1. REVOKE von PUBLIC + GRANT nur an authenticated

-- assign_coverage: Dienstzuweisung (nur Admin, authenticated)
REVOKE EXECUTE ON FUNCTION public.assign_coverage(integer, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_coverage(integer, uuid, uuid) TO authenticated;

-- check_time_entry_lock: Monats-Lock prüfen (authenticated)
REVOKE EXECUTE ON FUNCTION public.check_time_entry_lock(uuid, bigint, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_time_entry_lock(uuid, bigint, date) TO authenticated;

-- create_signed_absence: Abwesenheit mit Signatur erstellen (authenticated)
REVOKE EXECUTE ON FUNCTION public.create_signed_absence(jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_signed_absence(jsonb, jsonb) TO authenticated;

-- handle_new_user: Trigger-Funktion, wird nur intern von Supabase Auth aufgerufen
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;

-- is_admin / is_viewer: Rollen-Check (authenticated, in RLS-Policies genutzt)
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_viewer() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_viewer() TO authenticated;

-- is_month_locked: Monatsstatus prüfen (authenticated)
REVOKE EXECUTE ON FUNCTION public.is_month_locked(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_month_locked(uuid, date) TO authenticated;

-- mark_shifts_urgent: Schichten als dringend markieren (authenticated)
REVOKE EXECUTE ON FUNCTION public.mark_shifts_urgent(bigint[], uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_shifts_urgent(bigint[], uuid) TO authenticated;

-- perform_shift_swap: Schichttausch (authenticated)
REVOKE EXECUTE ON FUNCTION public.perform_shift_swap(bigint, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.perform_shift_swap(bigint, uuid) TO authenticated;

-- sync_absence_to_time_entries: Zeiteinträge synchronisieren (authenticated)
REVOKE EXECUTE ON FUNCTION public.sync_absence_to_time_entries() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_absence_to_time_entries() TO authenticated;

-- 2. search_path fixieren auf handle_new_user (Linter-Warning)
ALTER FUNCTION public.handle_new_user() SET search_path = public;

-- 3. Verification
SELECT p.proname, pg_get_function_arguments(p.oid) as args
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.prosecdef = true
  AND has_function_privilege('anon', p.oid, 'EXECUTE');
-- Erwartetes Ergebnis: leere Tabelle
