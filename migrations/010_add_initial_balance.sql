-- Migration: Add initial_balance field for employee onboarding with existing hour balances
-- This allows admins to set a starting balance when onboarding existing team members

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS initial_balance DECIMAL(10,2) DEFAULT 0;

COMMENT ON COLUMN profiles.initial_balance IS 
  'Historical hour balance at app introduction. Used for onboarding existing employees with pre-existing overtime/undertime.';

-- Example usage:
-- UPDATE profiles SET initial_balance = -10 WHERE email = 'max@example.com'; -- Max has 10 deficit hours
-- UPDATE profiles SET initial_balance = 23.5 WHERE email = 'lisa@example.com'; -- Lisa has 23.5 overtime hours
