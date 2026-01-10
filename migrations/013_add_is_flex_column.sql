-- Migration: Add is_flex column to shift_interests for manual FLEX assignment
-- Created: 2026-01-10

-- Add is_flex boolean column (NULL means automatic calculation applies)
ALTER TABLE public.shift_interests 
ADD COLUMN IF NOT EXISTS is_flex BOOLEAN DEFAULT NULL;

-- Comment for documentation
COMMENT ON COLUMN public.shift_interests.is_flex IS 
'Manual FLEX override. NULL/FALSE = use automatic calculation, TRUE = force FLEX tag.';
