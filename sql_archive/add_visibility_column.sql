-- Add is_visible column to roster_months table
ALTER TABLE public.roster_months 
ADD COLUMN IF NOT EXISTS is_visible BOOLEAN DEFAULT TRUE;

-- Update existing records to be visible by default
UPDATE public.roster_months SET is_visible = TRUE WHERE is_visible IS NULL;

-- Comment
COMMENT ON COLUMN public.roster_months.is_visible IS 'Controls if the shift plan for this month is visible to regular users';
