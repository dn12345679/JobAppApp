import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { JobApplication } from "../../types";
import { listJobs } from "../../lib/db";
import { fmtDate } from "../../lib/format";

type EventKind = "deadline" | "interview";
interface CalEvent {
  kind: EventKind;
  job: JobApplication;
}

const RAIL_LIMIT = 50; // cap rail rows for performance
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function CalendarPage({
  workspaceId,
  refreshKey,
}: {
  workspaceId: string;
  refreshKey?: number;
}) {
  const [jobs, setJobs] = useState<JobApplication[]>([]);
  const today = new Date();
  const [view, setView] = useState({
    year: today.getFullYear(),
    month: today.getMonth(),
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);

  useEffect(() => {
    listJobs(workspaceId).then(setJobs);
  }, [workspaceId, refreshKey]);

  // Map YYYY-MM-DD -> events on that day.
  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalEvent[]>();
    const add = (date: string | null, ev: CalEvent) => {
      const key = dayKey(date);
      if (!key) return;
      const list = map.get(key);
      if (list) list.push(ev);
      else map.set(key, [ev]);
    };
    for (const j of jobs) {
      add(j.deadline, { kind: "deadline", job: j });
      add(j.nextInterviewDate, { kind: "interview", job: j });
    }
    return map;
  }, [jobs]);

  const allEvents = useMemo(() => {
    const list: { key: string; ev: CalEvent }[] = [];
    for (const [key, evs] of eventsByDay)
      for (const ev of evs) list.push({ key, ev });
    return list.sort((a, b) => a.key.localeCompare(b.key));
  }, [eventsByDay]);

  const todayKey = dayKey(fmtISO(today)) ?? "";
  const grid = buildGrid(view.year, view.month);

  function shift(delta: number) {
    setView((v) => {
      const m = v.month + delta;
      return { year: v.year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 };
    });
  }

  const weeks = Math.ceil(grid.length / 7);
  const upcoming = allEvents
    .filter((e) => e.key >= todayKey)
    .slice(0, RAIL_LIMIT);
  const past = allEvents
    .filter((e) => e.key < todayKey)
    .reverse()
    .slice(0, RAIL_LIMIT);

  return (
    <div className="flex h-full flex-col">
      {/* Month header */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-100">
          {MONTHS[view.month]} {view.year}
        </h2>
        <div className="flex gap-1">
          <NavBtn onClick={() => shift(-1)}>‹</NavBtn>
          <NavBtn
            onClick={() =>
              setView({ year: today.getFullYear(), month: today.getMonth() })
            }
          >
            Today
          </NavBtn>
          <NavBtn onClick={() => shift(1)}>›</NavBtn>
        </div>
      </div>

      {/* Legend */}
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-indigo-400" /> Deadline
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> Interview
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded border border-indigo-500 bg-indigo-500/10" />{" "}
          Today
        </span>
      </div>

      <div className="flex min-h-0 flex-1 gap-6">
        {/* Calendar grid */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="grid grid-cols-7 gap-1 pb-1 text-center text-xs text-slate-500">
            {WEEKDAYS.map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>
          <div
            className="grid min-h-0 flex-1 grid-cols-7 gap-1"
            style={{ gridTemplateRows: `repeat(${weeks}, minmax(0, 1fr))` }}
          >
            {grid.map((day, i) => {
              if (day == null)
                return <div key={i} className="rounded-lg bg-slate-900/30" />;
              const key = keyOf(view.year, view.month, day);
              const evs = eventsByDay.get(key) ?? [];
              const isToday = key === todayKey;
              const hasInterview = evs.some((e) => e.kind === "interview");
              return (
                <button
                  key={i}
                  onClick={() => evs.length && setSelected(key)}
                  className={`flex flex-col overflow-hidden rounded-lg border p-1.5 text-left transition ${
                    isToday
                      ? "border-indigo-500 bg-indigo-500/10"
                      : "border-slate-800"
                  } ${evs.length ? "cursor-pointer hover:border-slate-600" : "cursor-default"} ${
                    hasInterview ? "ring-1 ring-amber-400/50" : ""
                  }`}
                >
                  <span
                    className={`text-xs font-medium ${
                      isToday ? "text-indigo-200" : "text-slate-400"
                    }`}
                  >
                    {day}
                  </span>
                  <div className="mt-1 min-h-0 flex-1 space-y-0.5 overflow-hidden">
                    {evs.slice(0, 3).map((e, idx) => (
                      <div
                        key={idx}
                        className={`truncate rounded px-1 py-0.5 text-[10px] leading-tight ${
                          e.kind === "interview"
                            ? "bg-amber-400/15 text-amber-200"
                            : "bg-indigo-500/15 text-indigo-200"
                        }`}
                        title={`${e.job.title} · ${e.job.company}`}
                      >
                        {e.job.title}
                      </div>
                    ))}
                    {evs.length > 3 && (
                      <div className="px-1 text-[10px] text-slate-500">
                        +{evs.length - 3} more
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Deadline rail */}
        <div className="flex w-72 shrink-0 flex-col overflow-auto pr-1">
          <h3 className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-500">
            Upcoming
          </h3>
          {upcoming.length === 0 ? (
            <p className="text-sm text-slate-600">
              No upcoming deadlines or interviews.
            </p>
          ) : (
            <ul className="space-y-2">
              {upcoming.map(({ key, ev }, i) => (
                <EventRow key={i} eventKey={key} ev={ev} onClick={() => setSelected(key)} />
              ))}
            </ul>
          )}

          {past.length > 0 && (
            <div className="mt-5">
              <button
                onClick={() => setShowPast((v) => !v)}
                className="flex w-full items-center justify-between text-sm font-medium uppercase tracking-wide text-slate-500 hover:text-slate-300"
              >
                <span>
                  Past ({past.length}
                  {past.length === RAIL_LIMIT ? "+" : ""})
                </span>
                <span className="text-xs">{showPast ? "▾" : "▸"}</span>
              </button>
              <AnimatePresence initial={false}>
                {showPast && (
                  <motion.ul
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="mt-2 space-y-2 overflow-hidden"
                  >
                    {past.map(({ key, ev }, i) => (
                      <EventRow key={i} eventKey={key} ev={ev} onClick={() => setSelected(key)} muted />
                    ))}
                  </motion.ul>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      {/* Day popup */}
      <AnimatePresence>
        {selected && (
          <DayPopup
            dayKey={selected}
            events={eventsByDay.get(selected) ?? []}
            onClose={() => setSelected(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function DayPopup({
  dayKey,
  events,
  onClose,
}: {
  dayKey: string;
  events: CalEvent[];
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 p-4"
    >
      <motion.div
        initial={{ scale: 0.96, y: 10 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.96, y: 10 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-800 p-5 shadow-2xl"
      >
        <h3 className="mb-3 font-semibold text-slate-100">{fmtDate(dayKey)}</h3>
        <ul className="space-y-2">
          {events.map((ev, i) => (
            <li
              key={i}
              className={`rounded-lg border-l-2 bg-slate-900/40 px-3 py-2 ${
                ev.kind === "interview" ? "border-amber-400" : "border-indigo-400"
              }`}
            >
              <div className="text-sm text-slate-100">
                {ev.job.title} · <span className="text-slate-400">{ev.job.company}</span>
              </div>
              <div className="text-xs text-slate-500">
                {ev.kind === "interview" ? "Interview" : "Application deadline"}
                {ev.job.link && (
                  <>
                    {" · "}
                    <button
                      onClick={() => openUrl(ev.job.link!)}
                      className="text-indigo-400 hover:underline"
                    >
                      link
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      </motion.div>
    </motion.div>
  );
}

function EventRow({
  eventKey,
  ev,
  onClick,
  muted,
}: {
  eventKey: string;
  ev: CalEvent;
  onClick: () => void;
  muted?: boolean;
}) {
  return (
    <li
      onClick={onClick}
      className={`cursor-pointer rounded-lg border-l-2 bg-slate-800/40 px-3 py-2 text-sm hover:bg-slate-800 ${
        ev.kind === "interview" ? "border-amber-400" : "border-indigo-400"
      } ${muted ? "opacity-60" : ""}`}
    >
      <div className="truncate text-slate-200">{ev.job.title}</div>
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>{ev.job.company}</span>
        <span>
          {fmtDate(eventKey)}
        </span>
      </div>
    </li>
  );
}

function NavBtn({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg border border-slate-700 px-3 py-1 text-sm text-slate-300 hover:border-slate-600 hover:text-slate-100"
    >
      {children}
    </button>
  );
}

// ---- date helpers -----------------------------------------------------------

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function keyOf(year: number, month: number, day: number) {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}
function fmtISO(d: Date) {
  return keyOf(d.getFullYear(), d.getMonth(), d.getDate());
}
/** Normalize a stored date to a YYYY-MM-DD key, or null. */
function dayKey(value: string | null): string | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}
/** Grid cells for a month: leading nulls then day numbers. */
function buildGrid(year: number, month: number): (number | null)[] {
  const startWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = Array(startWeekday).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  return cells;
}
