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
import AccountMenu from "./components/AccountMenu";
import MembersModal from "./components/MembersModal";
import CreateWorkspaceModal from "./components/CreateWorkspaceModal";
import SignInPage from "./components/SignInPage";

// Top-level navigation is two modes: the workspace-scoped application tracker,
// and per-user Tools (the résumé builder, room to grow). Each mode owns its own
// sub-tabs. See DESIGN.md §11.
type Mode = "applications" | "tools";
type Tab = "stats" | "jobs" | "calendar";
type ToolTab = "resume";

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
];

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
        Loading…
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
        Loading…
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
      <header className="flex items-center justify-between gap-4 border-b border-slate-800 px-6 py-3">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold tracking-tight text-slate-100">
            JobAppApp
          </h1>
          {/* Top-level mode switch: Applications to Tools */}
          <div className="inline-flex rounded-lg border border-slate-700 bg-slate-800 p-0.5">
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
        <div className="flex items-center gap-3">
          {/* Workspace controls are meaningful only for the workspace-scoped
              Applications mode; the per-user Tools mode hides them. */}
          {mode === "applications" && (
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500">Workspace</label>
              <select
                value={activeWs ?? ""}
                onChange={(e) => setActiveWs(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 outline-none focus:border-indigo-500"
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
                className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-300 hover:border-slate-600 hover:text-slate-100"
              >
                ＋
              </button>

              {user && (
                <button
                  onClick={() => setShowMembers(true)}
                  title="Share / members"
                  className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-300 hover:border-slate-600 hover:text-slate-100"
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
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:border-slate-600 disabled:opacity-50"
            >
              {syncing ? "Syncing…" : "⟳ Sync"}
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
          className={`flex items-center justify-between px-6 py-1.5 text-xs ${
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

      {/* Sub-tab bar for the active mode */}
      <nav className="flex gap-1 border-b border-slate-800 px-4">
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
            className="absolute inset-0 overflow-auto p-6"
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
              <ResumePage userId={currentUserId} />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

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
