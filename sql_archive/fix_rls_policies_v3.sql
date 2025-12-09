-- RLS Cleanup V3 (Signaturen auskommentiert)
-- Bitte führen Sie dies im Supabase SQL Editor aus.

-- 1. Tabellen vorbereiten
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_interests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roster_months ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.absences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.signatures ENABLE ROW LEVEL SECURITY; -- Vorerst überspringen
ALTER TABLE public.shift_logs ENABLE ROW LEVEL SECURITY;

-- 2. Alte Policies löschen
DROP POLICY IF EXISTS "User können eigenes Profil anlegen" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
DROP POLICY IF EXISTS "Profile sind öffentlich lesbar" ON public.profiles;
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;

DROP POLICY IF EXISTS "Eingeloggte User dürfen Interesse bekunden" ON public.shift_interests;
DROP POLICY IF EXISTS "User dürfen nur eigenes Interesse entfernen" ON public.shift_interests;
DROP POLICY IF EXISTS "Admins can delete shift_interests" ON public.shift_interests;

DROP POLICY IF EXISTS "Admins full access" ON public.absences;
DROP POLICY IF EXISTS "User tragen eigenen Urlaub ein" ON public.absences;
DROP POLICY IF EXISTS "Users can insert own absences" ON public.absences;
DROP POLICY IF EXISTS "User löschen eigenen Urlaub" ON public.absences;
DROP POLICY IF EXISTS "Jeder sieht Abwesenheiten" ON public.absences;
DROP POLICY IF EXISTS "Users can view own absences" ON public.absences;
DROP POLICY IF EXISTS "User dürfen Status ändern" ON public.absences;

DROP POLICY IF EXISTS "User dürfen Schichten erstellen" ON public.shifts;
DROP POLICY IF EXISTS "User dürfen Schichten bearbeiten" ON public.shifts;
DROP POLICY IF EXISTS "Admins can delete shifts" ON public.shifts;

DROP POLICY IF EXISTS "Authenticated write access" ON public.roster_months;
DROP POLICY IF EXISTS "Public read access" ON public.roster_months;

DROP POLICY IF EXISTS "Users can view own entries" ON public.time_entries;
DROP POLICY IF EXISTS "Users can insert own entries" ON public.time_entries;
DROP POLICY IF EXISTS "Users can update own pending entries" ON public.time_entries;
DROP POLICY IF EXISTS "Admins can view all entries" ON public.time_entries;
DROP POLICY IF EXISTS "Admins can manage all entries" ON public.time_entries;

-- Signaturen Policies erstmal deaktiviert lassen, da Spaltenname unklar
-- DROP POLICY IF EXISTS "Users can view signatures for their own requests" ON public.signatures;
-- DROP POLICY IF EXISTS "Admins can view all signatures" ON public.signatures;
-- DROP POLICY IF EXISTS "Users can insert their own signatures" ON public.signatures;

DROP POLICY IF EXISTS "Admins can view shift logs" ON public.shift_logs;

-- 3. Neue Policies erstellen

-- === PROFILES ===
CREATE POLICY "policy_profiles_read_all" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "policy_profiles_update_own" ON public.profiles FOR UPDATE USING ( id = (select auth.uid()) );
CREATE POLICY "policy_profiles_insert_own" ON public.profiles FOR INSERT WITH CHECK ( id = (select auth.uid()) );
CREATE POLICY "policy_profiles_admin_all" ON public.profiles FOR ALL USING ( exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin') );

-- === SHIFTS ===
CREATE POLICY "policy_shifts_read_all" ON public.shifts FOR SELECT TO authenticated USING (true);
CREATE POLICY "policy_shifts_admin_all" ON public.shifts FOR ALL USING ( exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin') );

-- === SHIFT INTERESTS ===
CREATE POLICY "policy_interests_user_own" ON public.shift_interests FOR ALL TO authenticated USING ( user_id = (select auth.uid()) ) WITH CHECK ( user_id = (select auth.uid()) );
CREATE POLICY "policy_interests_admin_all" ON public.shift_interests FOR ALL USING ( exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin') );

-- === ABSENCES ===
CREATE POLICY "policy_absences_read_all" ON public.absences FOR SELECT TO authenticated USING (true);
CREATE POLICY "policy_absences_user_own" ON public.absences FOR ALL TO authenticated USING ( user_id = (select auth.uid()) ) WITH CHECK ( user_id = (select auth.uid()) );
CREATE POLICY "policy_absences_admin_all" ON public.absences FOR ALL USING ( exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin') );

-- === ROSTER MONTHS ===
CREATE POLICY "policy_roster_read_all" ON public.roster_months FOR SELECT TO authenticated USING (true);
CREATE POLICY "policy_roster_admin_write" ON public.roster_months FOR ALL USING ( exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin') );

-- === TIME ENTRIES ===
CREATE POLICY "policy_time_user_select" ON public.time_entries FOR SELECT TO authenticated USING ( user_id = (select auth.uid()) );
CREATE POLICY "policy_time_user_insert" ON public.time_entries FOR INSERT TO authenticated WITH CHECK ( user_id = (select auth.uid()) );
CREATE POLICY "policy_time_user_update" ON public.time_entries FOR UPDATE TO authenticated USING ( user_id = (select auth.uid()) );
CREATE POLICY "policy_time_admin_all" ON public.time_entries FOR ALL USING ( exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin') );

-- === SHIFT LOGS ===
CREATE POLICY "policy_logs_admin_all" ON public.shift_logs FOR ALL USING ( exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin') );
