-- Drop the old function signature if it exists
DROP FUNCTION IF EXISTS create_signed_absence(jsonb, jsonb);

-- Create the new function with individual parameters to match the frontend call
CREATE OR REPLACE FUNCTION create_signed_absence(
  p_user_id UUID,
  p_start_date DATE,
  p_end_date DATE,
  p_type TEXT,
  p_notes TEXT,
  p_signature_hash TEXT,
  p_signature_data JSONB
) RETURNS UUID AS $$
DECLARE
  v_absence_id UUID;
  v_status TEXT := 'beantragt'; -- Default status
BEGIN
  -- 1. Insert Absence
  INSERT INTO absences (
    user_id, 
    start_date, 
    end_date, 
    type, 
    status, 
    data_hash
    -- notes column might not exist in your schema yet, usually absences structure is lean given the project history.
    -- If 'notes' column exists in 'absences', add it here. If not, we ignore p_notes for now or add it to profiles/metadata.
    -- Assuming standard fields for now based on previous code.
  )
  VALUES (
    p_user_id,
    p_start_date,
    p_end_date,
    p_type,
    v_status,
    p_signature_hash
  )
  RETURNING id INTO v_absence_id;

  -- 2. Insert Signature
  INSERT INTO signatures (
    request_id, 
    signer_id, 
    role, 
    payload_snapshot, 
    hash, 
    ip_address
  )
  VALUES (
    v_absence_id,
    (p_signature_data->>'signer_id')::uuid,
    p_signature_data->>'role',
    -- Reconstruct the payload object for the snapshot or use the one inside signature data if passed
    jsonb_build_object(
      'user_id', p_user_id,
      'start_date', p_start_date,
      'end_date', p_end_date,
      'type', p_type,
      'status', v_status
    ),
    p_signature_hash,
    p_signature_data->>'ip_address'
  );

  RETURN v_absence_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
