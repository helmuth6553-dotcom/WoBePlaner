-- 1. Drop previous attempts if they exist partially (Cleanup)
DROP FUNCTION IF EXISTS create_signed_absence;
DROP TABLE IF EXISTS signatures;

-- 2. Create Signatures Table (Corrected Types)
CREATE TABLE signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id bigint NOT NULL REFERENCES absences(id) ON DELETE CASCADE, -- Changed to bigint/integer to match absences.id
  signer_id uuid NOT NULL REFERENCES profiles(id),
  role text NOT NULL,
  signed_at timestamptz NOT NULL DEFAULT now(),
  payload_snapshot jsonb NOT NULL,
  hash text NOT NULL,
  ip_address text,
  metadata jsonb DEFAULT '{}'::jsonb
);

-- 3. Add hash column to absences if not exists
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'absences' AND column_name = 'data_hash') THEN
    ALTER TABLE absences ADD COLUMN data_hash text;
  END IF;
END $$;

-- 4. Enable RLS
ALTER TABLE signatures ENABLE ROW LEVEL SECURITY;

-- 5. Policies
CREATE POLICY "Users can view signatures for their own requests" ON signatures
  FOR SELECT USING (
    signer_id = auth.uid() OR 
    EXISTS (SELECT 1 FROM absences WHERE id = signatures.request_id AND user_id = auth.uid())
  );

CREATE POLICY "Admins can view all signatures" ON signatures
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Users can insert their own signatures" ON signatures
  FOR INSERT WITH CHECK (
    signer_id = auth.uid()
  );

-- 6. RPC Function (Corrected Return Type)
CREATE OR REPLACE FUNCTION create_signed_absence(
  p_absence_data jsonb,
  p_signature_data jsonb
) RETURNS bigint AS $$ -- Changed return type to bigint
DECLARE
  v_absence_id bigint; -- Changed variable type
BEGIN
  -- Insert Absence
  INSERT INTO absences (user_id, start_date, end_date, type, status, data_hash)
  VALUES (
    (p_absence_data->>'user_id')::uuid,
    (p_absence_data->>'start_date')::date,
    (p_absence_data->>'end_date')::date,
    p_absence_data->>'type',
    p_absence_data->>'status',
    p_signature_data->>'hash'
  )
  RETURNING id INTO v_absence_id;

  -- Insert Signature
  INSERT INTO signatures (request_id, signer_id, role, payload_snapshot, hash, ip_address)
  VALUES (
    v_absence_id,
    (p_signature_data->>'signer_id')::uuid,
    p_signature_data->>'role',
    p_absence_data,
    p_signature_data->>'hash',
    p_signature_data->>'ip_address'
  );

  RETURN v_absence_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
