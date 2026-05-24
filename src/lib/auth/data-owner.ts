/**
 * Phase 7 fix — unified data-owner resolution.
 *
 * Replaces the awkward pattern of:
 *   const { data: { user } } = await sb.auth.getUser();
 *   if (!user) return 401;
 *   ... filter by created_by = user.id
 *
 * With a single helper that handles guests (who see the admin's data) and
 * authed users (who see their own data).
 *
 * Returns:
 *   { ok: true, ownerId, viewer }     - go ahead and query by created_by = ownerId
 *   { ok: false, status, error }      - return that as the JSON error
 *
 * Write operations should additionally check viewer.kind — guests typically
 * cannot mutate admin's data unless explicitly allowed (e.g. narratives).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveViewer, type ViewerIdentity } from "@/lib/auth/permissions";

export type DataOwnerOk = {
  ok: true;
  ownerId: string;       // the user_id to filter by created_by
  viewer: ViewerIdentity;
  isReadOnly: boolean;   // true for guests by default
};
export type DataOwnerFail = {
  ok: false;
  status: number;
  error: string;
};
export type DataOwnerResult = DataOwnerOk | DataOwnerFail;

/**
 * Resolve the user_id whose data the current viewer should see.
 * Returns guest → admin's user_id; authed → their own user_id; none → 401.
 */
export async function resolveDataOwner(sb: SupabaseClient): Promise<DataOwnerResult> {
  const viewer = await resolveViewer(sb);
  if (viewer.kind === "admin" || viewer.kind === "user") {
    return { ok: true, ownerId: viewer.userId, viewer, isReadOnly: false };
  }
  if (viewer.kind === "guest") {
    // Find the admin user (there's only one) and use their data scope
    const admin = createAdminClient();
    const { data: adminUser } = await admin
      .from("users").select("id").eq("is_admin", true).limit(1).maybeSingle();
    if (!adminUser) {
      return { ok: false, status: 500, error: "No admin user configured" };
    }
    return { ok: true, ownerId: adminUser.id as string, viewer, isReadOnly: true };
  }
  return { ok: false, status: 401, error: "Unauthorized" };
}
