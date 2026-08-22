import { save, open } from "@tauri-apps/plugin-dialog";
import { writeTextFile, readTextFile } from "@tauri-apps/plugin-fs";
import { defaultResumeSettings, emptyContact } from "./db";
import type {
  BulletStyle,
  EducationEntry,
  ExperienceEntry,
  ProjectEntry,
  ResumeDensity,
  ResumeProfile,
  ResumeSettings,
  ResumeTemplate,
  SectionKey,
  SkillGroup,
} from "../types";

// Résumé import/export. Files are plain JSON wrapped in a small versioned
// envelope with a magic marker so we can recognise our own exports and handle
// format drift. The default extension is `.jtre`, but import also accepts
// `.json` (and, since any file's bytes are arbitrary regardless of extension,
// EVERYTHING that comes in is sanitised — see parseResumeImport). Nothing here
// trusts ids/userId from the file: the caller-supplied user owns the result and
// a fresh uuid is minted, so an import can never collide with an existing row.

export const RESUME_EXT = "jtre";
const SCHEMA = 1;

const uuid = () => crypto.randomUUID();

// ---- coercion primitives ----------------------------------------------------

const str = (v: unknown): string =>
  typeof v === "string" ? v : v == null ? "" : String(v);

const strOrNull = (v: unknown): string | null => {
  if (v == null) return null;
  return typeof v === "string" ? v : String(v);
};

const strArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(str) : [];

const num = (v: unknown, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  typeof v === "string" && (allowed as readonly string[]).includes(v)
    ? (v as T)
    : fallback;

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

// ---- per-entity sanitisers --------------------------------------------------

function sanContact(v: unknown) {
  const o = obj(v);
  return {
    ...emptyContact(),
    fullName: str(o.fullName),
    email: strOrNull(o.email),
    phone: strOrNull(o.phone),
    location: strOrNull(o.location),
    website: strOrNull(o.website),
    linkedin: strOrNull(o.linkedin),
    github: strOrNull(o.github),
    summary: strOrNull(o.summary),
  };
}

function sanExperience(v: unknown): ExperienceEntry {
  const o = obj(v);
  return {
    id: str(o.id) || uuid(),
    company: str(o.company),
    role: str(o.role),
    location: strOrNull(o.location),
    startDate: strOrNull(o.startDate),
    endDate: strOrNull(o.endDate),
    bullets: strArray(o.bullets),
  };
}

function sanEducation(v: unknown): EducationEntry {
  const o = obj(v);
  return {
    id: str(o.id) || uuid(),
    school: str(o.school),
    degree: strOrNull(o.degree),
    location: strOrNull(o.location),
    startDate: strOrNull(o.startDate),
    endDate: strOrNull(o.endDate),
    gpa: strOrNull(o.gpa),
    details: strArray(o.details),
  };
}

function sanProject(v: unknown): ProjectEntry {
  const o = obj(v);
  return {
    id: str(o.id) || uuid(),
    name: str(o.name),
    link: strOrNull(o.link),
    tech: strOrNull(o.tech),
    startDate: strOrNull(o.startDate),
    endDate: strOrNull(o.endDate),
    bullets: strArray(o.bullets),
  };
}

function sanSkill(v: unknown): SkillGroup {
  const o = obj(v);
  return {
    id: str(o.id) || uuid(),
    label: str(o.label),
    items: strArray(o.items),
  };
}

function sanArray<T>(v: unknown, fn: (x: unknown) => T): T[] {
  return Array.isArray(v) ? v.map(fn) : [];
}

const TEMPLATES: readonly ResumeTemplate[] = ["classic", "jake", "twocol"];
const DENSITIES: readonly ResumeDensity[] = ["roomy", "normal", "tight"];
const BULLETS: readonly BulletStyle[] = ["disc", "circle", "dash"];
const SECTION_KEYS: readonly SectionKey[] = [
  "summary",
  "experience",
  "education",
  "projects",
  "skills",
];

// Keep known section keys in the given order, then append any missing ones — so
// the résumé always renders every section exactly once.
function sanSectionOrder(v: unknown): SectionKey[] {
  const given = Array.isArray(v) ? v : [];
  const kept = given.filter(
    (k): k is SectionKey => typeof k === "string" && (SECTION_KEYS as readonly string[]).includes(k),
  );
  const seen = new Set(kept);
  const out = [...new Set(kept)];
  for (const k of SECTION_KEYS) if (!seen.has(k)) out.push(k);
  return out;
}

function sanHidden(v: unknown): Record<string, boolean> {
  const o = obj(v);
  const out: Record<string, boolean> = {};
  for (const [k, val] of Object.entries(o)) if (typeof val === "boolean") out[k] = val;
  return out;
}

function sanSettings(v: unknown): ResumeSettings {
  const o = obj(v);
  const d = defaultResumeSettings();
  return {
    template: oneOf(o.template, TEMPLATES, d.template),
    density: oneOf(o.density, DENSITIES, d.density),
    bulletStyle: oneOf(o.bulletStyle, BULLETS, d.bulletStyle),
    fontScale: clamp(num(o.fontScale, d.fontScale), 0.8, 1.3),
    sectionSpacing: clamp(num(o.sectionSpacing, d.sectionSpacing), -6, 24),
    bulletSpacing: clamp(num(o.bulletSpacing, d.bulletSpacing), -1, 10),
    sectionOrder: sanSectionOrder(o.sectionOrder),
    hidden: sanHidden(o.hidden),
    autoFit: typeof o.autoFit === "boolean" ? o.autoFit : d.autoFit,
  };
}

function sanName(v: unknown): string {
  const n = str(v).trim();
  return (n || "Imported résumé").slice(0, 120);
}

// ---- serialize / parse ------------------------------------------------------

/** The versioned envelope written to disk. */
export function serializeResume(p: ResumeProfile): string {
  return JSON.stringify(
    {
      app: "job-tracker",
      kind: "resume",
      schema: SCHEMA,
      exportedAt: new Date().toISOString(),
      resume: {
        name: p.name,
        contact: p.contact,
        education: p.education,
        experience: p.experience,
        projects: p.projects,
        skills: p.skills,
        settings: p.settings,
      },
    },
    null,
    2,
  );
}

/**
 * Parses arbitrary text into a fully-valid, sanitised ResumeProfile owned by
 * `userId`. Accepts both our envelope ({ kind: "resume", resume: {...} }) and a
 * bare résumé object. Throws only if the text isn't JSON at all; any missing or
 * wrong-typed field is replaced with a blank/default, so a foreign or malformed
 * file yields a mostly-empty résumé rather than an error.
 */
export function parseResumeImport(text: string, userId: string): ResumeProfile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
  const root = obj(raw);
  const data =
    root.kind === "resume" && root.resume ? obj(root.resume) : root;

  const ts = new Date().toISOString();
  return {
    id: uuid(),
    userId,
    name: sanName(data.name),
    contact: sanContact(data.contact),
    education: sanArray(data.education, sanEducation),
    experience: sanArray(data.experience, sanExperience),
    projects: sanArray(data.projects, sanProject),
    skills: sanArray(data.skills, sanSkill),
    settings: sanSettings(data.settings),
    createdAt: ts,
    updatedAt: ts,
  };
}

// ---- file dialogs -----------------------------------------------------------

/** Save the active résumé as a `.jtre` file. Returns the path, or null if cancelled. */
export async function exportResumeToFile(p: ResumeProfile): Promise<string | null> {
  const base = (p.name.replace(/[^\w-]+/g, "-") || "resume").slice(0, 60);
  const path = await save({
    defaultPath: `${base}.${RESUME_EXT}`,
    filters: [{ name: "Résumé", extensions: [RESUME_EXT, "json"] }],
  });
  if (!path) return null;
  await writeTextFile(path, serializeResume(p));
  return path;
}

/**
 * Prompts for a `.jtre`/`.json` file and returns a sanitised candidate résumé
 * (NOT yet persisted — the caller previews it, then commits). Null if cancelled.
 */
export async function importResumeFromFile(
  userId: string,
): Promise<ResumeProfile | null> {
  const selected = await open({
    multiple: false,
    filters: [{ name: "Résumé", extensions: [RESUME_EXT, "json"] }],
  });
  if (!selected || typeof selected !== "string") return null;
  const text = await readTextFile(selected);
  return parseResumeImport(text, userId);
}
