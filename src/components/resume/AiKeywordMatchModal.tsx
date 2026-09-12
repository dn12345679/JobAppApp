import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ModalPortal from "../ModalPortal";
import type { ApplicationState, JobApplication, ResumeProfile } from "../../types";
import { listJobs, listWorkspaces } from "../../lib/db";
import { STATE_LABELS, STATE_STYLES } from "../../lib/jobRules";
import {
  type AutoSettings,
  type AiProvider,
  loadAutoSettings,
  saveAutoSettings,
  getActiveApiKey,
  PROVIDER_OPTIONS,
} from "../../lib/autoSettings";
import {
  type AiMatchStepInfo,
  type BulletDiff,
  type KeywordMatchResult,
  MATCH_STEP_LABELS,
  matchKeywordsToResume,
  applySelectedDiffs,
} from "../../lib/aiKeywordMatch";

export default function AiKeywordMatchModal({
  profile,
  workspaceId,
  onApply,
  onClose,
}: {
  profile: ResumeProfile;
  workspaceId?: string;
  onApply: (modified: ResumeProfile) => void;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<"select" | "loading" | "preview">("select");
  const [jobs, setJobs] = useState<JobApplication[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [stateFilters, setStateFilters] = useState<Set<ApplicationState>>(
    () => new Set<ApplicationState>(["NotApplied", "InProgress", "Applied"]),
  );

  // AI settings
  const [settings, setSettings] = useState<AutoSettings>(loadAutoSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [tempApiKey, setTempApiKey] = useState(() => getActiveApiKey(loadAutoSettings()));

  // Matching state
  const [stepInfo, setStepInfo] = useState<AiMatchStepInfo>({
    step: "reading",
    label: MATCH_STEP_LABELS.reading,
    progress: 20,
  });
  const [matchResult, setMatchResult] = useState<KeywordMatchResult | null>(null);
  const [selectedDiffIds, setSelectedDiffIds] = useState<Set<string>>(new Set());
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Load available jobs
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoadingJobs(true);
      try {
        let allJobs: JobApplication[] = [];
        if (workspaceId) {
          allJobs = await listJobs(workspaceId);
        } else {
          const workspaces = await listWorkspaces();
          for (const ws of workspaces) {
            const wsJobs = await listJobs(ws.id);
            allJobs.push(...wsJobs);
          }
        }
        if (!alive) return;
        setJobs(allJobs);
        if (allJobs.length > 0) {
          setSelectedJobId(allJobs[0].id);
        }
      } catch (err) {
        console.error("Failed to load jobs for keyword matching:", err);
      } finally {
        if (alive) setLoadingJobs(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [workspaceId]);

  const activeProviderConfig =
    PROVIDER_OPTIONS.find((p) => p.id === settings.aiProvider) || PROVIDER_OPTIONS[0];

  const handleProviderChange = (providerId: AiProvider) => {
    const pConfig = PROVIDER_OPTIONS.find((p) => p.id === providerId)!;
    const newSettings: AutoSettings = {
      ...settings,
      aiProvider: providerId,
      aiModel: pConfig.defaultModel,
    };
    setSettings(newSettings);
    saveAutoSettings(newSettings);
    setTempApiKey(getActiveApiKey(newSettings));
  };

  const handleApiKeyChange = (key: string) => {
    setTempApiKey(key);
    const newSettings = { ...settings };
    if (settings.aiProvider === "openai") newSettings.openaiKey = key;
    else if (settings.aiProvider === "gemini") newSettings.geminiKey = key;
    else if (settings.aiProvider === "anthropic") newSettings.anthropicKey = key;
    setSettings(newSettings);
    saveAutoSettings(newSettings);
  };

  const handleModelChange = (modelId: string) => {
    const newSettings = { ...settings, aiModel: modelId };
    setSettings(newSettings);
    saveAutoSettings(newSettings);
  };

  const selectedJob = jobs.find((j) => j.id === selectedJobId) ?? null;

  const filteredJobs = jobs.filter((j) => {
    if (!stateFilters.has(j.state)) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      j.company.toLowerCase().includes(q) ||
      j.title.toLowerCase().includes(q) ||
      (j.locationCity && j.locationCity.toLowerCase().includes(q)) ||
      (j.tags && j.tags.some((t) => t.toLowerCase().includes(q)))
    );
  });

  useEffect(() => {
    if (filteredJobs.length > 0) {
      if (!selectedJobId || !filteredJobs.some((j) => j.id === selectedJobId)) {
        setSelectedJobId(filteredJobs[0].id);
      }
    } else {
      setSelectedJobId(null);
    }
  }, [filteredJobs, selectedJobId]);

  const handleStartMatch = async () => {
    if (!selectedJob) return;
    const apiKey = getActiveApiKey(settings);
    if (!apiKey) {
      setShowSettings(true);
      setErrorMsg(`Please enter your ${activeProviderConfig.name} API key below.`);
      return;
    }

    setErrorMsg(null);
    setPhase("loading");
    try {
      const result = await matchKeywordsToResume(
        profile,
        selectedJob,
        settings,
        (info) => setStepInfo(info),
      );
      setMatchResult(result);
      setSelectedDiffIds(new Set(result.diffs.map((d) => d.id)));
      setPhase("preview");
    } catch (err: any) {
      setErrorMsg(err.message || String(err));
      setPhase("select");
    }
  };

  const toggleDiff = (id: string) => {
    setSelectedDiffIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (!matchResult) return;
    setSelectedDiffIds(new Set(matchResult.diffs.map((d) => d.id)));
  };

  const deselectAll = () => {
    setSelectedDiffIds(new Set());
  };

  const handleConfirmApply = () => {
    if (!matchResult) return;
    const updated = applySelectedDiffs(profile, matchResult.diffs, selectedDiffIds);
    onApply(updated);
    onClose();
  };

  return (
    <ModalPortal>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={phase === "loading" ? undefined : onClose}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 10 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 10 }}
          transition={{ type: "spring", stiffness: 450, damping: 32 }}
          onClick={(e) => e.stopPropagation()}
          className="relative flex flex-col w-full max-w-2xl max-h-[85vh] rounded-2xl border border-slate-800 bg-slate-900 text-slate-100 shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
            <div className="flex items-center gap-2.5">
              <div>
                <h2 className="text-base font-semibold text-slate-100">
                  AI Keyword Match
                </h2>
                <p className="text-xs text-slate-400">
                  Tailor résumé bullets with high-impact keywords for your target role
                </p>
              </div>
            </div>
            {phase !== "loading" && (
              <button
                type="button"
                onClick={onClose}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition"
              >
                ✕
              </button>
            )}
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6">
            <AnimatePresence mode="wait">
              {/* Phase 1: Job Selection */}
              {phase === "select" && (
                <motion.div
                  key="select"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="space-y-4"
                >
                  {errorMsg && (
                    <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
                      {errorMsg}
                    </div>
                  )}

                  {/* AI Provider bar */}
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-slate-400">AI Provider:</span>
                        <span className="font-semibold text-slate-200">
                          {activeProviderConfig.name}
                        </span>
                        <span className="text-[11px] text-slate-500">
                          ({settings.aiModel})
                        </span>
                        {getActiveApiKey(settings) ? (
                          <span className="text-emerald-400 font-medium text-[10px]">
                            ✓ Key Set
                          </span>
                        ) : (
                          <span className="text-amber-400 font-medium text-[10px]">
                            ⚠ Key Required
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowSettings(!showSettings)}
                        className="text-xs font-medium text-indigo-400 hover:text-indigo-300 transition"
                      >
                        {showSettings ? "Hide Settings" : "Configure Key"}
                      </button>
                    </div>

                    {showSettings && (
                      <div className="mt-3 pt-3 border-t border-slate-800 space-y-3">
                        <div className="flex items-center gap-1.5">
                          {PROVIDER_OPTIONS.map((prov) => {
                            const isSelected = settings.aiProvider === prov.id;
                            return (
                              <button
                                key={prov.id}
                                type="button"
                                onClick={() => handleProviderChange(prov.id)}
                                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${isSelected
                                    ? "bg-indigo-600 text-white"
                                    : "bg-slate-800 text-slate-400 hover:text-slate-200"
                                  }`}
                              >
                                {prov.name}
                              </button>
                            );
                          })}
                        </div>
                        <div className="space-y-1">
                          <label className="text-[11px] font-medium text-slate-400">
                            {activeProviderConfig.name} API Key
                          </label>
                          <input
                            type="password"
                            placeholder={activeProviderConfig.keyPlaceholder}
                            value={tempApiKey}
                            onChange={(e) => handleApiKeyChange(e.target.value)}
                            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                          />
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <label className="text-[11px] font-medium text-slate-400">
                            Model
                          </label>
                          <select
                            value={
                              activeProviderConfig.models.some((m) => m.id === settings.aiModel)
                                ? settings.aiModel
                                : "__custom__"
                            }
                            onChange={(e) => {
                              if (e.target.value === "__custom__") {
                                handleModelChange("");
                              } else {
                                handleModelChange(e.target.value);
                              }
                            }}
                            className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-slate-200 focus:outline-none focus:border-indigo-500 text-xs"
                          >
                            {activeProviderConfig.models.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.name}
                              </option>
                            ))}
                            <option value="__custom__">Custom model ID…</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Target Job Picker */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                        Select Target Application
                      </label>
                      <span className="text-xs text-slate-500">
                        {jobs.length} applications available
                      </span>
                    </div>

                    <input
                      type="text"
                      placeholder="Search jobs by title, company, or tag…"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2 text-xs text-slate-200 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                    />

                    {/* Status Filter Chips */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="text-[11px] text-slate-400 mr-1">Filter:</span>
                      <button
                        type="button"
                        onClick={() => {
                          if (stateFilters.size === 3) {
                            setStateFilters(new Set());
                          } else {
                            setStateFilters(new Set(["NotApplied", "InProgress", "Applied"]));
                          }
                        }}
                        className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition ${stateFilters.size === 3
                            ? "bg-indigo-600 text-white shadow-sm"
                            : "border border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-200"
                          }`}
                      >
                        All
                      </button>
                      {(["InProgress", "NotApplied", "Applied"] as ApplicationState[]).map((st) => {
                        const isActive = stateFilters.has(st);
                        return (
                          <button
                            key={st}
                            type="button"
                            onClick={() => {
                              setStateFilters((prev) => {
                                const next = new Set(prev);
                                if (next.has(st)) next.delete(st);
                                else next.add(st);
                                return next;
                              });
                            }}
                            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium border transition ${isActive
                                ? "border-indigo-500/60 bg-indigo-500/15 text-indigo-200 shadow-sm"
                                : "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:text-slate-300"
                              }`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${st === "InProgress"
                                  ? "bg-amber-400"
                                  : st === "NotApplied"
                                    ? "bg-slate-400"
                                    : "bg-emerald-400"
                                }`}
                            />
                            <span>{STATE_LABELS[st]}</span>
                            {isActive && <span className="text-[10px] opacity-70">✓</span>}
                          </button>
                        );
                      })}
                    </div>

                    <div className="mt-2 max-h-56 overflow-y-auto space-y-1.5 pr-1">
                      {loadingJobs ? (
                        <p className="py-6 text-center text-xs text-slate-500">
                          Loading applications…
                        </p>
                      ) : filteredJobs.length === 0 ? (
                        <p className="py-6 text-center text-xs text-slate-500">
                          No matching applications found. Add a job application first!
                        </p>
                      ) : (
                        filteredJobs.map((job) => {
                          const isSelected = job.id === selectedJobId;
                          return (
                            <div
                              key={job.id}
                              onClick={() => setSelectedJobId(job.id)}
                              className={`cursor-pointer rounded-xl border p-3 transition flex items-center justify-between ${isSelected
                                  ? "border-indigo-500 bg-indigo-500/10"
                                  : "border-slate-800/80 bg-slate-800/30 hover:border-slate-700 hover:bg-slate-800/60"
                                }`}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="truncate font-medium text-sm text-slate-100">
                                    {job.title}
                                  </span>
                                  <span className="text-xs text-slate-400">
                                    · {job.company}
                                  </span>
                                </div>
                                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500">
                                  <span>{job.remote ? "Remote" : job.locationCity || "—"}</span>
                                  {job.tags && job.tags.length > 0 && (
                                    <span>• {job.tags.slice(0, 3).join(", ")}</span>
                                  )}
                                </div>
                              </div>
                              <div className="shrink-0 flex items-center gap-2">
                                <span
                                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATE_STYLES[job.state]
                                    }`}
                                >
                                  {STATE_LABELS[job.state]}
                                </span>
                                <div
                                  className={`h-4 w-4 rounded-full border flex items-center justify-center ${isSelected
                                      ? "border-indigo-500 bg-indigo-500 text-white"
                                      : "border-slate-600"
                                    }`}
                                >
                                  {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Phase 2: Loading / Analyzing */}
              {phase === "loading" && (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="py-12 flex flex-col items-center justify-center text-center space-y-6"
                >

                  <div className="space-y-1.5 max-w-sm">
                    <h3 className="text-sm font-semibold text-slate-200">
                      {stepInfo.label}
                    </h3>
                    {stepInfo.detail && (
                      <p className="text-xs text-slate-400">{stepInfo.detail}</p>
                    )}
                  </div>

                  {/* Progress bar */}
                  <div className="w-64 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-indigo-500 to-purple-500"
                      initial={{ width: "20%" }}
                      animate={{ width: `${stepInfo.progress}%` }}
                      transition={{ duration: 0.4 }}
                    />
                  </div>
                </motion.div>
              )}

              {/* Phase 3: Diff Preview */}
              {phase === "preview" && matchResult && (
                <motion.div
                  key="preview"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="space-y-4"
                >
                  {/* Keywords matched tags banner */}
                  {matchResult.keywordsMatched.length > 0 && (
                    <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-3">
                      <p className="text-xs font-semibold text-indigo-300 mb-1.5">
                        Target ATS Keywords Integrated:
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {matchResult.keywordsMatched.map((kw) => (
                          <span
                            key={kw}
                            className="rounded-md bg-indigo-500/20 px-2 py-0.5 text-[11px] font-medium text-indigo-200"
                          >
                            ✓ {kw}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Change summary & Select All / Deselect All */}
                  <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                    <span>
                      {matchResult.diffs.length === 0
                        ? "No bullet changes recommended; résumé is already well-tailored!"
                        : `${selectedDiffIds.size} of ${matchResult.diffs.length} suggestion${matchResult.diffs.length === 1 ? "" : "s"
                        } selected:`}
                    </span>
                    {matchResult.diffs.length > 0 && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={selectAll}
                          className="text-[11px] font-medium text-indigo-400 hover:text-indigo-300 transition"
                        >
                          Select all
                        </button>
                        <span className="text-slate-600">·</span>
                        <button
                          type="button"
                          onClick={deselectAll}
                          className="text-[11px] font-medium text-slate-400 hover:text-slate-200 transition"
                        >
                          Deselect all
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Diff list with checkboxes */}
                  <div className="max-h-72 overflow-y-auto space-y-3 pr-1">
                    {matchResult.diffs.map((diff) => {
                      const isSelected = selectedDiffIds.has(diff.id);
                      return (
                        <div
                          key={diff.id}
                          onClick={() => toggleDiff(diff.id)}
                          className={`cursor-pointer rounded-xl border p-3.5 space-y-2 transition ${isSelected
                              ? "border-slate-700 bg-slate-950/80 shadow-sm"
                              : "border-slate-800/60 bg-slate-950/30 opacity-60 hover:opacity-80"
                            }`}
                        >
                          <div className="flex items-center justify-between text-[11px]">
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleDiff(diff.id)}
                                onClick={(e) => e.stopPropagation()}
                                className="h-4 w-4 rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                              />
                              <span className="font-semibold text-slate-200">
                                {diff.section} · {diff.entryTitle}
                              </span>
                            </div>
                            {!isSelected && (
                              <span className="text-[10px] text-slate-500 italic">
                                (Will keep original)
                              </span>
                            )}
                          </div>

                          {/* Red / Green diff cards */}
                          <div className="space-y-1.5 text-xs font-mono">
                            <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-rose-300">
                              <span className="font-bold mr-1.5 text-rose-400">-</span>
                              {diff.original}
                            </div>
                            <div
                              className={`rounded-lg border px-3 py-2 ${isSelected
                                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                                  : "border-slate-700/40 bg-slate-800/30 text-slate-400 line-through"
                                }`}
                            >
                              <span className="font-bold mr-1.5 text-emerald-400">+</span>
                              {diff.modified}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-slate-800 bg-slate-950/50 px-6 py-3.5">
            {phase === "select" && (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 hover:text-white transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleStartMatch}
                  disabled={!selectedJobId || jobs.length === 0}
                  className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2 text-xs font-semibold text-white hover:bg-indigo-500 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
                >
                  <span>Match Keywords →</span>
                </button>
              </>
            )}

            {phase === "loading" && (
              <div className="w-full text-center text-xs text-slate-500">
                Processing… this usually takes ~5 seconds
              </div>
            )}

            {phase === "preview" && (
              <>
                <button
                  type="button"
                  onClick={() => setPhase("select")}
                  className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 hover:text-white transition"
                >
                  ← Choose Different Job
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition"
                  >
                    Discard
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmApply}
                    disabled={selectedDiffIds.size === 0}
                    className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2 text-xs font-semibold text-white hover:bg-indigo-500 transition shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span>
                      {selectedDiffIds.size === 0
                        ? "No changes selected"
                        : `Apply ${selectedDiffIds.size} Selected Change${selectedDiffIds.size === 1 ? "" : "s"
                        }`}
                    </span>
                  </button>
                </div>
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </ModalPortal>
  );
}
