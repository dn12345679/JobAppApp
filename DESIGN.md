# Job Application Tracker — Design Document

> Status: **Draft for review** · Last updated: 2026-08-05

A cross-platform (desktop-now, Android-later) app to track and update job
applications, backed by a shared, syncable data store, with an animated,
responsive UI.

---

## 1. Goals & non-goals

**Goals**
- Fast, offline-capable app: reads/writes work with no network.
- Sync changes (insert / update / delete) with a shared store when online.
- One-tap Google sign-in, cached so users sign in once.
- Three screens: **Stats**, **Job List**, **Calendar**.
- Ship to other people with **zero manual setup** beyond first-run sign-in
  (the app creates its own local DB automatically).
- Responsive UI that later ports to Android from the same codebase.

**Non-goals (for MVP)**
- No password storage for job sites (see §7 Security).
- No charts/calendar in the first milestone (data + list + sync first).

---

## 2. Platform & stack (decided)

| Layer | Choice | Why |
|---|---|---|
| Shell | **Tauri v2** (Rust) | Desktop now (Win/Linux) + Android later from one React codebase. |
| UI | **React + TypeScript + Vite** | Known to the team; fast dev loop. |
| Styling | **Tailwind CSS** | Responsive, good for the Android port. |
| Animation | **Framer Motion** | The "more animated" feel requested. |
| Charts | **Recharts** | Has Sankey + circular + day-of-week charts, all web. |
| On-device DB | **SQLite** (`tauri-plugin-sql`) | Embedded, offline, runs identically on desktop + Android. |
| Shared DB / backend | **Supabase** (hosted Postgres) | Single source of truth; auth + realtime + free tier; zero user setup. |
| Secrets | **OS keychain** (Win DPAPI / Linux libsecret) via Rust | Cache the OAuth refresh token securely. |

**Why Tauri wins here:** it renders a webview on *every* platform, so the same
React UI, Framer Motion animations, and Recharts visuals render identically on
desktop and Android — no React-Native chart/animation rewrite later.

**Prerequisites (Windows):**
- Rust toolchain — `winget install --id Rustlang.Rustup -e` ✓ installed.
- **MSVC C++ Build Tools** (provides `link.exe` + Windows SDK; required by Tauri):
  `winget install --id Microsoft.VisualStudio.2022.BuildTools -e --override "--passive --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"`
- WebView2 — ships with Windows 11. ✓
- Run the app: `npm run tauri dev`.

---

## 3. The source-of-truth problem (core design decision)

### 3.1 Why it feels unsolvable
Trying to crown *either* the Sheet *or* the local DB as "the truth" fails,
because both can change while offline. The trap is imagining **two** states
fighting to be dictator.

### 3.2 The fix: track three states (a *base snapshot*)
- **base** — last state this device successfully synced (stored locally).
- **local** — current SQLite state.
- **remote** — current canonical-store state.

With `base` as a reference, we can always tell *who changed what*:
- field differs from `base` **locally** → this device changed it → **push**.
- field differs from `base` **remotely** → someone else changed it → **pull**.
- differs in **both** → real conflict → resolve (last-write-wins per field, logged).

This is a 3-way merge (like git). The base snapshot means the local DB is a
**fast replica with an outbox**, not a rival truth. One store stays *canonical*
(the tie-breaker); the other is a cache.

### 3.3 Canonical store — DECIDED: hosted Postgres (Supabase)

A single **shared central database** is the source of truth; every app user
syncs to it **through the app only**. There is **no live Sheet editing** — the
Google Sheet is a manual, optional export/import target (§4.2), never in the
live sync path.

**Choice: Supabase (hosted Postgres).** It provides the shared DB, Google
sign-in with only a basic email/profile scope (no app-verification wall),
row-level security, and a free tier — the cleanest route to "ship it and users
do nothing but sign in." It's also where the **PostgreSQL** preference fits.
On-device store stays SQLite as the offline cache.

*Alternative considered:* Firebase/Firestore (also hosted, zero-setup) — rejected
in favor of Postgres since the team prefers SQL and relational querying suits the
filtering/stats features.

Because everyone writes through the app into a real DB (stable row IDs +
`updated_at`), the only conflict is "two users edited the same record while
offline" → resolved last-write-wins per field. The hard problem of merging
arbitrary human Sheet edits is **eliminated**.

### 3.4 Regardless of option: local is always a replica + outbox
- All UI reads/writes hit **SQLite** → instant, fully offline.
- Local edits mark rows `dirty` (the outbox).
- A sync pass reconciles `base` / `local` / `remote` and clears `dirty`.
- This delivers **offline writes for free** — the "maybe later" feature, now.

---

## 4. Sync

### 4.1 Live sync: SQLite (local) ↔ Supabase (canonical)

Because everyone writes through the app into one real DB, this is simple:

- **Join key:** every record's Postgres primary key = the same **UUID** in SQLite.
- **Watermark pull:** device stores the timestamp of its last successful sync;
  on sync it pulls rows where `updated_at > lastSync` → cheap, incremental.
- **Push:** locally-`dirty` rows are upserted to Supabase.
- **Conflict** (same row edited on two offline devices): last-write-wins per
  field by `updated_at`, logged so nothing silently vanishes.
- **Deletes:** soft-delete with a `deleted` tombstone so the delete propagates
  before the row is purged.
- **Offline:** all reads/writes hit SQLite; `dirty` rows form the outbox and
  flush on reconnect. Supabase realtime can later push live updates when online.

Build order: **(1) pull-only → (2) add push → (3) conflict handling.**

### 4.2 Manual Google Sheets export/import (optional feature)

Not part of live sync — user-triggered, one direction at a time:

- **Push to Sheet:** dump current DB → a Google Sheet (create or overwrite).
- **Pull from Sheet:** read a Sheet → upsert rows back into the DB by UUID.

This is the *only* feature that needs the Google Sheets API scope, so it's
isolated from normal sign-in (§8). Built after the core app + live sync work.

---

## 5. Data model

### 5.1 Entities & access model

Access is organized around **workspaces** (shared "job-application databases"),
not individual users. A user holds **memberships** in one or more workspaces and
switches the active one in the app.

**`Workspace`** — a shared board of job applications.
| Field | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `name` | string | e.g. "Dylan's applications". |
| `ownerId` | UUID (user) | Creator; always has `owner` role. |
| `createdAt` | timestamp | |

**`Membership`** — grants a user access to a workspace with a role.
| Field | Type | Notes |
|---|---|---|
| `userId` | UUID | From Supabase auth. |
| `workspaceId` | UUID | |
| `role` | enum | `owner` \| `editor` (read/write) \| `viewer` (read-only). |
| `createdAt` | timestamp | Unique on (`userId`, `workspaceId`). |

**`JobApplication`** — belongs to a workspace via `workspaceId` (§5.2).

Rules:
- A user sees only workspaces they're a member of; the UI has a **switcher** and
  all three screens scope to the active workspace.
- `owner`/`editor` can write; `viewer` is read-only. `owner` invites/removes
  members and sets roles.
- Enforced server-side by Supabase **row-level security** keyed on `Membership`.

### 5.2 `JobApplication` fields (from spec, with system fields added)

| # | Field | Type | Notes |
|---|---|---|---|
| 1 | `company` | string | Case-insensitive search. |
| 2 | `title` | string | "Contains" search, not exact. |
| 3 | `payMin`, `payMax` | number? (USD) | Range… |
| 3 | `payMedian` | number? (USD) | …or a single expected median. |
| 4 | `state` | enum | `NotApplied` \| `InProgress` \| `Applied`. |
| 5 | `stage` | enum? | If `Applied`: `InReview` \| `Interview` \| `Rejected` \| `Accepted` \| `Declined`. |
| 5 | `interviewNumber` | number? | Only when `stage = Interview`. |
| 6 | `locationCity`, `locationState` | string? | City / STATE… |
| 6 | `remote` | boolean | …or Remote available. |
| 7 | `username` | string? | `null` = N/A. |
| 8 | `auth` | enum | `none` \| `sso_google` \| `has_login`. **Replaces password field** (see §7). |
| 9 | `notes` | string? | Personal notes. |
| 10 | `deadline` | date? | Application deadline. |
| 11 | `dateApplied` | date? | |
| 12 | `lastUpdate` | timestamp | Auto-set whenever `stage` changes. |
| 13 | `nextInterviewDate` | date? | N/A until set. |
| 14 | `flag` | enum? | `red` (now) \| `yellow` (≤1wk) \| `green` (≤1mo). **Auto-cleared when `state ≠ NotApplied`.** |
| 15 | `link` | url? | Optional. |

**System fields (not user-facing):** `id` (UUID), `workspaceId` (FK → Workspace),
`createdAt`, `updatedAt`, `dirty` (outbox flag), `deleted` (tombstone).

### 5.3 Business rules
- Changing `stage` auto-updates `lastUpdate`.
- `flag` is only meaningful while `state = NotApplied`; clear it otherwise.
- `stage`/`interviewNumber` only apply when `state = Applied`.
- Dates displayed as `MM/DD/YYYY`; stored as ISO for correct sorting.

---

## 6. Screens

**Page 1 — Stats.** Counts: applied, interviews, accepted, declined, rejected,
in-progress, in-review. A dynamic **Sankey** of state→stage flow, plus a circular
chart of application states and an applications-per-weekday chart. Reads local DB.

**Workspace switcher (global).** Header control to pick the active workspace;
every screen scopes to it. A "Members" panel (owner only) to invite by email,
set roles, and revoke access.

**Page 2 — Job List (MVP focus).** To-do-style list of the active workspace's
jobs. Search bar
sorting/filtering by any field. Filters: date since applied (past week / month /
custom), and multiple tags. "Create new job application" button → popup form.

**Page 3 — Calendar.** Month view highlighting today and upcoming deadlines
(clickable → job summary popup). Right rail: deadlines and scheduled interviews
(yellow highlight) ordered by date. Reads local DB.

---

## 7. Security

- **No job-site passwords stored anywhere.** Column #8 becomes an `auth` enum
  (`none` / `sso_google` / `has_login`) plus the plain `username`. Most sign-ins
  are Google SSO anyway. If a password hint is ever wanted, it goes only in the
  **local encrypted DB via the OS keychain — never synced.**
- **OAuth refresh token** cached in the OS keychain (Win DPAPI / Linux libsecret).
- **Row-level security (Supabase):** every `JobApplication` / `Workspace` query is
  gated on the user having a matching `Membership`; writes additionally require
  `owner`/`editor` role. Access control lives server-side, not just in the UI.
- Never put personal data in URL query strings.

---

## 8. API keys / accounts needed

- **Supabase project** (free tier) — hosted Postgres + auth + realtime. The one
  account you (the owner) set up; users never touch it.
- **Google Cloud project → OAuth 2.0 Client** — Client ID + secret for Google
  sign-in. Only the **basic email/profile scope** for normal use → no
  app-verification wall.
- **Google Sheets API scope** — needed *only* for the optional manual export/
  import (§4.2), isolated from normal sign-in.
- **No Claude API key needed** for the core app (only if we later add AI features
  like summarizing a posting from its link).

---

## 9. Milestones (MVP scope: data + list + sync)

1. Scaffold Tauri + React + TS + Tailwind; boot to a 3-tab shell.
2. Schema: `Workspace`, `Membership`, `JobApplication` (all fields + system fields)
   in SQLite; seed a default local workspace.
3. Page 2: list + search + filters + create/edit popup — fully offline.
4. Google OAuth sign-in + token caching + Supabase project.
5. Sync engine: pull-only → push → conflict handling (§4.1).
6. Workspaces & sharing: switcher, invite-by-email, roles, Supabase RLS.
7. Then Page 1 (stats/Sankey) and Page 3 (calendar).
8. Optional: manual Google Sheets export/import (§4.2).

---

## 10. Open decisions

1. ~~Canonical store~~ — **DECIDED: Supabase (hosted Postgres)**, one shared DB;
   Sheet is manual export/import only.
2. ~~Access model~~ — **DECIDED: multiple shared workspaces per user, role-based
   membership (owner/editor/viewer).** (§5.1)
3. Pay: support both (min/max) *and* median, or pick one input mode? *(non-blocking)*
4. Tags: free-form text, or a fixed set? (affects the multi-tag filter) *(non-blocking)*
5. Invite flow: invite existing users only, or email an invite link to people
   without an account yet? *(matters at milestone 6, not before)*
6. Roles: is the 3-tier owner/editor/viewer enough, or do you want finer grants
   (e.g. per-field, or "can invite but not delete")? *(matters at milestone 6)*
