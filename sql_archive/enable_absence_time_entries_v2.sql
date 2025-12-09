-- 1. shift_id optional machen
ALTER TABLE public.time_entries 
    ALTER COLUMN shift_id DROP NOT NULL;

-- 2. Bestehenden Unique Constraint entfernen (war shift_id, user_id)
ALTER TABLE public.time_entries DROP CONSTRAINT IF EXISTS time_entries_shift_id_user_id_key;

-- 3. Neue Spalten für Absences hinzufügen (diesmal mit korrektem Typ INT)
-- Wir prüfen erst den Typ der absences.id Spalte, aber INT ist der Standardfehler.
-- Sicherheitshalber machen wir einfach BIGINT, das passt meistens auf Integer auch.
ALTER TABLE public.time_entries 
    ADD COLUMN IF NOT EXISTS absence_id BIGINT REFERENCES public.absences(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS entry_date DATE;

-- 4. Neue Unique Indices für beide Fälle erstellen
DROP INDEX IF EXISTS idx_unique_shift_entry;
CREATE UNIQUE INDEX idx_unique_shift_entry 
    ON public.time_entries(user_id, shift_id) 
    WHERE shift_id IS NOT NULL;

DROP INDEX IF EXISTS idx_unique_absence_entry;
CREATE UNIQUE INDEX idx_unique_absence_entry 
    ON public.time_entries(user_id, absence_id, entry_date) 
    WHERE absence_id IS NOT NULL;

-- 5. Policies Helper Update
CREATE OR REPLACE FUNCTION public.check_time_entry_lock(p_user_id UUID, p_shift_id UUID, p_entry_date DATE)
RETURNS BOOLEAN AS $$
DECLARE
    v_date DATE;
BEGIN
    IF p_shift_id IS NOT NULL THEN
        SELECT date(start_time) INTO v_date FROM public.shifts WHERE id = p_shift_id;
    ELSE
        v_date := p_entry_date;
    END IF;

    -- Wenn Monat gelockt ist, RETURN FALSE (Nicht erlaubt)
    RETURN NOT public.is_month_locked(p_user_id, v_date);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update Policies to use the cleaner function
DROP POLICY IF EXISTS "Users insert own entries if not locked" ON public.time_entries;
DROP POLICY IF EXISTS "Users update own entries if not locked" ON public.time_entries;
DROP POLICY IF EXISTS "Users delete own entries if not locked" ON public.time_entries;

CREATE POLICY "Users insert own entries if not locked" ON public.time_entries
FOR INSERT WITH CHECK (
    auth.uid() = user_id 
    AND public.check_time_entry_lock(user_id, shift_id, entry_date)
);

CREATE POLICY "Users update own entries if not locked" ON public.time_entries
FOR UPDATE USING (
    auth.uid() = user_id 
    AND public.check_time_entry_lock(user_id, shift_id, entry_date)
);

CREATE POLICY "Users delete own entries if not locked" ON public.time_entries
FOR DELETE USING (
    auth.uid() = user_id 
    AND public.check_time_entry_lock(user_id, shift_id, entry_date)
);
