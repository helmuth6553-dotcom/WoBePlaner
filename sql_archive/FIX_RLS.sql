-- FIX RLS POLICIES
-- Enable read access for all authenticated users to see colleagues' data in Team Panel

-- 1. Absences (Currently likely restricted to owner)
-- We need read access to CALCULATE BALANCE for colleagues.
drop policy if exists "Enable read access for all users" on absences;
create policy "Enable read access for all users"
on absences for select
to authenticated
using (true);

-- 2. Shifts (Should be public mostly, but ensure direct assignments are visible)
drop policy if exists "Enable read access for all users" on shifts;
create policy "Enable read access for all users"
on shifts for select
to authenticated
using (true);

-- 3. Time Entries (Calculated hours history)
drop policy if exists "Enable read access for all users" on time_entries;
create policy "Enable read access for all users"
on time_entries for select
to authenticated
using (true);

-- 4. Shift Interests (Usually visible, but ensure)
drop policy if exists "Enable read access for all users" on shift_interests;
create policy "Enable read access for all users"
on shift_interests for select
to authenticated
using (true);
