-- Trigger Function to sync approved absences to time_entries automatically
CREATE OR REPLACE FUNCTION public.sync_absence_to_time_entries()
RETURNS TRIGGER AS $$
DECLARE
    v_user_profile RECORD;
    v_daily_hours NUMERIC;
    v_current_date DATE;
    v_start_iso TIMESTAMPTZ;
    v_end_iso TIMESTAMPTZ;
    v_entry_exists BOOLEAN;
BEGIN
    -- Only act when status changes to 'genehmigt'
    IF NEW.status = 'genehmigt' AND (OLD.status IS DISTINCT FROM 'genehmigt') THEN
        
        -- 1. Get User Profile for Hours Calculation
        SELECT * INTO v_user_profile FROM public.profiles WHERE id = NEW.user_id;
        
        -- Default to 40h if not set, then divide by 5
        v_daily_hours := COALESCE(v_user_profile.weekly_hours, 40) / 5.0;

        -- 2. Loop through each day of the absence
        v_current_date := NEW.start_date;
        
        WHILE v_current_date <= NEW.end_date LOOP
            -- Check if it is a weekday (0=Sunday, 6=Saturday in Postgres usually, wait... logic: ISODOW 1=Mon...7=Sun)
            -- We assume Sat/Sun are free.
            IF EXTRACT(ISODOW FROM v_current_date) < 6 THEN 
                
                -- Construct fake times (e.g. 08:00 start)
                -- We construct ISO timestamps in UTC or Local? Let's assume naive composition for now
                -- 'YYYY-MM-DD 08:00:00'
                v_start_iso := (v_current_date || ' 08:00:00')::timestamp;
                v_end_iso := v_start_iso + (v_daily_hours * interval '1 hour');

                -- Check if entry already exists (to avoid duplicates if re-approved)
                SELECT EXISTS(
                    SELECT 1 FROM public.time_entries 
                    WHERE user_id = NEW.user_id 
                    AND (
                        (entry_date = v_current_date) OR 
                        (absence_id = NEW.id AND entry_date = v_current_date)
                    )
                ) INTO v_entry_exists;

                IF NOT v_entry_exists THEN
                    INSERT INTO public.time_entries (
                        user_id,
                        absence_id,
                        entry_date,
                        actual_start,
                        actual_end,
                        calculated_hours,
                        status
                    ) VALUES (
                        NEW.user_id,
                        NEW.id,
                        v_current_date,
                        v_start_iso,
                        v_end_iso,
                        ROUND(v_daily_hours, 2), -- Round to 2 decimals
                        'approved' -- Auto-approve
                    );
                END IF;

            END IF;
            
            v_current_date := v_current_date + 1;
        END LOOP;
        
    END IF;

    -- Handle Cancellation (Delete entries if cancelled)
    IF (NEW.status = 'storniert' OR NEW.status = 'abgelehnt') AND (OLD.status = 'genehmigt') THEN
        DELETE FROM public.time_entries 
        WHERE absence_id = NEW.id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create Trigger
DROP TRIGGER IF EXISTS trigger_sync_absence ON public.absences;
CREATE TRIGGER trigger_sync_absence
    AFTER UPDATE ON public.absences
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_absence_to_time_entries();

-- Optional: Run once for existing approved absences
-- DO $$
-- DECLARE r RECORD;
-- BEGIN
--    FOR r IN SELECT * FROM public.absences WHERE status = 'genehmigt' LOOP
--        UPDATE public.absences SET status = 'genehmigt' WHERE id = r.id; -- Trigger fake update
--    END LOOP;
-- END $$;
