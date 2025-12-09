-- =========================================================
-- Migration: Change target_resource_id to TEXT
-- Created: 2025-12-07
-- Description: Changes column type from UUID to TEXT to support integer IDs (e.g. absences)
-- =========================================================

-- 1. Drop the index relying on the column (cleanest way)
DROP INDEX IF EXISTS public.idx_admin_actions_resource;

-- 2. Alter the column type with automatic conversion
ALTER TABLE public.admin_actions 
    ALTER COLUMN target_resource_id TYPE TEXT;

-- 3. Re-create the index
CREATE INDEX IF NOT EXISTS idx_admin_actions_resource 
    ON public.admin_actions(target_resource_type, target_resource_id);

-- 4. Verify the change
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'admin_actions' AND column_name = 'target_resource_id';
