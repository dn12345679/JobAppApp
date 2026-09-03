-- Two more per-user documents, both shaped exactly like resume_profile (whole
-- document as JSON in `data`, one row per user, id == user_id, user-owned and
-- NOT workspace-scoped):
--   * cover_letter   — a single cover letter (contact + body text).
--   * personal_notes — professional references + "wild card" Q&A responses.
CREATE TABLE IF NOT EXISTS cover_letter (
    id         TEXT PRIMARY KEY,        -- == user_id
    user_id    TEXT NOT NULL,
    data       TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    dirty      INTEGER NOT NULL DEFAULT 0,
    deleted    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_cover_letter_user ON cover_letter (user_id);

CREATE TABLE IF NOT EXISTS personal_notes (
    id         TEXT PRIMARY KEY,        -- == user_id
    user_id    TEXT NOT NULL,
    data       TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    dirty      INTEGER NOT NULL DEFAULT 0,
    deleted    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_personal_notes_user ON personal_notes (user_id);
