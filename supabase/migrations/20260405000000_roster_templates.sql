-- Wochenplan-Templates für die Dienstplan-Generierung
-- Speichert welche Diensttypen an welchem Wochentag stattfinden.
-- Die tatsächlichen Zeiten werden weiterhin aus ShiftTemplateContext berechnet
-- (inkl. Feiertags- und Wochenendregeln).

CREATE TABLE roster_templates (
    id BIGSERIAL PRIMARY KEY,
    weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 1 AND 7), -- 1=Montag, 7=Sonntag (ISO)
    shift_type TEXT NOT NULL,
    sort_order SMALLINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (weekday, shift_type)
);

ALTER TABLE roster_templates ENABLE ROW LEVEL SECURITY;

-- Nur Admins dürfen lesen und schreiben
CREATE POLICY "roster_templates admin only"
    ON roster_templates
    FOR ALL
    TO authenticated
    USING (
        (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
    )
    WITH CHECK (
        (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
    );
