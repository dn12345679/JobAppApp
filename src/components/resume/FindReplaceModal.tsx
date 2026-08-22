import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import ModalPortal from "../ModalPortal";
import type { ResumeProfile } from "../../types";

// Find-and-replace across every text field of the active résumé (contact,
// experience, education, projects, skills — labels and bullets included). Pure
// literal matching (no regex) so user input can't blow up; the replacement is
// handed back to the parent, which routes it through the normal debounced save.

function countOcc(hay: string, needle: string, cs: boolean): number {
  if (!needle) return 0;
  const h = cs ? hay : hay.toLowerCase();
  const n = cs ? needle : needle.toLowerCase();
  let i = 0;
  let c = 0;
  for (;;) {
    const idx = h.indexOf(n, i);
    if (idx === -1) break;
    c++;
    i = idx + n.length;
  }
  return c;
}

function replaceOcc(hay: string, needle: string, repl: string, cs: boolean): string {
  if (!needle) return hay;
  if (cs) return hay.split(needle).join(repl);
  const h = hay.toLowerCase();
  const n = needle.toLowerCase();
  let out = "";
  let i = 0;
  for (;;) {
    const idx = h.indexOf(n, i);
    if (idx === -1) {
      out += hay.slice(i);
      break;
    }
    out += hay.slice(i, idx) + repl;
    i = idx + n.length;
  }
  return out;
}

/** Every user-editable string in the profile, in reading order. */
function allStrings(p: ResumeProfile): string[] {
  const out: string[] = [];
  const push = (s: string | null | undefined) => {
    if (s) out.push(s);
  };
  const c = p.contact;
  [c.fullName, c.email, c.phone, c.location, c.website, c.linkedin, c.github, c.summary].forEach(push);
  p.experience.forEach((e) => {
    push(e.company);
    push(e.role);
    push(e.location);
    e.bullets.forEach(push);
  });
  p.education.forEach((e) => {
    push(e.school);
    push(e.degree);
    push(e.location);
    push(e.gpa);
    e.details.forEach(push);
  });
  p.projects.forEach((pr) => {
    push(pr.name);
    push(pr.tech);
    pr.bullets.forEach(push);
  });
  p.skills.forEach((g) => {
    push(g.label);
    g.items.forEach(push);
  });
  return out;
}

/** Applies `fn` to every text field, returning a new profile (nulls preserved). */
function mapProfileStrings(
  p: ResumeProfile,
  fn: (s: string) => string,
): ResumeProfile {
  const m = (s: string | null): string | null => (s == null ? s : fn(s));
  return {
    ...p,
    contact: {
      ...p.contact,
      fullName: fn(p.contact.fullName),
      email: m(p.contact.email),
      phone: m(p.contact.phone),
      location: m(p.contact.location),
      website: m(p.contact.website),
      linkedin: m(p.contact.linkedin),
      github: m(p.contact.github),
      summary: m(p.contact.summary),
    },
    experience: p.experience.map((e) => ({
      ...e,
      company: fn(e.company),
      role: fn(e.role),
      location: m(e.location),
      bullets: e.bullets.map(fn),
    })),
    education: p.education.map((e) => ({
      ...e,
      school: fn(e.school),
      degree: m(e.degree),
      location: m(e.location),
      gpa: m(e.gpa),
      details: e.details.map(fn),
    })),
    projects: p.projects.map((pr) => ({
      ...pr,
      name: fn(pr.name),
      tech: m(pr.tech),
      bullets: pr.bullets.map(fn),
    })),
    skills: p.skills.map((g) => ({
      ...g,
      label: fn(g.label),
      items: g.items.map(fn),
    })),
  };
}

export default function FindReplaceModal({
  profile,
  onApply,
  onClose,
}: {
  profile: ResumeProfile;
  onApply: (next: ResumeProfile) => void;
  onClose: () => void;
}) {
  const [find, setFind] = useState("");
  const [replace, setReplace] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);

  const matches = useMemo(() => {
    if (!find) return 0;
    return allStrings(profile).reduce(
      (sum, s) => sum + countOcc(s, find, caseSensitive),
      0,
    );
  }, [profile, find, caseSensitive]);

  const apply = () => {
    if (!find || matches === 0) return;
    onApply(mapProfileStrings(profile, (s) => replaceOcc(s, find, replace, caseSensitive)));
    onClose();
  };

  return (
    <ModalPortal>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      >
        <motion.div
          initial={{ scale: 0.96, y: 12 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.96, y: 12 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-800 p-5 shadow-2xl"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-100">
              Find and replace
            </h2>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-200"
            >
              ✕
            </button>
          </div>

          <label className="mb-3 block">
            <span className="mb-1 block text-xs text-slate-400">Find</span>
            <input
              autoFocus
              value={find}
              onChange={(e) => setFind(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && apply()}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500"
              placeholder="text to find"
            />
          </label>

          <label className="mb-3 block">
            <span className="mb-1 block text-xs text-slate-400">Replace with</span>
            <input
              value={replace}
              onChange={(e) => setReplace(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && apply()}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500"
              placeholder="replacement (leave blank to remove)"
            />
          </label>

          <label className="mb-4 flex items-center gap-2 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={caseSensitive}
              onChange={(e) => setCaseSensitive(e.target.checked)}
            />
            Match case
          </label>

          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">
              {find
                ? matches === 0
                  ? "No matches"
                  : `${matches} match${matches === 1 ? "" : "es"}`
                : "Enter text to find"}
            </span>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-slate-600 hover:text-slate-100"
              >
                Cancel
              </button>
              <button
                onClick={apply}
                disabled={!find || matches === 0}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Replace all
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </ModalPortal>
  );
}
