import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type {
  ApplicationState,
  JobApplication,
  WorkspaceStage,
} from "../../types";
import { deleteJob, ensureStages, listJobs, listStages } from "../../lib/db";
import { fmtDate, fmtPay } from "../../lib/format";
import {
  FLAG_DOT,
  STATE_LABELS,
  STATE_STYLES,
  isInterviewStage,
} from "../../lib/jobRules";
import JobFormModal from "../JobFormModal";
import TrashModal from "../TrashModal";
import StagesModal from "../StagesModal";
import { exportJobs, type ExportFormat } from "../../lib/export";

type DateRange = "all" | "week" | "month" | "custom";
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
  const [stateFilter, setStateFilter] = useState<ApplicationState | "all">("all");
  const [range, setRange] = useState<DateRange>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [sort, setSort] = useState<SortKey>("newest");
  const [modal, setModal] = useState<null | { job?: JobApplication }>(null);
  const [showTrash, setShowTrash] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showStages, setShowStages] = useState(false);
  const [stages, setStages] = useState<WorkspaceStage[]>([]);

  async function refresh() {
    setJobs(await listJobs(workspaceId));
    setStages(await listStages(workspaceId));
  }

  useEffect(() => {
    (async () => {
      if (canWrite) await ensureStages(workspaceId); // seed defaults if empty
      await refresh();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, refreshKey]);

  const allTags = useMemo(
    () => [...new Set(jobs.flatMap((j) => j.tags))].sort(),
    [jobs],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const cutoff = rangeCutoff(range, customFrom);
    const to = range === "custom" && customTo ? new Date(customTo) : null;

    const result = jobs.filter((j) => {
      if (q) {
        const hay = `${j.company} ${j.title} ${j.locationCity ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (stateFilter !== "all" && j.state !== stateFilter) return false;
      if (activeTags.length && !activeTags.every((t) => j.tags.includes(t)))
        return false;
      if (range !== "all") {
        if (!j.dateApplied) return false;
        const d = new Date(j.dateApplied);
        if (cutoff && d < cutoff) return false;
        if (to && d > to) return false;
      }
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
  }, [jobs, query, stateFilter, range, customFrom, customTo, activeTags, sort]);

  async function doExport(format: ExportFormat) {
    setShowExport(false);
    try {
      await exportJobs(filtered, format, workspaceName || "job-applications");
    } catch (e) {
      alert(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col">
      {/* Search + sort */}
      <div className="mb-3 flex items-center gap-3">
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

      {/* Filters */}
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <Chip active={stateFilter === "all"} onClick={() => setStateFilter("all")}>
          All
        </Chip>
        {(["NotApplied", "InProgress", "Applied"] as ApplicationState[]).map((s) => (
          <Chip key={s} active={stateFilter === s} onClick={() => setStateFilter(s)}>
            {STATE_LABELS[s]}
          </Chip>
        ))}
        <span className="mx-1 h-4 w-px bg-slate-700" />
        {(["all", "week", "month", "custom"] as DateRange[]).map((r) => (
          <Chip key={r} active={range === r} onClick={() => setRange(r)}>
            {r === "all" ? "Any date" : r === "week" ? "Past week" : r === "month" ? "Past month" : "Custom"}
          </Chip>
        ))}
        {range === "custom" && (
          <span className="flex items-center gap-1">
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200" />
            <span className="text-slate-500">to</span>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200" />
          </span>
        )}
      </div>

      {allTags.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs">
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

      {/* List */}
      <div className="flex-1 space-y-2 overflow-auto pb-24">
        {filtered.length === 0 ? (
          <div className="mt-16 text-center text-slate-500">
            <p className="mt-3">
              {jobs.length === 0
                ? "No applications yet. Add your first one."
                : "No matches for these filters."}
            </p>
          </div>
        ) : (
          filtered.map((job) => (
            <JobRow
              key={job.id}
              job={job}
              canWrite={canWrite}
              onEdit={() => setModal({ job })}
              onDelete={async () => {
                await deleteJob(job.id);
                refresh();
              }}
            />
          ))
        )}
      </div>

      {canWrite && (
        <motion.button
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          onClick={() => setModal({})}
          className="absolute bottom-6 right-6 rounded-full bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-lg  hover:bg-indigo-500"
        >
          + New application
        </motion.button>
      )}

      <AnimatePresence>
        {modal && (
          <JobFormModal
            workspaceId={workspaceId}
            job={modal.job}
            stages={stages}
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
  onEdit,
  onDelete,
}: {
  job: JobApplication;
  canWrite: boolean;
  onEdit: () => void;
  onDelete: () => void;
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

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={canWrite ? onEdit : undefined}
      className={`group flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-800/40 px-4 py-3 ${
        canWrite ? "cursor-pointer hover:border-slate-600" : "cursor-default"
      }`}
    >
      {job.flag && (
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${FLAG_DOT[job.flag]}`} title={`Flag: ${job.flag}`} />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate font-medium text-slate-100">{job.title}</span>
          <span className="truncate text-sm text-slate-400">· {job.company}</span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
          <span>{location}</span>
          {pay && <span>{pay}</span>}
          {job.deadline && <span>Due {fmtDate(job.deadline)}</span>}
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
      <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${STATE_STYLES[job.state]}`}>
        {STATE_LABELS[job.state]}
      </span>
      {canWrite && (
        <button
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
      className={`rounded-full border px-2.5 py-1 font-medium transition ${
        active
          ? "border-indigo-500 bg-indigo-500/15 text-indigo-200"
          : "border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200"
      }`}
    >
      {children}
    </button>
  );
}

function rangeCutoff(range: DateRange, customFrom: string): Date | null {
  const now = new Date();
  if (range === "week") return new Date(now.getTime() - 7 * 864e5);
  if (range === "month") return new Date(now.getTime() - 30 * 864e5);
  if (range === "custom" && customFrom) return new Date(customFrom);
  return null;
}

function cmpNullableDate(a: string | null, b: string | null): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b);
}
