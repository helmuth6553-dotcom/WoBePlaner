-- Remove shifts.assigned_to column (dead code)
--
-- This column was the old direct-assignment mechanism before shift_interests.
-- Nothing in the current app writes to it — all shift tracking uses shift_interests.
-- coverage_requests.assigned_to (separate table) is NOT touched here.

-- 1. Update RLS policy on shifts — remove the assigned_to branch
DROP POLICY IF EXISTS "policy_shifts_read_all" ON public.shifts;

CREATE POLICY "policy_shifts_read_all" ON public.shifts
  FOR SELECT TO authenticated
  USING (
    -- Non-private types: visible for everyone
    type NOT IN ('MITARBEITERGESPRAECH')
    OR
    -- Private types: only admin or participants via shift_interests
    (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = (SELECT auth.uid()) AND role = 'admin'
      )
      OR EXISTS (
        SELECT 1 FROM public.shift_interests
        WHERE shift_id = shifts.id AND user_id = (SELECT auth.uid())
      )
    )
  );

-- 2. Drop the column
ALTER TABLE public.shifts DROP COLUMN IF EXISTS assigned_to;
