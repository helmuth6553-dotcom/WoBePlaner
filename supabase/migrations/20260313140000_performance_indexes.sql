-- =====================================================
-- Migration: Performance - Add missing FK indexes, remove unused indexes
-- Datum: 2026-03-13
-- Level: INFO (nicht kritisch, Performance-Optimierung)
-- =====================================================

-- =====================================================
-- 1. Fehlende Foreign-Key-Indexes hinzufügen
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_balance_corrections_created_by
    ON public.balance_corrections (created_by);

CREATE INDEX IF NOT EXISTS idx_coverage_requests_assigned_to
    ON public.coverage_requests (assigned_to);

CREATE INDEX IF NOT EXISTS idx_coverage_requests_resolved_by
    ON public.coverage_requests (resolved_by);

CREATE INDEX IF NOT EXISTS idx_coverage_votes_user_id
    ON public.coverage_votes (user_id);

CREATE INDEX IF NOT EXISTS idx_profiles_team_id
    ON public.profiles (team_id);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id
    ON public.push_subscriptions (user_id);

-- =====================================================
-- 2. Unbenutzte Indexes entfernen
-- =====================================================

DROP INDEX IF EXISTS idx_profiles_deactivated_by;
DROP INDEX IF EXISTS idx_signatures_signer_id;
DROP INDEX IF EXISTS idx_profiles_is_active;
DROP INDEX IF EXISTS idx_admin_actions_admin;
DROP INDEX IF EXISTS idx_admin_actions_resource;
DROP INDEX IF EXISTS idx_shifts_end_time;
DROP INDEX IF EXISTS idx_profiles_email;
DROP INDEX IF EXISTS idx_roster_months_year_month;
DROP INDEX IF EXISTS idx_absences_approved_by;
