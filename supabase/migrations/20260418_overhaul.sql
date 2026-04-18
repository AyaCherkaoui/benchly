-- ============================================================
-- Benchly overhaul migrations — run in Supabase SQL Editor
-- ============================================================

-- ── 1. Profiles: new columns for onboarding ──────────────────
alter table profiles
  add column if not exists lab_focus      text,
  add column if not exists techniques     text[],
  add column if not exists days_per_week  integer,
  add column if not exists onboarding_complete boolean default false;

-- ── 2. Daily summaries table ─────────────────────────────────
create table if not exists daily_summaries (
  id                  uuid default uuid_generate_v4() primary key,
  user_id             uuid references auth.users on delete cascade,
  date                date not null,
  summary             text,
  protocols_worked_on text[],
  steps_completed     integer default 0,
  samples_logged      integer default 0,
  created_at          timestamp with time zone default timezone('utc', now()),
  unique (user_id, date)
);

alter table daily_summaries enable row level security;

create policy "Users can manage their own daily summaries"
  on daily_summaries for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Already created in 20260417_weekly_reports.sql: ──────────
-- weekly_reports table (id, user_id, week_number, week_start,
--   week_end, report_content, raw_data, created_at, updated_at)
