-- RPC function to assign a coverage request.
-- Runs as SECURITY DEFINER so any authenticated user can assign shifts
-- to other users (the RLS policy on shift_interests only allows self-inserts).
CREATE OR REPLACE FUNCTION assign_coverage(
    p_shift_id uuid,
    p_user_id uuid,
    p_resolved_by uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- 1. Create or update the shift interest (marks the shift as taken)
    INSERT INTO shift_interests (shift_id, user_id, is_flex)
    VALUES (p_shift_id, p_user_id, true)
    ON CONFLICT (shift_id, user_id) DO UPDATE SET is_flex = true;

    -- 2. Mark the coverage request as assigned
    UPDATE coverage_requests
    SET status = 'assigned',
        assigned_to = p_user_id,
        resolved_by = p_resolved_by,
        resolved_at = now()
    WHERE shift_id = p_shift_id;
END;
$$;
