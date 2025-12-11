-- DANGEROUS: This script deletes transaction data to reset the system.
-- It preserves Employees (profiles) and Service Plans (shifts).

-- 1. Clear Time Entries (Transactions)
DELETE FROM time_entries;

-- 2. Clear Absences (Vacation, Sick Leave)
DELETE FROM absences;

-- 3. Clear Monthly Reports (Locked reports & Signatures)
DELETE FROM monthly_reports;

-- 4. Clear Shift Interests (User assignment requests)
DELETE FROM shift_interests;

-- 5. Clear Audit Logs (History of changes)
DELETE FROM admin_actions;

-- 6. Clear Shift Logs (Roster change history)
DELETE FROM shift_logs;

-- Note: 'shifts' (Dienstplan) and 'profiles' (Employees) are NOT deleted.
