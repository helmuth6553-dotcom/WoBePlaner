-- Add original_data_snapshot column to monthly_reports table
-- This column will store the full JSON copy of the time entries at the moment of submission.
-- This allows reconstruction of the original signed data even if live entries are modified later.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'monthly_reports'
        AND column_name = 'original_data_snapshot'
    ) THEN
        ALTER TABLE public.monthly_reports ADD COLUMN original_data_snapshot JSONB;
    END IF;
END $$;
