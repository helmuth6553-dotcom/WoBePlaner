-- ACHTUNG: Dieses Skript löscht fast alle Daten für einen Neustart!

-- 1. Lösche Logs
DELETE FROM public.shift_logs;

-- 2. Lösche alle Verknüpfungen (Interessen an Schichten)
DELETE FROM public.shift_interests;

-- 3. Lösche alle Schichten (Dienstpläne)
DELETE FROM public.shifts;

-- 4. Lösche alle Abwesenheiten (Urlaubsanträge)
DELETE FROM public.absences;

-- 5. Lösche alle offenen Einladungen
DELETE FROM public.invitations;

-- 6. Lösche den Status der Monate (Sperren/Freigaben)
DELETE FROM public.roster_months;

-- 7. Profile bleiben erhalten (Admin & Mitarbeiter)
-- DELETE FROM public.profiles WHERE role != 'admin';

-- Optional: Wenn du ALLES (auch Admins) löschen willst, entferne das "WHERE..." oben.
-- Aber Vorsicht: Dann hast du keinen Zugriff mehr und musst manuell einen User zum Admin machen.
