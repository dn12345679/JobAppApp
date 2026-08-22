-- ===========================================================================
-- Multi-résumé migration for EXISTING Supabase projects.
-- Run this ONCE in the Supabase SQL editor BEFORE shipping/installing the
-- updated app (the new client pushes a `name` column and may create a second
-- résumé per user; both need this change first).
--
-- Non-destructive: it drops a uniqueness *rule* and adds an empty column —
-- no résumé rows are read or rewritten. Take a snapshot first if you like.
-- ===========================================================================

-- 0. (Optional) Confirm the constraint's name before dropping it. Postgres
--    auto-names it `resume_profile_user_id_key`; verify if unsure:
--    select conname from pg_constraint
--    where conrelid = 'public.resume_profile'::regclass and contype = 'u';

-- 1. Allow more than one résumé per user (existing rows are untouched; their
--    id still happens to equal user_id, which stays valid).
alter table public.resume_profile
  drop constraint if exists resume_profile_user_id_key;

-- 2. Add the user-facing label. Nullable → the client shows a default name for
--    legacy rows.
alter table public.resume_profile
  add column if not exists name text;

-- 3. Sanity check: row count unchanged, name all NULL (nothing was rewritten).
--    select count(*) as rows, count(name) as named from public.resume_profile;

-- RLS is already user-scoped (user_id = auth.uid()) so no policy change needed.
