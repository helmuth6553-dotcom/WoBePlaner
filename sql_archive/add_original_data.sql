ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS original_data JSONB;

-- Optional: Backfill existing entries to have original_data = current data (assuming they were correct or just to have a baseline)
UPDATE time_entries 
SET original_data = jsonb_build_object(
    'start', actual_start,
    'end', actual_end,
    'interruptions', interruptions
)
WHERE original_data IS NULL;
