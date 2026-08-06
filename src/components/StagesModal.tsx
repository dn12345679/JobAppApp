import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import type { WorkspaceStage } from "../types";
import { createStage, deleteStage, listStages, renameStage } from "../lib/db";

export default function StagesModal({
  workspaceId,
  onClose,
  onChanged,
}: {
  workspaceId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [stages, setStages] = useState<WorkspaceStage[]>([]);
  const [newLabel, setNewLabel] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setStages(await listStages(workspaceId));
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  async function add() {
    const l = newLabel.trim();
    if (!l || busy) return;
    setBusy(true);
    try {
      await createStage(workspaceId, l);
      setNewLabel("");
      await load();
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function rename(s: WorkspaceStage, label: string) {
    const l = label.trim();
    if (!l || l === s.label) return;
    await renameStage(workspaceId, s.id, s.label, l);
    await load();
    onChanged();
  }

  async function remove(s: WorkspaceStage) {
    if (
      !window.confirm(
        `Delete stage "${s.label}"? Jobs already set to it keep the label; it just won't be offered anymore.`,
      )
    )
      return;
    await deleteStage(s.id);
    await load();
    onChanged();
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-4"
    >
      <motion.div
        initial={{ scale: 0.96, y: 12 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.96, y: 12 }}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[80vh] w-full max-w-md flex-col rounded-2xl border border-slate-700 bg-slate-800 p-5 shadow-2xl"
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-100">
            Application stages
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            ✕
          </button>
        </div>
        <p className="mb-4 text-xs text-slate-500">
          The stage options for applications in this workspace. Renaming one
          updates every job using it. Sync to share changes.
        </p>

        <div className="flex-1 space-y-2 overflow-auto pr-1">
          {stages.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-600">
              No stages yet — add one below.
            </p>
          ) : (
            stages.map((s) => (
              <StageRow
                key={s.id}
                stage={s}
                onRename={(label) => rename(s, label)}
                onDelete={() => remove(s)}
              />
            ))
          )}
        </div>

        <div className="mt-3 flex gap-2 border-t border-slate-700 pt-3">
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="New stage (e.g. Ghosted)"
            className="flex-1 rounded-lg border border-slate-600 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500"
          />
          <button
            onClick={add}
            disabled={busy || !newLabel.trim()}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-40"
          >
            Add
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function StageRow({
  stage,
  onRename,
  onDelete,
}: {
  stage: WorkspaceStage;
  onRename: (label: string) => void;
  onDelete: () => void;
}) {
  const [label, setLabel] = useState(stage.label);

  return (
    <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/40 px-3 py-2">
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={() => onRename(label)}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm text-slate-100 outline-none hover:border-slate-700 focus:border-indigo-500"
      />
      <button
        onClick={onDelete}
        title="Delete stage"
        className="shrink-0 rounded-md px-2 py-1 text-xs text-slate-500 hover:text-rose-400"
      >
        ✕
      </button>
    </div>
  );
}
