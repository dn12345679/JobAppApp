import Database from "@tauri-apps/plugin-sql";
import { BaseDirectory, remove } from "@tauri-apps/plugin-fs";
import { supabase } from "./supabase";
import type {
  ContactInfo,
  CoverLetter,
  CoverLetterData,
  JobApplication,
  NewJobInput,
  PersonalNotes,
  PersonalNotesData,
  ResumeProfile,
  ResumeProfileData,
  ResumeSettings,
  Role,
  SectionKey,
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
  if (!dbPromise) dbPromise = loadDbWithRecovery();
  return dbPromise;
}

/**
 * Opens the local SQLite cache, self-healing a corrupt/incompatible file. The
 * local DB is a disposable cache — Supabase is canonical — so a migration
 * checksum mismatch (e.g. an old DB left behind by a previous install; SQLite
 * migrations can't be safely reapplied once changed) must NOT brick the app.
 * On such a failure we delete the file and re-create it fresh; the next sync
 * re-pulls everything. Only migration failures trigger the reset — other errors
 * (e.g. disk/permission) propagate so we don't silently wipe data for no reason.
 */
async function loadDbWithRecovery(): Promise<Database> {
  try {
    return await Database.load(DB_URL);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/migrat/i.test(msg)) throw e;
    console.warn("[db] migration mismatch — resetting local cache:", msg);
    await resetLocalDbFiles();
    return await Database.load(DB_URL);
  }
}

/** Deletes the SQLite file (and its WAL/SHM sidecars) from the app config dir. */
async function resetLocalDbFiles(): Promise<void> {
  for (const name of [
    "jobtracker.db",
    "jobtracker.db-wal",
    "jobtracker.db-shm",
  ]) {
    try {
      await remove(name, { baseDir: BaseDirectory.AppConfig });
    } catch {
      /* sidecar files may not exist — ignore */
    }
  }
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
  await db.execute("DELETE FROM stages");
  await db.execute("DELETE FROM resume_profile");
  await db.execute("DELETE FROM cover_letter");
  await db.execute("DELETE FROM personal_notes");
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

// ---- résumé profile (per-user, one row; DESIGN.md §11) ----------------------

const DEFAULT_SECTION_ORDER: SectionKey[] = [
  "summary",
  "experience",
  "education",
  "projects",
  "skills",
];

export function defaultResumeSettings(): ResumeSettings {
  return {
    template: "classic",
    density: "normal",
    bulletStyle: "disc",
    fontScale: 1,
    sectionSpacing: 0,
    bulletSpacing: 0,
    sectionOrder: [...DEFAULT_SECTION_ORDER],
    hidden: {},
    autoFit: false,
  };
}

/** Default label for a résumé whose `name` column is NULL (e.g. legacy rows). */
export const DEFAULT_RESUME_NAME = "My résumé";

export function emptyContact(): ContactInfo {
  return {
    fullName: "",
    email: null,
    phone: null,
    location: null,
    website: null,
    linkedin: null,
    github: null,
    summary: null,
  };
}

function defaultResumeProfile(
  userId: string,
  ts: string,
  opts?: { id?: string; name?: string },
): ResumeProfile {
  return {
    // Legacy behaviour: the very first résumé keeps id == userId so both the
    // user's devices converge on the same row. Extra résumés pass their own uuid.
    id: opts?.id ?? userId,
    userId,
    name: opts?.name ?? DEFAULT_RESUME_NAME,
    contact: emptyContact(),
    education: [],
    experience: [],
    projects: [],
    skills: [],
    settings: defaultResumeSettings(),
    createdAt: ts,
    updatedAt: ts,
  };
}

/** The JSON payload for the `data` column — everything except system fields. */
function toProfileData(p: ResumeProfile): ResumeProfileData {
  return {
    contact: p.contact,
    education: p.education,
    experience: p.experience,
    projects: p.projects,
    skills: p.skills,
    settings: p.settings,
  };
}

function safeParseProfileData(raw: unknown): Partial<ResumeProfileData> {
  if (typeof raw !== "string") return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? (v as Partial<ResumeProfileData>) : {};
  } catch {
    return {};
  }
}

function rowToResumeProfile(r: JobRow): ResumeProfile {
  const d = safeParseProfileData(r.data);
  return {
    id: r.id as string,
    userId: r.user_id as string,
    // `name` is nullable (legacy rows predate it) — fall back to a default label.
    name: ((r.name as string) ?? "").trim() || DEFAULT_RESUME_NAME,
    // Merge with defaults so a document written by an older/newer build (missing
    // or extra keys) always yields a fully-populated, well-typed profile.
    contact: { ...emptyContact(), ...(d.contact ?? {}) },
    education: Array.isArray(d.education) ? d.education : [],
    experience: Array.isArray(d.experience) ? d.experience : [],
    projects: Array.isArray(d.projects) ? d.projects : [],
    skills: Array.isArray(d.skills) ? d.skills : [],
    settings: { ...defaultResumeSettings(), ...(d.settings ?? {}) },
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

/** All of a user's live (non-trashed) résumés, oldest first. */
export async function listResumes(
  userId: string = LOCAL_USER_ID,
): Promise<ResumeProfile[]> {
  const db = await getDb();
  const rows = await db.select<JobRow[]>(
    "SELECT * FROM resume_profile WHERE user_id = $1 AND deleted = 0 ORDER BY created_at ASC",
    [userId],
  );
  return rows.map(rowToResumeProfile);
}

/** Soft-deleted résumés for the Trash view (most-recently-deleted first). */
export async function listTrashedResumes(
  userId: string = LOCAL_USER_ID,
): Promise<ResumeProfile[]> {
  const db = await getDb();
  const rows = await db.select<JobRow[]>(
    "SELECT * FROM resume_profile WHERE user_id = $1 AND deleted = 1 ORDER BY updated_at DESC",
    [userId],
  );
  return rows.map(rowToResumeProfile);
}

/** A single résumé by id, or null if it doesn't exist (or is trashed). */
export async function getResume(id: string): Promise<ResumeProfile | null> {
  const db = await getDb();
  const rows = await db.select<JobRow[]>(
    "SELECT * FROM resume_profile WHERE id = $1 AND deleted = 0 LIMIT 1",
    [id],
  );
  return rows.length ? rowToResumeProfile(rows[0]) : null;
}

/**
 * Returns the user's résumés, seeding a first default one if none exist yet (the
 * legacy row keeps id == userId; see defaultResumeProfile). Used on first load
 * and whenever the collection is emptied. INSERT OR IGNORE keeps the seed
 * race-safe under StrictMode's double-invoked effects.
 */
export async function ensureAtLeastOneResume(
  userId: string = LOCAL_USER_ID,
): Promise<ResumeProfile[]> {
  const existing = await listResumes(userId);
  if (existing.length > 0) return existing;
  await createResume(userId, { seedId: userId });
  return listResumes(userId);
}

function insertResume(profile: ResumeProfile): Promise<unknown> {
  return getDb().then((db) =>
    db.execute(
      `INSERT OR IGNORE INTO resume_profile (id, user_id, name, data, created_at, updated_at, dirty, deleted)
       VALUES ($1, $2, $3, $4, $5, $5, 1, 0)`,
      [
        profile.id,
        profile.userId,
        profile.name,
        JSON.stringify(toProfileData(profile)),
        profile.createdAt,
      ],
    ),
  );
}

/**
 * Creates a new résumé. Blank by default; `template` pre-selects a layout.
 * `seedId` is used only by the first-run seed to keep id == userId.
 */
export async function createResume(
  userId: string = LOCAL_USER_ID,
  opts?: { name?: string; template?: ResumeProfile["settings"]["template"]; seedId?: string },
): Promise<ResumeProfile> {
  const ts = now();
  const profile = defaultResumeProfile(userId, ts, {
    id: opts?.seedId ?? uuid(),
    name: opts?.name,
  });
  if (opts?.template) profile.settings.template = opts.template;
  await insertResume(profile);
  return profile;
}

/**
 * Duplicates an existing résumé into a new row (own uuid, own name), optionally
 * switching the template. The whole document is deep-copied so edits don't leak
 * back to the source.
 */
export async function copyResume(
  sourceId: string,
  opts?: { name?: string; template?: ResumeProfile["settings"]["template"] },
): Promise<ResumeProfile> {
  const source = await getResume(sourceId);
  if (!source) throw new Error("copyResume: source résumé not found");
  const ts = now();
  const copy: ResumeProfile = {
    ...structuredClone(source),
    id: uuid(),
    name: opts?.name ?? `${source.name} (copy)`,
    createdAt: ts,
    updatedAt: ts,
  };
  if (opts?.template) copy.settings.template = opts.template;
  await insertResume(copy);
  return copy;
}

/**
 * Inserts a fully-formed résumé produced by the import sanitizer (its id/userId/
 * name/timestamps are already set). Marks it dirty so it syncs like any other.
 */
export async function importResumeProfile(
  profile: ResumeProfile,
): Promise<ResumeProfile> {
  await insertResume(profile);
  return profile;
}

/** Renames a résumé and marks it dirty for the next sync. */
export async function renameResume(
  id: string,
  name: string,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE resume_profile SET name = $2, updated_at = $3, dirty = 1 WHERE id = $1",
    [id, name.trim() || DEFAULT_RESUME_NAME, now()],
  );
}

/** Soft-delete (tombstone) a résumé so the deletion syncs; recoverable in Trash. */
export async function softDeleteResume(id: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE resume_profile SET deleted = 1, dirty = 1, updated_at = $2 WHERE id = $1",
    [id, now()],
  );
}

/** Un-delete: clears the tombstone and marks dirty so the restore syncs up. */
export async function restoreResume(id: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE resume_profile SET deleted = 0, dirty = 1, updated_at = $2 WHERE id = $1",
    [id, now()],
  );
}

/**
 * Permanently removes a résumé — from Supabase first (so a later pull can't
 * resurrect it), then locally. Irreversible; only reachable from the Trash's
 * "Delete permanently" action. If offline the server row can't be removed, so
 * we surface an error rather than delete locally and have it reappear.
 */
export async function permanentlyDeleteResume(id: string): Promise<void> {
  if (supabase) {
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData.session) {
      const { error } = await supabase.from("resume_profile").delete().eq("id", id);
      if (error) throw new Error(`permanent delete failed: ${error.message}`);
    }
  }
  const db = await getDb();
  await db.execute("DELETE FROM resume_profile WHERE id = $1", [id]);
}

/** Persists the whole profile document and marks it dirty for the next sync. */
export async function saveResumeProfile(
  profile: ResumeProfile,
): Promise<ResumeProfile> {
  const db = await getDb();
  const updated = { ...profile, updatedAt: now() };
  await db.execute(
    "UPDATE resume_profile SET data = $2, updated_at = $3, dirty = 1 WHERE id = $1",
    [updated.id, JSON.stringify(toProfileData(updated)), updated.updatedAt],
  );
  return updated;
}

// ---- cover letter (per-user, one row; same shape as resume_profile) ---------

/** The starter text a new cover letter is seeded with (user-editable). */
export const DEFAULT_COVER_LETTER_BODY = `Dear [Hiring Manager's Name],

Good day! [I was referred to your company by ___ / I saw your job post on ___]. [Company]’s [unique selling point or project] really stood out to me, and I’d love to be part of your team.

After [X years] in [past industry or role], I’ve decided to [make a career move / follow my passion / switch focus] to [target role or industry]. I bring [relevant skills or experiences], and I’ve always enjoyed [something related to the job]. Based on your job ad, I believe I could be a strong match.

To give you a better idea of my work, I’d be happy to provide a free [sample/demo/test project].

Attached is my resume. I hope to hear from you soon!

Sincerely,

[Your Name]`;

/** Generic tolerant JSON parse for a `data` column → a partial document. */
function safeParseJson<T>(raw: unknown): Partial<T> {
  if (typeof raw !== "string") return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? (v as Partial<T>) : {};
  } catch {
    return {};
  }
}

/** Default label for a cover letter whose `name` is NULL (legacy rows). */
export const DEFAULT_COVER_LETTER_NAME = "My cover letter";

export function defaultCoverLetterSettings(): CoverLetter["settings"] {
  return { fontScale: 1, lineSpacing: 0 };
}

function emptyCoverContact(): CoverLetter["contact"] {
  return { fullName: "", contact: null, location: null };
}

function toCoverData(c: CoverLetter): CoverLetterData {
  return { contact: c.contact, body: c.body, settings: c.settings };
}

function rowToCoverLetter(r: JobRow): CoverLetter {
  const d = safeParseJson<CoverLetterData>(r.data);
  return {
    id: r.id as string,
    userId: r.user_id as string,
    name: ((r.name as string) ?? "").trim() || DEFAULT_COVER_LETTER_NAME,
    contact: { ...emptyCoverContact(), ...(d.contact ?? {}) },
    body: typeof d.body === "string" ? d.body : DEFAULT_COVER_LETTER_BODY,
    settings: { ...defaultCoverLetterSettings(), ...(d.settings ?? {}) },
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function defaultCoverLetter(
  userId: string,
  ts: string,
  opts?: { id?: string; name?: string },
): CoverLetter {
  return {
    id: opts?.id ?? userId, // first row keeps id == userId; extras get a uuid
    userId,
    name: opts?.name ?? DEFAULT_COVER_LETTER_NAME,
    contact: emptyCoverContact(),
    body: DEFAULT_COVER_LETTER_BODY,
    settings: defaultCoverLetterSettings(),
    createdAt: ts,
    updatedAt: ts,
  };
}

/** All of a user's live (non-trashed) cover letters, oldest first. */
export async function listCoverLetters(
  userId: string = LOCAL_USER_ID,
): Promise<CoverLetter[]> {
  const db = await getDb();
  const rows = await db.select<JobRow[]>(
    "SELECT * FROM cover_letter WHERE user_id = $1 AND deleted = 0 ORDER BY created_at ASC",
    [userId],
  );
  return rows.map(rowToCoverLetter);
}

/** Soft-deleted cover letters for the Trash view. */
export async function listTrashedCoverLetters(
  userId: string = LOCAL_USER_ID,
): Promise<CoverLetter[]> {
  const db = await getDb();
  const rows = await db.select<JobRow[]>(
    "SELECT * FROM cover_letter WHERE user_id = $1 AND deleted = 1 ORDER BY updated_at DESC",
    [userId],
  );
  return rows.map(rowToCoverLetter);
}

/** A single cover letter by id, or null if missing/trashed. */
export async function getCoverLetterById(id: string): Promise<CoverLetter | null> {
  const db = await getDb();
  const rows = await db.select<JobRow[]>(
    "SELECT * FROM cover_letter WHERE id = $1 AND deleted = 0 LIMIT 1",
    [id],
  );
  return rows.length ? rowToCoverLetter(rows[0]) : null;
}

/** Returns the user's cover letters, seeding a first template-filled one if none. */
export async function ensureAtLeastOneCoverLetter(
  userId: string = LOCAL_USER_ID,
): Promise<CoverLetter[]> {
  const existing = await listCoverLetters(userId);
  if (existing.length > 0) return existing;
  await createCoverLetter(userId, { seedId: userId });
  return listCoverLetters(userId);
}

function insertCoverLetter(cl: CoverLetter): Promise<unknown> {
  return getDb().then((db) =>
    db.execute(
      `INSERT OR IGNORE INTO cover_letter (id, user_id, name, data, created_at, updated_at, dirty, deleted)
       VALUES ($1, $2, $3, $4, $5, $5, 1, 0)`,
      [cl.id, cl.userId, cl.name, JSON.stringify(toCoverData(cl)), cl.createdAt],
    ),
  );
}

/** Creates a new cover letter (template-filled by default). */
export async function createCoverLetter(
  userId: string = LOCAL_USER_ID,
  opts?: { name?: string; seedId?: string },
): Promise<CoverLetter> {
  const ts = now();
  const cl = defaultCoverLetter(userId, ts, {
    id: opts?.seedId ?? uuid(),
    name: opts?.name,
  });
  await insertCoverLetter(cl);
  return cl;
}

/** Duplicates a cover letter into a new row (own uuid + name). */
export async function copyCoverLetter(
  sourceId: string,
  opts?: { name?: string },
): Promise<CoverLetter> {
  const source = await getCoverLetterById(sourceId);
  if (!source) throw new Error("copyCoverLetter: source not found");
  const ts = now();
  const copy: CoverLetter = {
    ...structuredClone(source),
    id: uuid(),
    name: opts?.name ?? `${source.name} (copy)`,
    createdAt: ts,
    updatedAt: ts,
  };
  await insertCoverLetter(copy);
  return copy;
}

/** Inserts a sanitised imported cover letter (id/name/timestamps preset). */
export async function importCoverLetter(cl: CoverLetter): Promise<CoverLetter> {
  await insertCoverLetter(cl);
  return cl;
}

export async function renameCoverLetter(id: string, name: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE cover_letter SET name = $2, updated_at = $3, dirty = 1 WHERE id = $1",
    [id, name.trim() || DEFAULT_COVER_LETTER_NAME, now()],
  );
}

export async function softDeleteCoverLetter(id: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE cover_letter SET deleted = 1, dirty = 1, updated_at = $2 WHERE id = $1",
    [id, now()],
  );
}

export async function restoreCoverLetter(id: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE cover_letter SET deleted = 0, dirty = 1, updated_at = $2 WHERE id = $1",
    [id, now()],
  );
}

/** Permanently removes a cover letter — Supabase first, then locally. */
export async function permanentlyDeleteCoverLetter(id: string): Promise<void> {
  if (supabase) {
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData.session) {
      const { error } = await supabase.from("cover_letter").delete().eq("id", id);
      if (error) throw new Error(`permanent delete failed: ${error.message}`);
    }
  }
  const db = await getDb();
  await db.execute("DELETE FROM cover_letter WHERE id = $1", [id]);
}

/** Persists the cover letter document and marks it dirty for the next sync. */
export async function saveCoverLetter(cl: CoverLetter): Promise<CoverLetter> {
  const db = await getDb();
  const updated = { ...cl, updatedAt: now() };
  await db.execute(
    "UPDATE cover_letter SET data = $2, updated_at = $3, dirty = 1 WHERE id = $1",
    [updated.id, JSON.stringify(toCoverData(updated)), updated.updatedAt],
  );
  return updated;
}

// ---- personal notes: references + wild-card Q&A (per-user, one row) ---------

function toNotesData(n: PersonalNotes): PersonalNotesData {
  return { references: n.references, wildcards: n.wildcards };
}

function rowToNotes(r: JobRow): PersonalNotes {
  const d = safeParseJson<PersonalNotesData>(r.data);
  return {
    id: r.id as string,
    userId: r.user_id as string,
    references: Array.isArray(d.references) ? d.references : [],
    wildcards: Array.isArray(d.wildcards) ? d.wildcards : [],
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

/** The user's notes (references + wild cards), seeding an empty one on first run. */
export async function getPersonalNotes(
  userId: string = LOCAL_USER_ID,
): Promise<PersonalNotes> {
  const db = await getDb();
  const rows = await db.select<JobRow[]>(
    "SELECT * FROM personal_notes WHERE deleted = 0 ORDER BY created_at LIMIT 1",
  );
  if (rows.length > 0) return rowToNotes(rows[0]);

  const ts = now();
  const n: PersonalNotes = {
    id: userId,
    userId,
    references: [],
    wildcards: [],
    createdAt: ts,
    updatedAt: ts,
  };
  await db.execute(
    `INSERT OR IGNORE INTO personal_notes (id, user_id, data, created_at, updated_at, dirty, deleted)
     VALUES ($1, $2, $3, $4, $4, 1, 0)`,
    [n.id, n.userId, JSON.stringify(toNotesData(n)), ts],
  );
  const seeded = await db.select<JobRow[]>(
    "SELECT * FROM personal_notes WHERE deleted = 0 ORDER BY created_at LIMIT 1",
  );
  return seeded.length ? rowToNotes(seeded[0]) : n;
}

/** Persists the notes document and marks it dirty for the next sync. */
export async function savePersonalNotes(
  n: PersonalNotes,
): Promise<PersonalNotes> {
  const db = await getDb();
  const updated = { ...n, updatedAt: now() };
  await db.execute(
    "UPDATE personal_notes SET data = $2, updated_at = $3, dirty = 1 WHERE id = $1",
    [updated.id, JSON.stringify(toNotesData(updated)), updated.updatedAt],
  );
  return updated;
}
