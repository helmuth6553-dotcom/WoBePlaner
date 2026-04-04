-- Konfigurierbare Dienstzeiten (Admin kann Zeiten ohne Code-Change anpassen)
-- Überschreibt die hardcodierten Defaults in ShiftTemplateContext.jsx.
-- Fallback: wenn kein Eintrag vorhanden, werden die hardcodierten Defaults verwendet.

CREATE TABLE shift_time_configs (
    shift_type        TEXT PRIMARY KEY,
    start_time        TIME NOT NULL,
    end_time          TIME NOT NULL,
    -- Wochenend-Override (Samstag + Sonntag gleich)
    weekend_start     TIME,
    weekend_end       TIME,
    -- Feiertags-Override
    holiday_start     TIME,
    holiday_end       TIME,
    -- Freitag/Samstag End-Override (primär für ND: 10:00 statt 08:00)
    fri_sat_end       TIME,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE shift_time_configs ENABLE ROW LEVEL SECURITY;

-- Alle angemeldeten Nutzer dürfen lesen (für getDefaultTimes in allen Komponenten)
CREATE POLICY "shift_time_configs read"
    ON shift_time_configs FOR SELECT TO authenticated
    USING (true);

-- Nur Admins dürfen schreiben
CREATE POLICY "shift_time_configs admin write"
    ON shift_time_configs FOR ALL TO authenticated
    USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin')
    WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- Seed: aktuelle Defaults aus ShiftTemplateContext.jsx
INSERT INTO shift_time_configs (shift_type, start_time, end_time, weekend_start, weekend_end, holiday_start, holiday_end, fri_sat_end) VALUES
    ('TD1',                 '07:30', '14:30', '09:30', '14:30', '09:30', '14:30', NULL),
    ('TD2',                 '14:00', '19:30', NULL,    NULL,    NULL,    NULL,    NULL),
    ('ND',                  '19:00', '08:00', NULL,    NULL,    NULL,    NULL,    '10:00'),
    ('DBD',                 '20:00', '00:00', NULL,    NULL,    NULL,    NULL,    NULL),
    ('AST',                 '16:45', '19:45', NULL,    NULL,    NULL,    NULL,    NULL),
    ('TEAM',                '09:30', '11:30', NULL,    NULL,    NULL,    NULL,    NULL),
    ('FORTBILDUNG',         '09:00', '17:00', NULL,    NULL,    NULL,    NULL,    NULL),
    ('EINSCHULUNG',         '13:00', '15:00', NULL,    NULL,    NULL,    NULL,    NULL),
    ('MITARBEITERGESPRAECH','10:00', '11:00', NULL,    NULL,    NULL,    NULL,    NULL),
    ('SONSTIGES',           '10:00', '11:00', NULL,    NULL,    NULL,    NULL,    NULL),
    ('SUPERVISION',         '09:00', '10:30', NULL,    NULL,    NULL,    NULL,    NULL);
