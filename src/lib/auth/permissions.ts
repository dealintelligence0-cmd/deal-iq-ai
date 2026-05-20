/**
 * Permission helpers — Phase 6a guest-session model.
 *
 * Identity classes:
 *   1. Admin (the one signed-in admin user)
 *   2. Guest (visiting via active invite link cookie)
 *   3. None (signed out, not a guest)
 *
 * Important: invite-link lookup uses the SERVICE-ROLE admin client because
 * admin_invite_links has RLS that blocks unauth'd reads. The user-supplied
 * sb client is only used for the auth.getUser() check.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

export type ModuleKey =
  | "deals_data" | "import" | "prioritization" | "triage"
  | "themes" | "signals" | "boltons" | "advisors" | "narratives"
  | "proposals" | "pmi" | "synergy" | "tsa"
  | "exports" | "settings";

export type ModuleCatalogRow = {
  module_key: ModuleKey;
  display_name: string;
  category: "deal_data" | "intelligence" | "advisory" | "system";
  default_for_invitees: boolean;
  sort_order: number;
};

export type UserModuleMap = Record<ModuleKey, boolean>;

export type ViewerIdentity =
  | { kind: "admin"; userId: string }
  | { kind: "guest"; inviteId: string; inviteToken: string }
  | { kind: "user"; userId: string }
  | { kind: "none" };

const GUEST_COOKIE_NAME = "deal_iq_guest";

/**
 * Resolve who's viewing. Uses sb for auth check (user-scoped) and admin client
 * for invite-link lookup (RLS-bypassing).
 */
export async function resolveViewer(sb: SupabaseClient): Promise<ViewerIdentity> {
  // Try authed user first
  const { data: { user } } = await sb.auth.getUser();
  if (user) {
    // Use admin client to read is_admin without depending on user-RLS
    const admin = createAdminClient();
    const { data } = await admin.from("users").select("is_admin").eq("id", user.id).maybeSingle();
    if (data?.is_admin) return { kind: "admin", userId: user.id };
    return { kind: "user", userId: user.id };
  }
  // Try guest cookie — MUST use admin client because admin_invite_links is admin-RLS-only
  const jar = await cookies();
  const guestToken = jar.get(GUEST_COOKIE_NAME)?.value;
  if (guestToken) {
    const admin = createAdminClient();
    const { data: invite } = await admin
      .from("admin_invite_links")
      .select("id, token, is_active")
      .eq("token", guestToken)
      .eq("is_active", true)
      .maybeSingle();
    if (invite?.is_active) {
      return { kind: "guest", inviteId: invite.id as string, inviteToken: invite.token as string };
    }
  }
  return { kind: "none" };
}

/** Check one (viewer, module) pair. */
export async function viewerHasModule(
  _sb: SupabaseClient,
  viewer: ViewerIdentity,
  moduleKey: ModuleKey
): Promise<boolean> {
  if (viewer.kind === "admin") return true;
  if (viewer.kind === "none") return false;
  const admin = createAdminClient();
  if (viewer.kind === "guest") {
    const { data } = await admin
      .from("admin_invite_links")
      .select("module_access")
      .eq("id", viewer.inviteId)
      .eq("is_active", true)
      .maybeSingle();
    const access = (data?.module_access ?? {}) as Record<string, boolean>;
    if (Object.prototype.hasOwnProperty.call(access, moduleKey)) {
      return access[moduleKey] === true;
    }
    const { data: cat } = await admin
      .from("module_catalog").select("default_for_invitees")
      .eq("module_key", moduleKey).maybeSingle();
    return cat?.default_for_invitees === true;
  }
  // Regular user (rare path now) — fall back to user_module_permissions
  const { data: perm } = await admin
    .from("user_module_permissions").select("granted")
    .eq("user_id", viewer.userId).eq("module_key", moduleKey).maybeSingle();
  if (perm) return perm.granted as boolean;
  const { data: cat2 } = await admin
    .from("module_catalog").select("default_for_invitees")
    .eq("module_key", moduleKey).maybeSingle();
  return cat2?.default_for_invitees === true;
}

/** Build full {moduleKey → granted} map for the viewer. */
export async function getViewerModules(
  _sb: SupabaseClient,
  viewer: ViewerIdentity
): Promise<UserModuleMap> {
  const admin = createAdminClient();
  const { data: catalog } = await admin
    .from("module_catalog")
    .select("module_key, default_for_invitees")
    .order("sort_order");
  const allModules = (catalog ?? []) as Array<{ module_key: ModuleKey; default_for_invitees: boolean }>;

  if (viewer.kind === "admin") {
    const map: Partial<UserModuleMap> = {};
    for (const c of allModules) map[c.module_key] = true;
    return map as UserModuleMap;
  }
  if (viewer.kind === "none") {
    const map: Partial<UserModuleMap> = {};
    for (const c of allModules) map[c.module_key] = false;
    return map as UserModuleMap;
  }
  if (viewer.kind === "guest") {
    const { data: invite } = await admin
      .from("admin_invite_links")
      .select("module_access")
      .eq("id", viewer.inviteId)
      .maybeSingle();
    const access = (invite?.module_access ?? {}) as Record<string, boolean>;
    const map: Partial<UserModuleMap> = {};
    for (const c of allModules) {
      map[c.module_key] = Object.prototype.hasOwnProperty.call(access, c.module_key)
        ? access[c.module_key as ModuleKey] === true
        : c.default_for_invitees;
    }
    return map as UserModuleMap;
  }
  // viewer.kind === "user" — regular signup, uses user_module_permissions
  const { data: perms } = await admin
    .from("user_module_permissions")
    .select("module_key, granted")
    .eq("user_id", viewer.userId);
  const grantMap = new Map<string, boolean>();
  for (const p of perms ?? []) grantMap.set(p.module_key as string, p.granted as boolean);
  const map: Partial<UserModuleMap> = {};
  for (const c of allModules) {
    map[c.module_key] = grantMap.has(c.module_key)
      ? grantMap.get(c.module_key)!
      : c.default_for_invitees;
  }
  return map as UserModuleMap;
}

export async function isViewerAdmin(viewer: ViewerIdentity): Promise<boolean> {
  return viewer.kind === "admin";
}
