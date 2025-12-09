-- Drop the incorrect function first
DROP FUNCTION IF EXISTS create_signed_absence(UUID, DATE, DATE, TEXT, TEXT, TEXT, JSONB);

-- Re-create with correct return type (BIGINT) for the absence ID
CREATE OR REPLACE FUNCTION create_signed_absence(
  p_user_id UUID,
  p_start_date DATE,
  p_end_date DATE,
  p_type TEXT,
  p_notes TEXT,
  p_signature_hash TEXT,
  p_signature_data JSONB
) RETURNS BIGINT AS $$
DECLARE
  v_absence_id BIGINT;
  v_status TEXT := 'beantragt'; 
BEGIN
  -- 1. Insert Absence
  INSERT INTO absences (user_id, start_date, end_date, type, status, data_hash)
  VALUES (p_user_id, p_start_date, p_end_date, p_type, v_status, p_signature_hash)
  RETURNING id INTO v_absence_id;

  -- 2. Insert Signature
  INSERT INTO signatures (request_id, signer_id, role, payload_snapshot, hash, ip_address)
  VALUES (
    v_absence_id,
    (p_signature_data->>'signer_id')::uuid,
    p_signature_data->>'role',
    jsonb_build_object('user_id', p_user_id, 'start_date', p_start_date, 'end_date', p_end_date, 'type', p_type, 'status', v_status),
    p_signature_hash,
    p_signature_data->>'ip_address'
  );

  RETURN v_absence_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
