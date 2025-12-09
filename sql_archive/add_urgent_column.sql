-- 1. Add urgent_since to shifts table to track when a shift became urgent (sick dropout)
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS urgent_since timestamptz;

-- 2. Ensure shift_interests has created_at to track when a user signed up (for FLEX bonus calculation)
ALTER TABLE public.shift_interests ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
