import { useState } from "react";
import { motion } from "framer-motion";
import ModalPortal from "../ModalPortal";
import type { ResumeProfile, ResumeTemplate } from "../../types";

const TEMPLATE_LABEL: Record<ResumeTemplate, string> = {
  classic: "Classic",
  jake: "JG. Template",
  twocol: "Two-column",
};

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

// "View and open previous" + Trash, in one modal. Live résumés on top with
// open / rename / duplicate / delete; the trash below with restore / delete
// permanently. Mirrors the job-application trash (soft-delete is recoverable;
// permanent delete is irreversible and gated behind a confirm).
export default function ResumeManagerModal({
  resumes,
  trashed,
  activeId,
  onOpen,
  onNew,
  onDuplicate,
  onRename,
  onDelete,
  onRestore,
  onPurge,
  onClose,
}: {
  resumes: ResumeProfile[];
  trashed: ResumeProfile[];
  activeId: string | null;
  onOpen: (id: string) => void;
  onNew: () => void;
  onDuplicate: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onRestore: (id: string) => void;
  onPurge: (id: string) => void;
  onClose: () => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");

  const startRename = (r: ResumeProfile) => {
    setEditingId(r.id);
    setDraftName(r.name);
  };
  const commitRename = () => {
    if (editingId) onRename(editingId, draftName.trim() || "Untitled");
    setEditingId(null);
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
          className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-slate-700 bg-slate-800 p-5 shadow-2xl"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-100">Your résumés</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-auto pr-1">
            <ul className="flex flex-col gap-2">
              {resumes.map((r) => {
                const active = r.id === activeId;
                return (
                  <li
                    key={r.id}
                    className={`rounded-xl border p-3 ${
                      active
                        ? "border-indigo-500 bg-slate-900/60"
                        : "border-slate-700 bg-slate-900/40"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        {editingId === r.id ? (
                          <input
                            autoFocus
                            value={draftName}
                            onChange={(e) => setDraftName(e.target.value)}
                            onBlur={commitRename}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitRename();
                              if (e.key === "Escape") setEditingId(null);
                            }}
                            className="w-full rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-sm text-slate-100 outline-none focus:border-indigo-500"
                          />
                        ) : (
                          <button
                            onClick={() => onOpen(r.id)}
                            className="block w-full truncate text-left text-sm font-medium text-slate-100 hover:text-indigo-300"
                            title="Open"
                          >
                            {r.name}
                            {active && (
                              <span className="ml-2 rounded-full bg-indigo-500 px-1.5 py-0.5 text-[10px] font-medium text-white">
                                Open
                              </span>
                            )}
                          </button>
                        )}
                        <div className="mt-0.5 text-xs text-slate-500">
                          {TEMPLATE_LABEL[r.settings.template] ?? "Classic"} · edited{" "}
                          {fmtDate(r.updatedAt)}
                        </div>
                      </div>
                      <div className="flex flex-none gap-1">
                        <IconBtn label="Rename" onClick={() => startRename(r)}>
                          ✎
                        </IconBtn>
                        <IconBtn label="Duplicate" onClick={() => onDuplicate(r.id)}>
                          ⧉
                        </IconBtn>
                        <IconBtn
                          label="Move to trash"
                          onClick={() => onDelete(r.id)}
                          danger
                        >
                          🗑
                        </IconBtn>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            <button
              onClick={onNew}
              className="mt-3 w-full rounded-xl border border-dashed border-slate-600 py-2.5 text-sm text-slate-300 hover:border-indigo-500 hover:text-indigo-300"
            >
              + New blank résumé
            </button>

            {trashed.length > 0 && (
              <div className="mt-6">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Trash · {trashed.length}
                </div>
                <ul className="flex flex-col gap-2">
                  {trashed.map((r) => (
                    <li
                      key={r.id}
                      className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/30 p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm text-slate-300">{r.name}</div>
                        <div className="mt-0.5 text-xs text-slate-600">
                          deleted {fmtDate(r.updatedAt)}
                        </div>
                      </div>
                      <button
                        onClick={() => onRestore(r.id)}
                        className="rounded-md border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:border-slate-500 hover:text-slate-100"
                      >
                        Restore
                      </button>
                      <button
                        onClick={() => {
                          if (
                            window.confirm(
                              `Permanently delete "${r.name}"? This can't be undone.`,
                            )
                          )
                            onPurge(r.id);
                        }}
                        className="rounded-md border border-rose-900/60 px-2.5 py-1 text-xs text-rose-300 hover:border-rose-700 hover:text-rose-200"
                      >
                        Delete
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </ModalPortal>
  );
}

function IconBtn({
  children,
  label,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`rounded-md border px-2 py-1 text-xs ${
        danger
          ? "border-slate-700 text-slate-400 hover:border-rose-700 hover:text-rose-300"
          : "border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-100"
      }`}
    >
      {children}
    </button>
  );
}
