-- DIAGNOSE-SCRIPT
-- Führe dieses Script im Supabase SQL Editor aus.
-- Es verändert KEINE Daten. Es zeigt nur den Ist-Zustand an.

-- 1. Tabellen und ihre Spalten prüfen
SELECT 
    table_name, 
    column_name, 
    data_type 
FROM 
    information_schema.columns 
WHERE 
    table_schema = 'public' 
    AND table_name IN ('time_entries', 'absences', 'shifts', 'profiles', 'monthly_reports')
ORDER BY 
    table_name, ordinal_position;

-- 2. Aktive Trigger finden (Das ist wichtig! Hier verstecken sich oft "Zombie-Regeln")
SELECT 
    event_object_table AS table_name, 
    trigger_name, 
    action_statement AS trigger_logic,
    action_timing
FROM 
    information_schema.triggers 
WHERE 
    trigger_schema = 'public';

-- 3. RLS Policies (Sicherheitsregeln)
SELECT 
    tablename, 
    policyname, 
    cmd AS operation, 
    qual, 
    with_check 
FROM 
    pg_policies 
WHERE 
    schemaname = 'public';

-- 4. Prüfen ob Foreign Keys korrekt sind (Verbindungen zwischen Tabellen)
SELECT
    tc.table_schema, 
    tc.constraint_name, 
    tc.table_name, 
    kcu.column_name, 
    ccu.table_schema AS foreign_table_schema,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name 
FROM 
    information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema='public';
