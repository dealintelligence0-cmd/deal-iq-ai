/**
 * GET /api/admin/users          → list all users + their permission summary
 * PATCH /api/admin/users        → grant/revoke modules: { user_id, module_key, granted }
 *
 * Admin only.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isUserAdmin } from "@/lib/auth/permissions";

export const runtime = "nodejs";

export async function GET() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isUserAdmin(sb, user.id))) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  // All users
  const { data: users, error: uErr } = await sb
    .from("users")
    .select("id, email, is_admin, created_at, signed_up_via_invite_id")
    .order("created_at");
  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });

  // All permissions grouped by user
  const { data: perms } = await sb
    .from("user_module_permissions")
    .select("user_id, module_key, granted, granted_at");

  // Catalogue (for the matrix UI)
  const { data: catalog } = await sb
    .from("module_catalog")
    .select("module_key, display_name, category, default_for_invitees, sort_order")
    .order("sort_order");

  const permsByUser = new Map<string, Map<string, boolean>>();
  for (const p of perms ?? []) {
    const m = permsByUser.get(p.user_id as string) ?? new Map<string, boolean>();
    m.set(p.module_key as string, p.granted as boolean);
    permsByUser.set(p.user_id as string, m);
  }

  // Build the effective access matrix
  const enriched = (users ?? []).map((u) => {
    const m = permsByUser.get(u.id as string) ?? new Map<string, boolean>();
    const access: Record<string, boolean> = {};
    for (const c of catalog ?? []) {
      if (u.is_admin) access[c.module_key as string] = true;
      else access[c.module_key as string] = m.has(c.module_key as string)
        ? m.get(c.module_key as string)!
        : (c.default_for_invitees as boolean);
    }
    return { ...u, access };
  });

  return NextResponse.json({ users: enriched, catalog: catalog ?? [] });
}

export async function PATCH(req: NextRequest) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isUserAdmin(sb, user.id))) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  let body: { user_id?: string; module_key?: string; granted?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.user_id || !body.module_key || typeof body.granted !== "boolean") {
    return NextResponse.json({ error: "Need user_id, module_key, granted" }, { status: 400 });
  }

  // Don't allow modifying admin's own grants — admin always has full access
  const { data: target } = await sb.from("users").select("is_admin").eq("id", body.user_id).maybeSingle();
  if (target?.is_admin) {
    return NextResponse.json({ error: "Cannot modify admin permissions" }, { status: 400 });
  }

  const { error } = await sb.from("user_module_permissions").upsert({
    user_id: body.user_id,
    module_key: body.module_key,
    granted: body.granted,
    granted_at: body.granted ? new Date().toISOString() : null,
    granted_by: user.id,
  }, { onConflict: "user_id,module_key" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
