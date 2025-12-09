-- Add data_hash column to monthly_reports table
-- This column will store the cryptographic hash of the time entries at the moment of submission.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'monthly_reports'
        AND column_name = 'data_hash'
    ) THEN
        ALTER TABLE public.monthly_reports ADD COLUMN data_hash TEXT;
    END IF;
END $$;
