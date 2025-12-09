-- Add approved_by column to absences
ALTER TABLE absences
ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES profiles(id);

-- Optional: Update RLS policies?
-- Currently RLS seems open enough for admins to update, but good to know for future.
