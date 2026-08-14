-- Per-user résumé profile: one row per user, whole document stored as JSON in
-- `data` (contact/education/experience/projects/skills/settings). User-owned,
-- NOT workspace-scoped (see DESIGN.md §11). id == user_id so both devices
-- converge on the same row.
CREATE TABLE IF NOT EXISTS resume_profile (
    id         TEXT PRIMARY KEY,        -- == user_id
    user_id    TEXT NOT NULL,
    data       TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    dirty      INTEGER NOT NULL DEFAULT 0,
    deleted    INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_resume_profile_user ON resume_profile (user_id);
