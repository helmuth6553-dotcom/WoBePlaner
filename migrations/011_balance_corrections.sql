-- Migration: Balance Corrections Table
-- Allows admins to create manual hour corrections for employees
-- Fully auditable with required reason

CREATE TABLE IF NOT EXISTS balance_corrections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) NOT NULL,
    
    -- What is being corrected?
    correction_hours DECIMAL(10,2) NOT NULL,  -- e.g. -5 (subtract 5 hours) or +3 (add 3 hours)
    effective_month DATE NOT NULL,            -- First day of the month, e.g. 2024-11-01
    
    -- Documentation (required!)
    reason TEXT NOT NULL,
    
    -- Audit trail
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_balance_corrections_user_month 
ON balance_corrections(user_id, effective_month);

-- RLS Policies
ALTER TABLE balance_corrections ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins can manage corrections" ON balance_corrections
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- Users can view their own corrections
CREATE POLICY "Users can view own corrections" ON balance_corrections
    FOR SELECT USING (user_id = auth.uid());

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE balance_corrections;

COMMENT ON TABLE balance_corrections IS 'Manual hour corrections by admin for fixing errors in time tracking';
COMMENT ON COLUMN balance_corrections.correction_hours IS 'Positive = add hours, Negative = subtract hours';
COMMENT ON COLUMN balance_corrections.effective_month IS 'First day of month this correction applies to';
COMMENT ON COLUMN balance_corrections.reason IS 'Required explanation for audit trail';
