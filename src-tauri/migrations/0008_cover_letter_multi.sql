-- Multi-cover-letter support: relax cover_letter from one-per-user to many, the
-- same way 0006 did for résumés. Additive — existing rows keep their id
-- (== user_id) and get a default name in the client when `name` is NULL; new
-- cover letters get their own uuid. Trash reuses the existing `deleted` flag.
ALTER TABLE cover_letter ADD COLUMN name TEXT;
