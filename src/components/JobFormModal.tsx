import { useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import type {
  ApplicationState,
  AuthKind,
  Flag,
  JobApplication,
  WorkspaceStage,
} from "../types";
import { createJob, updateJob } from "../lib/db";
import {
  AUTH_OPTIONS,
  FLAG_DOT,
  FLAG_OPTIONS,
  STATE_OPTIONS,
  isInterviewStage,
  normalizeJob,
} from "../lib/jobRules";

type PayMode = "range" | "median";

export default function JobFormModal({
  workspaceId,
  job,
  stages,
  onClose,
  onSaved,
}: {
  workspaceId: string;
  job?: JobApplication;
  stages: WorkspaceStage[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = !!job;

  const [company, setCompany] = useState(job?.company ?? "");
  const [title, setTitle] = useState(job?.title ?? "");
  const [payMode, setPayMode] = useState<PayMode>(
    job?.payMedian != null ? "median" : "range",
  );
  const [payMin, setPayMin] = useState(numStr(job?.payMin));
  const [payMax, setPayMax] = useState(numStr(job?.payMax));
  const [payMedian, setPayMedian] = useState(numStr(job?.payMedian));
  const [hourly, setHourly] = useState(job?.hourly ?? false);
  const [state, setState] = useState<ApplicationState>(
    job?.state ?? "NotApplied",
  );
  const [stage, setStage] = useState<string>(job?.stage ?? "");
  const [interviewNumber, setInterviewNumber] = useState(
    numStr(job?.interviewNumber),
  );
  const [remote, setRemote] = useState(job?.remote ?? false);
  const [locationCity, setLocationCity] = useState(job?.locationCity ?? "");
  const [locationState, setLocationState] = useState(job?.locationState ?? "");
  const [auth, setAuth] = useState<AuthKind>(job?.auth ?? "none");
  const [username, setUsername] = useState(job?.username ?? "");
  const [notes, setNotes] = useState(job?.notes ?? "");
  const [deadline, setDeadline] = useState(job?.deadline ?? "");
  const [dateApplied, setDateApplied] = useState(job?.dateApplied ?? "");
  const [nextInterviewDate, setNextInterviewDate] = useState(
    job?.nextInterviewDate ?? "",
  );
  const [endDate, setEndDate] = useState(job?.endDate ?? "");
  const [flag, setFlag] = useState<Flag | "">(job?.flag ?? "");
  const [link, setLink] = useState(job?.link ?? "");
  const [tags, setTags] = useState<string[]>(job?.tags ?? []);
  const [saving, setSaving] = useState(false);

  const canSave = company.trim() && title.trim();

  async function submit() {
    if (!canSave || saving) return;
    setSaving(true);

    const merged: JobApplication = {
      id: job?.id ?? "",
      workspaceId,
      createdAt: job?.createdAt ?? "",
      updatedAt: job?.updatedAt ?? "",
      company: company.trim(),
      title: title.trim(),
      payMin: payMode === "range" ? toNum(payMin) : null,
      payMax: payMode === "range" ? toNum(payMax) : null,
      payMedian: payMode === "median" ? toNum(payMedian) : null,
      hourly,
      state,
      stage: stage || null,
      interviewNumber: toNum(interviewNumber),
      locationCity: locationCity.trim() || null,
      locationState: locationState.trim() || null,
      remote,
      username: username.trim() || null,
      auth,
      notes: notes.trim() || null,
      deadline: deadline || null,
      dateApplied: dateApplied || null,
      lastUpdate: job?.lastUpdate ?? null,
      nextInterviewDate: nextInterviewDate || null,
      endDate: endDate || null,
      flag: flag || null,
      link: link.trim() || null,
      tags,
    };

    const normalized = normalizeJob(merged, job?.stage ?? null);
    try {
      if (editing) await updateJob(normalized);
      else await createJob(workspaceId, normalized);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="absolute inset-0 z-20 flex items-start justify-center overflow-auto bg-black/50 p-4 sm:items-center"
    >
      <motion.div
        initial={{ scale: 0.96, y: 12 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.96, y: 12 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-800 p-5 shadow-2xl"
      >
        <h2 className="mb-4 text-lg font-semibold text-slate-100">
          {editing ? "Edit application" : "New application"}
        </h2>

        <div className="max-h-[70vh] space-y-3 overflow-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Company *">
              <input autoFocus value={company} onChange={(e) => setCompany(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Position title *">
              <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
            </Field>
          </div>

          {/* Pay */}
          <Field label="Pay (USD)">
            <div className="flex flex-wrap items-center gap-2">
              <Segmented
                value={payMode}
                onChange={setPayMode}
                options={[
                  { value: "range", label: "Range" },
                  { value: "median", label: "Median" },
                ]}
              />
              <Segmented
                value={hourly ? "hourly" : "annual"}
                onChange={(v) => setHourly(v === "hourly")}
                options={[
                  { value: "annual", label: "/yr" },
                  { value: "hourly", label: "/hr" },
                ]}
              />
              {payMode === "range" ? (
                <div className="flex flex-1 items-center gap-2">
                  <input type="number" placeholder="min" value={payMin} onChange={(e) => setPayMin(e.target.value)} className={inputCls} />
                  <span className="text-slate-500">–</span>
                  <input type="number" placeholder="max" value={payMax} onChange={(e) => setPayMax(e.target.value)} className={inputCls} />
                </div>
              ) : (
                <input type="number" placeholder="expected median" value={payMedian} onChange={(e) => setPayMedian(e.target.value)} className={`${inputCls} flex-1`} />
              )}
            </div>
          </Field>

          {/* State / stage */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="State">
              <select value={state} onChange={(e) => setState(e.target.value as ApplicationState)} className={inputCls}>
                {STATE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Field>

            
            {state === "Applied" && (
              <Field label="Stage">
                <select value={stage} onChange={(e) => setStage(e.target.value)} className={inputCls}>
                  <option value="">—</option>
                  {stages.map((s) => (
                    <option key={s.id} value={s.label}>{s.label}</option>
                  ))}
                  {/* Preserve a legacy/removed stage still on this job. */}
                  {stage && !stages.some((s) => s.label === stage) && (
                    <option value={stage}>{stage}</option>
                  )}
                </select>
              </Field>
            )}
          </div>

          {state === "Applied" && isInterviewStage(stage) && (
            <Field label="Interview number">
              <input type="number" min={1} value={interviewNumber} onChange={(e) => setInterviewNumber(e.target.value)} className={inputCls} />
            </Field>
          )}

          {state === "NotApplied" && (
            <Field label="Flag">
              <div className="flex flex-wrap gap-2">
                <FlagPill selected={flag === ""} onClick={() => setFlag("")} label="None" />
                {FLAG_OPTIONS.map((o) => (
                  <FlagPill
                    key={o.value}
                    selected={flag === o.value}
                    onClick={() => setFlag(o.value)}
                    dot={FLAG_DOT[o.value]}
                    label={o.label}
                  />
                ))}
              </div>
            </Field>
          )}

          {/* Location */}
          <Field label="Location">
            <label className="mb-2 flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={remote} onChange={(e) => setRemote(e.target.checked)} className="h-4 w-4 accent-indigo-500" />
              Remote available
            </label>
            {!remote && (
              <div className="grid grid-cols-2 gap-2">
                <input placeholder="City" value={locationCity} onChange={(e) => setLocationCity(e.target.value)} className={inputCls} />
                <input placeholder="STATE" value={locationState} onChange={(e) => setLocationState(e.target.value)} className={inputCls} />
              </div>
            )}
          </Field>

          {/* Auth */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Sign-in">
              <select value={auth} onChange={(e) => setAuth(e.target.value as AuthKind)} className={inputCls}>
                {AUTH_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Field>
            {auth === "has_login" && (
              <Field label="Username">
                <input value={username} onChange={(e) => setUsername(e.target.value)} className={inputCls} />
              </Field>
            )}
          </div>
          {auth === "has_login" && (
            <p className="-mt-1 text-xs text-amber-400/80">
              Passwords won't be stored on the Database
            </p>
          )}

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Deadline">
              <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Date applied">
              <input type="date" value={dateApplied} onChange={(e) => setDateApplied(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Next interview">
              <input type="date" value={nextInterviewDate} onChange={(e) => setNextInterviewDate(e.target.value)} className={inputCls} />
            </Field>
            <Field label="End date">
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputCls} />
            </Field>
          </div>

          <Field label="Link">
            <input type="url" placeholder="https://…" value={link} onChange={(e) => setLink(e.target.value)} className={inputCls} />
          </Field>

          <Field label="Tags">
            <TagInput tags={tags} onChange={setTags} />
          </Field>

          <Field label="Notes">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={`${inputCls} resize-none`} />
          </Field>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-slate-400 hover:text-slate-200">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!canSave || saving}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? "Saving…" : editing ? "Save changes" : "Create"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function TagInput({
  tags,
  onChange,
}: {
  tags: string[];
  onChange: (t: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  function commit() {
    const v = draft.trim();
    if (v && !tags.includes(v)) onChange([...tags, v]);
    setDraft("");
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-600 bg-slate-900/60 px-2 py-1.5">
      {tags.map((t) => (
        <span key={t} className="flex items-center gap-1 rounded-full bg-indigo-500/20 px-2 py-0.5 text-xs text-indigo-200">
          {t}
          <button onClick={() => onChange(tags.filter((x) => x !== t))} className="text-indigo-300 hover:text-white">×</button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit();
          } else if (e.key === "Backspace" && !draft && tags.length) {
            onChange(tags.slice(0, -1));
          }
        }}
        onBlur={commit}
        placeholder={tags.length ? "" : "Add tags…"}
        className="min-w-[6rem] flex-1 bg-transparent px-1 py-0.5 text-sm text-slate-100 outline-none"
      />
    </div>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="flex shrink-0 rounded-lg border border-slate-600 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
            value === o.value ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-slate-600 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500";

function FlagPill({
  selected,
  onClick,
  dot,
  label,
}: {
  selected: boolean;
  onClick: () => void;
  dot?: string;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition ${
        selected
          ? "border-indigo-500 bg-indigo-500/10 text-slate-100"
          : "border-slate-600 text-slate-300 hover:border-slate-500"
      }`}
    >
      <span
        className={`h-2.5 w-2.5 rounded-full ${
          dot ?? "border border-slate-500"
        }`}
      />
      {label}
    </button>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-400">{label}</span>
      {children}
    </label>
  );
}

const numStr = (n: number | null | undefined) => (n == null ? "" : String(n));
const toNum = (s: string): number | null => {
  const v = parseFloat(s);
  return isNaN(v) ? null : v;
};
