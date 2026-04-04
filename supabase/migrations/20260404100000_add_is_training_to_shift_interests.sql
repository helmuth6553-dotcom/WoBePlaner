-- Add is_training column to shift_interests
-- Beidienst-Teilnehmer werden vom Konflikt-Count ausgeschlossen,
-- damit der Primär-Mitarbeiter seine Stunden behält und der Beidienst-Teilnehmer
-- ebenfalls Stunden gutgeschrieben bekommt.

ALTER TABLE public.shift_interests
  ADD COLUMN IF NOT EXISTS is_training BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.shift_interests.is_training IS
  'TRUE = Beidienst (Schnuppertag/Einschulung). Wird beim Konflikt-Count nicht gezählt.';
