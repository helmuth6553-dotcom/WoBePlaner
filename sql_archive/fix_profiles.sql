-- 1. Create the function that inserts a row into public.profiles
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, role, vacation_days_per_year)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    'employee',
    25 -- Default vacation days
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

-- 2. Create the trigger on auth.users
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 3. Backfill missing profiles for existing users
insert into public.profiles (id, email, full_name, role, vacation_days_per_year)
select 
    id, 
    email, 
    coalesce(raw_user_meta_data->>'full_name', split_part(email, '@', 1)), 
    'employee',
    25
from auth.users
where id not in (select id from public.profiles);
