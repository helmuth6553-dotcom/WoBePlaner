-- NUCLEAR RLS OPTION
-- Drop ALL policies regarding SELECT on crucial tables to ensure clean slate
-- Then enable FULL ACCESS for authenticated users

-- ABSENCES
drop policy if exists "Enable read access for all users" on absences;
drop policy if exists "Users can view their own absences" on absences;
drop policy if exists "Admins can view all absences" on absences;
drop policy if exists "Public absences" on absences;
-- (Add any other potential names you might suspect, or loop via manual inspection if possible)

create policy "ALLOW_SELECT_ABSENCES_ALL"
on absences for select
to authenticated
using (true);

-- SHIFTS
drop policy if exists "Enable read access for all users" on shifts;
drop policy if exists "Users can view their own shifts" on shifts;
drop policy if exists "Users can view assigned shifts" on shifts;

create policy "ALLOW_SELECT_SHIFTS_ALL"
on shifts for select
to authenticated
using (true);

-- TIME ENTRIES
drop policy if exists "Enable read access for all users" on time_entries;

create policy "ALLOW_SELECT_TIME_ENTRIES_ALL"
on time_entries for select
to authenticated
using (true);
