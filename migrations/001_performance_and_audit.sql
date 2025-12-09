-- =========================================================
-- Migration: Performance & Audit Improvements
-- Created: 2025-12-07
-- Description: Adds indices, hash versioning, and audit log
-- =========================================================

-- 1. Performance Indices
-- These significantly speed up common queries
CREATE INDEX IF NOT EXISTS idx_time_entries_user_date 
    ON public.time_entries(user_id, entry_date);

CREATE INDEX IF NOT EXISTS idx_time_entries_user_start 
    ON public.time_entries(user_id, actual_start);

CREATE INDEX IF NOT EXISTS idx_monthly_reports_user_period 
    ON public.monthly_reports(user_id, year, month);

CREATE INDEX IF NOT EXISTS idx_absences_user_dates 
    ON public.absences(user_id, start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_absences_status 
    ON public.absences(user_id, status);

CREATE INDEX IF NOT EXISTS idx_shifts_time 
    ON public.shifts(start_time, end_time);

CREATE INDEX IF NOT EXISTS idx_shift_interests_user_shift 
    ON public.shift_interests(user_id, shift_id);

-- 2. Hash Versioning
-- Allows future hash algorithm changes without breaking old reports
ALTER TABLE public.monthly_reports 
ADD COLUMN IF NOT EXISTS hash_version TEXT DEFAULT 'v1';

COMMENT ON COLUMN public.monthly_reports.hash_version IS 
    'Version of the hash algorithm used (v1, v2, etc.). Allows backwards compatibility when hash logic changes.';

-- 3. Admin Audit Log Table
-- Tracks all administrative actions for compliance
CREATE TABLE IF NOT EXISTS public.admin_actions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Who performed the action
    admin_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    
    -- What was done
    action TEXT NOT NULL,  -- 'approve_report', 'reject_report', 'edit_entry', 'delete_entry', etc.
    
    -- To whom/what
    target_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    target_resource_type TEXT,  -- 'monthly_report', 'time_entry', 'absence', etc.
    target_resource_id UUID,
    
    -- Details
    changes JSONB,  -- { before: {...}, after: {...} }
    metadata JSONB,  -- Additional context (IP, user agent, etc.)
    
    -- When
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for admin action queries
CREATE INDEX IF NOT EXISTS idx_admin_actions_admin 
    ON public.admin_actions(admin_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_actions_target_user 
    ON public.admin_actions(target_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_actions_resource 
    ON public.admin_actions(target_resource_type, target_resource_id);

COMMENT ON TABLE public.admin_actions IS 
    'Audit log of all administrative actions for compliance and security tracking.';

-- 4. Row Level Security for admin_actions
ALTER TABLE public.admin_actions ENABLE ROW LEVEL SECURITY;

-- Admins can see all actions
CREATE POLICY admin_actions_admin_all ON public.admin_actions
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Users can only see actions that affected them
CREATE POLICY admin_actions_user_read ON public.admin_actions
    FOR SELECT
    TO authenticated
    USING (target_user_id = auth.uid());

-- 5. Update existing reports to v1 (if any NULL values)
UPDATE public.monthly_reports 
SET hash_version = 'v1' 
WHERE hash_version IS NULL;

-- =========================================================
-- Verification Queries (Run these to check success)
-- =========================================================

-- Check indices were created:
-- SELECT indexname, tablename FROM pg_indexes WHERE schemaname = 'public' AND indexname LIKE 'idx_%';

-- Check hash_version column:
-- SELECT column_name, data_type, column_default FROM information_schema.columns 
-- WHERE table_name = 'monthly_reports' AND column_name = 'hash_version';

-- Check admin_actions table:
-- SELECT * FROM admin_actions LIMIT 1;
