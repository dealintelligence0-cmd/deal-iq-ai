/**
 * Permission helpers — Phase 6a guest-session model.
 *
 * The system has THREE identity classes:
 *   1. Admin (the one signed-in admin user)
 *   2. Guest (anyone visiting via an active invite link cookie)
 *   3. None (signed out, not a guest)
 *
 * For admin: all 13 modules are accessible.
 * For guest: read `module_access` JSONB from the active invite_link row
 *           (admin toggles this in real time).
 * For none: no access — middleware redirects to /login.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export type ModuleKey =
  | "deals_data" | "import" | "prioritization" | "triage"
  | "themes" | "signals" | "boltons"
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
  | { kind: "none" };

const GUEST_COOKIE_NAME = "deal_iq_guest";

/** Resolve who's viewing — admin / guest / none. Server-only (uses next/headers). */
export async function resolveViewer(sb: SupabaseClient): Promise<ViewerIdentity> {
  // Try authed user first
  const { data: { user } } = await sb.auth.getUser();
  if (user) {
    const { data } = await sb.from("users").select("is_admin").eq("id", user.id).maybeSingle();
    if (data?.is_admin) return { kind: "admin", userId: user.id };
    // The system only allows one admin. Anyone else who is signed in but not admin
    // is treated as having no access (defensive — schema prevents this anyway).
    return { kind: "none" };
  }
  // Try guest cookie
  const jar = await cookies();
  const guestToken = jar.get(GUEST_COOKIE_NAME)?.value;
  if (guestToken) {
    // We need the SERVICE ROLE here because the admin_invite_links table is admin-RLS only.
    // But this helper is called from server components which have the same supabase client.
    // To keep this working without leaking service key into client code, we use the
    // existing sb client but rely on the SECURITY DEFINER function check via SQL.
    const { data: invite } = await sb
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
  sb: SupabaseClient,
  viewer: ViewerIdentity,
  moduleKey: ModuleKey
): Promise<boolean> {
  if (viewer.kind === "admin") return true;
  if (viewer.kind === "none") return false;
  // Guest — look up module_access on the invite row
  const { data } = await sb
    .from("admin_invite_links")
    .select("module_access")
    .eq("id", viewer.inviteId)
    .eq("is_active", true)
    .maybeSingle();
  const access = (data?.module_access ?? {}) as Record<string, boolean>;
  if (Object.prototype.hasOwnProperty.call(access, moduleKey)) {
    return access[moduleKey] === true;
  }
  // Fall back to catalogue default
  const { data: cat } = await sb
    .from("module_catalog")
    .select("default_for_invitees")
    .eq("module_key", moduleKey)
    .maybeSingle();
  return cat?.default_for_invitees === true;
}

/** Build full {moduleKey → granted} map for the current viewer. */
export async function getViewerModules(
  sb: SupabaseClient,
  viewer: ViewerIdentity
): Promise<UserModuleMap> {
  const { data: catalog } = await sb
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

  // Guest — load module_access from the invite row
  const { data: invite } = await sb
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

/** Legacy convenience — admin?  */
export async function isViewerAdmin(viewer: ViewerIdentity): Promise<boolean> {
  return viewer.kind === "admin";
}
