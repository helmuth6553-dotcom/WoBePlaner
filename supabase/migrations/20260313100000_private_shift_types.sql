-- Migration: Private Shift Types
-- Bestimmte Diensttypen (z.B. MITARBEITERGESPRAECH) sind nur für
-- eingetragene Teilnehmer:innen und Admins sichtbar.

-- Alle bestehenden SELECT-Policies entfernen (PostgreSQL OR-verknüpft Policies!)
DROP POLICY IF EXISTS "policy_shifts_read_all" ON public.shifts;
DROP POLICY IF EXISTS "ALLOW_SELECT_SHIFTS_ALL" ON public.shifts;

-- Neue Policy: Private Diensttypen nur für Beteiligte + Admins sichtbar
CREATE POLICY "policy_shifts_read_all" ON public.shifts
  FOR SELECT TO authenticated
  USING (
    -- Nicht-private Typen: für alle sichtbar (Verhalten wie bisher)
    type NOT IN ('MITARBEITERGESPRAECH')
    OR
    -- Private Typen: nur für Admin, direkt Zugewiesene oder Interessierte
    (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = (SELECT auth.uid()) AND role = 'admin'
      )
      OR assigned_to = (SELECT auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.shift_interests
        WHERE shift_id = shifts.id AND user_id = (SELECT auth.uid())
      )
    )
  );
