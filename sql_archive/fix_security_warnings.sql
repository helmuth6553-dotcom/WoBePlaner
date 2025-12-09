-- Security Fix Script
-- Setzt den 'search_path' für sicherheitskritische Funktionen auf 'public',
-- um die Warnungen "Function Search Path Mutable" zu beheben.

DO $$
DECLARE
    func_record RECORD;
BEGIN
    -- Durchsucht die Systemtabelle nach den betroffenen Funktionen
    FOR func_record IN 
        SELECT oid::regprocedure::text as func_signature
        FROM pg_proc
        WHERE proname IN ('perform_shift_swap', 'is_admin', 'create_signed_absence', 'handle_new_user')
        AND pronamespace = 'public'::regnamespace
    LOOP
        -- Führt für jede gefundene Funktion den ALTER Befehl aus
        EXECUTE 'ALTER FUNCTION ' || func_record.func_signature || ' SET search_path = public';
    END LOOP;
END $$;
