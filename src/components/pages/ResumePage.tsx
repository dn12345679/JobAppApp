import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import type { ResumeProfile, ResumeSettings, ResumeTemplate } from "../../types";
import {
  copyResume,
  createResume,
  ensureAtLeastOneResume,
  getResume,
  importResumeProfile,
  listResumes,
  listTrashedResumes,
  permanentlyDeleteResume,
  renameResume,
  restoreResume,
  saveResumeProfile,
  softDeleteResume,
} from "../../lib/db";
import { exportResumeToFile, importResumeFromFile } from "../../lib/resumeIO";
import ProfileEditor from "../resume/ProfileEditor";
import ResumePreview from "../resume/ResumePreview";
import ResumeMenuBar from "../resume/ResumeMenuBar";
import ResumeManagerModal from "../resume/ResumeManagerModal";
import FindReplaceModal from "../resume/FindReplaceModal";
import ImportPreviewModal from "../resume/ImportPreviewModal";
import TemplateGallery from "../resume/TemplateGallery";

// The Tools › Résumé screen. A user can keep several named résumés; this page
// owns the active-document state plus the Word-style menu bar (File/Edit), the
// résumé manager (open/new/duplicate/trash) and find-and-replace. The active
// document is the ProfileEditor's source of truth; edits save to SQLite
// (debounced) and mark the row dirty for the next sync (DESIGN.md §11).
export default function ResumePage({ userId }: { userId: string }) {
  const [resumes, setResumes] = useState<ResumeProfile[]>([]);
  const [trashed, setTrashed] = useState<ResumeProfile[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [profile, setProfile] = useState<ResumeProfile | null>(null);
  const [savedAt, setSavedAt] = useState<"idle" | "saving" | "saved">("idle");
  const [manager, setManager] = useState(false);
  const [findReplace, setFindReplace] = useState(false);
  const [copyPicker, setCopyPicker] = useState(false);
  const [importCandidate, setImportCandidate] = useState<ResumeProfile | null>(null);
  const [loading, setLoading] = useState(true);
  // Bumped to force the ProfileEditor to remount after an external content change
  // (find-and-replace) so its inputs that seed local state — e.g. the skills line —
  // re-derive from the updated profile. Switching résumés remounts via activeId.
  const [editorEpoch, setEditorEpoch] = useState(0);

  const timer = useRef<number | undefined>(undefined);
  const pending = useRef<ResumeProfile | null>(null);
  const activeKey = `activeResumeId:${userId}`;

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const list = await ensureAtLeastOneResume(userId);
      const trash = await listTrashedResumes(userId);
      if (!alive) return;
      const stored = localStorage.getItem(activeKey);
      const active = list.find((r) => r.id === stored) ?? list[0] ?? null;
      setResumes(list);
      setTrashed(trash);
      setActiveId(active?.id ?? null);
      setProfile(active ?? null);
      if (active) localStorage.setItem(activeKey, active.id);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // On unmount, cancel the debounce and flush any still-pending edit.
  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      if (pending.current) void saveResumeProfile(pending.current);
    },
    [],
  );

  // Debounced save of the active document.
  function update(next: ResumeProfile) {
    setProfile(next);
    pending.current = next;
    setSavedAt("saving");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      pending.current = null;
      await saveResumeProfile(next);
      setSavedAt("saved");
    }, 500);
  }

  // Persist any pending edit immediately (before switching/creating/deleting).
  async function flush() {
    window.clearTimeout(timer.current);
    if (pending.current) {
      const p = pending.current;
      pending.current = null;
      await saveResumeProfile(p);
      setSavedAt("saved");
    }
  }

  async function reloadLists() {
    const [list, trash] = await Promise.all([
      listResumes(userId),
      listTrashedResumes(userId),
    ]);
    setResumes(list);
    setTrashed(trash);
    return list;
  }

  async function switchTo(id: string) {
    await flush();
    const p = await getResume(id);
    if (!p) return;
    setActiveId(id);
    setProfile(p);
    localStorage.setItem(activeKey, id);
  }

  async function handleNew() {
    await flush();
    const p = await createResume(userId, { name: "Untitled résumé" });
    await reloadLists();
    await switchTo(p.id);
    setManager(false);
  }

  async function handleMakeCopy(template: ResumeTemplate) {
    if (!profile) return;
    await flush();
    const p = await copyResume(profile.id, { template });
    await reloadLists();
    await switchTo(p.id);
    setCopyPicker(false);
  }

  async function handleExportFile() {
    if (!profile) return;
    await flush();
    try {
      await exportResumeToFile(profile);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Export failed.");
    }
  }

  // Read + sanitise the chosen file, then open the read-only preview. Nothing is
  // written until the user confirms (confirmImport).
  async function handleImport() {
    try {
      const candidate = await importResumeFromFile(userId);
      if (candidate) setImportCandidate(candidate);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Could not read that file.");
    }
  }

  async function confirmImport() {
    if (!importCandidate) return;
    await flush();
    await importResumeProfile(importCandidate);
    const id = importCandidate.id;
    setImportCandidate(null);
    await reloadLists();
    await switchTo(id);
  }

  async function handleDuplicate(id: string) {
    await flush();
    const p = await copyResume(id);
    await reloadLists();
    await switchTo(p.id);
  }

  async function handleRename(id: string, name: string) {
    await renameResume(id, name);
    await reloadLists();
    if (id === activeId) {
      setProfile((cur) => (cur ? { ...cur, name } : cur));
    }
  }

  async function handleDelete(id: string) {
    if (id === activeId) await flush();
    await softDeleteResume(id);
    const list = await reloadLists();
    if (id === activeId) {
      const next = list[0] ?? null;
      setActiveId(next?.id ?? null);
      setProfile(next ?? null);
      if (next) localStorage.setItem(activeKey, next.id);
    }
  }

  async function handleRestore(id: string) {
    await restoreResume(id);
    const list = await reloadLists();
    // If nothing was open (came back from an empty collection), open the restore.
    if (!activeId && list.length) await switchTo(list.find((r) => r.id === id)?.id ?? list[0].id);
  }

  async function handlePurge(id: string) {
    try {
      await permanentlyDeleteResume(id);
    } catch (e) {
      window.alert(
        e instanceof Error ? e.message : "Could not permanently delete (are you offline?)",
      );
    }
    await reloadLists();
  }

  function applySettings(patch: Partial<ResumeSettings>) {
    if (!profile) return;
    update({ ...profile, settings: { ...profile.settings, ...patch } });
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-slate-400">
        Loading…
      </div>
    );
  }

  // Empty-collection gate: the user deleted every résumé. Offer only to create a
  // fresh default one (plus a way back into the trash if anything's recoverable).
  if (!profile) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
        <div className="text-slate-300">You have no résumés.</div>
        <button
          onClick={handleNew}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          Create a blank résumé
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
            <ResumeManagerModal
              resumes={resumes}
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

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-slate-800">
      <ResumeMenuBar
        profile={profile}
        savedAt={savedAt}
        onNew={handleNew}
        onMakeCopy={() => setCopyPicker(true)}
        onOpenManager={() => setManager(true)}
        onImport={handleImport}
        onExportFile={handleExportFile}
        onExportPdf={() => window.print()}
        onSettings={applySettings}
        onFindReplace={() => setFindReplace(true)}
      />

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-80 flex-none overflow-auto border-r border-slate-800">
          <ProfileEditor
            key={`${activeId}-${editorEpoch}`}
            profile={profile}
            onChange={update}
            savedAt={savedAt}
          />
        </aside>
        <ResumePreview profile={profile} onChange={update} />
      </div>

      <AnimatePresence>
        {manager && (
          <ResumeManagerModal
            resumes={resumes}
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
          <FindReplaceModal
            profile={profile}
            onApply={(next) => {
              update(next);
              setEditorEpoch((e) => e + 1);
            }}
            onClose={() => setFindReplace(false)}
          />
        )}
        {copyPicker && (
          <TemplateGallery
            current={profile.settings.template}
            onSelect={(t) => void handleMakeCopy(t)}
            onClose={() => setCopyPicker(false)}
          />
        )}
        {importCandidate && (
          <ImportPreviewModal
            profile={importCandidate}
            onConfirm={() => void confirmImport()}
            onCancel={() => setImportCandidate(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
