import { useState } from "react";
import { motion } from "framer-motion";
import ModalPortal from "./ModalPortal";
import type { Role } from "../types";
import { createWorkspace } from "../lib/db";
import { syncAll } from "../lib/sync";
import { inviteMember } from "../lib/sharing";

type InviteRole = Exclude<Role, "owner">;
interface PendingInvite {
  email: string;
  role: InviteRole;
}

export default function CreateWorkspaceModal({
  ownerId,
  canShare,
  onClose,
  onCreated,
}: {
  ownerId: string;
  canShare: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InviteRole>("editor");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addInvite() {
    const e = email.trim().toLowerCase();
    if (!e) return;
    if (!invites.some((i) => i.email === e)) {
      setInvites([...invites, { email: e, role }]);
    }
    setEmail("");
  }

  async function create() {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      // Fold a not-yet-added email in the box into the invite list.
      const pending = email.trim()
        ? [...invites, { email: email.trim().toLowerCase(), role }]
        : invites;

      const ws = await createWorkspace(name, ownerId);
      onCreated(ws.id); // reflect the new workspace immediately

      if (canShare && pending.length) {
        // Push the workspace + owner membership so invites can attach to it.
        await syncAll();
        const failures: string[] = [];
        for (const inv of pending) {
          try {
            await inviteMember(ws.id, inv.email, inv.role);
          } catch (e) {
            failures.push(
              `${inv.email}: ${e instanceof Error ? e.message : String(e)}`,
            );
          }
        }
        if (failures.length) {
          setError(`Workspace created, but some invites failed:\n${failures.join("\n")}`);
          setBusy(false);
          return; // keep the modal open so the failures are visible
        }
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
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
        className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-800 p-5 shadow-2xl"
      >
        <h2 className="mb-4 text-lg font-semibold text-slate-100">
          Create workspace
        </h2>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-400">
            Name
          </span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !canShare && create()}
            placeholder="e.g. Summer 2026 internships"
            className={inputCls}
          />
        </label>

        {canShare && (
          <div className="mt-4">
            <span className="mb-1 block text-xs font-medium text-slate-400">
              Share with (optional)
            </span>
            <div className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addInvite();
                  }
                }}
                placeholder="teammate@gmail.com"
                className={`${inputCls} flex-1`}
              />
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as InviteRole)}
                className="rounded-lg border border-slate-600 bg-slate-900/60 px-2 py-2 text-sm text-slate-200"
              >
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </select>
              <button
                onClick={addInvite}
                className="rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-200 hover:border-slate-500"
              >
                Add
              </button>
            </div>

            {invites.length > 0 && (
              <ul className="mt-2 space-y-1">
                {invites.map((inv) => (
                  <li
                    key={inv.email}
                    className="flex items-center gap-2 rounded-lg bg-slate-900/40 px-3 py-1.5 text-sm"
                  >
                    <span className="min-w-0 flex-1 truncate text-slate-200">
                      {inv.email}
                    </span>
                    <span className="text-xs text-slate-500">{inv.role}</span>
                    <button
                      onClick={() =>
                        setInvites(invites.filter((x) => x.email !== inv.email))
                      }
                      className="text-slate-500 hover:text-rose-400"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-1 text-xs text-slate-500">
              Invitees must have signed in to the app at least once.
            </p>
          </div>
        )}

        {error && (
          <p className="mt-3 whitespace-pre-line text-xs text-rose-400">{error}</p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-slate-400 hover:text-slate-200"
          >
            Cancel
          </button>
          <button
            onClick={create}
            disabled={!name.trim() || busy}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Creating…" : "Create"}
          </button>
        </div>
      </motion.div>
      </motion.div>
    </ModalPortal>
  );
}

const inputCls =
  "w-full rounded-lg border border-slate-600 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500";
