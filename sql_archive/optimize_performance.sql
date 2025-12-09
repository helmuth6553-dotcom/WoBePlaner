-- Optimierung der Datenbank-Performance für den Dienstplan
-- Erstellt Indizes für häufig durchsuchte Spalten
-- Risiko: Gering (Nur Performance-Verbesserung, keine Datenänderung)

-- 1. Index für Schicht-Startzeiten (Wird bei jedem Kalender-Laden genutzt)
CREATE INDEX IF NOT EXISTS idx_shifts_start_time ON shifts(start_time);

-- 2. Index für Schicht-Interessen nach User (Häufige Filterung)
CREATE INDEX IF NOT EXISTS idx_shift_interests_user_id ON shift_interests(user_id);
CREATE INDEX IF NOT EXISTS idx_shift_interests_shift_id ON shift_interests(shift_id);

-- 3. Index für Zeiteinträge (Kritisch für TimeTracking.jsx Ladezeit)
CREATE INDEX IF NOT EXISTS idx_time_entries_user_id ON time_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_actual_start ON time_entries(actual_start);
CREATE INDEX IF NOT EXISTS idx_time_entries_entry_date ON time_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_time_entries_shift_id ON time_entries(shift_id);

-- 4. Index für Abwesenheiten
CREATE INDEX IF NOT EXISTS idx_absences_user_id ON absences(user_id);
CREATE INDEX IF NOT EXISTS idx_absences_date_range ON absences(start_date, end_date);

-- 5. Index für die Profil-Suche (Admin Dashboard)
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);

-- Analyse aktualisieren, um die neuen Indizes sofort zu nutzen
ANALYZE shifts;
ANALYZE shift_interests;
ANALYZE time_entries;
ANALYZE absences;
ANALYZE profiles;
