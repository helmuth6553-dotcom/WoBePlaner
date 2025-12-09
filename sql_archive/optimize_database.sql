-- Supabase Optimierungs-Skript (Korrigiert)
-- Entfernt den fehlerhaften Index auf 'date' und nutzt existierende Spalten.

-- Indizes für Tabelle 'shifts'
CREATE INDEX IF NOT EXISTS idx_shifts_start_time ON public.shifts (start_time);
CREATE INDEX IF NOT EXISTS idx_shifts_end_time ON public.shifts (end_time);
CREATE INDEX IF NOT EXISTS idx_shifts_assigned_to ON public.shifts (assigned_to);

-- Indizes für Tabelle 'shift_interests'
CREATE INDEX IF NOT EXISTS idx_shift_interests_user_id ON public.shift_interests (user_id);
CREATE INDEX IF NOT EXISTS idx_shift_interests_shift_id ON public.shift_interests (shift_id);

-- Indizes für Tabelle 'absences'
CREATE INDEX IF NOT EXISTS idx_absences_user_id ON public.absences (user_id);
CREATE INDEX IF NOT EXISTS idx_absences_start_date ON public.absences (start_date);
CREATE INDEX IF NOT EXISTS idx_absences_end_date ON public.absences (end_date);
CREATE INDEX IF NOT EXISTS idx_absences_status ON public.absences (status);

-- Indizes für Tabelle 'time_entries'
-- Korrektur: Kein 'date', stattdessen shift_id und user_id
CREATE INDEX IF NOT EXISTS idx_time_entries_user_id ON public.time_entries (user_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_shift_id ON public.time_entries (shift_id);
-- Falls Sie nach tatsächlichem Beginn filtern wollen:
-- CREATE INDEX IF NOT EXISTS idx_time_entries_actual_start ON public.time_entries (actual_start);

-- Indizes für Tabelle 'roster_months'
CREATE INDEX IF NOT EXISTS idx_roster_months_year_month ON public.roster_months (year, month);
