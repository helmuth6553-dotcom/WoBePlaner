-- Add availability_preference column to coverage_votes
-- This allows voting preferences to be stored separately from shift_interests,
-- preventing the premature shift assignment bug.
ALTER TABLE coverage_votes 
ADD COLUMN IF NOT EXISTS availability_preference TEXT 
CHECK (availability_preference IN ('available', 'reluctant', 'emergency_only'));
