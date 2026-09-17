import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type {
  ApplicationState,
  JobApplication,
  WorkspaceStage,
} from "../../types";
import {
  deleteJob,
  ensureStages,
  listJobs,
  listStages,
  restoreJob,
} from "../../lib/db";
import { fmtDate, fmtPay } from "../../lib/format";
import {
  FLAG_DOT,
  STATE_LABELS,
  STATE_STYLES,
  isInterviewStage,
  isMissedDeadline,
} from "../../lib/jobRules";
import JobFormModal from "../JobFormModal";
import FillByLinkModal from "../FillByLinkModal";
import TrashModal from "../TrashModal";
import StagesModal from "../StagesModal";
import { exportJobs, type ExportFormat } from "../../lib/export";
import { openUrl } from "@tauri-apps/plugin-opener";

type DateRange = "all" | "today" | "week" | "month" | "custom";
type SortKey = "newest" | "deadline" | "company" | "updated";

export default function JobsPage({
  workspaceId,
  workspaceName,
  refreshKey,
  canWrite = true,
}: {
  workspaceId: string;
  workspaceName: string;
  refreshKey?: number;
  canWrite?: boolean;
}) {
  const [jobs, setJobs] = useState<JobApplication[]>([]);
  const [query, setQuery] = useState("");
  const [stateFilter, setStateFilter] = useState<
    ApplicationState | "all" | "missed"
  >("all");
  const [range, setRange] = useState<DateRange>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [activeStages, setActiveStages] = useState<string[]>([]);
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [hideMissed, setHideMissed] = useState(false);
  const [sort, setSort] = useState<SortKey>("newest");
  const [modal, setModal] = useState<null | {
    job?: JobApplication;
    prefill?: Partial<JobApplication>;
  }>(null);
  const [fabExpanded, setFabExpanded] = useState(false);
  const [showFillByLink, setShowFillByLink] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showStages, setShowStages] = useState(false);
  const [stages, setStages] = useState<WorkspaceStage[]>([]);
  const [showFilters, setShowFilters] = useState(false); // mobile filter drawer

  const pendingDeleteTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [pendingDeletes, setPendingDeletes] = useState<Record<string, boolean>>({});
  const lastScrollTopRef = useRef(0);

  const dismissPendingDelete = (id: string) => {
    if (pendingDeleteTimers.current[id]) {
      clearTimeout(pendingDeleteTimers.current[id]);
      delete pendingDeleteTimers.current[id];
    }
    setPendingDeletes((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setJobs((prev) => prev.filter((j) => j.id !== id));
  };

  const dismissAllPendingDeletes = () => {
    const ids = Object.keys(pendingDeleteTimers.current);
    if (ids.length === 0) return;

    ids.forEach((id) => {
      clearTimeout(pendingDeleteTimers.current[id]);
      delete pendingDeleteTimers.current[id];
    });

    const idSet = new Set(ids);
    setPendingDeletes({});
    setJobs((prev) => prev.filter((j) => !idSet.has(j.id)));
  };

  const handleDelete = async (job: JobApplication) => {
    try {
      await deleteJob(job.id);
    } catch (err) {
      console.error("Failed to soft-delete job:", err);
      return;
    }

    setPendingDeletes((prev) => ({ ...prev, [job.id]: true }));

    if (pendingDeleteTimers.current[job.id]) {
      clearTimeout(pendingDeleteTimers.current[job.id]);
    }

    pendingDeleteTimers.current[job.id] = setTimeout(() => {
      dismissPendingDelete(job.id);
    }, 5000);
  };

  const handleUndo = async (id: string) => {
    if (pendingDeleteTimers.current[id]) {
      clearTimeout(pendingDeleteTimers.current[id]);
      delete pendingDeleteTimers.current[id];
    }
    setPendingDeletes((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

    try {
      await restoreJob(id);
    } catch (err) {
      console.error("Failed to restore job:", err);
    }
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const currentScrollTop = e.currentTarget.scrollTop;
    if (Math.abs(currentScrollTop - lastScrollTopRef.current) > 2) {
      lastScrollTopRef.current = currentScrollTop;
      if (Object.keys(pendingDeleteTimers.current).length > 0) {
        dismissAllPendingDeletes();
      }
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (Math.abs(e.deltaY) > 5 || Math.abs(e.deltaX) > 5) {
      if (Object.keys(pendingDeleteTimers.current).length > 0) {
        dismissAllPendingDeletes();
      }
    }
  };

  async function refresh() {
    Object.values(pendingDeleteTimers.current).forEach((timer) => clearTimeout(timer));
    pendingDeleteTimers.current = {};
    setPendingDeletes({});
    setJobs(await listJobs(workspaceId));
    setStages(await listStages(workspaceId));
  }

  useEffect(() => {
    return () => {
      Object.values(pendingDeleteTimers.current).forEach((timer) => clearTimeout(timer));
    };
  }, []);

  useEffect(() => {
    (async () => {
      if (canWrite) await ensureStages(workspaceId); // seed defaults if empty
      await refresh();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, refreshKey]);

  const allStages = useMemo(() => {
    const list: string[] = [];
    const seen = new Set<string>();
    for (const s of stages) {
      if (!seen.has(s.label)) {
        seen.add(s.label);
        list.push(s.label);
      }
    }
    for (const j of jobs) {
      if (j.stage && !seen.has(j.stage)) {
        seen.add(j.stage);
        list.push(j.stage);
      }
    }
    return list;
  }, [stages, jobs]);

  const allTags = useMemo(
    () => [...new Set(jobs.flatMap((j) => j.tags))].sort(),
    [jobs],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    const result = jobs.filter((j) => {
      if (q) {
        const hay = `${j.company} ${j.title} ${j.locationCity ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (stateFilter === "missed") {
        if (!isMissedDeadline(j)) return false;
      } else if (stateFilter !== "all" && j.state !== stateFilter) {
        return false;
      } else if (hideMissed && isMissedDeadline(j)) {
        return false;
      }
      if (activeStages.length && (!j.stage || !activeStages.includes(j.stage)))
        return false;
      if (activeTags.length && !activeTags.every((t) => j.tags.includes(t)))
        return false;
      if (!jobMatchesDateRange(j, stateFilter, range, customFrom, customTo))
        return false;
      return true;
    });

    result.sort((a, b) => {
      switch (sort) {
        case "deadline":
          return cmpNullableDate(a.deadline, b.deadline);
        case "company":
          return a.company.localeCompare(b.company);
        case "updated":
          return b.updatedAt.localeCompare(a.updatedAt);
        default:
          return b.createdAt.localeCompare(a.createdAt);
      }
    });
    return result;
  }, [jobs, query, stateFilter, range, customFrom, customTo, activeStages, activeTags, sort, hideMissed]);

  async function doExport(format: ExportFormat) {
    setShowExport(false);
    try {
      await exportJobs(filtered, format, workspaceName || "job-applications");
    } catch (e) {
      alert(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Number of filters narrowing the list (shown as a badge on the mobile drawer).
  const activeFilterCount =
    (stateFilter !== "all" ? 1 : 0) +
    (range !== "all" ? 1 : 0) +
    (hideMissed ? 1 : 0) +
    activeStages.length +
    activeTags.length;

  // The full filter set, reused inline on desktop and inside the mobile drawer.
  const filterControls = (
    <>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Chip active={stateFilter === "all"} onClick={() => setStateFilter("all")}>
          All
        </Chip>
        {(["NotApplied", "InProgress", "Applied"] as ApplicationState[]).map((s) => (
          <Chip key={s} active={stateFilter === s} onClick={() => setStateFilter(s)}>
            {STATE_LABELS[s]}
          </Chip>
        ))}
        <Chip
          active={stateFilter === "missed"}
          onClick={() => setStateFilter("missed")}
        >
          Missed deadline
        </Chip>
        <span className="mx-1 h-4 w-px bg-slate-700" />
        {(["all", "today", "week", "month", "custom"] as DateRange[]).map((r) => (
          <Chip key={r} active={range === r} onClick={() => setRange(r)}>
            {r === "all"
              ? "Any date"
              : r === "today"
              ? "Today"
              : r === "week"
              ? "Past week"
              : r === "month"
              ? "Past month"
              : "Custom"}
          </Chip>
        ))}
        {range === "custom" && (
          <span className="flex items-center gap-1">
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200" />
            <span className="text-slate-500">to</span>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200" />
          </span>
        )}
        <span className="mx-1 h-4 w-px bg-slate-700" />
        <Chip active={hideMissed} onClick={() => setHideMissed((v) => !v)}>
          {hideMissed ? "✓ " : ""}Hide missed
        </Chip>
      </div>

      {allStages.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-slate-500">Stage:</span>
          {allStages.map((s) => (
            <Chip
              key={s}
              active={activeStages.includes(s)}
              onClick={() =>
                setActiveStages((prev) =>
                  prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
                )
              }
            >
              {s}
            </Chip>
          ))}
        </div>
      )}

      {allTags.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-slate-500">Tags:</span>
          {allTags.map((t) => (
            <Chip
              key={t}
              active={activeTags.includes(t)}
              onClick={() =>
                setActiveTags((prev) =>
                  prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
                )
              }
            >
              {t}
            </Chip>
          ))}
        </div>
      )}
    </>
  );

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col">
      {/* Search + sort */}
      <div className="mb-3 flex flex-wrap items-center gap-2 md:gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search company, title, or location…"
          className="flex-1 rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-2.5 text-sm text-slate-200 outline-none placeholder:text-slate-500 focus:border-indigo-500"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2.5 text-sm text-slate-300 outline-none focus:border-indigo-500"
        >
          <option value="newest">Newest</option>
          <option value="deadline">Deadline</option>
          <option value="company">Company</option>
          <option value="updated">Last updated</option>
        </select>
        <div className="relative">
          <button
            onClick={() => setShowExport((v) => !v)}
            title="Export"
            className="rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2.5 text-sm text-slate-400 hover:text-slate-200"
          >
            Export
          </button>
          <AnimatePresence>
            {showExport && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowExport(false)}
                />
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="absolute right-0 z-20 mt-1 w-44 rounded-lg border border-slate-700 bg-slate-800 p-1 shadow-xl"
                >
                  <div className="px-2 py-1 text-xs text-slate-500">
                    Export {filtered.length} shown
                  </div>
                  <button
                    onClick={() => doExport("csv")}
                    className="w-full rounded-md px-2 py-1.5 text-left text-sm text-slate-200 hover:bg-slate-700"
                  >
                    as CSV
                  </button>
                  <button
                    onClick={() => doExport("json")}
                    className="w-full rounded-md px-2 py-1.5 text-left text-sm text-slate-200 hover:bg-slate-700"
                  >
                    as JSON
                  </button>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
        {canWrite && (
          <button
            onClick={() => setShowStages(true)}
            title="Manage stages"
            className="rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2.5 text-sm text-slate-400 hover:text-slate-200"
          >
            Stages
          </button>
        )}
        {canWrite && (
          <button
            onClick={() => setShowTrash(true)}
            title="Trash"
            className="rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2.5 text-sm text-slate-400 hover:text-slate-200"
          >
            🗑 Deleted
          </button>
        )}
      </div>
      {!canWrite && (
        <div className="mb-3 rounded-lg border border-slate-800 bg-slate-800/40 px-3 py-1.5 text-xs text-slate-400">
          View-only. you have viewer access to this workspace.
        </div>
      )}

      {/* Filters — inline chips on desktop; a collapsible drawer on mobile so
          wrapped chip rows don't push the application list down the page. */}
      <div className="mb-3 hidden md:block">{filterControls}</div>
      <div className="mb-3 md:hidden">
        <button
          onClick={() => setShowFilters((v) => !v)}
          className="flex w-full items-center justify-between rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-300"
        >
          <span className="flex items-center gap-2">
            Filters &amp; tags
            {activeFilterCount > 0 && (
              <span className="rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                {activeFilterCount}
              </span>
            )}
          </span>
          <span className="text-slate-500">{showFilters ? "▲" : "▾"}</span>
        </button>
        <AnimatePresence initial={false}>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="pt-3">{filterControls}</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* List */}
      <div
        onScroll={handleScroll}
        onWheel={handleWheel}
        className="flex-1 space-y-2 overflow-auto pb-24"
      >
        {filtered.length === 0 ? (
          <div className="mt-16 text-center text-slate-500">
            <p className="mt-3">
              {jobs.length === 0
                ? "No applications yet. Add your first one."
                : "No matches for these filters."}
            </p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {filtered.map((job) => (
              <motion.div
                key={job.id}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{
                  opacity: 0,
                  height: 0,
                  scale: 0.95,
                  transition: { duration: 0.25, ease: "easeInOut" },
                }}
                className="overflow-hidden rounded-xl"
              >
                <JobRow
                  job={job}
                  canWrite={canWrite}
                  isDeleted={!!pendingDeletes[job.id]}
                  onEdit={() => setModal({ job })}
                  onDelete={() => handleDelete(job)}
                  onUndo={() => handleUndo(job.id)}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {canWrite && (
        <div className="absolute bottom-6 right-6 z-30">
          <AnimatePresence mode="wait">
            {!fabExpanded ? (
              <motion.button
                key="fab-default"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.12 }}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setFabExpanded(true)}
                className="flex items-center gap-2 rounded-full bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-500 transition"
              >
                <span>+ New application</span>
              </motion.button>
            ) : (
              <motion.div
                key="fab-expanded"
                initial={{ opacity: 0, scale: 0.85, y: 6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.85, y: 6 }}
                transition={{ type: "spring", stiffness: 600, damping: 30 }}
                className="flex items-center gap-2 rounded-full border border-slate-700 bg-slate-800/95 p-1.5 shadow-2xl backdrop-blur-md"
              >
                <motion.button
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => {
                    setFabExpanded(false);
                    setShowFillByLink(true);
                  }}
                  className="flex items-center gap-1.5 rounded-full bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 transition"
                >
                  <span>AI</span>
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => {
                    setFabExpanded(false);
                    setModal({});
                  }}
                  className="flex items-center gap-1.5 rounded-full bg-slate-700/80 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 hover:text-white transition"
                >
                  <span>Manual</span>
                </motion.button>

                <button
                  type="button"
                  onClick={() => setFabExpanded(false)}
                  title="Close"
                  className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition text-xs"
                >
                  ✕
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Backdrop overlay to close expanded FAB on click outside */}
      {fabExpanded && (
        <div
          className="fixed inset-0 z-20"
          onClick={() => setFabExpanded(false)}
        />
      )}

      <AnimatePresence>
        {showFillByLink && (
          <FillByLinkModal
            existingTags={allTags}
            onSuccess={(prefill) => {
              setShowFillByLink(false);
              setModal({ prefill });
            }}
            onCancel={() => setShowFillByLink(false)}
          />
        )}
        {modal && (
          <JobFormModal
            workspaceId={workspaceId}
            job={modal.job}
            prefill={modal.prefill}
            stages={stages}
            tagSuggestions={allTags}
            onClose={() => setModal(null)}
            onSaved={() => {
              setModal(null);
              refresh();
            }}
          />
        )}
        {showStages && (
          <StagesModal
            workspaceId={workspaceId}
            onClose={() => setShowStages(false)}
            onChanged={refresh}
          />
        )}
        {showTrash && (
          <TrashModal
            workspaceId={workspaceId}
            onClose={() => setShowTrash(false)}
            onChanged={refresh}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function JobRow({
  job,
  canWrite,
  isDeleted,
  onEdit,
  onDelete,
  onUndo,
}: {
  job: JobApplication;
  canWrite: boolean;
  isDeleted?: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onUndo?: () => void;
}) {
  const location = job.remote
    ? "Remote"
    : [job.locationCity, job.locationState].filter(Boolean).join(", ") || "—";
  const pay = fmtPay(job);
  const stageLabel =
    job.state === "Applied" && job.stage
      ? isInterviewStage(job.stage) && job.interviewNumber
        ? `${job.stage} #${job.interviewNumber}`
        : job.stage
      : null;
  const missed = isMissedDeadline(job);

  return (
    <div className="relative overflow-hidden rounded-xl">
      {/* Background showing 'Deleted' + Undo button */}
      <div
        className={`absolute inset-0 flex items-center justify-between rounded-xl border border-dashed border-slate-700/60 bg-slate-900/90 px-4 py-3 transition-opacity duration-200 ${
          isDeleted ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        <div className="flex items-center gap-2.5">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-xs text-rose-400 font-semibold">
            ✕
          </span>
          <span className="text-sm font-medium text-slate-300">Deleted</span>
          <span className="hidden text-xs text-slate-500 sm:inline truncate max-w-xs">
            · {job.title} {job.company ? `(${job.company})` : ""}
          </span>
        </div>
        {onUndo && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onUndo();
            }}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-indigo-400 hover:bg-slate-700 hover:text-indigo-300 transition shadow-sm active:scale-95"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a5 5 0 015 5v2m0 0l-4-4m4 4l4-4" />
            </svg>
            <span>Undo</span>
          </button>
        )}
      </div>

      {/* Front card that slides out */}
      <motion.div
        animate={{
          x: isDeleted ? "105%" : "0%",
          opacity: isDeleted ? 0 : 1,
        }}
        transition={{
          type: "spring",
          stiffness: 350,
          damping: 30,
        }}
        onClick={canWrite && !isDeleted ? onEdit : undefined}
        className={`group relative z-10 flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-800/95 px-4 py-3 backdrop-blur-sm ${
          canWrite && !isDeleted ? "cursor-pointer hover:border-slate-600" : "cursor-default"
        }`}
        style={{
          pointerEvents: isDeleted ? "none" : "auto",
        }}
      >
        {job.flag && (
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${FLAG_DOT[job.flag]}`} title={`Flag: ${job.flag}`} />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate font-medium text-slate-100">{job.title}</span>
            <span className="truncate text-sm text-slate-400">· {job.company}</span>
            {job.link && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (job.link) openUrl(job.link);
                }}
                title="Open job posting in browser"
                className="inline-flex items-center text-slate-400 opacity-0 transition hover:text-indigo-400 group-hover:opacity-100"
              >
                <svg
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
              </button>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
            <span>{location}</span>
            {pay && <span>{pay}</span>}
            {job.deadline && (
              <span className={missed ? "text-rose-400" : undefined}>
                Due {fmtDate(job.deadline)}
              </span>
            )}
            {job.endDate && <span>Ended {fmtDate(job.endDate)}</span>}
            {job.tags.map((t) => (
              <span key={t} className="rounded-full bg-slate-700/60 px-1.5 py-0.5 text-[10px] text-slate-300">
                {t}
              </span>
            ))}
          </div>
        </div>
        {stageLabel && (
          <span className="shrink-0 rounded-full bg-indigo-500/15 px-2.5 py-1 text-xs font-medium text-indigo-300">
            {stageLabel}
          </span>
        )}
        {missed && (
          <span
            className="shrink-0 rounded-full bg-rose-500/15 px-2.5 py-1 text-xs font-medium text-rose-300"
            title="Deadline passed without applying"
          >
            Missed deadline
          </span>
        )}
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${STATE_STYLES[job.state]}`}>
          {STATE_LABELS[job.state]}
        </span>
        {canWrite && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="shrink-0 rounded-lg px-2 py-1 text-slate-600 opacity-0 transition hover:bg-slate-700 hover:text-rose-400 group-hover:opacity-100"
            title="Delete"
          >
            ✕
          </button>
        )}
      </motion.div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 font-medium transition backdrop-blur-xs ${active
          ? "border-indigo-500 bg-indigo-500/25 text-indigo-200 shadow-xs"
          : "border-slate-700/80 bg-slate-800/60 text-slate-300 hover:border-slate-600 hover:bg-slate-800/90 hover:text-slate-100"
        }`}
    >
      {children}
    </button>
  );
}

function parseLocalDate(str: string, boundary: "start" | "end" = "start"): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
  if (m) {
    return boundary === "start"
      ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0)
      : new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59, 999);
  }
  return new Date(str);
}

function jobMatchesDateRange(
  job: JobApplication,
  stateFilter: ApplicationState | "all" | "missed",
  range: DateRange,
  customFrom: string,
  customTo: string,
  now: Date = new Date(),
): boolean {
  if (range === "all") return true;

  // 1. Determine candidate date strings for this job based on selected stateFilter
  const candidateDateStrings: string[] = [];

  const effectiveState =
    stateFilter === "all"
      ? isMissedDeadline(job)
        ? "missed"
        : job.state
      : stateFilter;

  switch (effectiveState) {
    case "Applied":
      if (job.dateApplied) candidateDateStrings.push(job.dateApplied);
      else if (job.updatedAt) candidateDateStrings.push(job.updatedAt);
      else if (job.createdAt) candidateDateStrings.push(job.createdAt);
      break;

    case "missed":
      if (job.deadline) candidateDateStrings.push(job.deadline);
      break;

    case "InProgress":
      if (job.lastUpdate) candidateDateStrings.push(job.lastUpdate);
      if (job.updatedAt) candidateDateStrings.push(job.updatedAt);
      if (job.nextInterviewDate) candidateDateStrings.push(job.nextInterviewDate);
      if (job.dateApplied) candidateDateStrings.push(job.dateApplied);
      if (job.createdAt) candidateDateStrings.push(job.createdAt);
      break;

    case "NotApplied":
      if (job.deadline) candidateDateStrings.push(job.deadline);
      if (job.createdAt) candidateDateStrings.push(job.createdAt);
      if (job.updatedAt) candidateDateStrings.push(job.updatedAt);
      break;

    default:
      if (job.dateApplied) candidateDateStrings.push(job.dateApplied);
      if (job.deadline) candidateDateStrings.push(job.deadline);
      if (job.updatedAt) candidateDateStrings.push(job.updatedAt);
      if (job.createdAt) candidateDateStrings.push(job.createdAt);
      break;
  }

  if (candidateDateStrings.length === 0) return false;

  // 2. Compute range bounds in local time
  let minDate: Date | null = null;
  let maxDate: Date | null = null;

  if (range === "today") {
    minDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    maxDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  } else if (range === "week") {
    minDate = new Date(now.getTime() - 7 * 864e5);
    maxDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  } else if (range === "month") {
    minDate = new Date(now.getTime() - 30 * 864e5);
    maxDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  } else if (range === "custom") {
    if (customFrom) minDate = parseLocalDate(customFrom, "start");
    if (customTo) maxDate = parseLocalDate(customTo, "end");
  }

  // 3. Check if at least one candidate date falls within [minDate, maxDate]
  return candidateDateStrings.some((dStr) => {
    if (!dStr) return false;
    const d = parseLocalDate(dStr, "start");
    if (isNaN(d.getTime())) return false;
    if (minDate && d < minDate) return false;
    if (maxDate && d > maxDate) return false;
    return true;
  });
}

function cmpNullableDate(a: string | null, b: string | null): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b);
}
