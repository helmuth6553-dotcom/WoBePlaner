-- =====================================================
-- Migration: Tabellen zur supabase_realtime Publication hinzufügen
-- Datum: 2026-03-14
-- Zweck: Supabase Realtime benötigt, dass Tabellen in der
--        'supabase_realtime' Publication enthalten sind.
--        Ohne Publication-Eintrag werden keine Events gesendet.
-- =====================================================

-- Idempotent: ALTER PUBLICATION ... ADD TABLE wirft Fehler bei Duplikaten,
-- daher prüfen wir vorher ob die Tabelle schon enthalten ist.

DO $$
DECLARE
  _tables TEXT[] := ARRAY[
    'shift_interests',
    'shifts',
    'roster_months',
    'profiles',
    'absences',
    'time_entries',
    'coverage_requests',
    'coverage_votes'
  ];
  _tbl TEXT;
BEGIN
  FOREACH _tbl IN ARRAY _tables
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND tablename = _tbl
        AND schemaname = 'public'
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', _tbl);
      RAISE NOTICE 'Added % to supabase_realtime publication', _tbl;
    ELSE
      RAISE NOTICE '% already in supabase_realtime publication', _tbl;
    END IF;
  END LOOP;
END $$;

-- Verification
SELECT * FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;
