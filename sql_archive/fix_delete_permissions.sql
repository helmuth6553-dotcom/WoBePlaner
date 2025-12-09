-- Allow Admins to DELETE shifts
DROP POLICY IF EXISTS "Admins can delete shifts" ON shifts;
CREATE POLICY "Admins can delete shifts"
ON shifts
FOR DELETE
USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
);

-- Allow Admins to DELETE shift_interests (for cascade cleanup)
DROP POLICY IF EXISTS "Admins can delete shift_interests" ON shift_interests;
CREATE POLICY "Admins can delete shift_interests"
ON shift_interests
FOR DELETE
USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
);
