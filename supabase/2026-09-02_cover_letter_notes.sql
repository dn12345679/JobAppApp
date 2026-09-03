-- ===========================================================================
-- Cover letter + personal notes tables for an EXISTING Supabase project.
-- Run once in the Supabase SQL editor before shipping the client that syncs
-- them. Purely additive (two new tables + their RLS) — nothing existing changes.
-- ===========================================================================

create table if not exists public.cover_letter (
  id         uuid primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted    boolean not null default false,
  unique (user_id)
);
alter table public.cover_letter enable row level security;
create policy cl_select on public.cover_letter for select using (user_id = auth.uid());
create policy cl_insert on public.cover_letter for insert with check (user_id = auth.uid());
create policy cl_update on public.cover_letter for update using (user_id = auth.uid());
create policy cl_delete on public.cover_letter for delete using (user_id = auth.uid());

create table if not exists public.personal_notes (
  id         uuid primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted    boolean not null default false,
  unique (user_id)
);
alter table public.personal_notes enable row level security;
create policy pn_select on public.personal_notes for select using (user_id = auth.uid());
create policy pn_insert on public.personal_notes for insert with check (user_id = auth.uid());
create policy pn_update on public.personal_notes for update using (user_id = auth.uid());
create policy pn_delete on public.personal_notes for delete using (user_id = auth.uid());
