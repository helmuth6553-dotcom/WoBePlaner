-- 1. Update the trigger function to delete the invitation after signup
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
DECLARE
    invite_record record;
BEGIN
    -- Check if email is invited
    SELECT * INTO invite_record FROM public.invitations WHERE email = NEW.email;
    
    IF invite_record IS NULL THEN
        RAISE EXCEPTION 'Email not authorized. Please contact admin.';
    END IF;

    -- Insert into profiles with data from invitation
    INSERT INTO public.profiles (id, email, full_name, role, weekly_hours, start_date, vacation_days_per_year)
    VALUES (
        NEW.id, 
        NEW.email, 
        invite_record.full_name, 
        invite_record.role,
        invite_record.weekly_hours,
        invite_record.start_date,
        invite_record.vacation_days_per_year
    );

    -- CLEANUP: Delete the invitation so it no longer appears as pending
    DELETE FROM public.invitations WHERE email = NEW.email;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. One-time cleanup for existing users who are still in the invitations table
DELETE FROM public.invitations 
WHERE email IN (SELECT email FROM public.profiles);
