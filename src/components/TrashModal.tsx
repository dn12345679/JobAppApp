import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import ModalPortal from "./ModalPortal";
import type { JobApplication } from "../types";
import { listDeletedJobs, restoreJob } from "../lib/db";
import { purgeJob } from "../lib/sync";

export default function TrashModal({
  workspaceId,
  onClose,
  onChanged,
}: {
  workspaceId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [items, setItems] = useState<JobApplication[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    setItems(await listDeletedJobs(workspaceId));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  async function restore(id: string) {
    setBusy(id);
    try {
      await restoreJob(id);
      await load();
      onChanged();
    } finally {
      setBusy(null);
    }
  }

  async function purge(job: JobApplication) {
    if (
      !window.confirm(
        `Permanently delete "${job.title} · ${job.company}"? This can't be undone.`,
      )
    )
      return;
    setBusy(job.id);
    try {
      await purgeJob(job.id);
      await load();
      onChanged();
    } finally {
      setBusy(null);
    }
  }

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
        className="flex max-h-[75vh] w-full max-w-lg flex-col rounded-2xl border border-slate-700 bg-slate-800 p-5 shadow-2xl"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-100">🗑 Trash</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200"
          >
            ✕
          </button>
        </div>

        {items.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-500">
            Trash is empty.
          </p>
        ) : (
          <div className="flex-1 space-y-2 overflow-auto pr-1">
            {items.map((job) => (
              <div
                key={job.id}
                className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-900/40 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-slate-200">
                    {job.title}{" "}
                    <span className="text-slate-500">· {job.company}</span>
                  </div>
                </div>
                <button
                  onClick={() => restore(job.id)}
                  disabled={busy === job.id}
                  className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
                >
                  Restore
                </button>
                <button
                  onClick={() => purge(job)}
                  disabled={busy === job.id}
                  className="shrink-0 rounded-lg px-2 py-1 text-xs text-slate-500 hover:text-rose-400 disabled:opacity-40"
                  title="Delete forever"
                >
                  Delete forever
                </button>
              </div>
            ))}
          </div>
        )}

        {items.length > 0 && (
          <p className="mt-3 text-xs text-slate-600">
            Restored items reappear in your list and sync back up on the next
            sync.
          </p>
        )}
      </motion.div>
      </motion.div>
    </ModalPortal>
  );
}
