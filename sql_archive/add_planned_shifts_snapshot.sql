-- Add column to store planned shifts snapshot when reporting sick
-- This preserves the original shift data even after interests are deleted

ALTER TABLE absences ADD COLUMN IF NOT EXISTS planned_shifts_snapshot JSONB DEFAULT NULL;

-- Comment for documentation
COMMENT ON COLUMN absences.planned_shifts_snapshot IS 'Stores the planned shifts at the time of sick report, preserving original shift times even after interests are deleted';
