-- Combined RLS Policies Script
-- Fasst mehrere "Permissive Policies" in einer einzigen effizienten Policy pro Aktion zusammen.

-- 1. Alte (getrennte) Policies entfernen
DROP POLICY IF EXISTS "policy_profiles_read_all" ON public.profiles;
DROP POLICY IF EXISTS "policy_profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "policy_profiles_insert_own" ON public.profiles;
DROP POLICY IF EXISTS "policy_profiles_admin_all" ON public.profiles;

DROP POLICY IF EXISTS "policy_shifts_read_all" ON public.shifts;
DROP POLICY IF EXISTS "policy_shifts_admin_all" ON public.shifts;

DROP POLICY IF EXISTS "policy_interests_user_own" ON public.shift_interests;
DROP POLICY IF EXISTS "policy_interests_admin_all" ON public.shift_interests;

DROP POLICY IF EXISTS "policy_absences_read_all" ON public.absences;
DROP POLICY IF EXISTS "policy_absences_user_own" ON public.absences;
DROP POLICY IF EXISTS "policy_absences_admin_all" ON public.absences;

DROP POLICY IF EXISTS "policy_roster_read_all" ON public.roster_months;
DROP POLICY IF EXISTS "policy_roster_admin_write" ON public.roster_months;

DROP POLICY IF EXISTS "policy_time_user_select" ON public.time_entries;
DROP POLICY IF EXISTS "policy_time_user_insert" ON public.time_entries;
DROP POLICY IF EXISTS "policy_time_user_update" ON public.time_entries;
DROP POLICY IF EXISTS "policy_time_admin_all" ON public.time_entries;

DROP POLICY IF EXISTS "Interessen sind öffentlich lesbar" ON public.shift_interests;
DROP POLICY IF EXISTS "Schichten sind öffentlich lesbar" ON public.shifts;


-- 2. Neue (kombinierte) Policies erstellen

-- === PROFILES ===
-- SELECT: Jeder darf lesen
CREATE POLICY "profiles_select_policy" ON public.profiles 
FOR SELECT USING (true);

-- INSERT: Nur Admin ODER eigener User (bei Registrierung)
CREATE POLICY "profiles_insert_policy" ON public.profiles 
FOR INSERT WITH CHECK ( 
  (select auth.uid()) = id OR 
  exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin') 
);

-- UPDATE: Nur Admin ODER eigener User
CREATE POLICY "profiles_update_policy" ON public.profiles 
FOR UPDATE USING ( 
  (select auth.uid()) = id OR 
  exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin') 
);

-- DELETE: Nur Admin
CREATE POLICY "profiles_delete_policy" ON public.profiles 
FOR DELETE USING ( 
  exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin') 
);


-- === SHIFTS ===
-- SELECT: Jeder darf lesen
CREATE POLICY "shifts_select_policy" ON public.shifts 
FOR SELECT USING (true);

-- INSERT/UPDATE/DELETE: Nur Admin
CREATE POLICY "shifts_write_policy" ON public.shifts 
FOR ALL USING ( 
  exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin') 
);


-- === SHIFT INTERESTS ===
-- SELECT: Alle lesen
CREATE POLICY "interests_select_policy" ON public.shift_interests 
FOR SELECT USING (true);

-- INSERT/UPDATE: Eigener User ODER Admin
CREATE POLICY "interests_write_policy" ON public.shift_interests 
FOR ALL USING ( 
  user_id = (select auth.uid()) OR 
  exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin') 
);


-- === ABSENCES ===
-- SELECT: Alle lesen (für Kalender)
CREATE POLICY "absences_select_policy" ON public.absences 
FOR SELECT USING (true);

-- INSERT/UPDATE/DELETE: Eigener User ODER Admin
CREATE POLICY "absences_write_policy" ON public.absences 
FOR ALL USING ( 
  user_id = (select auth.uid()) OR 
  exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin') 
);


-- === ROSTER MONTHS ===
-- SELECT: Jeder
CREATE POLICY "roster_select_policy" ON public.roster_months 
FOR SELECT USING (true);

-- WRITE: Admin only
CREATE POLICY "roster_write_policy" ON public.roster_months 
FOR ALL USING ( 
  exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin') 
);


-- === TIME ENTRIES ===
-- SELECT: Eigener User ODER Admin
CREATE POLICY "time_select_policy" ON public.time_entries 
FOR SELECT USING ( 
  user_id = (select auth.uid()) OR 
  exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin') 
);

-- INSERT/UPDATE: Eigener User ODER Admin
CREATE POLICY "time_write_policy" ON public.time_entries 
FOR ALL USING ( 
  user_id = (select auth.uid()) OR 
  exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin') 
);

