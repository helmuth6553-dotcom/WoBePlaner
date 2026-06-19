-- =====================================================
-- Migration: SECURITY DEFINER Funktionen für anon sperren
-- Datum: 2026-06-19
-- Zweck: Supabase Security Advisor hat 10 SECURITY DEFINER
--        Funktionen identifiziert, die von der anon-Rolle
--        (unauthentifiziert) via /rest/v1/rpc/ aufrufbar sind.
--        Alle werden nur im authentifizierten Kontext genutzt.
--        Fix: EXECUTE von PUBLIC revoken, nur authenticated erlauben.
--        Zusätzlich: search_path auf handle_new_user fixieren.
--
-- Hinweis: Funktionen wurden teilweise out-of-band erstellt
--          (nicht alle haben eigene Migrations-Dateien).
--          DO-Block prüft Existenz vor REVOKE/GRANT.
-- =====================================================

DO $$
DECLARE
  fn record;
BEGIN
  -- Funktionen die nur authenticated brauchen (via RPC aufrufbar)
  FOR fn IN
    SELECT unnest(ARRAY[
      'assign_coverage(integer, uuid, uuid)',
      'check_time_entry_lock(uuid, bigint, date)',
      'create_signed_absence(jsonb, jsonb)',
      'is_admin()',
      'is_viewer()',
      'is_month_locked(uuid, date)',
      'mark_shifts_urgent(bigint[], uuid)',
      'perform_shift_swap(bigint, uuid)'
    ]) AS signature
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
        AND p.oid = format('public.%s', fn.signature)::regprocedure
    ) THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC', fn.signature);
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', fn.signature);
      RAISE NOTICE 'Secured: %', fn.signature;
    ELSE
      RAISE NOTICE 'Skipped (not found): %', fn.signature;
    END IF;
  END LOOP;

  -- Trigger-Funktionen: weder anon noch authenticated brauchen EXECUTE
  -- Sie werden nur intern von der DB aufgerufen (INSERT-Trigger auf auth.users / absences)
  FOR fn IN
    SELECT unnest(ARRAY[
      'handle_new_user()',
      'sync_absence_to_time_entries()'
    ]) AS signature
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
        AND p.oid = format('public.%s', fn.signature)::regprocedure
    ) THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC', fn.signature);
      RAISE NOTICE 'Secured (trigger, no GRANT): %', fn.signature;
    ELSE
      RAISE NOTICE 'Skipped (not found): %', fn.signature;
    END IF;
  END LOOP;

  -- Leerer search_path ist sicherer für SECURITY DEFINER
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'handle_new_user'
  ) THEN
    ALTER FUNCTION public.handle_new_user() SET search_path = '';
    RAISE NOTICE 'search_path fixed: handle_new_user()';
  END IF;
END $$;

-- Verification: Keine anon-executable SECURITY DEFINER Funktionen mehr
SELECT p.proname, pg_get_function_arguments(p.oid) as args
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.prosecdef = true
  AND has_function_privilege('anon', p.oid, 'EXECUTE');
-- Erwartetes Ergebnis: leere Tabelle
