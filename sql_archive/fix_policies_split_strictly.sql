-- RLS Policy Strict Split Script
-- Trennt SELECT Policies strikt von INSERT/UPDATE/DELETE Policies, 
-- um "Multiple Permissive Policies" Warnungen zu vermeiden (da FOR ALL auch SELECT beinhaltet).

-- 1. Vorherige Kombi-Policies löschen
DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_policy" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_policy" ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete_policy" ON public.profiles;

DROP POLICY IF EXISTS "shifts_select_policy" ON public.shifts;
DROP POLICY IF EXISTS "shifts_write_policy" ON public.shifts;

DROP POLICY IF EXISTS "interests_select_policy" ON public.shift_interests;
DROP POLICY IF EXISTS "interests_write_policy" ON public.shift_interests;

DROP POLICY IF EXISTS "absences_select_policy" ON public.absences;
DROP POLICY IF EXISTS "absences_write_policy" ON public.absences;

DROP POLICY IF EXISTS "roster_select_policy" ON public.roster_months;
DROP POLICY IF EXISTS "roster_write_policy" ON public.roster_months;

DROP POLICY IF EXISTS "time_select_policy" ON public.time_entries;
DROP POLICY IF EXISTS "time_write_policy" ON public.time_entries;


-- 2. Neue, strikt getrennte Policies erstellen

-- === PROFILES ===
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT WITH CHECK ((select auth.uid()) = id OR exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'));
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE USING ((select auth.uid()) = id OR exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'));
CREATE POLICY "profiles_delete" ON public.profiles FOR DELETE USING (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'));


-- === SHIFTS ===
CREATE POLICY "shifts_select" ON public.shifts FOR SELECT USING (true);
CREATE POLICY "shifts_insert" ON public.shifts FOR INSERT WITH CHECK (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'));
CREATE POLICY "shifts_update" ON public.shifts FOR UPDATE USING (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'));
CREATE POLICY "shifts_delete" ON public.shifts FOR DELETE USING (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'));


-- === SHIFT INTERESTS ===
CREATE POLICY "interests_select" ON public.shift_interests FOR SELECT USING (true);
-- Write Policies separat, kein FOR ALL
CREATE POLICY "interests_insert" ON public.shift_interests FOR INSERT WITH CHECK (user_id = (select auth.uid()) OR exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'));
CREATE POLICY "interests_update" ON public.shift_interests FOR UPDATE USING (user_id = (select auth.uid()) OR exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'));
CREATE POLICY "interests_delete" ON public.shift_interests FOR DELETE USING (user_id = (select auth.uid()) OR exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'));


-- === ABSENCES ===
CREATE POLICY "absences_select" ON public.absences FOR SELECT USING (true);
CREATE POLICY "absences_insert" ON public.absences FOR INSERT WITH CHECK (user_id = (select auth.uid()) OR exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'));
CREATE POLICY "absences_update" ON public.absences FOR UPDATE USING (user_id = (select auth.uid()) OR exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'));
CREATE POLICY "absences_delete" ON public.absences FOR DELETE USING (user_id = (select auth.uid()) OR exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'));


-- === ROSTER MONTHS ===
CREATE POLICY "roster_select" ON public.roster_months FOR SELECT USING (true);
CREATE POLICY "roster_insert" ON public.roster_months FOR INSERT WITH CHECK (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'));
CREATE POLICY "roster_update" ON public.roster_months FOR UPDATE USING (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'));
CREATE POLICY "roster_delete" ON public.roster_months FOR DELETE USING (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'));


-- === TIME ENTRIES ===
CREATE POLICY "time_select" ON public.time_entries FOR SELECT USING (user_id = (select auth.uid()) OR exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'));
CREATE POLICY "time_insert" ON public.time_entries FOR INSERT WITH CHECK (user_id = (select auth.uid()) OR exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'));
CREATE POLICY "time_update" ON public.time_entries FOR UPDATE USING (user_id = (select auth.uid()) OR exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'));
CREATE POLICY "time_delete" ON public.time_entries FOR DELETE USING (user_id = (select auth.uid()) OR exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'));
