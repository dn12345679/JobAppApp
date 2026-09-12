import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import type { CoverLetter, CoverLetterSettings } from "../../types";
import {
  copyCoverLetter,
  createCoverLetter,
  ensureAtLeastOneCoverLetter,
  getCoverLetterById,
  importCoverLetter,
  listCoverLetters,
  listTrashedCoverLetters,
  permanentlyDeleteCoverLetter,
  renameCoverLetter,
  restoreCoverLetter,
  saveCoverLetter,
  softDeleteCoverLetter,
} from "../../lib/db";
import {
  exportCoverLetterToFile,
  importCoverLetterFromFile,
} from "../../lib/coverLetterIO";
import { exportToPdf } from "../../lib/exportPdf";
import CoverLetterPreview from "../coverletter/CoverLetterPreview";
import CoverLetterMenuBar from "../coverletter/CoverLetterMenuBar";
import CoverLetterManagerModal from "../coverletter/CoverLetterManagerModal";
import CoverLetterFindReplaceModal from "../coverletter/CoverLetterFindReplaceModal";
import CoverLetterImportPreviewModal from "../coverletter/CoverLetterImportPreviewModal";

const inputCls =
  "w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500 placeholder:text-slate-500";

// Tools › Cover Letter — full parity with the résumé: multiple named documents,
// Word-style menu bar, import/export, PDF export, and a fixed letter-size preview
// that scales. This page owns the active-document state and modals.
export default function CoverLetterPage({ userId }: { userId: string }) {
  const [letters, setLetters] = useState<CoverLetter[]>([]);
  const [trashed, setTrashed] = useState<CoverLetter[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [letter, setLetter] = useState<CoverLetter | null>(null);
  const [savedAt, setSavedAt] = useState<"idle" | "saving" | "saved">("idle");
  const [manager, setManager] = useState(false);
  const [findReplace, setFindReplace] = useState(false);
  const [importCandidate, setImportCandidate] = useState<CoverLetter | null>(null);
  const [loading, setLoading] = useState(true);
  const [pane, setPane] = useState<"edit" | "preview">("edit");

  const timer = useRef<number | undefined>(undefined);
  const pending = useRef<CoverLetter | null>(null);
  const activeKey = `activeCoverLetterId:${userId}`;

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const list = await ensureAtLeastOneCoverLetter(userId);
      const trash = await listTrashedCoverLetters(userId);
      if (!alive) return;
      const stored = localStorage.getItem(activeKey);
      const active = list.find((c) => c.id === stored) ?? list[0] ?? null;
      setLetters(list);
      setTrashed(trash);
      setActiveId(active?.id ?? null);
      setLetter(active ?? null);
      if (active) localStorage.setItem(activeKey, active.id);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      if (pending.current) void saveCoverLetter(pending.current);
    },
    [],
  );

  function update(next: CoverLetter) {
    setLetter(next);
    pending.current = next;
    setSavedAt("saving");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      pending.current = null;
      await saveCoverLetter(next);
      setSavedAt("saved");
    }, 500);
  }

  async function flush() {
    window.clearTimeout(timer.current);
    if (pending.current) {
      const c = pending.current;
      pending.current = null;
      await saveCoverLetter(c);
      setSavedAt("saved");
    }
  }

  async function reloadLists() {
    const [list, trash] = await Promise.all([
      listCoverLetters(userId),
      listTrashedCoverLetters(userId),
    ]);
    setLetters(list);
    setTrashed(trash);
    return list;
  }

  async function switchTo(id: string) {
    await flush();
    const c = await getCoverLetterById(id);
    if (!c) return;
    setActiveId(id);
    setLetter(c);
    localStorage.setItem(activeKey, id);
  }

  async function handleNew() {
    await flush();
    const c = await createCoverLetter(userId, { name: "Untitled cover letter" });
    await reloadLists();
    await switchTo(c.id);
    setManager(false);
  }

  async function handleDuplicate(id: string) {
    await flush();
    const c = await copyCoverLetter(id);
    await reloadLists();
    await switchTo(c.id);
  }

  async function handleRename(id: string, name: string) {
    await renameCoverLetter(id, name);
    await reloadLists();
    if (id === activeId) setLetter((cur) => (cur ? { ...cur, name } : cur));
  }

  async function handleDelete(id: string) {
    if (id === activeId) await flush();
    await softDeleteCoverLetter(id);
    const list = await reloadLists();
    if (id === activeId) {
      const next = list[0] ?? null;
      setActiveId(next?.id ?? null);
      setLetter(next ?? null);
      if (next) localStorage.setItem(activeKey, next.id);
    }
  }

  async function handleRestore(id: string) {
    await restoreCoverLetter(id);
    const list = await reloadLists();
    if (!activeId && list.length) await switchTo(id);
  }

  async function handlePurge(id: string) {
    try {
      await permanentlyDeleteCoverLetter(id);
    } catch (e) {
      window.alert(
        e instanceof Error ? e.message : "Could not permanently delete (offline?)",
      );
    }
    await reloadLists();
  }

  async function handleExportFile() {
    if (!letter) return;
    await flush();
    try {
      await exportCoverLetterToFile(letter);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Export failed.");
    }
  }

  async function handleImport() {
    try {
      const candidate = await importCoverLetterFromFile(userId);
      if (candidate) setImportCandidate(candidate);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Could not read that file.");
    }
  }

  async function confirmImport() {
    if (!importCandidate) return;
    await flush();
    await importCoverLetter(importCandidate);
    const id = importCandidate.id;
    setImportCandidate(null);
    await reloadLists();
    await switchTo(id);
  }

  function applySettings(patch: Partial<CoverLetterSettings>) {
    if (!letter) return;
    update({ ...letter, settings: { ...letter.settings, ...patch } });
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-slate-400">
        Loading…
      </div>
    );
  }

  if (!letter) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
        <div className="text-slate-300">You have no cover letters.</div>
        <button
          onClick={handleNew}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          Create a cover letter
        </button>
        {trashed.length > 0 && (
          <button
            onClick={() => setManager(true)}
            className="text-xs text-slate-400 underline hover:text-slate-200"
          >
            Recover one from Trash ({trashed.length})
          </button>
        )}
        <AnimatePresence>
          {manager && (
            <CoverLetterManagerModal
              letters={letters}
              trashed={trashed}
              activeId={activeId}
              onOpen={(id) => {
                setManager(false);
                void switchTo(id);
              }}
              onNew={handleNew}
              onDuplicate={handleDuplicate}
              onRename={handleRename}
              onDelete={handleDelete}
              onRestore={handleRestore}
              onPurge={handlePurge}
              onClose={() => setManager(false)}
            />
          )}
        </AnimatePresence>
      </div>
    );
  }

  const c = letter.contact;
  const setContact = (patch: Partial<CoverLetter["contact"]>) =>
    update({ ...letter, contact: { ...letter.contact, ...patch } });

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-slate-800">
      <CoverLetterMenuBar
        letter={letter}
        savedAt={savedAt}
        onNew={handleNew}
        onMakeCopy={() => void handleDuplicate(letter.id)}
        onOpenManager={() => setManager(true)}
        onImport={handleImport}
        onExportFile={handleExportFile}
        onExportPdf={exportToPdf}
        onSettings={applySettings}
        onFindReplace={() => setFindReplace(true)}
      />

      <div className="flex gap-1 border-b border-slate-800 p-1.5 md:hidden">
        {(["edit", "preview"] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPane(p)}
            className={`flex-1 rounded-md py-1.5 text-sm font-medium capitalize ${
              pane === p ? "bg-indigo-600 text-white" : "text-slate-400"
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      <div className="flex flex-1 overflow-hidden">
        <aside
          className={`${
            pane === "edit" ? "flex" : "hidden"
          } w-full flex-none flex-col gap-3 overflow-auto border-r border-slate-800 p-4 md:flex md:w-80`}
        >
          <label className="block">
            <span className="mb-1 block text-xs text-slate-500">Name</span>
            <input
              className={inputCls}
              value={c.fullName}
              onChange={(e) => setContact({ fullName: e.target.value })}
              placeholder="Your name"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-slate-500">Contacts</span>
            <input
              className={inputCls}
              value={c.contact ?? ""}
              onChange={(e) => setContact({ contact: e.target.value })}
              placeholder="email · phone"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-slate-500">Location</span>
            <input
              className={inputCls}
              value={c.location ?? ""}
              onChange={(e) => setContact({ location: e.target.value })}
              placeholder="City, ST"
            />
          </label>
          <label className="flex flex-1 flex-col">
            <span className="mb-1 block text-xs text-slate-500">Letter</span>
            <textarea
              className={`${inputCls} min-h-[16rem] flex-1 resize-none leading-relaxed`}
              value={letter.body}
              onChange={(e) => update({ ...letter, body: e.target.value })}
            />
          </label>
        </aside>

        <div
          className={`${
            pane === "preview" ? "flex" : "hidden"
          } flex-1 overflow-hidden md:flex`}
        >
          <CoverLetterPreview letter={letter} />
        </div>
      </div>

      <AnimatePresence>
        {manager && (
          <CoverLetterManagerModal
            letters={letters}
            trashed={trashed}
            activeId={activeId}
            onOpen={(id) => {
              setManager(false);
              void switchTo(id);
            }}
            onNew={handleNew}
            onDuplicate={handleDuplicate}
            onRename={handleRename}
            onDelete={handleDelete}
            onRestore={handleRestore}
            onPurge={handlePurge}
            onClose={() => setManager(false)}
          />
        )}
        {findReplace && (
          <CoverLetterFindReplaceModal
            letter={letter}
            onApply={update}
            onClose={() => setFindReplace(false)}
          />
        )}
        {importCandidate && (
          <CoverLetterImportPreviewModal
            letter={importCandidate}
            onConfirm={() => void confirmImport()}
            onCancel={() => setImportCandidate(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
