/**
 * Workspace / deal ownership guards.
 *
 * Several routes operate on a `workspace_id` or `deal_id` taken from the
 * request and then read/write via the service-role admin client (which
 * bypasses RLS). Without an explicit ownership check that is a cross-tenant
 * IDOR. These helpers centralise the check.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { GUEST_SESSION_WORKSPACE_PREFIX } from "@/lib/workspaces/context";

/**
 * True if the authenticated user is a member of `workspaceId`.
 * When `write` is set, require an owner/editor role (viewers are read-only).
 * Guest virtual workspaces are never accessible to a Supabase-authed user.
 */
export async function userCanAccessWorkspace(
  userId: string,
  workspaceId: string | null | undefined,
  opts: { write?: boolean } = {},
): Promise<boolean> {
  if (!workspaceId || workspaceId.startsWith(GUEST_SESSION_WORKSPACE_PREFIX)) return false;
  const admin = createAdminClient();
  const { data } = await admin
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return false;
  if (opts.write) return data.role === "owner" || data.role === "editor";
  return true;
}

/** True if the deal was created by this user. */
export async function userOwnsDeal(userId: string, dealId: string | null | undefined): Promise<boolean> {
  if (!dealId) return false;
  const admin = createAdminClient();
  const { data } = await admin
    .from("deals")
    .select("id")
    .eq("id", dealId)
    .eq("created_by", userId)
    .maybeSingle();
  return !!data;
}

/**
 * Guard for cognition-style scopes that are keyed by an optional workspace_id
 * and/or deal_id. Returns true when the user may touch the given scope.
 *
 * - workspace_id present → must be a member (owner/editor when writing).
 * - else deal_id present → must own the deal.
 * - both null → the shared/global default bucket; allowed (no tenant data).
 */
export async function userCanAccessCognitionScope(
  userId: string,
  workspaceId: string | null | undefined,
  dealId: string | null | undefined,
  opts: { write?: boolean } = {},
): Promise<boolean> {
  if (workspaceId) return userCanAccessWorkspace(userId, workspaceId, opts);
  if (dealId) return userOwnsDeal(userId, dealId);
  return true;
}
