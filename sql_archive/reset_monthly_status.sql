-- Löscht alle Monats-Abschlüsse (Genehmigungen, Einreichungen)
TRUNCATE TABLE public.monthly_reports RESTART IDENTITY CASCADE;
