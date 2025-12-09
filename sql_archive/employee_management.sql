-- 0. Ensure is_admin function exists (Fix for missing dependency)
create or replace function public.is_admin()
returns boolean as $$
begin
  return exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
end;
$$ language plpgsql security definer;

-- 1. Extend profiles table with new employee details
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS weekly_hours numeric DEFAULT 40,
ADD COLUMN IF NOT EXISTS start_date date DEFAULT CURRENT_DATE,
ADD COLUMN IF NOT EXISTS vacation_days_per_year numeric DEFAULT 25;

-- 2. Create invitations table to whitelist emails
CREATE TABLE IF NOT EXISTS public.invitations (
    email text PRIMARY KEY,
    full_name text,
    weekly_hours numeric DEFAULT 40,
    start_date date DEFAULT CURRENT_DATE,
    vacation_days_per_year numeric DEFAULT 25,
    role text DEFAULT 'user',
    created_at timestamptz DEFAULT now()
);

-- 3. RLS for invitations (Only Admins can manage)
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage invitations" ON public.invitations;
CREATE POLICY "Admins can manage invitations" ON public.invitations
    FOR ALL USING (is_admin());

-- 4. Trigger Function to handle new user signup and enforce whitelist
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
DECLARE
    invite_record record;
BEGIN
    -- Check if email is invited
    SELECT * INTO invite_record FROM public.invitations WHERE email = NEW.email;
    
    IF invite_record IS NULL THEN
        -- OPTIONAL: Allow signup without invite but set as 'pending' or similar?
        -- For now, we strictly enforce invites as requested.
        -- But to avoid blocking the FIRST admin, we might need a bypass or manual insert.
        -- Let's assume the first admin is already created via the previous steps.
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

-- 5. Re-create the trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
