-- Multi-résumé support: relax the one-row-per-user model so a user can keep
-- several named résumés (View / New / Make a copy / Trash). This is purely
-- additive — no existing row is rewritten:
--   * existing résumés keep their id (== user_id) and are simply given a
--     default name in application code when `name` is NULL;
--   * newly created résumés get their own uuid `id` (id no longer == user_id).
-- The trash reuses the existing `deleted` tombstone flag, so no new column is
-- needed for it. See DESIGN.md §11.
ALTER TABLE resume_profile ADD COLUMN name TEXT;
