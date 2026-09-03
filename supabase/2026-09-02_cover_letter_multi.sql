-- ===========================================================================
-- Multi-cover-letter migration for an EXISTING Supabase project. Run once,
-- AFTER 2026-09-02_cover_letter_notes.sql, before shipping the multi-cover-letter
-- client. Non-destructive: drops the one-per-user rule and adds the name column
-- (mirrors the résumé multi-doc migration). No cover-letter rows are rewritten.
-- ===========================================================================

alter table public.cover_letter
  drop constraint if exists cover_letter_user_id_key;

alter table public.cover_letter
  add column if not exists name text;
