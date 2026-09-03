import { useEffect, useRef, useState } from "react";
import type { PersonalNotes, ReferenceEntry, WildCardEntry } from "../../types";
import { getPersonalNotes, savePersonalNotes } from "../../lib/db";

// Tools › Notes. A single per-user scratchpad with two sections: professional
// references (copyable) and "wild card" Q&A (interview/application answers kept
// on hand). Debounced save to SQLite; marked dirty for the next sync.

const uuid = () => crypto.randomUUID();
const inputCls =
  "w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500 placeholder:text-slate-500";

const newReference = (): ReferenceEntry => ({
  id: uuid(),
  name: "",
  contact: null,
  location: null,
  jobTitle: null,
  relationship: null,
});
const newWildCard = (): WildCardEntry => ({ id: uuid(), question: "", response: "" });

function referenceToText(r: ReferenceEntry): string {
  return (
    [
      r.name && `Name: ${r.name}`,
      r.jobTitle && `Job title: ${r.jobTitle}`,
      r.relationship && `Relationship: ${r.relationship}`,
      r.contact && `Contact: ${r.contact}`,
      r.location && `Location: ${r.location}`,
    ]
      .filter(Boolean)
      .join("\n") || "(empty reference)"
  );
}

export default function NotesPage({ userId }: { userId: string }) {
  const [notes, setNotes] = useState<PersonalNotes | null>(null);
  const [savedAt, setSavedAt] = useState<"idle" | "saving" | "saved">("idle");
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const pending = useRef<PersonalNotes | null>(null);

  useEffect(() => {
    let alive = true;
    getPersonalNotes(userId).then((n) => {
      if (alive) setNotes(n);
    });
    return () => {
      alive = false;
    };
  }, [userId]);

  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      if (pending.current) void savePersonalNotes(pending.current);
    },
    [],
  );

  function update(next: PersonalNotes) {
    setNotes(next);
    pending.current = next;
    setSavedAt("saving");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      pending.current = null;
      await savePersonalNotes(next);
      setSavedAt("saved");
    }, 500);
  }

  if (!notes) {
    return (
      <div className="flex h-full items-center justify-center text-slate-400">
        Loading…
      </div>
    );
  }

  const setRefs = (references: ReferenceEntry[]) => update({ ...notes, references });
  const setWilds = (wildcards: WildCardEntry[]) => update({ ...notes, wildcards });
  const patchRef = (i: number, patch: Partial<ReferenceEntry>) =>
    setRefs(notes.references.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const patchWild = (i: number, patch: Partial<WildCardEntry>) =>
    setWilds(notes.wildcards.map((w, idx) => (idx === i ? { ...w, ...patch } : w)));

  async function copyRef(r: ReferenceEntry) {
    try {
      await navigator.clipboard.writeText(referenceToText(r));
      setCopied(r.id);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard blocked — the fields are selectable manually */
    }
  }

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col overflow-auto pb-10">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-100">Notes</h2>
        <span className="text-xs text-slate-500">
          {savedAt === "saving" ? "Saving…" : savedAt === "saved" ? "Saved" : ""}
        </span>
      </div>

      {/* References */}
      <section className="mb-8">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            Professional references
          </h3>
          <span className="text-xs text-slate-600">{notes.references.length}</span>
        </div>

        <div className="flex flex-col gap-3">
          {notes.references.map((r, i) => (
            <div
              key={r.id}
              className="rounded-xl border border-slate-700 bg-slate-800/50 p-3"
            >
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input
                  className={inputCls}
                  value={r.name}
                  onChange={(e) => patchRef(i, { name: e.target.value })}
                  placeholder="Name"
                />
                <input
                  className={inputCls}
                  value={r.jobTitle ?? ""}
                  onChange={(e) => patchRef(i, { jobTitle: e.target.value })}
                  placeholder="Job title"
                />
                <input
                  className={inputCls}
                  value={r.relationship ?? ""}
                  onChange={(e) => patchRef(i, { relationship: e.target.value })}
                  placeholder="Relationship (e.g. former manager)"
                />
                <input
                  className={inputCls}
                  value={r.contact ?? ""}
                  onChange={(e) => patchRef(i, { contact: e.target.value })}
                  placeholder="Contact (email · phone)"
                />
                <input
                  className={`${inputCls} sm:col-span-2`}
                  value={r.location ?? ""}
                  onChange={(e) => patchRef(i, { location: e.target.value })}
                  placeholder="Location"
                />
              </div>
              <div className="mt-2 flex justify-end gap-2">
                <button
                  onClick={() => copyRef(r)}
                  className="rounded-md border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:border-slate-500 hover:text-slate-100"
                >
                  {copied === r.id ? "Copied ✓" : "Copy"}
                </button>
                <button
                  onClick={() => setRefs(notes.references.filter((_, idx) => idx !== i))}
                  className="rounded-md border border-slate-700 px-2.5 py-1 text-xs text-slate-400 hover:border-rose-700 hover:text-rose-300"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={() => setRefs([...notes.references, newReference()])}
          className="mt-3 w-full rounded-xl border border-dashed border-slate-600 py-2.5 text-sm text-slate-300 hover:border-indigo-500 hover:text-indigo-300"
        >
          + Add reference
        </button>
      </section>

      {/* Wild cards */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            Wild card
          </h3>
          <span className="text-xs text-slate-600">{notes.wildcards.length}</span>
        </div>
        <p className="mb-3 text-xs text-slate-500">
          Prep answers to prompts like “Describe your experience doing X” and keep
          your written response ready to paste.
        </p>

        <div className="flex flex-col gap-3">
          {notes.wildcards.map((w, i) => (
            <div
              key={w.id}
              className="rounded-xl border border-slate-700 bg-slate-800/50 p-3"
            >
              <input
                className={`${inputCls} mb-2 font-medium`}
                value={w.question}
                onChange={(e) => patchWild(i, { question: e.target.value })}
                placeholder="Question / prompt"
              />
              <textarea
                className={`${inputCls} min-h-[6rem] resize-y leading-relaxed`}
                value={w.response}
                onChange={(e) => patchWild(i, { response: e.target.value })}
                placeholder="Your written response…"
              />
              <div className="mt-2 flex justify-end">
                <button
                  onClick={() => setWilds(notes.wildcards.filter((_, idx) => idx !== i))}
                  className="rounded-md border border-slate-700 px-2.5 py-1 text-xs text-slate-400 hover:border-rose-700 hover:text-rose-300"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={() => setWilds([...notes.wildcards, newWildCard()])}
          className="mt-3 w-full rounded-xl border border-dashed border-slate-600 py-2.5 text-sm text-slate-300 hover:border-indigo-500 hover:text-indigo-300"
        >
          + Add wild card
        </button>
      </section>
    </div>
  );
}
