import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import type { JobApplication } from "../types";
import { fmtDate } from "./format";

export type ExportFormat = "csv" | "json";

/** Human-readable CSV columns (flattened from JobApplication). */
const COLUMNS: [string, (j: JobApplication) => string][] = [
  ["Company", (j) => j.company],
  ["Title", (j) => j.title],
  ["State", (j) => j.state],
  ["Stage", (j) => j.stage ?? ""],
  ["Interview #", (j) => (j.interviewNumber != null ? String(j.interviewNumber) : "")],
  ["Pay Min", (j) => (j.payMin != null ? String(j.payMin) : "")],
  ["Pay Max", (j) => (j.payMax != null ? String(j.payMax) : "")],
  ["Pay Median", (j) => (j.payMedian != null ? String(j.payMedian) : "")],
  ["Pay Type", (j) => (j.hourly ? "Hourly" : "Annual")],
  ["Remote", (j) => (j.remote ? "Yes" : "No")],
  ["City", (j) => j.locationCity ?? ""],
  ["State/Region", (j) => j.locationState ?? ""],
  ["Username", (j) => j.username ?? ""],
  ["Sign-in", (j) => j.auth],
  ["Deadline", (j) => fmtDate(j.deadline)],
  ["Date Applied", (j) => fmtDate(j.dateApplied)],
  ["Next Interview", (j) => fmtDate(j.nextInterviewDate)],
  ["End Date", (j) => fmtDate(j.endDate)],
  ["Flag", (j) => j.flag ?? ""],
  ["Tags", (j) => j.tags.join("; ")],
  ["Link", (j) => j.link ?? ""],
  ["Notes", (j) => j.notes ?? ""],
];

function csvCell(value: string): string {
  // fmtDate returns "—" for empty; normalize that to blank in exports.
  const v = value === "—" ? "" : value;
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function toCsv(jobs: JobApplication[]): string {
  const header = COLUMNS.map(([h]) => csvCell(h)).join(",");
  const rows = jobs.map((j) =>
    COLUMNS.map(([, get]) => csvCell(get(j))).join(","),
  );
  return [header, ...rows].join("\r\n");
}

function toJson(jobs: JobApplication[]): string {
  // Drop internal sync/id fields from the export.
  const clean = jobs.map(({ id, workspaceId, ...rest }) => {
    void id;
    void workspaceId;
    return rest;
  });
  return JSON.stringify(clean, null, 2);
}

/** Opens a native Save dialog and writes the export. Returns the path, or null if cancelled. */
export async function exportJobs(
  jobs: JobApplication[],
  format: ExportFormat,
  workspaceName: string,
): Promise<string | null> {
  const stamp = new Date().toISOString().slice(0, 10);
  const base = `${workspaceName.replace(/[^\w-]+/g, "-")}-${stamp}`;
  const content = format === "csv" ? toCsv(jobs) : toJson(jobs);

  const path = await save({
    defaultPath: `${base}.${format}`,
    filters: [{ name: format.toUpperCase(), extensions: [format] }],
  });
  if (!path) return null;
  await writeTextFile(path, content);
  return path;
}
