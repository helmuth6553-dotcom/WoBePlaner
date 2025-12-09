-- Aktualisiere Policies für time_entries um den "Lock" zu respektieren

-- Bestehende Policies droppen (um Konflikte zu vermeiden - wir schreiben sie neu)
DROP POLICY IF EXISTS "Users can insert own time entries" ON public.time_entries;
DROP POLICY IF EXISTS "Users can update own time entries" ON public.time_entries;
DROP POLICY IF EXISTS "Users can delete own time entries" ON public.time_entries;

-- 1. INSERT Policy
-- Erlaubt, wenn User ID passt UND Shifts-Datum nicht in einem gelockten Monat liegt
-- (Hinweis: Das Joinen in Policies kann Performanz kosten, ist aber hier nötig für Sicherheit)
CREATE POLICY "Users insert own entries if not locked" ON public.time_entries
FOR INSERT WITH CHECK (
    auth.uid() = user_id 
    AND NOT public.is_month_locked(
        auth.uid(), 
        (SELECT date(start_time) FROM public.shifts WHERE id = shift_id)
    )
);

-- 2. UPDATE Policy
-- Erlaubt, wenn User ID passt UND nicht gelockt
CREATE POLICY "Users update own entries if not locked" ON public.time_entries
FOR UPDATE USING (
    auth.uid() = user_id 
    AND NOT public.is_month_locked(
        auth.uid(), 
        (SELECT date(start_time) FROM public.shifts WHERE id = shift_id)
    )
);

-- 3. DELETE Policy
CREATE POLICY "Users delete own entries if not locked" ON public.time_entries
FOR DELETE USING (
    auth.uid() = user_id 
    AND NOT public.is_month_locked(
        auth.uid(), 
        (SELECT date(start_time) FROM public.shifts WHERE id = shift_id)
    )
);

-- SELECT bleibt wie gehabt (User sieht immer seine, Admin sieht alle)
-- (Diese Policy rühren wir nicht an, oder stellen sicher dass sie existiert)
