-- 1. Add role column to profiles
alter table public.profiles 
add column if not exists role text default 'user';

-- 2. Create a secure function to check if the invoking user is an admin
create or replace function public.is_admin()
returns boolean as $$
begin
  return exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
end;
$$ language plpgsql security definer;

-- 3. RLS Policy Updates

-- ROSTER MONTHS
drop policy if exists "Authenticated write access" on public.roster_months;
drop policy if exists "Admins can manage months" on public.roster_months;
create policy "Admins can manage months" on public.roster_months
  for all using (is_admin());

-- PROFILES (Role Management)
-- Allow admins to update roles of other users
drop policy if exists "Admins can update any profile" on public.profiles;
create policy "Admins can update any profile" on public.profiles
  for update using (is_admin());

-- ABSENCES (Approvals)
-- Allow admins to update status
drop policy if exists "Admins can update absences" on public.absences;
create policy "Admins can update absences" on public.absences
  for update using (is_admin());

-- SHIFTS (Assignments)
-- Allow admins to update assignments
drop policy if exists "Admins can update shifts" on public.shifts;
create policy "Admins can update shifts" on public.shifts
  for update using (is_admin());

-- ==========================================
-- WICHTIG: ADMIN RECHTE VERGEBEN
-- Damit du die Admin-Funktionen nutzen kannst, musst du dich selbst zum Admin machen.
-- Kopiere die folgende Zeile, ersetze die E-Mail und führe sie im SQL Editor aus:
--
-- UPDATE public.profiles SET role = 'admin' WHERE email = 'deine.email@adresse.de';
-- ==========================================
