-- Sicherstellen, dass RLS aktiv ist
ALTER TABLE absences ENABLE ROW LEVEL SECURITY;

-- Alte/Kaputte Regeln aufräumen
DROP POLICY IF EXISTS "Users can view own absences" ON absences;
DROP POLICY IF EXISTS "Users can insert own absences" ON absences;
DROP POLICY IF EXISTS "Admins can view all absences" ON absences;
DROP POLICY IF EXISTS "Admins can update absences" ON absences;
DROP POLICY IF EXISTS "Admins full access" ON absences;

-- 1. Mitarbeiter: Dürfen ihre EIGENEN Daten sehen
CREATE POLICY "Users can view own absences" ON absences
FOR SELECT USING (
  auth.uid() = user_id
);

-- 2. Mitarbeiter: Dürfen EIGENE Daten erstellen
CREATE POLICY "Users can insert own absences" ON absences
FOR INSERT WITH CHECK (
  auth.uid() = user_id
);

-- 3. Admins: Dürfen ALLES (Sehen, Bearbeiten, Löschen)
CREATE POLICY "Admins full access" ON absences
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND role = 'admin'
  )
);
