-- 1. Create Shift Logs Table
-- Drop first if exists to allow type change
DROP TABLE IF EXISTS shift_logs;

CREATE TABLE shift_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  shift_id BIGINT REFERENCES shifts(id) ON DELETE CASCADE,
  old_user_id UUID REFERENCES profiles(id),
  new_user_id UUID REFERENCES profiles(id),
  changed_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  action_type TEXT DEFAULT 'swap'
);

-- Enable RLS
ALTER TABLE shift_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Admins can view all logs
CREATE POLICY "Admins can view shift logs"
ON shift_logs FOR SELECT
USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- 2. Create Swap Function (Interest Based)
-- Drop function first to allow signature change
DROP FUNCTION IF EXISTS perform_shift_swap;

CREATE OR REPLACE FUNCTION perform_shift_swap(p_shift_id BIGINT, p_new_user_id UUID)
RETURNS VOID AS $$
DECLARE
  v_old_user_id UUID;
BEGIN
  v_old_user_id := auth.uid();

  -- Check if the current user is actually signed up (interested)
  IF NOT EXISTS (SELECT 1 FROM shift_interests WHERE shift_id = p_shift_id AND user_id = v_old_user_id) THEN
     RAISE EXCEPTION 'You are not signed up for this shift.';
  END IF;

  -- Remove old interest
  DELETE FROM shift_interests WHERE shift_id = p_shift_id AND user_id = v_old_user_id;

  -- Add new interest (ensure no duplicate)
  INSERT INTO shift_interests (shift_id, user_id)
  VALUES (p_shift_id, p_new_user_id)
  ON CONFLICT DO NOTHING;

  -- Log the change
  INSERT INTO shift_logs (shift_id, old_user_id, new_user_id, changed_by, action_type)
  VALUES (p_shift_id, v_old_user_id, p_new_user_id, auth.uid(), 'swap');

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
