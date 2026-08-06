import { deleteWorkspace as softDeleteWorkspace, getDb } from "./db";
import { supabase } from "./supabase";

export interface SyncResult {
  pushedJobs: number;
  pulledJobs: number;
  pulledWorkspaces: number;
}

type Row = Record<string, unknown>;

const num = (v: unknown): number | null =>
  v == null || v === "" ? null : isNaN(Number(v)) ? null : Number(v);
const bool01 = (v: unknown): number => (v ? 1 : 0);
const parseTags = (v: unknown): string => {
  if (Array.isArray(v)) return JSON.stringify(v.map(String));
  if (typeof v === "string") {
    try {
      const a = JSON.parse(v);
      return JSON.stringify(Array.isArray(a) ? a.map(String) : []);
    } catch {
      return "[]";
    }
  }
  return "[]";
};
const toArray = (v: unknown): string[] => {
  const s = parseTags(v);
  return JSON.parse(s);
};

/**
 * Full two-way reconcile between local SQLite (working copy) and Supabase
 * (canonical). See DESIGN.md §4.1. Order: claim local seed → push local
 * changes → pull remote. Conflicts resolve last-write-wins by `updated_at`.
 */
export async function syncAll(): Promise<SyncResult> {
  if (!supabase) throw new Error("Sync is not configured.");
  const db = await getDb();

  // Read the uid straight from the live session so it always equals auth.uid()
  // in Supabase RLS (and confirms the auth token is actually attached).
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !authData.user) {
    throw new Error("Not signed in yet — try again in a moment.");
  }
  const uid = authData.user.id;
  console.log("[sync] uid", uid);

  // 1. Adopt the offline "local" seed workspace/membership for this user so it
  //    satisfies Supabase RLS (owner_id / user_id must equal auth.uid()).
  await db.execute(
    "UPDATE workspaces SET owner_id = $1, dirty = 1 WHERE owner_id = 'local'",
    [uid],
  );
  await db.execute(
    "UPDATE memberships SET user_id = $1 WHERE user_id = 'local'",
    [uid],
  );
  // Single-user model: any workspace we push must be owned by us to satisfy the
  // RLS WITH CHECK (owner_id = auth.uid()). Repairs stale/duplicate seeds.
  await db.execute(
    "UPDATE workspaces SET owner_id = $1 WHERE dirty = 1 AND owner_id <> $1",
    [uid],
  );

  // Drop membership rows that point at a workspace we no longer have locally,
  // so we never push a dangling foreign key.
  await db.execute(
    "DELETE FROM memberships WHERE workspace_id NOT IN (SELECT id FROM workspaces)",
  );

  // 2. PUSH all workspaces we own (not just dirty) so every membership's FK
  //    target is guaranteed to exist on the server before step 3.
  const ownedWs = await db.select<Row[]>(
    "SELECT * FROM workspaces WHERE owner_id = $1",
    [uid],
  );
  if (ownedWs.length) {
    const { error } = await supabase.from("workspaces").upsert(
      ownedWs.map((w) => ({
        id: w.id,
        name: w.name,
        owner_id: w.owner_id,
        created_at: w.created_at,
        updated_at: w.updated_at,
        deleted: !!w.deleted,
      })),
    );
    if (error) throw new Error(`push workspaces: ${error.message}`);
    await db.execute("UPDATE workspaces SET dirty = 0 WHERE owner_id = $1", [
      uid,
    ]);
  }

  // 3. PUSH memberships only for workspaces WE OWN. Our own membership in a
  //    workspace someone else shared with us is managed by that owner and is
  //    pulled read-only — pushing it hits an owner-only UPDATE policy.
  const mems = await db.select<Row[]>(
    `SELECT m.* FROM memberships m
     JOIN workspaces w ON w.id = m.workspace_id
     WHERE w.owner_id = $1`,
    [uid],
  );
  if (mems.length) {
    const { error } = await supabase
      .from("memberships")
      .upsert(
        mems.map((m) => ({
          user_id: m.user_id,
          workspace_id: m.workspace_id,
          role: m.role,
          created_at: m.created_at,
        })),
        { onConflict: "user_id,workspace_id" },
      );
    if (error) throw new Error(`push memberships: ${error.message}`);
  }

  // 4. PUSH dirty job applications.
  const dirtyJobs = await db.select<Row[]>(
    "SELECT * FROM job_applications WHERE dirty = 1",
  );
  if (dirtyJobs.length) {
    const { error } = await supabase
      .from("job_applications")
      .upsert(dirtyJobs.map(localJobToRemote));
    if (error) throw new Error(`push jobs: ${error.message}`);
    await db.execute("UPDATE job_applications SET dirty = 0 WHERE dirty = 1");
  }

  // 5. PULL everything visible (RLS limits to the user's workspaces).
  const { data: wsRemote, error: wsErr } = await supabase
    .from("workspaces")
    .select("*");
  if (wsErr) throw new Error(`pull workspaces: ${wsErr.message}`);
  for (const w of wsRemote ?? []) await upsertWorkspaceLocal(w);

  const { data: memRemote, error: memErr } = await supabase
    .from("memberships")
    .select("*");
  if (memErr) throw new Error(`pull memberships: ${memErr.message}`);
  for (const m of memRemote ?? []) await upsertMembershipLocal(m);

  const { data: jobsRemote, error: jobsErr } = await supabase
    .from("job_applications")
    .select("*");
  if (jobsErr) throw new Error(`pull jobs: ${jobsErr.message}`);
  for (const j of jobsRemote ?? []) await upsertJobLocal(j);

  return {
    pushedJobs: dirtyJobs.length,
    pulledJobs: jobsRemote?.length ?? 0,
    pulledWorkspaces: wsRemote?.length ?? 0,
  };

  // ---- local upserters (defined here to capture `db`) ----

  async function upsertWorkspaceLocal(w: Row) {
    await db.execute(
      `INSERT INTO workspaces (id, name, owner_id, created_at, updated_at, dirty, deleted)
       VALUES ($1, $2, $3, $4, $5, 0, $6)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name, owner_id = excluded.owner_id,
         updated_at = excluded.updated_at, deleted = excluded.deleted, dirty = 0
       WHERE excluded.updated_at >= workspaces.updated_at`,
      [w.id, w.name, w.owner_id, w.created_at, w.updated_at, bool01(w.deleted)],
    );
  }

  async function upsertMembershipLocal(m: Row) {
    await db.execute(
      `INSERT INTO memberships (user_id, workspace_id, role, created_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT(user_id, workspace_id) DO UPDATE SET role = excluded.role`,
      [m.user_id, m.workspace_id, m.role, m.created_at],
    );
  }

  async function upsertJobLocal(j: Row) {
    await db.execute(
      `INSERT INTO job_applications (
         id, workspace_id, company, title, pay_min, pay_max, pay_median,
         state, stage, interview_number, location_city, location_state, remote,
         username, auth, notes, deadline, date_applied, last_update,
         next_interview_date, flag, link, tags, created_at, updated_at, end_date, dirty, deleted
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,0,$27
       )
       ON CONFLICT(id) DO UPDATE SET
         workspace_id = excluded.workspace_id, company = excluded.company,
         title = excluded.title, pay_min = excluded.pay_min, pay_max = excluded.pay_max,
         pay_median = excluded.pay_median, state = excluded.state, stage = excluded.stage,
         interview_number = excluded.interview_number, location_city = excluded.location_city,
         location_state = excluded.location_state, remote = excluded.remote,
         username = excluded.username, auth = excluded.auth, notes = excluded.notes,
         deadline = excluded.deadline, date_applied = excluded.date_applied,
         last_update = excluded.last_update, next_interview_date = excluded.next_interview_date,
         flag = excluded.flag, link = excluded.link, tags = excluded.tags,
         end_date = excluded.end_date,
         updated_at = excluded.updated_at, deleted = excluded.deleted, dirty = 0
       WHERE excluded.updated_at >= job_applications.updated_at`,
      [
        j.id, j.workspace_id, j.company, j.title, num(j.pay_min), num(j.pay_max), num(j.pay_median),
        j.state, j.stage ?? null, num(j.interview_number), j.location_city ?? null, j.location_state ?? null, bool01(j.remote),
        j.username ?? null, j.auth ?? "none", j.notes ?? null, j.deadline ?? null, j.date_applied ?? null, j.last_update ?? null,
        j.next_interview_date ?? null, j.flag ?? null, j.link ?? null, parseTags(j.tags), j.created_at, j.updated_at, j.end_date ?? null, bool01(j.deleted),
      ],
    );
  }
}

/**
 * Deletes a workspace. Empty ones (no live applications) are hard-deleted
 * locally and on the server (cascading to jobs/memberships) — no tombstone
 * left behind for a mistakenly-created workspace. Non-empty ones are
 * soft-deleted so the data stays recoverable and the deletion propagates.
 */
export async function deleteWorkspaceSmart(id: string): Promise<void> {
  const db = await getDb();
  const rows = await db.select<Row[]>(
    "SELECT COUNT(*) AS n FROM job_applications WHERE workspace_id = $1 AND deleted = 0",
    [id],
  );
  const liveJobs = Number(rows[0]?.n ?? 0);

  if (liveJobs > 0) {
    await softDeleteWorkspace(id);
    return;
  }

  // Empty → hard delete everywhere.
  if (supabase) {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      const { error } = await supabase.from("workspaces").delete().eq("id", id);
      if (error) throw new Error(`delete workspace: ${error.message}`);
    }
  }
  await db.execute("DELETE FROM job_applications WHERE workspace_id = $1", [id]);
  await db.execute("DELETE FROM memberships WHERE workspace_id = $1", [id]);
  await db.execute("DELETE FROM workspaces WHERE id = $1", [id]);
}

/** Permanently removes a job locally and (when signed in) on the server. */
export async function purgeJob(id: string): Promise<void> {
  const db = await getDb();
  if (supabase) {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      const { error } = await supabase
        .from("job_applications")
        .delete()
        .eq("id", id);
      if (error) throw new Error(`purge: ${error.message}`);
    }
  }
  await db.execute("DELETE FROM job_applications WHERE id = $1", [id]);
}

function localJobToRemote(r: Row) {
  return {
    id: r.id,
    workspace_id: r.workspace_id,
    company: r.company,
    title: r.title,
    pay_min: num(r.pay_min),
    pay_max: num(r.pay_max),
    pay_median: num(r.pay_median),
    state: r.state,
    stage: r.stage ?? null,
    interview_number: num(r.interview_number),
    location_city: r.location_city ?? null,
    location_state: r.location_state ?? null,
    remote: !!r.remote,
    username: r.username ?? null,
    auth: r.auth ?? "none",
    notes: r.notes ?? null,
    deadline: r.deadline ?? null,
    date_applied: r.date_applied ?? null,
    last_update: r.last_update ?? null,
    next_interview_date: r.next_interview_date ?? null,
    end_date: r.end_date ?? null,
    flag: r.flag ?? null,
    link: r.link ?? null,
    tags: toArray(r.tags),
    created_at: r.created_at,
    updated_at: r.updated_at,
    deleted: !!r.deleted,
  };
}
