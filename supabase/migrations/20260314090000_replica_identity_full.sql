-- Migration: REPLICA IDENTITY FULL für Supabase Realtime
-- Ohne FULL liefern DELETE-Events nur den Primary Key,
-- nicht die vollen Zeilendaten (shift_id, user_id etc.)

ALTER TABLE public.shift_interests REPLICA IDENTITY FULL;
ALTER TABLE public.shifts REPLICA IDENTITY FULL;
ALTER TABLE public.roster_months REPLICA IDENTITY FULL;
ALTER TABLE public.profiles REPLICA IDENTITY FULL;
ALTER TABLE public.absences REPLICA IDENTITY FULL;
ALTER TABLE public.time_entries REPLICA IDENTITY FULL;
ALTER TABLE public.coverage_requests REPLICA IDENTITY FULL;
ALTER TABLE public.coverage_votes REPLICA IDENTITY FULL;
