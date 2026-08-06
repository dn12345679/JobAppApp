-- Job Application Tracker — Supabase (Postgres) schema + row-level security.
-- Run this in the Supabase dashboard: SQL Editor → New query → paste → Run.
-- Mirrors the local SQLite schema (src-tauri/migrations/0001_init.sql).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.workspaces (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  owner_id   uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted    boolean not null default false
);

create table if not exists public.memberships (
  user_id      uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  role         text not null default 'editor' check (role in ('owner', 'editor', 'viewer')),
  created_at   timestamptz not null default now(),
  primary key (user_id, workspace_id)
);

create table if not exists public.job_applications (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references public.workspaces (id) on delete cascade,
  company             text not null,
  title               text not null,
  pay_min             numeric,
  pay_max             numeric,
  pay_median          numeric,
  hourly              boolean not null default false,
  state               text not null default 'NotApplied',
  stage               text,
  interview_number    integer,
  location_city       text,
  location_state      text,
  remote              boolean not null default false,
  username            text,
  auth                text not null default 'none',
  notes               text,
  deadline            date,
  date_applied        date,
  last_update         timestamptz,
  next_interview_date date,
  end_date            date,
  flag                text,
  link                text,
  tags                jsonb not null default '[]'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted             boolean not null default false
);

create index if not exists idx_jobs_workspace on public.job_applications (workspace_id);
create index if not exists idx_jobs_updated   on public.job_applications (updated_at);
create index if not exists idx_memberships_ws on public.memberships (workspace_id);

create table if not exists public.stages (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  label        text not null,
  position     integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted      boolean not null default false
);
create index if not exists idx_stages_workspace on public.stages (workspace_id);

-- ---------------------------------------------------------------------------
-- Access helpers (SECURITY DEFINER bypasses RLS to avoid recursive checks)
-- ---------------------------------------------------------------------------

create or replace function public.is_member(ws uuid)
returns boolean language sql security definer stable
set search_path = public as $$
  select exists (
    select 1 from public.memberships m
    where m.workspace_id = ws and m.user_id = auth.uid()
  );
$$;

create or replace function public.can_write(ws uuid)
returns boolean language sql security definer stable
set search_path = public as $$
  select exists (
    select 1 from public.memberships m
    where m.workspace_id = ws and m.user_id = auth.uid()
      and m.role in ('owner', 'editor')
  );
$$;

create or replace function public.is_owner(ws uuid)
returns boolean language sql security definer stable
set search_path = public as $$
  select exists (
    select 1 from public.workspaces w
    where w.id = ws and w.owner_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.workspaces       enable row level security;
alter table public.memberships      enable row level security;
alter table public.job_applications enable row level security;

-- Workspaces: members (and always the owner) can read; only the owner
-- creates/edits/removes. Owners must see their own workspace even before a
-- membership row exists, so upsert read-back after insert succeeds.
create policy ws_select on public.workspaces
  for select using (public.is_member(id) or owner_id = auth.uid());
create policy ws_insert on public.workspaces
  for insert with check (owner_id = auth.uid());
create policy ws_update on public.workspaces
  for update using (public.is_owner(id));
create policy ws_delete on public.workspaces
  for delete using (public.is_owner(id));

-- Memberships: you always see your own rows (also makes upsert read-back work);
-- members see the roster; the owner manages it; you may remove yourself.
create policy mem_select on public.memberships
  for select using (user_id = auth.uid() or public.is_member(workspace_id));
create policy mem_insert on public.memberships
  for insert with check (public.is_owner(workspace_id) or user_id = auth.uid());
create policy mem_update on public.memberships
  for update using (public.is_owner(workspace_id));
create policy mem_delete on public.memberships
  for delete using (public.is_owner(workspace_id) or user_id = auth.uid());

-- Job applications: members read; editors/owners write.
create policy jobs_select on public.job_applications
  for select using (public.is_member(workspace_id));
create policy jobs_insert on public.job_applications
  for insert with check (public.can_write(workspace_id));
create policy jobs_update on public.job_applications
  for update using (public.can_write(workspace_id));
create policy jobs_delete on public.job_applications
  for delete using (public.can_write(workspace_id));

-- Stages: members read; editors/owners write.
alter table public.stages enable row level security;
create policy stages_select on public.stages
  for select using (public.is_member(workspace_id));
create policy stages_insert on public.stages
  for insert with check (public.can_write(workspace_id));
create policy stages_update on public.stages
  for update using (public.can_write(workspace_id));
create policy stages_delete on public.stages
  for delete using (public.can_write(workspace_id));

-- ---------------------------------------------------------------------------
-- Sharing RPCs (memberships store only user_id; clients can't read auth.users)
-- ---------------------------------------------------------------------------

-- Roster (email + role) for a workspace the caller belongs to.
create or replace function public.list_workspace_members(p_workspace uuid)
returns table (user_id uuid, email text, role text)
language sql security definer stable
set search_path = public, auth as $$
  select m.user_id, u.email::text, m.role
  from public.memberships m
  join auth.users u on u.id = m.user_id
  where m.workspace_id = p_workspace
    and public.is_member(p_workspace);
$$;

-- Owner invites a user by email. The invitee must have signed in at least once
-- (so they exist in auth.users). Upserts the role if already a member.
create or replace function public.invite_to_workspace(
  p_workspace uuid, p_email text, p_role text
)
returns text
language plpgsql security definer
set search_path = public, auth as $$
declare v_uid uuid;
begin
  if not public.is_owner(p_workspace) then
    raise exception 'Only the workspace owner can invite members';
  end if;
  if p_role not in ('editor', 'viewer') then
    raise exception 'Role must be editor or viewer';
  end if;
  select id into v_uid from auth.users where lower(email) = lower(p_email) limit 1;
  if v_uid is null then
    raise exception 'No account found for %. Ask them to sign in to the app once, then invite again.', p_email;
  end if;
  insert into public.memberships (user_id, workspace_id, role)
  values (v_uid, p_workspace, p_role)
  on conflict (user_id, workspace_id) do update set role = excluded.role;
  return v_uid::text;
end $$;

grant execute on function public.list_workspace_members(uuid) to authenticated;
grant execute on function public.invite_to_workspace(uuid, text, text) to authenticated;
