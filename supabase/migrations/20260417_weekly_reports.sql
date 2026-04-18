-- Run this in the Supabase SQL editor to enable Weekly Reports
create table if not exists weekly_reports (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade,
  week_number integer not null,
  week_start date not null,
  week_end date not null,
  report_content text,
  raw_data jsonb,
  created_at timestamp with time zone default timezone('utc', now()),
  updated_at timestamp with time zone default timezone('utc', now())
);

alter table weekly_reports enable row level security;

create policy "Users can manage their own weekly reports"
  on weekly_reports for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
