-- Initial schema for the Job Application Tracker (see DESIGN.md §5).
-- Dates are stored as ISO-8601 TEXT for correct sorting; displayed as MM/DD/YYYY.

CREATE TABLE IF NOT EXISTS workspaces (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    owner_id    TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    dirty       INTEGER NOT NULL DEFAULT 0,
    deleted     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS memberships (
    user_id      TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    role         TEXT NOT NULL DEFAULT 'owner',  -- owner | editor | viewer
    created_at   TEXT NOT NULL,
    PRIMARY KEY (user_id, workspace_id)
);

CREATE TABLE IF NOT EXISTS job_applications (
    id                  TEXT PRIMARY KEY,
    workspace_id        TEXT NOT NULL,
    company             TEXT NOT NULL,
    title               TEXT NOT NULL,
    pay_min             REAL,
    pay_max             REAL,
    pay_median          REAL,
    state               TEXT NOT NULL DEFAULT 'NotApplied', -- NotApplied | InProgress | Applied
    stage               TEXT,                                -- InReview | Interview | Rejected | Accepted | Declined
    interview_number    INTEGER,
    location_city       TEXT,
    location_state      TEXT,
    remote              INTEGER NOT NULL DEFAULT 0,
    username            TEXT,
    auth                TEXT NOT NULL DEFAULT 'none',         -- none | sso_google | has_login
    notes               TEXT,
    deadline            TEXT,
    date_applied        TEXT,
    last_update         TEXT,
    next_interview_date TEXT,
    flag                TEXT,                                 -- red | yellow | green
    link                TEXT,
    tags                TEXT NOT NULL DEFAULT '[]',           -- JSON array of strings
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL,
    dirty               INTEGER NOT NULL DEFAULT 0,
    deleted             INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (workspace_id) REFERENCES workspaces (id)
);

CREATE INDEX IF NOT EXISTS idx_jobs_workspace ON job_applications (workspace_id);
CREATE INDEX IF NOT EXISTS idx_jobs_deadline  ON job_applications (deadline);
CREATE INDEX IF NOT EXISTS idx_jobs_updated   ON job_applications (updated_at);
