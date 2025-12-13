-- ============================================================
-- Migration: Add password_set field to profiles
-- Purpose: Track whether invited users have set their password
-- ============================================================

-- Add the password_set column (defaults to true for existing users)
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS password_set BOOLEAN DEFAULT true;

-- Comment for documentation
COMMENT ON COLUMN profiles.password_set IS 'Whether the user has set their own password. False for newly invited users.';

-- For existing users, ensure password_set is true
UPDATE profiles SET password_set = true WHERE password_set IS NULL;
