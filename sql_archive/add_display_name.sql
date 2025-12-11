-- Display Name Feature Migration
-- Run this in Supabase SQL Editor

-- Add display_name column to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS display_name TEXT;

-- Optional: Copy existing full_name as initial display_name for all users
-- UPDATE profiles SET display_name = full_name WHERE display_name IS NULL;
