-- Per-workspace, user-editable application stages.
CREATE TABLE IF NOT EXISTS stages (
    id           TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    label        TEXT NOT NULL,
    position     INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    dirty        INTEGER NOT NULL DEFAULT 0,
    deleted      INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_stages_workspace ON stages (workspace_id);

-- Existing jobs stored the enum value 'InReview'; the others already match
-- their display label. Normalize so job.stage always equals a stage label.
UPDATE job_applications SET stage = 'In Review' WHERE stage = 'InReview';
