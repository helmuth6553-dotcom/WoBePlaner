-- ===========================================
-- FIX: Admin Update Policy für time_entries
-- Dienstplan-App - 12.12.2025
-- ===========================================
-- Problem: Admins können time_entries nicht updaten weil die Policy nur
-- user_id = auth.uid() erlaubt, ohne Admin-Ausnahme.
--
-- Lösung: Neue Policy die Admins UPDATE erlaubt.
-- ===========================================

-- Neue Policy: Admins können ALLE time_entries updaten (auch ohne Lock-Check)
DROP POLICY IF EXISTS "Admins update all time entries" ON public.time_entries;
CREATE POLICY "Admins update all time entries" ON public.time_entries
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = (select auth.uid()) AND role = 'admin')
    );

-- Verifizierung
SELECT 'Admin time_entries UPDATE Policy erfolgreich erstellt!' AS status;
