/**
 * Workspace context helpers — Phase 7.
 *
 * Active workspace resolution order:
 *   1. `deal_iq_workspace` cookie (set by workspace picker)
 *   2. User's personal workspace (workspace.id = user.id)
 *   3. null → caller falls back to per-user behavior (legacy `created_by` scope)
 *
 * Guest sessions never have a workspace — they get null.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

export const WORKSPACE_COOKIE = "deal_iq_workspace";

export type WorkspaceContext = {
  workspaceId: string | null;
  workspaceName: string | null;
  isPersonal: boolean;
  role: "owner" | "editor" | "viewer" | null;
};

/**
 * Resolve which workspace the current user is operating in.
 * Returns nulls for guests + signed-out viewers.
 */
export async function getActiveWorkspace(sb: SupabaseClient): Promise<WorkspaceContext> {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { workspaceId: null, workspaceName: null, isPersonal: false, role: null };

  const admin = createAdminClient();
  const jar = await cookies();
  const explicit = jar.get(WORKSPACE_COOKIE)?.value;

  // Verify the explicit workspace is one the user belongs to
  if (explicit) {
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
    };
  }
  return { workspaceId: null, workspaceName: null, isPersonal: false, role: null };
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
