-- Create time_entries table
-- FIX: Changed shift_id type to bigint to match shifts(id)
create table if not exists time_entries (
  id uuid default uuid_generate_v4() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  shift_id bigint references shifts(id) on delete cascade not null,
  user_id uuid references profiles(id) not null,
  actual_start timestamp with time zone not null,
  actual_end timestamp with time zone not null,
  interruptions jsonb default '[]'::jsonb, -- Array of {start: ISOString, end: ISOString, note: String}
  status text check (status in ('submitted', 'approved', 'rejected')) default 'submitted',
  admin_note text,
  calculated_hours numeric(5,2) not null,
  
  unique(shift_id, user_id)
);

-- Enable RLS
alter table time_entries enable row level security;

-- Policies
-- 1. Users can view their own entries
create policy "Users can view own entries" on time_entries
  for select using (auth.uid() = user_id);

-- 2. Users can insert their own entries
create policy "Users can insert own entries" on time_entries
  for insert with check (auth.uid() = user_id);

-- 3. Users can update their own entries ONLY if not approved yet
create policy "Users can update own pending entries" on time_entries
  for update using (auth.uid() = user_id and status != 'approved');

-- 4. Admins can view all entries
create policy "Admins can view all entries" on time_entries
  for select using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- 5. Admins can insert/update/delete all entries
create policy "Admins can manage all entries" on time_entries
  for all using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );
