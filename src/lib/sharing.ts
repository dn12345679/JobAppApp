import type { Role } from "../types";
import { supabase } from "./supabase";

export interface Member {
  userId: string;
  email: string;
  role: Role;
}

function requireClient() {
  if (!supabase) throw new Error("Sync is not configured.");
  return supabase;
}

export async function listMembers(workspaceId: string): Promise<Member[]> {
  const sb = requireClient();
  const { data, error } = await sb.rpc("list_workspace_members", {
    p_workspace: workspaceId,
  });
  if (error) throw new Error(error.message);
  return (data ?? []).map(
    (r: { user_id: string; email: string; role: Role }) => ({
      userId: r.user_id,
      email: r.email,
      role: r.role,
    }),
  );
}

/** Owner-only. Invitee must have signed in at least once. */
export async function inviteMember(
  workspaceId: string,
  email: string,
  role: Exclude<Role, "owner">,
): Promise<void> {
  const sb = requireClient();
  const { error } = await sb.rpc("invite_to_workspace", {
    p_workspace: workspaceId,
    p_email: email,
    p_role: role,
  });
  if (error) throw new Error(error.message);
}

export async function setMemberRole(
  userId: string,
  workspaceId: string,
  role: Role,
): Promise<void> {
  const sb = requireClient();
  const { error } = await sb
    .from("memberships")
    .update({ role })
    .eq("user_id", userId)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);
}

export async function removeMember(
  userId: string,
  workspaceId: string,
): Promise<void> {
  const sb = requireClient();
  const { error } = await sb
    .from("memberships")
    .delete()
    .eq("user_id", userId)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);
}
