-- Add initial_balance to invitations table so fallback invite flow preserves hour balances
ALTER TABLE public.invitations
ADD COLUMN IF NOT EXISTS initial_balance DECIMAL(10,2) DEFAULT 0;

-- Update handle_new_user() trigger to copy initial_balance from invitation to profile
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

    -- Insert into profiles with data from invitation (including initial_balance)
    INSERT INTO public.profiles (id, email, full_name, role, weekly_hours, start_date, vacation_days_per_year, initial_balance)
    VALUES (
        NEW.id,
        NEW.email,
        invite_record.full_name,
        invite_record.role,
        invite_record.weekly_hours,
        invite_record.start_date,
        invite_record.vacation_days_per_year,
        COALESCE(invite_record.initial_balance, 0)
    );

    -- CLEANUP: Delete the invitation so it no longer appears as pending
    DELETE FROM public.invitations WHERE email = NEW.email;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
