-- ===========================================
-- RLS ROLLBACK BACKUP SCRIPT
-- Stand: 11.12.2025 (Vor Performance-Optimierung)
-- ===========================================
-- Falls fix_rls_performance.sql Probleme macht, 
-- führe dieses Script aus, um den alten Zustand wiederherzustellen.
-- ===========================================

-- 1. Profiles
DROP POLICY IF EXISTS "profiles_select" ON profiles;
CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "profiles_update" ON profiles;
CREATE POLICY "profiles_update" ON profiles FOR UPDATE USING ((auth.uid() = id) OR (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')));

-- 2. Shifts (Wiederherstellung der Duplikate zur Sicherheit)
DROP POLICY IF EXISTS "shifts_select" ON shifts;
CREATE POLICY "shifts_select" ON shifts FOR SELECT USING (true);
DROP POLICY IF EXISTS "ALLOW_SELECT_SHIFTS_ALL" ON shifts;
CREATE POLICY "ALLOW_SELECT_SHIFTS_ALL" ON shifts FOR SELECT USING (true);

-- 3. Shift Interests
DROP POLICY IF EXISTS "interests_select" ON shift_interests;
CREATE POLICY "interests_select" ON shift_interests FOR SELECT USING (true);
DROP POLICY IF EXISTS "Enable read access for all users" ON shift_interests;
CREATE POLICY "Enable read access for all users" ON shift_interests FOR SELECT USING (true);

-- 4. Absences
DROP POLICY IF EXISTS "absences_select" ON absences;
CREATE POLICY "absences_select" ON absences FOR SELECT USING (true);
DROP POLICY IF EXISTS "ALLOW_SELECT_ABSENCES_ALL" ON absences;
CREATE POLICY "ALLOW_SELECT_ABSENCES_ALL" ON absences FOR SELECT USING (true);

-- 5. Time Entries (Kritisch: Zugriff wiederherstellen)
DROP POLICY IF EXISTS "time_select" ON time_entries;
-- Alte Logik: User sieht eigene ODER Admin
CREATE POLICY "time_select" ON time_entries FOR SELECT USING ((auth.uid() = user_id) OR (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')));

DROP POLICY IF EXISTS "ALLOW_SELECT_TIME_ENTRIES_ALL" ON time_entries;
-- Alte Logik: Alle sehen alle (Option 1)
CREATE POLICY "ALLOW_SELECT_TIME_ENTRIES_ALL" ON time_entries FOR SELECT USING (true);

-- 6. Monthly Reports (Original Policies ohne (select ...))
DROP POLICY IF EXISTS "Users view own reports" ON monthly_reports;
CREATE POLICY "Users view own reports" ON monthly_reports FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins view all reports" ON monthly_reports;
CREATE POLICY "Admins view all reports" ON monthly_reports FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- 7. Admin Actions
DROP POLICY IF EXISTS "admin_actions_user_read" ON admin_actions;
CREATE POLICY "admin_actions_user_read" ON admin_actions FOR SELECT USING (target_user_id = auth.uid());

DROP POLICY IF EXISTS "admin_actions_admin_select" ON admin_actions;
CREATE POLICY "admin_actions_admin_select" ON admin_actions FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Abschluss
SELECT 'Rollback Script erfolgreich ausgeführt - Alter Zustand wiederhergestellt' as status;
