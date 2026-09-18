import type { JobApplication } from "../types";

/** Format an ISO date or date-only (YYYY-MM-DD) string as MM/DD/YYYY, tz-safe. */
export function fmtDate(value: string | null): string {
  if (!value) return "—";
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) {
    const [, y, m, d] = dateOnly;
    return `${m}/${d}/${y}`;
  }
  const d = new Date(value);
  return isNaN(d.getTime())
    ? value
    : d.toLocaleDateString("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
      });
}

/** Short human date, e.g. "Aug 5". */
export function fmtDateShort(value: string | null): string {
  if (!value) return "";
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const d = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(value);
  return isNaN(d.getTime())
    ? value
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function fmtPay(job: JobApplication): string | null {
  const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
  const per = job.hourly ? "/hr" : "/yr";
  let base: string | null = null;
  if (job.payMedian != null) base = `~${usd(job.payMedian)}`;
  else if (job.payMin != null && job.payMax != null)
    base = `${usd(job.payMin)}–${usd(job.payMax)}`;
  else if (job.payMin != null) base = `${usd(job.payMin)}+`;
  else if (job.payMax != null) base = `up to ${usd(job.payMax)}`;
  return base ? `${base}${per}` : null;
}

/**
 * Builds export file names matching:
 * Resume_<content in full name separated by underscores>_<MMDDYY>
 * CoverLetter_<content in full name separated by underscores>_<MMDDYY>
 */
export function buildExportFileName(
  prefix: "Resume" | "CoverLetter",
  fullName?: string | null,
  fallbackName?: string | null,
  date: Date = new Date(),
): string {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const yy = String(date.getFullYear()).slice(-2);
  const dateSuffix = `${mm}${dd}${yy}`;

  const raw = (fullName && fullName.trim()) || (fallbackName && fallbackName.trim()) || "Untitled";
  const safe = raw
    .replace(/[\\/:*?"<>|,.]+/g, "")
    .trim()
    .replace(/\s+/g, "_");

  const namePart = safe || "Untitled";
  return `${prefix}_${namePart}_${dateSuffix}`;
}

