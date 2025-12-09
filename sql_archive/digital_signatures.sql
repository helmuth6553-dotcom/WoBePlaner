-- Create Signatures Table
CREATE TABLE IF NOT EXISTS signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES absences(id) ON DELETE CASCADE,
  signer_id uuid NOT NULL REFERENCES profiles(id),
  role text NOT NULL, -- 'applicant', 'approver'
  signed_at timestamptz NOT NULL DEFAULT now(),
  payload_snapshot jsonb NOT NULL,
  hash text NOT NULL,
  ip_address text,
  metadata jsonb DEFAULT '{}'::jsonb
);

-- Add hash column to absences if not exists
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'absences' AND column_name = 'data_hash') THEN
    ALTER TABLE absences ADD COLUMN data_hash text;
  END IF;
END $$;

-- Enable RLS
ALTER TABLE signatures ENABLE ROW LEVEL SECURITY;

-- Policies for signatures
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

-- RPC Function to create absence and signature transactionally
CREATE OR REPLACE FUNCTION create_signed_absence(
  p_absence_data jsonb,
  p_signature_data jsonb
) RETURNS uuid AS $$
DECLARE
  v_absence_id uuid;
BEGIN
  -- 1. Insert Absence
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

  -- 2. Insert Signature
  INSERT INTO signatures (request_id, signer_id, role, payload_snapshot, hash, ip_address)
  VALUES (
    v_absence_id,
    (p_signature_data->>'signer_id')::uuid,
    p_signature_data->>'role',
    p_absence_data, -- The signed payload
    p_signature_data->>'hash',
    p_signature_data->>'ip_address'
  );

  RETURN v_absence_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
