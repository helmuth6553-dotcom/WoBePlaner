-- Add approved_at column to track exact timestamp of approval
ALTER TABLE absences
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

-- Optional: Add a comment
COMMENT ON COLUMN absences.approved_at IS 'Timestamp when the request was approved by an admin';
