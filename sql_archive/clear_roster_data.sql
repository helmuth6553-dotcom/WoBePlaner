-- Clear all roster data (Shifts, Interests, Absences) but KEEP Profiles/Users.

-- 1. Clear Shift Interests (Child of Shifts)
DELETE FROM public.shift_interests;

-- 2. Clear Shifts
DELETE FROM public.shifts;

-- 3. Clear Absences (Vacation, Sick, etc.)
DELETE FROM public.absences;

-- 4. Clear Roster Month Statuses (Reset Open/Closed state)
DELETE FROM public.roster_months;

-- Note: This does NOT delete profiles, auth.users, or locations.
