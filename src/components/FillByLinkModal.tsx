import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ModalPortal from "./ModalPortal";
import {
  loadAutoSettings,
  saveAutoSettings,
  getActiveApiKey,
  PROVIDER_OPTIONS,
  type AutoSettings,
  type AiProvider,
} from "../lib/autoSettings";
import { fillJobFromUrl, type AiFillStep, type AiFillStepInfo } from "../lib/aiJobFill";
import type { JobApplication } from "../types";

export interface FillByLinkModalProps {
  existingTags: string[];
  onSuccess: (prefill: Partial<JobApplication>) => void;
  onCancel: () => void;
}

type ModalPhase = "input" | "loading" | "error";

const STEP_PERCENTAGES: Record<AiFillStep, number> = {
  fetching: 33,
  reading: 66,
  building: 90,
  done: 100,
  error: 0,
};

const STEP_NUMBERS: Record<AiFillStep, number> = {
  fetching: 1,
  reading: 2,
  building: 3,
  done: 3,
  error: 1,
};

export default function FillByLinkModal({
  existingTags,
  onSuccess,
  onCancel,
}: FillByLinkModalProps) {
  const [phase, setPhase] = useState<ModalPhase>("input");
  const [url, setUrl] = useState("");
  const [settings, setSettings] = useState<AutoSettings>(loadAutoSettings);
  const [showSettings, setShowSettings] = useState(false);

  // Loading state
  const [currentStep, setCurrentStep] = useState<AiFillStep>("fetching");
  const [stepDetail, setStepDetail] = useState<string>("");

  // Error state
  const [errorMsg, setErrorMsg] = useState("");

  // Keep settings synced
  useEffect(() => {
    setSettings(loadAutoSettings());
  }, []);

  const activeProviderConfig =
    PROVIDER_OPTIONS.find((p) => p.id === settings.aiProvider) || PROVIDER_OPTIONS[0];
  const activeKey = getActiveApiKey(settings);

  function handleProviderChange(provider: AiProvider) {
    const config = PROVIDER_OPTIONS.find((p) => p.id === provider);
    const defaultModel = config?.defaultModel || "gpt-4o-mini";
    const next = saveAutoSettings({ aiProvider: provider, aiModel: defaultModel });
    setSettings(next);
  }

  function handleKeyChange(val: string) {
    const patch: Partial<AutoSettings> = {};
    if (settings.aiProvider === "openai") patch.openaiKey = val;
    else if (settings.aiProvider === "gemini") patch.geminiKey = val;
    else if (settings.aiProvider === "anthropic") patch.anthropicKey = val;
    const next = saveAutoSettings(patch);
    setSettings(next);
  }

  function handleModelChange(val: string) {
    const next = saveAutoSettings({ aiModel: val });
    setSettings(next);
  }

  async function handleGenerate() {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return;

    if (!activeKey.trim()) {
      setShowSettings(true);
      setErrorMsg(`Please enter your ${activeProviderConfig.name} API key below before proceeding.`);
      return;
    }

    setPhase("loading");
    setCurrentStep("fetching");
    setStepDetail("Connecting to URL…");
    setErrorMsg("");

    try {
      const result = await fillJobFromUrl(
        trimmedUrl,
        settings,
        existingTags,
        (info: AiFillStepInfo) => {
          setCurrentStep(info.step);
          if (info.detail) setStepDetail(info.detail);
        },
      );

      // Brief snappy transition to JobFormModal
      setTimeout(() => {
        onSuccess(result);
      }, 200);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
      setPhase("error");
    }
  }

  const inputCls =
    "w-full rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition";

  return (
    <ModalPortal>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={phase === "loading" ? undefined : onCancel}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      >
        <motion.div
          initial={{ scale: 0.95, y: 10, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.95, y: 10, opacity: 0 }}
          transition={{ type: "spring", stiffness: 550, damping: 28 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-800 p-6 shadow-2xl"
        >
          {phase === "input" && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">

                  <div>
                    <h2 className="text-lg font-semibold text-slate-100">
                      Fill by Link
                    </h2>
                    <p className="text-xs text-slate-400">
                      Extract job details automatically using LLM
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onCancel}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition"
                >
                  ✕
                </button>
              </div>

              {errorMsg && (
                <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
                  {errorMsg}
                </div>
              )}

              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-300">
                  Job posting URL *
                </label>
                <input
                  type="url"
                  autoFocus
                  placeholder="https://boards..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && url.trim()) {
                      e.preventDefault();
                      handleGenerate();
                    }
                  }}
                  className={inputCls}
                />
                <p className="text-[11px] text-slate-500">
                  Paste any job listing from LinkedIn, Indeed, Greenhouse, Lever, Workday, etc.
                </p>
              </div>

              {/* AI Provider & API Key Configuration */}
              <div className="rounded-xl border border-slate-700/70 bg-slate-900/40 p-3.5 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-300">AI:</span>
                    <span className="rounded bg-indigo-500/20 px-2 py-0.5 font-medium text-indigo-300">
                      {activeProviderConfig.name} ({settings.aiModel})
                    </span>
                    {activeKey ? (
                      <span className="text-[11px] text-emerald-400 font-medium">✓ Key set</span>
                    ) : (
                      <span className="text-[11px] text-amber-400 font-medium">● Key required</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowSettings((s) => !s)}
                    className="text-xs font-medium text-indigo-400 hover:text-indigo-300 transition"
                  >
                    {showSettings ? "Hide config" : (activeKey ? "Change provider / key" : "Configure key")}
                  </button>
                </div>

                <AnimatePresence>
                  {(showSettings || !activeKey) && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.15, ease: "easeOut" }}
                      className="mt-3 space-y-3 overflow-hidden border-t border-slate-700/60 pt-3"
                    >
                      {/* Provider Selector Tabs */}
                      <div>
                        <label className="mb-1.5 block text-[11px] font-medium text-slate-400">
                          Provider
                        </label>
                        <div className="flex gap-1 rounded-lg bg-slate-950/60 p-1">
                          {PROVIDER_OPTIONS.map((prov) => {
                            const isSelected = prov.id === settings.aiProvider;
                            const provKey = getActiveApiKey(settings, prov.id);
                            return (
                              <button
                                key={prov.id}
                                type="button"
                                onClick={() => handleProviderChange(prov.id)}
                                className={`flex-1 rounded-md py-1.5 text-xs font-medium transition ${isSelected
                                  ? "bg-indigo-600 text-white"
                                  : "text-slate-400 hover:text-slate-200"
                                  }`}
                              >
                                {prov.name}
                                {provKey && <span className="ml-1 text-[10px] opacity-70">✓</span>}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* API Key Input */}
                      <div>
                        <div className="mb-1 flex items-center justify-between">
                          <label className="text-[11px] font-medium text-slate-400">
                            {activeProviderConfig.name} API Key *
                          </label>
                          <span className="text-[10px] text-slate-500">
                            Stored locally in your app
                          </span>
                        </div>
                        <input
                          type="password"
                          placeholder={activeProviderConfig.keyPlaceholder}
                          value={activeKey}
                          onChange={(e) => handleKeyChange(e.target.value)}
                          className={inputCls}
                        />
                      </div>

                      {/* Model Selector */}
                      <div className="space-y-1.5 pt-0.5">
                        <div className="flex items-center justify-between text-[11px] text-slate-400">
                          <span>Model:</span>
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
                            className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-slate-200 focus:outline-none focus:border-indigo-500 text-xs"
                          >
                            {activeProviderConfig.models.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.name}
                              </option>
                            ))}
                            <option value="__custom__">Custom model ID…</option>
                          </select>
                        </div>
                        {!activeProviderConfig.models.some((m) => m.id === settings.aiModel) && (
                          <input
                            type="text"
                            autoFocus
                            placeholder="Enter model name (e.g. gemini-3.6-flash)"
                            value={settings.aiModel}
                            onChange={(e) => handleModelChange(e.target.value)}
                            className={inputCls}
                          />
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Tag notice */}
              {existingTags.length > 0 ? (
                <div className="text-[11px] text-slate-400">
                  <span className="font-medium text-slate-300">Workspace tags:</span> The AI will automatically pick applicable tags only from your {existingTags.length} existing tag(s).
                </div>
              ) : (
                <div className="text-[11px] text-slate-500">
                  No tags currently exist in this workspace. The AI will leave tags empty.
                </div>
              )}

              {/* Modal actions */}
              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={onCancel}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700/70 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={!url.trim() || !activeKey.trim()}
                  className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 transition"
                >
                  <span>Generate Application</span>
                </button>
              </div>
            </div>
          )}

          {phase === "loading" && (
            <div className="space-y-6 py-2">
              <div className="flex items-center gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-100">
                    Collecting job data…
                  </h2>
                  <p className="text-xs text-slate-400">
                    Parsing posting and extracting application details
                  </p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-medium text-slate-400">
                  <span className="text-indigo-300">
                    {currentStep === "done" ? "Completed" : `Step ${STEP_NUMBERS[currentStep]} of 3`}
                  </span>
                  <span>{STEP_PERCENTAGES[currentStep]}%</span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-700/80">
                  <motion.div
                    className="h-full rounded-full bg-indigo-500"
                    initial={{ width: "10%" }}
                    animate={{ width: `${STEP_PERCENTAGES[currentStep]}%` }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                  />
                </div>
              </div>

              {/* Step indicator list */}
              <div className="space-y-2.5 rounded-xl border border-slate-700/60 bg-slate-900/40 p-4 text-xs">
                <div className="flex items-center gap-2.5">
                  <span className={STEP_NUMBERS[currentStep] > 1 || currentStep === "done" ? "text-emerald-400" : currentStep === "fetching" ? "animate-pulse text-indigo-400" : "text-slate-600"}>
                    {STEP_NUMBERS[currentStep] > 1 || currentStep === "done" ? "✓" : "●"}
                  </span>
                  <span className={currentStep === "fetching" ? "font-medium text-slate-200" : STEP_NUMBERS[currentStep] > 1 ? "text-slate-400" : "text-slate-500"}>
                    Fetching page content
                  </span>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className={STEP_NUMBERS[currentStep] > 2 || currentStep === "done" ? "text-emerald-400" : currentStep === "reading" ? "animate-pulse text-indigo-400" : "text-slate-600"}>
                    {STEP_NUMBERS[currentStep] > 2 || currentStep === "done" ? "✓" : "●"}
                  </span>
                  <span className={currentStep === "reading" ? "font-medium text-slate-200" : STEP_NUMBERS[currentStep] > 2 ? "text-slate-400" : "text-slate-500"}>
                    Reading job description with AI
                  </span>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className={currentStep === "done" ? "text-emerald-400" : currentStep === "building" ? "animate-pulse text-indigo-400" : "text-slate-600"}>
                    {currentStep === "done" ? "✓" : "●"}
                  </span>
                  <span className={currentStep === "building" ? "font-medium text-slate-200" : currentStep === "done" ? "text-slate-400" : "text-slate-500"}>
                    Building your application
                  </span>
                </div>
              </div>

              {stepDetail && (
                <p className="text-center text-xs text-slate-400 animate-pulse">
                  {stepDetail}
                </p>
              )}
            </div>
          )}

          {phase === "error" && (
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-500/20 text-rose-400 text-lg">
                  ⚠
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-100">
                    Couldn't extract job data
                  </h2>
                  <p className="text-xs text-slate-400">
                    An error occurred while communicating with the webpage or AI
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs text-rose-300 leading-relaxed">
                {errorMsg}
              </div>

              <p className="text-xs text-slate-400">
                You can try again or continue opening the form manually with this URL saved.
              </p>

              <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={onCancel}
                  className="rounded-lg px-3 py-2 text-xs font-medium text-slate-400 hover:bg-slate-700/60 hover:text-slate-200 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => onSuccess({ link: url })}
                  className="rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700 transition"
                >
                  Continue manually
                </button>
                <button
                  type="button"
                  onClick={() => setPhase("input")}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 transition"
                >
                  Try again
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </ModalPortal>
  );
}

