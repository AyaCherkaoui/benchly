-- ============================================================
-- Benchly migration — 2026-04-18 comprehensive overhaul
-- ============================================================

-- ── profiles ─────────────────────────────────────────────────
alter table profiles
  add column if not exists full_name          text,
  add column if not exists role               text,
  add column if not exists lab_name           text,
  add column if not exists lab_focus          text,
  add column if not exists techniques         text[],
  add column if not exists days_per_week      integer,
  add column if not exists supervisor_name    text,
  add column if not exists onboarding_complete boolean default false;

-- ── samples ──────────────────────────────────────────────────
alter table samples
  add column if not exists project_name      text,
  add column if not exists experiment_number text;

-- ── sessions ─────────────────────────────────────────────────
alter table sessions
  add column if not exists experiment_number text,
  add column if not exists project_name      text;

-- ── calendar_tasks ───────────────────────────────────────────
create table if not exists calendar_tasks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  date        date not null,
  text        text not null,
  completed   boolean not null default false,
  created_at  timestamptz not null default now()
);

alter table calendar_tasks enable row level security;

create policy if not exists "Users can manage their own tasks"
  on calendar_tasks
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── weekly_reports ───────────────────────────────────────────
create table if not exists weekly_reports (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  week_number    integer,
  week_start     date,
  week_end       date,
  report_content text,
  raw_data       jsonb,
  created_at     timestamptz not null default now()
);

alter table weekly_reports enable row level security;

create policy if not exists "Users can manage their own reports"
  on weekly_reports
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── lab_relationships ────────────────────────────────────────
create table if not exists lab_relationships (
  id               uuid primary key default gen_random_uuid(),
  supervisor_id    uuid not null references auth.users(id) on delete cascade,
  supervisor_email text,
  member_email     text not null,
  status           text not null default 'pending',  -- pending | active
  created_at       timestamptz not null default now()
);

alter table lab_relationships enable row level security;

create policy if not exists "Supervisors can manage their relationships"
  on lab_relationships
  for all
  using  (auth.uid() = supervisor_id)
  with check (auth.uid() = supervisor_id);

-- ── voice_logs ───────────────────────────────────────────────
create table if not exists voice_logs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  protocol_id  uuid references protocols(id) on delete set null,
  type         text,           -- command | question | unknown
  transcript   text,
  response     text,
  action_taken text,
  created_at   timestamptz not null default now()
);

alter table voice_logs enable row level security;

create policy if not exists "Users can manage their own voice logs"
  on voice_logs
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
