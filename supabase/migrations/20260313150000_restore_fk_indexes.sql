-- =====================================================
-- Migration: Restore FK indexes that were incorrectly removed
-- Datum: 2026-03-13
-- Die vorherige Migration hat Indexes gelöscht die als "unused"
-- gemeldet waren, aber Foreign Keys abdecken. Diese werden hier
-- wiederhergestellt.
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_absences_approved_by
    ON public.absences (approved_by);

CREATE INDEX IF NOT EXISTS idx_admin_actions_admin_id
    ON public.admin_actions (admin_id);

CREATE INDEX IF NOT EXISTS idx_profiles_deactivated_by
    ON public.profiles (deactivated_by);

CREATE INDEX IF NOT EXISTS idx_signatures_signer_id
    ON public.signatures (signer_id);
