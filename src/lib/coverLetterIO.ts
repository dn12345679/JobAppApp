import { save, open } from "@tauri-apps/plugin-dialog";
import { writeTextFile, readTextFile } from "@tauri-apps/plugin-fs";
import {
  DEFAULT_COVER_LETTER_BODY,
  DEFAULT_COVER_LETTER_NAME,
  defaultCoverLetterSettings,
} from "./db";
import type { CoverLetter } from "../types";

// Cover-letter import/export — same versioned-envelope + sanitiser approach as
// resumeIO. Default extension `.jtcl`; import also accepts `.json`. Everything
// that comes in is sanitised, and ids/userId are never trusted.

export const COVER_EXT = "jtcl";
const SCHEMA = 1;
const uuid = () => crypto.randomUUID();

const str = (v: unknown): string =>
  typeof v === "string" ? v : v == null ? "" : String(v);
const strOrNull = (v: unknown): string | null =>
  v == null ? null : typeof v === "string" ? v : String(v);
const num = (v: unknown, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

export function serializeCoverLetter(c: CoverLetter): string {
  return JSON.stringify(
    {
      app: "job-tracker",
      kind: "cover_letter",
      schema: SCHEMA,
      exportedAt: new Date().toISOString(),
      cover: {
        name: c.name,
        contact: c.contact,
        body: c.body,
        settings: c.settings,
      },
    },
    null,
    2,
  );
}

/** Parses arbitrary text into a sanitised CoverLetter owned by `userId`. */
export function parseCoverLetterImport(text: string, userId: string): CoverLetter {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
  const root = obj(raw);
  const d = root.kind === "cover_letter" && root.cover ? obj(root.cover) : root;
  const contact = obj(d.contact);
  const settings = obj(d.settings);
  const def = defaultCoverLetterSettings();
  const ts = new Date().toISOString();
  const name = str(d.name).trim();
  return {
    id: uuid(),
    userId,
    name: (name || "Imported cover letter").slice(0, 120),
    contact: {
      fullName: str(contact.fullName),
      contact: strOrNull(contact.contact),
      location: strOrNull(contact.location),
    },
    body: typeof d.body === "string" ? d.body : DEFAULT_COVER_LETTER_BODY,
    settings: {
      fontScale: clamp(num(settings.fontScale, def.fontScale), 0.8, 1.3),
      lineSpacing: clamp(num(settings.lineSpacing, def.lineSpacing), 0, 12),
    },
    createdAt: ts,
    updatedAt: ts,
  };
}

/** Save a cover letter as a `.jtcl` file. Returns the path, or null if cancelled. */
export async function exportCoverLetterToFile(
  c: CoverLetter,
): Promise<string | null> {
  const base = (c.name.replace(/[^\w-]+/g, "-") || "cover-letter").slice(0, 60);
  const path = await save({
    defaultPath: `${base}.${COVER_EXT}`,
    filters: [{ name: "Cover letter", extensions: [COVER_EXT, "json"] }],
  });
  if (!path) return null;
  await writeTextFile(path, serializeCoverLetter(c));
  return path;
}

/** Prompts for a `.jtcl`/`.json` file → a sanitised candidate (not persisted). */
export async function importCoverLetterFromFile(
  userId: string,
): Promise<CoverLetter | null> {
  const selected = await open({
    multiple: false,
    filters: [{ name: "Cover letter", extensions: [COVER_EXT, "json"] }],
  });
  if (!selected || typeof selected !== "string") return null;
  const text = await readTextFile(selected);
  return parseCoverLetterImport(text, userId);
}

/** Default label for a fresh cover letter (kept here for import fallbacks). */
export const IMPORTED_COVER_NAME = DEFAULT_COVER_LETTER_NAME;
