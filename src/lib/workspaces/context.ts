/**
 * Workspace resolution helper — current workspace from cookie, fallback to personal
 *
 * For guests: use hash of invite token as a virtual workspace ID.
 * This allows guest narratives to be workspace-scoped and visible on reload.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import crypto from "crypto";

export const WORKSPACE_COOKIE = "deal_iq_workspace";
export const GUEST_SESSION_WORKSPACE_PREFIX = "guest_session_";

export type WorkspaceContext = {
  workspaceId: string | null;
  workspaceName: string | null;
  isPersonal: boolean;
  role: "owner" | "editor" | "viewer" | null;
  isGuestSession: boolean;
};

/**
 * Resolve which workspace the current user is operating in.
 * Returns nulls for signed-out viewers.
 */
export async function getActiveWorkspace(sb: SupabaseClient): Promise<WorkspaceContext> {
  const { data: { user } } = await sb.auth.getUser();
  const admin = createAdminClient();
  const jar = await cookies();

  // Check if guest session
  const guestToken = jar.get("deal_iq_guest")?.value;
  if (guestToken && !user) {
    // Derive a stable virtual workspace ID from the guest token
    const wsId = GUEST_SESSION_WORKSPACE_PREFIX + crypto.createHash("sha256").update(guestToken).digest("hex").slice(0, 16);
    return {
      workspaceId: wsId,
      workspaceName: "Guest Session",
      isPersonal: false,
      role: "viewer",
      isGuestSession: true,
    };
  }

  if (!user) return { workspaceId: null, workspaceName: null, isPersonal: false, role: null, isGuestSession: false };

  const explicit = jar.get(WORKSPACE_COOKIE)?.value;

  // Verify the explicit workspace is one the user belongs to
  if (explicit && !explicit.startsWith(GUEST_SESSION_WORKSPACE_PREFIX)) {
    const { data } = await admin
      .from("workspace_members")
      .select("role, workspaces!inner(id, name, is_personal)")
      .eq("user_id", user.id)
      .eq("workspace_id", explicit)
      .maybeSingle();
    if (data) {
      const ws = (data as any).workspaces;
      return {
        workspaceId: ws.id as string,
        workspaceName: ws.name as string,
        isPersonal: ws.is_personal as boolean,
        role: data.role as "owner" | "editor" | "viewer",
        isGuestSession: false,
      };
    }
  }

  // Fallback to personal workspace (created_by = user.id)
  const { data: personal } = await admin
    .from("workspaces")
    .select("id, name")
    .eq("created_by", user.id)
    .eq("is_personal", true)
    .maybeSingle();
  if (personal) {
    return {
      workspaceId: personal.id as string,
      workspaceName: personal.name as string,
      isPersonal: true,
      role: "owner",
      isGuestSession: false,
    };
  }
  return { workspaceId: null, workspaceName: null, isPersonal: false, role: null, isGuestSession: false };
}

/**
 * List all workspaces the user can switch to.
 */
export async function listMyWorkspaces(sb: SupabaseClient): Promise<Array<{
  id: string; name: string; is_personal: boolean; role: string; member_count: number;
}>> {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return [];

  const admin = createAdminClient();
  const { data } = await admin
    .from("workspace_members")
    .select("role, workspaces!inner(id, name, is_personal, created_at)")
    .eq("user_id", user.id);

  const rows = (data ?? []) as Array<{ role: string; workspaces: any }>;
  const ids = rows.map((r) => r.workspaces.id as string);

  // Member counts per workspace
  const counts = new Map<string, number>();
  if (ids.length > 0) {
    const { data: all } = await admin.from("workspace_members").select("workspace_id").in("workspace_id", ids);
    for (const m of all ?? []) {
      counts.set(m.workspace_id as string, (counts.get(m.workspace_id as string) ?? 0) + 1);
    }
  }

  return rows.map((r) => ({
    id: r.workspaces.id as string,
    name: r.workspaces.name as string,
    is_personal: r.workspaces.is_personal as boolean,
    role: r.role,
    member_count: counts.get(r.workspaces.id as string) ?? 1,
  })).sort((a, b) => (a.is_personal ? -1 : 1) - (b.is_personal ? -1 : 1));
}
