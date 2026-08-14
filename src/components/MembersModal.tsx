import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import ModalPortal from "./ModalPortal";
import type { Role } from "../types";
import { listJobs, renameWorkspace } from "../lib/db";
import { deleteWorkspaceSmart } from "../lib/sync";
import {
  inviteMember,
  listMembers,
  removeMember,
  setMemberRole,
  type Member,
} from "../lib/sharing";

const ROLE_LABEL: Record<Role, string> = {
  owner: "Owner",
  editor: "Editor (read/write)",
  viewer: "Viewer (read-only)",
};

export default function MembersModal({
  workspaceId,
  workspaceName,
  isOwner,
  currentUserId,
  onClose,
  onChanged,
}: {
  workspaceId: string;
  workspaceName: string;
  isOwner: boolean;
  currentUserId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [members, setMembers] = useState<Member[]>([]);
  const [name, setName] = useState(workspaceName);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Exclude<Role, "owner">>("editor");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [jobCount, setJobCount] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  async function load() {
    setError(null);
    try {
      setMembers(await listMembers(workspaceId));
    } catch (e) {
      setError(msg(e));
    }
  }

  useEffect(() => {
    load();
    listJobs(workspaceId).then((j) => setJobCount(j.length));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  async function invite() {
    if (!email.trim() || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await inviteMember(workspaceId, email.trim(), inviteRole);
      setNotice(`Invited ${email.trim()} as ${inviteRole}.`);
      setEmail("");
      await load();
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(m: Member, role: Role) {
    setBusy(true);
    setError(null);
    try {
      await setMemberRole(m.userId, workspaceId, role);
      await load();
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(m: Member) {
    const self = m.userId === currentUserId;
    if (
      !window.confirm(
        self
          ? `Leave "${workspaceName}"? You'll lose access.`
          : `Remove ${m.email} from "${workspaceName}"?`,
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      await removeMember(m.userId, workspaceId);
      if (self) {
        onChanged();
        onClose();
        return;
      }
      await load();
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveName() {
    if (name.trim() === workspaceName) return;
    await renameWorkspace(workspaceId, name);
    onChanged();
  }

  async function deleteWs() {
    if (busy || confirmText.trim() !== workspaceName) return;
    setBusy(true);
    setError(null);
    try {
      await deleteWorkspaceSmart(workspaceId);
      onChanged();
      onClose();
    } catch (e) {
      setError(msg(e));
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
        className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-2xl border border-slate-700 bg-slate-800 p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-100">
            Share workspace
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            ✕
          </button>
        </div>

        {/* Rename (owner only) */}
        <label className="mb-4 block">
          <span className="mb-1 block text-xs font-medium text-slate-400">
            Workspace name
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            disabled={!isOwner}
            className="w-full rounded-lg border border-slate-600 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500 disabled:opacity-60"
          />
        </label>

        {/* Invite (owner only) */}
        {isOwner && (
          <div className="mb-4">
            <span className="mb-1 block text-xs font-medium text-slate-400">
              Invite by email
            </span>
            <div className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && invite()}
                placeholder="teammate@gmail.com"
                className="flex-1 rounded-lg border border-slate-600 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500"
              />
              <select
                value={inviteRole}
                onChange={(e) =>
                  setInviteRole(e.target.value as Exclude<Role, "owner">)
                }
                className="rounded-lg border border-slate-600 bg-slate-900/60 px-2 py-2 text-sm text-slate-200"
              >
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </select>
              <button
                onClick={invite}
                disabled={busy || !email.trim()}
                className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-40"
              >
                Invite
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              They must have signed in to the app at least once first.
            </p>
          </div>
        )}

        {notice && <p className="mb-2 text-xs text-emerald-400">{notice}</p>}
        {error && <p className="mb-2 text-xs text-rose-400">{error}</p>}

        {/* Roster */}
        <span className="mb-1 block text-xs font-medium text-slate-400">
          Members ({members.length})
        </span>
        <div className="flex-1 space-y-2 overflow-auto pr-1">
          {members.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-600">
              {error ? "Couldn't load members." : "Just you so far."}
            </p>
          ) : (
            members.map((m) => {
              const self = m.userId === currentUserId;
              const isMemberOwner = m.role === "owner";
              return (
                <div
                  key={m.userId}
                  className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/40 px-3 py-2"
                >
                  <div className="min-w-0 flex-1 truncate text-sm text-slate-200">
                    {m.email}
                    {self && <span className="text-slate-500"> (you)</span>}
                  </div>
                  {isOwner && !isMemberOwner ? (
                    <select
                      value={m.role}
                      onChange={(e) => changeRole(m, e.target.value as Role)}
                      disabled={busy}
                      className="rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-slate-200"
                    >
                      <option value="editor">Editor</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  ) : (
                    <span className="text-xs text-slate-500">
                      {ROLE_LABEL[m.role]}
                    </span>
                  )}
                  {((isOwner && !isMemberOwner) || (self && !isOwner)) && (
                    <button
                      onClick={() => remove(m)}
                      disabled={busy}
                      className="rounded-md px-2 py-1 text-xs text-slate-500 hover:text-rose-400"
                      title={self ? "Leave" : "Remove"}
                    >
                      {self ? "Leave" : "Remove"}
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        {isOwner && (
          <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/5 p-3">
            <p className="text-sm font-medium text-rose-300">Danger zone</p>
            <p className="mt-1 text-xs text-slate-400">
              {jobCount === null
                ? "…"
                : jobCount === 0
                  ? "Delete this empty workspace?"
                  : `Deletes this workspace and its ${jobCount} application${
                      jobCount === 1 ? "" : "s"
                    } for everyone. Sync afterward to apply.`}
            </p>
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="mt-2 rounded-lg border border-rose-500/50 px-3 py-1.5 text-sm font-medium text-rose-300 hover:bg-rose-500/10"
              >
                Delete workspace…
              </button>
            ) : (
              <div className="mt-2 space-y-2">
                <p className="text-xs text-slate-400">
                  Type{" "}
                  <span className="font-semibold text-slate-200">
                    {workspaceName}
                  </span>{" "}
                  to confirm.
                </p>
                <input
                  autoFocus
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder={workspaceName}
                  className="w-full rounded-lg border border-slate-600 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-rose-500"
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => {
                      setConfirmDelete(false);
                      setConfirmText("");
                    }}
                    className="rounded-lg px-3 py-1.5 text-sm text-slate-400 hover:text-slate-200"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={deleteWs}
                    disabled={busy || confirmText.trim() !== workspaceName}
                    className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-40"
                  >
                    {busy ? "Deleting…" : "Permanently delete"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </motion.div>
      </motion.div>
    </ModalPortal>
  );
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
