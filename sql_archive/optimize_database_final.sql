-- Finales Datenbank-Optimierungs-Skript
-- Legt fehlende Indizes für Fremdschlüssel an, wie vom Supabase Advisor empfohlen.

-- Indizes für Shift Logs (Performance bei Historie)
CREATE INDEX IF NOT EXISTS idx_shift_logs_shift_id ON public.shift_logs (shift_id);
CREATE INDEX IF NOT EXISTS idx_shift_logs_changed_by ON public.shift_logs (changed_by);
CREATE INDEX IF NOT EXISTS idx_shift_logs_new_user_id ON public.shift_logs (new_user_id);
CREATE INDEX IF NOT EXISTS idx_shift_logs_old_user_id ON public.shift_logs (old_user_id);

-- Indizes für Signatures (Performance bei Unterschriften)
CREATE INDEX IF NOT EXISTS idx_signatures_signer_id ON public.signatures (signer_id);
CREATE INDEX IF NOT EXISTS idx_signatures_request_id ON public.signatures (request_id);

-- Indizes für Absences (Genehmiger)
CREATE INDEX IF NOT EXISTS idx_absences_approved_by ON public.absences (approved_by);

-- Bestätigung
SELECT 'Alle fehlenden Indizes wurden erfolgreich angelegt.' as status;
