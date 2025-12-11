-- ===========================================
-- PERFORMANCE OPTIMIZATION - MISSING INDEXES
-- Dienstplan-App - 11.12.2025
-- ===========================================
-- Dieses Script erstellt fehlende Indexe für Foreign Keys.
-- Das verbessert die Performance bei Joins und Löschoperationen.
-- ===========================================

-- 1. Profiles: deactivated_by
CREATE INDEX IF NOT EXISTS idx_profiles_deactivated_by 
ON public.profiles(deactivated_by);

-- 2. Signatures: request_id
-- (Verbessert Join mit Absences)
CREATE INDEX IF NOT EXISTS idx_signatures_request_id 
ON public.signatures(request_id);

-- 3. Signatures: signer_id
-- (Verbessert Filter nach Signer)
CREATE INDEX IF NOT EXISTS idx_signatures_signer_id 
ON public.signatures(signer_id);

-- 4. Time Entries: absence_id
-- (Verbessert Join mit Absences und Löschung cascading)
CREATE INDEX IF NOT EXISTS idx_time_entries_absence_id 
ON public.time_entries(absence_id);

-- ABSCHLUSS
SELECT 'Missing indexes successfully created' as status;
