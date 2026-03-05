-- Coverage System Migration
-- Run this in Supabase SQL Editor

-- 1. Add availability_preference to shift_interests
-- Allows 3-level voting: available, reluctant, emergency_only
-- NULL = normal interest (backwards compatible)
ALTER TABLE shift_interests
ADD COLUMN IF NOT EXISTS availability_preference TEXT
CHECK (availability_preference IN ('available', 'reluctant', 'emergency_only'));

-- 2. Coverage Votes tracking (for penalty/missed vote calculation)
CREATE TABLE IF NOT EXISTS coverage_votes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    shift_id UUID REFERENCES shifts(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES profiles(id) NOT NULL,
    was_eligible BOOLEAN DEFAULT true,
    responded BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(shift_id, user_id)
);

-- 3. Coverage Requests tracking (lifecycle of a coverage request)
CREATE TABLE IF NOT EXISTS coverage_requests (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    shift_id UUID REFERENCES shifts(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    status TEXT DEFAULT 'open'
        CHECK (status IN ('open', 'assigned', 'expired')),
    resolved_by UUID REFERENCES profiles(id),
    assigned_to UUID REFERENCES profiles(id),
    resolved_at TIMESTAMPTZ,
    UNIQUE(shift_id)
);

-- RLS Policies
ALTER TABLE coverage_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE coverage_requests ENABLE ROW LEVEL SECURITY;

-- Everyone can read coverage data
CREATE POLICY "Anyone can read coverage_votes" ON coverage_votes
    FOR SELECT USING (true);

CREATE POLICY "Anyone can read coverage_requests" ON coverage_requests
    FOR SELECT USING (true);

-- Users can update their own vote response
CREATE POLICY "Users can update own votes" ON coverage_votes
    FOR UPDATE USING (auth.uid() = user_id);

-- Service role handles inserts (via edge functions)
CREATE POLICY "Service can manage coverage_votes" ON coverage_votes
    FOR ALL USING (true);

CREATE POLICY "Service can manage coverage_requests" ON coverage_requests
    FOR ALL USING (true);
