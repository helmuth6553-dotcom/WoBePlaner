-- ACHTUNG: Löscht alle Bewegungsdaten!
-- Benutzer (profiles) bleiben erhalten.

TRUNCATE TABLE 
  public.time_entries,
  public.shift_interests,
  public.shifts,
  public.absences,
  public.monthly_reports,
  public.roster_months
RESTART IDENTITY CASCADE;

-- Optional: Setzt alle User auf ein sauberes Startdatum, falls nötig
-- UPDATE public.profiles SET start_date = '2024-01-01';
