/**
 * Permission helpers — Phase 6a.
 *
 * Two flavors:
 *   - userHasModule(userId, key) — server-side, uses the SQL function for atomicity
 *   - getUserModules(userId) — returns the full map of {moduleKey → granted} for UI
 *
 * Admin always returns true for every module.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

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

/** Server-side check for one (user, module) pair. */
export async function userHasModule(
  sb: SupabaseClient,
  userId: string,
  moduleKey: ModuleKey
): Promise<boolean> {
  // Use the SQL function for the canonical check (admin shortcut + default fallback)
  const { data, error } = await sb.rpc("user_has_module", { p_user: userId, p_module: moduleKey });
  if (error) {
    console.error(`userHasModule(${moduleKey}) failed:`, error.message);
    return false;
  }
  return data === true;
}

/** Get the full module-access map for a user. Admin → all true. */
export async function getUserModules(
  sb: SupabaseClient,
  userId: string
): Promise<UserModuleMap> {
  // Check admin first
  const { data: userRow } = await sb.from("users").select("is_admin").eq("id", userId).maybeSingle();
  const isAdmin = userRow?.is_admin === true;

  const { data: catalog } = await sb.from("module_catalog").select("module_key, default_for_invitees");
  const allModules: ModuleKey[] = ((catalog ?? []) as Array<{ module_key: ModuleKey; default_for_invitees: boolean }>)
    .map((c) => c.module_key);

  if (isAdmin) {
    const map: Partial<UserModuleMap> = {};
    for (const k of allModules) map[k] = true;
    return map as UserModuleMap;
  }

  // Load explicit grants
  const { data: grants } = await sb
    .from("user_module_permissions")
    .select("module_key, granted")
    .eq("user_id", userId);
  const grantMap = new Map<string, boolean>();
  for (const g of grants ?? []) grantMap.set(g.module_key as string, g.granted as boolean);

  const map: Partial<UserModuleMap> = {};
  for (const c of (catalog ?? []) as Array<{ module_key: ModuleKey; default_for_invitees: boolean }>) {
    map[c.module_key] = grantMap.has(c.module_key)
      ? grantMap.get(c.module_key)!
      : c.default_for_invitees;
  }
  return map as UserModuleMap;
}

/** Convenience: is this user the admin? */
export async function isUserAdmin(sb: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await sb.from("users").select("is_admin").eq("id", userId).maybeSingle();
  return data?.is_admin === true;
}
