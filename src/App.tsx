import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Role, Workspace } from "./types";
import {
  LOCAL_USER_ID,
  clearLocalData,
  createWorkspace,
  dedupeWorkspaces,
  ensureDefaultWorkspace,
  getMyRole,
  listWorkspaces,
} from "./lib/db";
import { syncAll } from "./lib/sync";
import { checkForUpdate } from "./lib/updater";
import { useAuth } from "./auth/AuthContext";
import StatsPage from "./components/pages/StatsPage";
import JobsPage from "./components/pages/JobsPage";
import CalendarPage from "./components/pages/CalendarPage";
import ResumePage from "./components/pages/ResumePage";
import CoverLetterPage from "./components/pages/CoverLetterPage";
import NotesPage from "./components/pages/NotesPage";
import AccountMenu from "./components/AccountMenu";
import MembersModal from "./components/MembersModal";
import CreateWorkspaceModal from "./components/CreateWorkspaceModal";
import SignInPage from "./components/SignInPage";

// Top-level navigation is two modes: the workspace-scoped application tracker,
// and per-user Tools (the résumé builder, room to grow). Each mode owns its own
// sub-tabs. See DESIGN.md §11.
type Mode = "applications" | "tools";
type Tab = "stats" | "jobs" | "calendar";
type ToolTab = "resume" | "cover" | "notes";

type NavTab = { id: string; label: string };

const MODES: { id: Mode; label: string }[] = [
  { id: "applications", label: "Applications" },
  { id: "tools", label: "Tools" },
];

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "stats", label: "Stats", icon: "" },
  { id: "jobs", label: "Applications", icon: "" },
  { id: "calendar", label: "Calendar", icon: "" },
];

const TOOL_TABS: { id: ToolTab; label: string }[] = [
  { id: "resume", label: "Résumé" },
  { id: "cover", label: "Cover Letter" },
  { id: "notes", label: "Notes" },
];

// Mobile-only bottom navigation: flattens the desktop's two-level nav (mode
// switch + sub-tabs) into one row. Each item resolves to a (mode, tab) pair.
type BottomNavItem = { id: string; label: string; mode: Mode; tab?: Tab };
const BOTTOM_NAV: BottomNavItem[] = [
  { id: "stats", label: "Stats", mode: "applications", tab: "stats" },
  { id: "jobs", label: "Jobs", mode: "applications", tab: "jobs" },
  { id: "calendar", label: "Calendar", mode: "applications", tab: "calendar" },
  { id: "tools", label: "Tools", mode: "tools" },
];

function BottomNavIcon({ id }: { id: string }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.8 } as const;
  if (id === "stats")
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" {...p}>
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
      </svg>
    );
  if (id === "calendar")
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" {...p}>
        <rect x="3" y="4.5" width="18" height="16" rx="2" />
        <path d="M3 9h18M8 2.5v4M16 2.5v4" />
      </svg>
    );
  if (id === "tools")
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" {...p}>
        <path d="M6 3h8l4 4v14H6z" />
        <path d="M14 3v4h4M9 13h6M9 17h6" />
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" {...p}>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

export default function App() {
  const [mode, setMode] = useState<Mode>("applications");
  const [tab, setTab] = useState<Tab>("jobs");
  const [toolTab, setToolTab] = useState<ToolTab>("resume");
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWs, setActiveWs] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number>(() => {
    const v = parseFloat(localStorage.getItem("ui-zoom") ?? "1");
    return isNaN(v) ? 1 : clampZoom(v);
  });
  const { user, configured, loading: authLoading } = useAuth();
  const [dataVersion, setDataVersion] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [showMembers, setShowMembers] = useState(false);
  const [showCreateWs, setShowCreateWs] = useState(false);

  const currentUserId = user?.id ?? LOCAL_USER_ID;
  const isOwner = role === "owner";
  const canWrite = role !== "viewer";
  const activeWsName =
    workspaces.find((w) => w.id === activeWs)?.name ?? "Workspace";
  const navTabs: NavTab[] = mode === "applications" ? TABS : TOOL_TABS;
  const activeTabId = mode === "applications" ? tab : toolTab;

  // Track the signed-in user's role in the active workspace.
  useEffect(() => {
    if (activeWs) getMyRole(activeWs, currentUserId).then(setRole);
    else setRole(null);
  }, [activeWs, currentUserId, dataVersion]);

  async function initWorkspaces() {
    const def = await ensureDefaultWorkspace();
    await dedupeWorkspaces();
    const all = await listWorkspaces();
    setWorkspaces(all);
    setActiveWs(all.find((w) => w.id === def.id)?.id ?? all[0]?.id ?? null);
  }

  // Local-only mode (no cloud configured): initialize immediately.
  useEffect(() => {
    if (configured) return;
    (async () => {
      try {
        await initWorkspaces();
      } catch (e) {
        setError(String(e));
      } finally {
        setReady(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configured]);

  // Signed in: wipe the cache if a different account than last time, then PULL
  // this account's data before deciding whether to seed a starter workspace
  // (seeding first would create a duplicate when the account already has one).
  useEffect(() => {
    if (!configured || !user) return;
    (async () => {
      try {
        const KEY = "last-user-id";
        const last = localStorage.getItem(KEY);
        if (last !== user.id) {
          setReady(false); // hide any prior account's data during the swap
          await clearLocalData();
        }
        localStorage.setItem(KEY, user.id);

        // Pull first.
        try {
          await syncAll();
        } catch (e) {
          setSyncMsg(
            `Sync error: ${e instanceof Error ? e.message : String(e)}`,
          );
        }

        // Seed a starter workspace only if the account truly has none.
        let all = await listWorkspaces();
        if (all.length === 0) {
          await createWorkspace("My Applications", user.id);
          try {
            await syncAll();
          } catch {
            /* offline: keep the local seed until next sync */
          }
        }
        const merged = await dedupeWorkspaces();
        if (merged > 0) {
          try {
            await syncAll(); // push the merge tombstones so the server is cleaned too
          } catch {
            /* ignore */
          }
        }
        all = await listWorkspaces();
        setWorkspaces(all);
        setActiveWs((cur) =>
          cur && all.some((w) => w.id === cur) ? cur : (all[0]?.id ?? null),
        );
        setDataVersion((v) => v + 1);
      } catch (e) {
        setError(String(e));
      } finally {
        setReady(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, configured]);

  async function reloadWorkspaces() {
    const all = await listWorkspaces();
    setWorkspaces(all);
    setActiveWs((cur) =>
      cur && all.some((w) => w.id === cur) ? cur : (all[0]?.id ?? null),
    );
  }

  async function syncNow() {
    if (!user || syncing) return;
    setSyncing(true);
    setSyncMsg(null);
    try {
      const r = await syncAll();
      await reloadWorkspaces();
      setDataVersion((v) => v + 1);
      console.log("[sync] result", r);
      setSyncMsg(
        `Synced · pushed ${r.pushedJobs}, ${r.pulledJobs} job(s) on server`,
      );
    } catch (e) {
      console.error("[sync] failed", e);
      setSyncMsg(`Sync error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSyncing(false);
    }
  }

  // Quietly check for an app update on launch.
  useEffect(() => {
    void checkForUpdate({ silent: true });
  }, []);

  // Apply + persist UI scale (webviews ignore native Ctrl+ zoom).
  useEffect(() => {
    document.documentElement.style.zoom = String(zoom);
    localStorage.setItem("ui-zoom", String(zoom));
  }, [zoom]);

  // Ctrl+= / Ctrl+- / Ctrl+0 scale the whole app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        setZoom((z) => clampZoom(round1(z + 0.1)));
      } else if (e.key === "-") {
        e.preventDefault();
        setZoom((z) => clampZoom(round1(z - 0.1)));
      } else if (e.key === "0") {
        e.preventDefault();
        setZoom(1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Wait for the auth session to resolve before deciding what to show.
  if (configured && authLoading) {
    return (
      <div className="flex h-full items-center justify-center text-slate-400">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-700 border-t-indigo-500" />
          <span className="text-xs font-medium tracking-wide">Loading…</span>
        </div>
      </div>
    );
  }

  // Required sign-in gate (when cloud sync is configured).
  if (configured && !user) {
    return <SignInPage />;
  }

  // Signed in (or local-only): wait for the local cache to be ready.
  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center text-slate-400">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-700 border-t-indigo-500" />
          <span className="text-xs font-medium tracking-wide">Loading…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-rose-400">
        <div>
          <p className="mb-2 font-semibold">Could not open the local database</p>
          <pre className="max-w-lg overflow-auto rounded bg-slate-800 p-3 text-left text-xs text-rose-300">
            {error}
          </pre>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header: title + workspace switcher */}
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-3 py-2.5 md:gap-4 md:px-6 md:py-3">
        <div className="flex items-center gap-3 md:gap-4">
          <h1 className="text-base font-semibold tracking-tight text-slate-100 md:text-lg">
            JobAppApp
          </h1>
          {/* Top-level mode switch: Applications to Tools. Hidden on mobile —
              the bottom tab bar covers this navigation. */}
          <div className="hidden rounded-lg border border-slate-700 bg-slate-800 p-0.5 md:inline-flex">
            {MODES.map((m) => {
              const active = mode === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setMode(m.id)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    active
                      ? "bg-indigo-600 text-white"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex items-center gap-2 md:gap-3">
          {/* Workspace controls are meaningful only for the workspace-scoped
              Applications mode; the per-user Tools mode hides them. On mobile
              only the switcher itself shows; create/settings stay desktop-only. */}
          {mode === "applications" && (
            <div className="flex items-center gap-2">
              <label className="hidden text-xs text-slate-500 md:block">
                Workspace
              </label>
              <select
                value={activeWs ?? ""}
                onChange={(e) => setActiveWs(e.target.value)}
                className="max-w-[8.5rem] truncate rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-200 outline-none focus:border-indigo-500 md:max-w-none md:px-3"
              >
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>

              <button
                onClick={() => setShowCreateWs(true)}
                title="New workspace"
                className="hidden rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-300 hover:border-slate-600 hover:text-slate-100 md:block"
              >
                ＋
              </button>

              {user && (
                <button
                  onClick={() => setShowMembers(true)}
                  title="Share / members"
                  className="hidden rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-300 hover:border-slate-600 hover:text-slate-100 md:block"
                >
                  Workspace Settings
                </button>
              )}
            </div>
          )}
          {user && (
            <button
              onClick={syncNow}
              disabled={syncing}
              title={syncMsg ?? "Sync now"}
              className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-200 hover:border-slate-600 disabled:opacity-50 md:px-3"
            >
              <span className="hidden md:inline">
                {syncing ? "Syncing…" : "⟳ Sync"}
              </span>
              <span className="md:hidden">{syncing ? "…" : "⟳"}</span>
            </button>
          )}
          <AccountMenu
            zoom={zoom}
            onZoomIn={() => setZoom((z) => clampZoom(round1(z + 0.1)))}
            onZoomOut={() => setZoom((z) => clampZoom(round1(z - 0.1)))}
            onZoomReset={() => setZoom(1)}
          />
        </div>
      </header>

      {/* Sync status banner */}
      {syncMsg && (
        <div
          className={`flex items-center justify-between px-6 py-1.5text-xs ${
            syncMsg.startsWith("Sync error")
              ? "bg-rose-950/50 text-rose-300"
              : "text-slate-500"
          }`}
        >
          <span>{syncMsg}</span>
          <button
            onClick={() => setSyncMsg(null)}
            className="text-slate-500 hover:text-slate-300"
          >
            ✕
          </button>
        </div>
      )}

      {/* Sub-tab bar. Desktop: always shown. Mobile: hidden for Applications
          (the bottom bar covers those), but shown for Tools so its sub-tabs
          (Résumé / Cover Letter / Notes) remain reachable. */}
      <nav
        className={`gap-1 border-b border-slate-800 bg-slate-900/40 backdrop-blur-xs px-4 ${
          mode === "tools" ? "flex" : "hidden md:flex"
        }`}
      >
        {navTabs.map((t) => {
          const active = activeTabId === t.id;
          return (
            <button
              key={t.id}
              onClick={() =>
                mode === "applications"
                  ? setTab(t.id as Tab)
                  : setToolTab(t.id as ToolTab)
              }
              className="relative px-4 py-3 text-sm font-medium text-slate-400 transition-colors hover:text-slate-200"
            >
              <span className={active ? "text-slate-100" : ""}>{t.label}</span>
              {active && (
                <motion.div
                  layoutId="tab-underline"
                  className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-indigo-500"
                  transition={{ type: "spring", stiffness: 500, damping: 34 }}
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* Animated page content */}
      <main className="relative flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={mode === "applications" ? tab : toolTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="absolute inset-0 overflow-auto p-3 md:p-6"
          >
            {mode === "applications" && activeWs && tab === "stats" && (
              <StatsPage workspaceId={activeWs} refreshKey={dataVersion} />
            )}
            {mode === "applications" && activeWs && tab === "jobs" && (
              <JobsPage
                workspaceId={activeWs}
                workspaceName={activeWsName}
                refreshKey={dataVersion}
                canWrite={canWrite}
              />
            )}
            {mode === "applications" && activeWs && tab === "calendar" && (
              <CalendarPage workspaceId={activeWs} refreshKey={dataVersion} />
            )}
            {mode === "tools" && toolTab === "resume" && (
              <ResumePage
                userId={currentUserId}
                activeWorkspaceId={activeWs ?? undefined}
              />
            )}
            {mode === "tools" && toolTab === "cover" && (
              <CoverLetterPage userId={currentUserId} />
            )}
            {mode === "tools" && toolTab === "notes" && (
              <NotesPage userId={currentUserId} />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Mobile bottom navigation — flattens mode + sub-tabs into one row. */}
      <nav className="flex border-t border-slate-800 bg-slate-900/60 md:hidden">
        {BOTTOM_NAV.map((item) => {
          const active =
            item.mode === "tools" ? mode === "tools" : mode === "applications" && tab === item.tab;
          return (
            <button
              key={item.id}
              onClick={() => {
                setMode(item.mode);
                if (item.mode === "applications" && item.tab) setTab(item.tab);
              }}
              className={`flex flex-1 flex-col items-center gap-1 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-[11px] transition-colors ${
                active ? "text-indigo-300" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <BottomNavIcon id={item.id} />
              {item.label}
            </button>
          );
        })}
      </nav>

      <AnimatePresence>
        {showMembers && activeWs && (
          <MembersModal
            workspaceId={activeWs}
            workspaceName={activeWsName}
            isOwner={isOwner}
            currentUserId={currentUserId}
            onClose={() => setShowMembers(false)}
            onChanged={reloadWorkspaces}
          />
        )}
        {showCreateWs && (
          <CreateWorkspaceModal
            ownerId={currentUserId}
            canShare={configured && !!user}
            onClose={() => setShowCreateWs(false)}
            onCreated={async (id) => {
              await reloadWorkspaces();
              setActiveWs(id);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

const clampZoom = (z: number) => Math.min(2, Math.max(0.8, z));
const round1 = (z: number) => Math.round(z * 10) / 10;
