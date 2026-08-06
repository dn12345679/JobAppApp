import type { ApplicationState, AuthKind, Flag, JobApplication } from "../types";

export const STATE_OPTIONS: { value: ApplicationState; label: string }[] = [
  { value: "NotApplied", label: "Not applied" },
  { value: "InProgress", label: "In progress" },
  { value: "Applied", label: "Applied" },
];

/** Whether a (custom) stage label represents an interview, enabling the # field. */
export function isInterviewStage(label: string | null): boolean {
  return !!label && label.toLowerCase().includes("interview");
}

export const FLAG_OPTIONS: { value: Flag; label: string }[] = [
  { value: "red", label: "🔴 Apply now" },
  { value: "yellow", label: "🟡 Within 1 week" },
  { value: "green", label: "🟢 Within 1 month" },
];

export const AUTH_OPTIONS: { value: AuthKind; label: string }[] = [
  { value: "none", label: "No sign-in needed" },
  { value: "sso_google", label: "Google SSO" },
  { value: "has_login", label: "Username / password" },
];

export const STATE_LABELS: Record<ApplicationState, string> = {
  NotApplied: "Not applied",
  InProgress: "In progress",
  Applied: "Applied",
};

export const FLAG_DOT: Record<Flag, string> = {
  red: "bg-rose-500",
  yellow: "bg-amber-400",
  green: "bg-emerald-500",
};

export const STATE_STYLES: Record<ApplicationState, string> = {
  NotApplied: "bg-slate-700 text-slate-300",
  InProgress: "bg-amber-500/20 text-amber-300",
  Applied: "bg-emerald-500/20 text-emerald-300",
};

/**
 * Enforce the invariants from DESIGN.md §5.3 and stamp `lastUpdate` when the
 * stage changes. Returns a cleaned copy; `previousStage` enables the timestamp.
 */
export function normalizeJob(
  job: JobApplication,
  previousStage?: string | null,
): JobApplication {
  const next = { ...job };

  // Stage/interview only apply when Applied.
  if (next.state !== "Applied") {
    next.stage = null;
    next.interviewNumber = null;
  }
  if (!isInterviewStage(next.stage)) {
    next.interviewNumber = null;
  }

  // Flag is only meaningful while Not applied.
  if (next.state !== "NotApplied") {
    next.flag = null;
  }

  // Remote clears a typed location.
  if (next.remote) {
    next.locationCity = null;
    next.locationState = null;
  }

  // Stamp lastUpdate when the stage actually changed.
  if (previousStage !== undefined && next.stage !== previousStage) {
    next.lastUpdate = new Date().toISOString();
  }

  return next;
}
