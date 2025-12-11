-- ============================================
-- Soft Delete für Mitarbeiter
-- Führen Sie dieses Script in Supabase aus
-- ============================================

-- 1. Neue Spalten für Soft Delete
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS deactivated_by UUID REFERENCES profiles(id);

-- 2. Alle bestehenden Mitarbeiter als aktiv markieren
UPDATE profiles SET is_active = true WHERE is_active IS NULL;

-- 3. Index für Performance bei häufigen Abfragen
CREATE INDEX IF NOT EXISTS idx_profiles_is_active ON profiles(is_active);

-- 4. Verifizierung
SELECT id, full_name, email, is_active, deactivated_at 
FROM profiles 
ORDER BY full_name;
