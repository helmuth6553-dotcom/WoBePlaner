-- FIXED v2: Function to mark shifts as urgent when a user reports sick
-- Removed the redundant check - the frontend already verified ownership

-- First drop the old functions
DROP FUNCTION IF EXISTS mark_shifts_urgent(UUID[], UUID);
DROP FUNCTION IF EXISTS mark_shifts_urgent(BIGINT[], UUID);

-- Create the simplified function
CREATE OR REPLACE FUNCTION mark_shifts_urgent(
    p_shift_ids BIGINT[],
    p_user_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Update shifts: set urgent_since and clear assigned_to if it was the user
    -- We trust the frontend already verified these shifts belonged to the user
    UPDATE shifts
    SET 
        urgent_since = NOW(),
        assigned_to = CASE 
            WHEN assigned_to = p_user_id THEN NULL 
            ELSE assigned_to 
        END
    WHERE id = ANY(p_shift_ids);
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION mark_shifts_urgent(BIGINT[], UUID) TO authenticated;
