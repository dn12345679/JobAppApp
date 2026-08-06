import Database from "@tauri-apps/plugin-sql";
import type {
  JobApplication,
  NewJobInput,
  Role,
  Workspace,
  WorkspaceStage,
} from "../types";

export const DEFAULT_STAGES = [
  "In Review",
  "Interview",
  "Rejected",
  "Accepted",
  "Declined",
];

// Must match DB_URL in src-tauri/src/lib.rs.
const DB_URL = "sqlite:jobtracker.db";

// Placeholder identity until Google sign-in lands (DESIGN.md milestone 4).
export const LOCAL_USER_ID = "local";

let dbPromise: Promise<Database> | null = null;

export function getDb(): Promise<Database> {
  if (!dbPromise) dbPromise = Database.load(DB_URL);
  return dbPromise;
}

const now = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();

// ---- row <-> domain mapping -------------------------------------------------

type JobRow = Record<string, unknown>;

function rowToJob(r: JobRow): JobApplication {
  return {
    id: r.id as string,
    workspaceId: r.workspace_id as string,
    company: r.company as string,
    title: r.title as string,
    payMin: (r.pay_min as number) ?? null,
    payMax: (r.pay_max as number) ?? null,
    payMedian: (r.pay_median as number) ?? null,
    hourly: Number(r.hourly) === 1,
    state: r.state as JobApplication["state"],
    stage: (r.stage as JobApplication["stage"]) ?? null,
    interviewNumber: (r.interview_number as number) ?? null,
    locationCity: (r.location_city as string) ?? null,
    locationState: (r.location_state as string) ?? null,
    remote: Number(r.remote) === 1,
    username: (r.username as string) ?? null,
    auth: r.auth as JobApplication["auth"],
    notes: (r.notes as string) ?? null,
    deadline: (r.deadline as string) ?? null,
    dateApplied: (r.date_applied as string) ?? null,
    lastUpdate: (r.last_update as string) ?? null,
    nextInterviewDate: (r.next_interview_date as string) ?? null,
    endDate: (r.end_date as string) ?? null,
    flag: (r.flag as JobApplication["flag"]) ?? null,
    link: (r.link as string) ?? null,
    tags: safeParseTags(r.tags),
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function safeParseTags(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

// ---- workspaces -------------------------------------------------------------

let ensurePromise: Promise<Workspace> | null = null;

/**
 * Returns the user's workspaces, creating a default local one on first run.
 * Memoized so React StrictMode's double-invoked effect can't seed twice.
 */
export function ensureDefaultWorkspace(): Promise<Workspace> {
  if (!ensurePromise) ensurePromise = ensureDefaultWorkspaceImpl();
  return ensurePromise;
}

async function ensureDefaultWorkspaceImpl(): Promise<Workspace> {
  const db = await getDb();
  const rows = await db.select<JobRow[]>(
    "SELECT * FROM workspaces WHERE deleted = 0 ORDER BY created_at LIMIT 1",
  );
  if (rows.length > 0) return workspaceFromRow(rows[0]);

  const ts = now();
  const ws: Workspace = {
    id: uuid(),
    name: "My Applications",
    ownerId: LOCAL_USER_ID,
    createdAt: ts,
    updatedAt: ts,
  };
  await db.execute(
    `INSERT INTO workspaces (id, name, owner_id, created_at, updated_at, dirty, deleted)
     VALUES ($1, $2, $3, $4, $5, 1, 0)`,
    [ws.id, ws.name, ws.ownerId, ws.createdAt, ws.updatedAt],
  );
  await db.execute(
    `INSERT INTO memberships (user_id, workspace_id, role, created_at)
     VALUES ($1, $2, 'owner', $3)`,
    [LOCAL_USER_ID, ws.id, ts],
  );
  return ws;
}

/**
 * Wipes the local cache — used when a different account signs in on the same
 * device so one user never sees another's data. Safe because Supabase holds
 * the canonical copy and the account re-pulls on the next sync.
 */
export async function clearLocalData(): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM job_applications");
  await db.execute("DELETE FROM memberships");
  await db.execute("DELETE FROM workspaces");
  ensurePromise = null; // allow a fresh seed for the new account
}

export async function listWorkspaces(): Promise<Workspace[]> {
  const db = await getDb();
  const rows = await db.select<JobRow[]>(
    "SELECT * FROM workspaces WHERE deleted = 0 ORDER BY created_at",
  );
  return rows.map(workspaceFromRow);
}

/**
 * Merges duplicate workspaces (same owner + name) into the earliest-created
 * one: reassigns their jobs, then tombstones the extras. Returns how many were
 * merged. Safe to run every startup — a no-op when there are no duplicates.
 */
export async function dedupeWorkspaces(): Promise<number> {
  const db = await getDb();
  const rows = await db.select<JobRow[]>(
    "SELECT id, name, owner_id FROM workspaces WHERE deleted = 0 ORDER BY created_at ASC",
  );
  const keeperByKey = new Map<string, string>();
  const ts = now();
  let merged = 0;
  for (const w of rows) {
    const key = `${w.owner_id}::${w.name}`;
    const keeper = keeperByKey.get(key);
    if (!keeper) {
      keeperByKey.set(key, w.id as string);
      continue;
    }
    await db.execute(
      "UPDATE job_applications SET workspace_id = $1, dirty = 1, updated_at = $2 WHERE workspace_id = $3 AND deleted = 0",
      [keeper, ts, w.id],
    );
    await db.execute(
      "UPDATE workspaces SET deleted = 1, dirty = 1, updated_at = $2 WHERE id = $1",
      [w.id, ts],
    );
    merged++;
  }
  return merged;
}

function workspaceFromRow(r: JobRow): Workspace {
  return {
    id: r.id as string,
    name: r.name as string,
    ownerId: (r.owner_id as string) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

export async function createWorkspace(
  name: string,
  ownerId: string = LOCAL_USER_ID,
): Promise<Workspace> {
  const db = await getDb();
  const ts = now();
  const ws: Workspace = {
    id: uuid(),
    name: name.trim() || "Untitled",
    ownerId,
    createdAt: ts,
    updatedAt: ts,
  };
  await db.execute(
    `INSERT INTO workspaces (id, name, owner_id, created_at, updated_at, dirty, deleted)
     VALUES ($1, $2, $3, $4, $5, 1, 0)`,
    [ws.id, ws.name, ws.ownerId, ws.createdAt, ws.updatedAt],
  );
  await db.execute(
    `INSERT INTO memberships (user_id, workspace_id, role, created_at)
     VALUES ($1, $2, 'owner', $3)`,
    [ownerId, ws.id, ts],
  );
  await seedDefaultStages(ws.id);
  return ws;
}

/** Soft-delete an entire workspace and its jobs (tombstones sync to server). */
export async function deleteWorkspace(id: string): Promise<void> {
  const db = await getDb();
  const ts = now();
  await db.execute(
    "UPDATE job_applications SET deleted = 1, dirty = 1, updated_at = $2 WHERE workspace_id = $1 AND deleted = 0",
    [id, ts],
  );
  await db.execute(
    "UPDATE workspaces SET deleted = 1, dirty = 1, updated_at = $2 WHERE id = $1",
    [id, ts],
  );
}

export async function renameWorkspace(id: string, name: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE workspaces SET name = $2, dirty = 1, updated_at = $3 WHERE id = $1",
    [id, name.trim() || "Untitled", now()],
  );
}

// ---- stages (per-workspace, user-editable) ----------------------------------

function stageFromRow(r: JobRow): WorkspaceStage {
  return {
    id: r.id as string,
    workspaceId: r.workspace_id as string,
    label: r.label as string,
    position: Number(r.position ?? 0),
  };
}

export async function listStages(
  workspaceId: string,
): Promise<WorkspaceStage[]> {
  const db = await getDb();
  const rows = await db.select<JobRow[]>(
    "SELECT * FROM stages WHERE workspace_id = $1 AND deleted = 0 ORDER BY position, created_at",
    [workspaceId],
  );
  return rows.map(stageFromRow);
}

export async function seedDefaultStages(workspaceId: string): Promise<void> {
  const db = await getDb();
  const ts = now();
  for (let i = 0; i < DEFAULT_STAGES.length; i++) {
    await db.execute(
      `INSERT INTO stages (id, workspace_id, label, position, created_at, updated_at, dirty, deleted)
       VALUES ($1, $2, $3, $4, $5, $5, 1, 0)`,
      [uuid(), workspaceId, DEFAULT_STAGES[i], i, ts],
    );
  }
}

/** Seeds default stages only if the workspace has none (fresh workspace). */
export async function ensureStages(workspaceId: string): Promise<void> {
  const existing = await listStages(workspaceId);
  if (existing.length === 0) await seedDefaultStages(workspaceId);
}

export async function createStage(
  workspaceId: string,
  label: string,
): Promise<void> {
  const db = await getDb();
  const l = label.trim();
  if (!l) return;
  const rows = await db.select<JobRow[]>(
    "SELECT COALESCE(MAX(position), -1) AS p FROM stages WHERE workspace_id = $1 AND deleted = 0",
    [workspaceId],
  );
  const pos = Number(rows[0]?.p ?? -1) + 1;
  const ts = now();
  await db.execute(
    `INSERT INTO stages (id, workspace_id, label, position, created_at, updated_at, dirty, deleted)
     VALUES ($1, $2, $3, $4, $5, $5, 1, 0)`,
    [uuid(), workspaceId, l, pos, ts],
  );
}

/** Renames a stage and propagates the new label to every job that used it. */
export async function renameStage(
  workspaceId: string,
  id: string,
  oldLabel: string,
  newLabel: string,
): Promise<void> {
  const db = await getDb();
  const l = newLabel.trim();
  if (!l || l === oldLabel) return;
  const ts = now();
  await db.execute(
    "UPDATE stages SET label = $2, dirty = 1, updated_at = $3 WHERE id = $1",
    [id, l, ts],
  );
  await db.execute(
    "UPDATE job_applications SET stage = $2, dirty = 1, updated_at = $3 WHERE workspace_id = $1 AND stage = $4 AND deleted = 0",
    [workspaceId, l, ts, oldLabel],
  );
}

export async function deleteStage(id: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE stages SET deleted = 1, dirty = 1, updated_at = $2 WHERE id = $1",
    [id, now()],
  );
}

/** The signed-in user's role in a workspace (from the local cache). */
export async function getMyRole(
  workspaceId: string,
  userId: string,
): Promise<Role | null> {
  const db = await getDb();
  const rows = await db.select<JobRow[]>(
    "SELECT role FROM memberships WHERE workspace_id = $1 AND user_id = $2 LIMIT 1",
    [workspaceId, userId],
  );
  return rows.length ? (rows[0].role as Role) : null;
}

// ---- job applications -------------------------------------------------------

export async function listJobs(workspaceId: string): Promise<JobApplication[]> {
  const db = await getDb();
  const rows = await db.select<JobRow[]>(
    `SELECT * FROM job_applications
     WHERE workspace_id = $1 AND deleted = 0
     ORDER BY created_at DESC`,
    [workspaceId],
  );
  return rows.map(rowToJob);
}

export async function createJob(
  workspaceId: string,
  input: NewJobInput,
): Promise<JobApplication> {
  const db = await getDb();
  const ts = now();
  const job: JobApplication = {
    id: uuid(),
    workspaceId,
    company: input.company,
    title: input.title,
    payMin: input.payMin ?? null,
    payMax: input.payMax ?? null,
    payMedian: input.payMedian ?? null,
    hourly: input.hourly ?? false,
    state: input.state ?? "NotApplied",
    stage: input.stage ?? null,
    interviewNumber: input.interviewNumber ?? null,
    locationCity: input.locationCity ?? null,
    locationState: input.locationState ?? null,
    remote: input.remote ?? false,
    username: input.username ?? null,
    auth: input.auth ?? "none",
    notes: input.notes ?? null,
    deadline: input.deadline ?? null,
    dateApplied: input.dateApplied ?? null,
    lastUpdate: input.lastUpdate ?? null,
    nextInterviewDate: input.nextInterviewDate ?? null,
    endDate: input.endDate ?? null,
    flag: input.flag ?? null,
    link: input.link ?? null,
    tags: input.tags ?? [],
    createdAt: ts,
    updatedAt: ts,
  };

  await db.execute(
    `INSERT INTO job_applications (
       id, workspace_id, company, title, pay_min, pay_max, pay_median,
       state, stage, interview_number, location_city, location_state, remote,
       username, auth, notes, deadline, date_applied, last_update,
       next_interview_date, flag, link, tags, created_at, updated_at, end_date, hourly, dirty, deleted
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7,
       $8, $9, $10, $11, $12, $13,
       $14, $15, $16, $17, $18, $19,
       $20, $21, $22, $23, $24, $25, $26, $27, 1, 0
     )`,
    [
      job.id, job.workspaceId, job.company, job.title, job.payMin, job.payMax, job.payMedian,
      job.state, job.stage, job.interviewNumber, job.locationCity, job.locationState, job.remote ? 1 : 0,
      job.username, job.auth, job.notes, job.deadline, job.dateApplied, job.lastUpdate,
      job.nextInterviewDate, job.flag, job.link, JSON.stringify(job.tags), job.createdAt, job.updatedAt, job.endDate, job.hourly ? 1 : 0,
    ],
  );
  return job;
}

export async function updateJob(job: JobApplication): Promise<JobApplication> {
  const db = await getDb();
  const updated = { ...job, updatedAt: now() };
  await db.execute(
    `UPDATE job_applications SET
       company = $2, title = $3, pay_min = $4, pay_max = $5, pay_median = $6,
       state = $7, stage = $8, interview_number = $9, location_city = $10,
       location_state = $11, remote = $12, username = $13, auth = $14, notes = $15,
       deadline = $16, date_applied = $17, last_update = $18, next_interview_date = $19,
       flag = $20, link = $21, tags = $22, updated_at = $23, end_date = $24, hourly = $25, dirty = 1
     WHERE id = $1`,
    [
      updated.id, updated.company, updated.title, updated.payMin, updated.payMax, updated.payMedian,
      updated.state, updated.stage, updated.interviewNumber, updated.locationCity,
      updated.locationState, updated.remote ? 1 : 0, updated.username, updated.auth, updated.notes,
      updated.deadline, updated.dateApplied, updated.lastUpdate, updated.nextInterviewDate,
      updated.flag, updated.link, JSON.stringify(updated.tags), updated.updatedAt, updated.endDate, updated.hourly ? 1 : 0,
    ],
  );
  return updated;
}

/** Soft-delete (tombstone) so the deletion can sync later (DESIGN.md §4.1). */
export async function deleteJob(id: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE job_applications SET deleted = 1, dirty = 1, updated_at = $2 WHERE id = $1",
    [id, now()],
  );
}

/** Soft-deleted jobs for the Trash view. */
export async function listDeletedJobs(
  workspaceId: string,
): Promise<JobApplication[]> {
  const db = await getDb();
  const rows = await db.select<JobRow[]>(
    `SELECT * FROM job_applications
     WHERE workspace_id = $1 AND deleted = 1
     ORDER BY updated_at DESC`,
    [workspaceId],
  );
  return rows.map(rowToJob);
}

/** Un-delete: clears the tombstone and marks dirty so the restore syncs up. */
export async function restoreJob(id: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE job_applications SET deleted = 0, dirty = 1, updated_at = $2 WHERE id = $1",
    [id, now()],
  );
}
