/**
 * GET   /api/admin/users          → rows = [admin] + [all regular users] + [guest session]
 * PATCH /api/admin/users          → toggle a module:
 *                                    body for regular user:  { user_id, module_key, granted }
 *                                    body for guest session: { invite_id, module_key, granted }
 *
 * Admin-only via service-role client (bypasses RLS).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveViewer } from "@/lib/auth/permissions";

export const runtime = "nodejs";

export async function GET() {
  const sb = await createClient();
  const viewer = await resolveViewer(sb);
  if (viewer.kind !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const admin = createAdminClient();

  // All users
  const { data: users } = await admin
    .from("users")
    .select("id, email, is_admin, created_at")
    .order("is_admin", { ascending: false })
    .order("created_at");

  // Module catalogue
  const { data: catalog } = await admin
    .from("module_catalog")
    .select("module_key, display_name, category, default_for_invitees, sort_order")
    .order("sort_order");
  const catalogKeys = (catalog ?? []).map((c) => c.module_key as string);

  // All user permissions
  const { data: perms } = await admin
    .from("user_module_permissions")
    .select("user_id, module_key, granted");
  const permsByUser = new Map<string, Map<string, boolean>>();
  for (const p of perms ?? []) {
    const m = permsByUser.get(p.user_id as string) ?? new Map<string, boolean>();
    m.set(p.module_key as string, p.granted as boolean);
    permsByUser.set(p.user_id as string, m);
  }

  // Build user rows
  const userRows = (users ?? []).map((u) => {
    const userPerms = permsByUser.get(u.id as string) ?? new Map<string, boolean>();
    const access: Record<string, boolean> = {};
    for (const c of catalog ?? []) {
      if (u.is_admin) {
        access[c.module_key as string] = true;
      } else {
        access[c.module_key as string] = userPerms.has(c.module_key as string)
          ? userPerms.get(c.module_key as string)!
          : (c.default_for_invitees as boolean);
      }
    }
    return {
      kind: u.is_admin ? ("admin" as const) : ("user" as const),
      id: u.id,
      email: u.email,
      is_admin: u.is_admin as boolean,
      created_at: u.created_at,
      access,
      user_id: u.id,
      invite_id: null,
      signup_count: null,
    };
  });

  // Active guest invite link as a virtual row
  const { data: activeInvite } = await admin
    .from("admin_invite_links")
    .select("id, module_access, created_at, signup_count")
    .eq("is_active", true)
    .maybeSingle();
  const guestRow = activeInvite ? {
    kind: "guest" as const,
    id: "guest_" + activeInvite.id,
    email: `Guest session (${activeInvite.signup_count} visit${activeInvite.signup_count !== 1 ? "s" : ""})`,
    is_admin: false,
    created_at: activeInvite.created_at,
    access: Object.fromEntries(
      catalogKeys.map((k) => {
        const ma = (activeInvite.module_access ?? {}) as Record<string, boolean>;
        if (Object.prototype.hasOwnProperty.call(ma, k)) return [k, ma[k] === true];
        const c = (catalog ?? []).find((x) => x.module_key === k);
        return [k, c?.default_for_invitees ?? false];
      })
    ),
    user_id: null,
    invite_id: activeInvite.id,
    signup_count: activeInvite.signup_count,
  } : null;

  const allRows = guestRow ? [...userRows, guestRow] : userRows;
  return NextResponse.json({ users: allRows, catalog: catalog ?? [] });
}

export async function PATCH(req: NextRequest) {
  const sb = await createClient();
  const viewer = await resolveViewer(sb);
  if (viewer.kind !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  let body: { user_id?: string; invite_id?: string; module_key?: string; granted?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.module_key || typeof body.granted !== "boolean") {
    return NextResponse.json({ error: "module_key + granted required" }, { status: 400 });
  }

  const admin = createAdminClient();

  if (body.invite_id) {
    // Toggle module on the guest invite link
    const { data: current } = await admin
      .from("admin_invite_links")
      .select("module_access")
      .eq("id", body.invite_id)
      .maybeSingle();
    if (!current) return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    const merged = { ...(current.module_access as Record<string, boolean> ?? {}), [body.module_key]: body.granted };
    const { error } = await admin
      .from("admin_invite_links")
      .update({ module_access: merged })
      .eq("id", body.invite_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.user_id) {
    // Toggle module for a regular user
    const { data: target } = await admin.from("users").select("is_admin").eq("id", body.user_id).maybeSingle();
    if (target?.is_admin) {
      return NextResponse.json({ error: "Cannot modify admin permissions" }, { status: 400 });
    }
    const { error } = await admin.from("user_module_permissions").upsert({
      user_id: body.user_id,
      module_key: body.module_key,
      granted: body.granted,
      granted_at: body.granted ? new Date().toISOString() : null,
      granted_by: viewer.userId,
    }, { onConflict: "user_id,module_key" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Need user_id or invite_id" }, { status: 400 });
}
