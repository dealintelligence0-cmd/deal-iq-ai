/**
 * GET   /api/admin/users          → rows = [admin] + [guest session per active invite]
 * PATCH /api/admin/users          → body: { invite_id, module_key, granted } — flips module_access JSONB
 *
 * Admin-only. Uses service-role client to bypass RLS for cross-table read.
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

  // The admin user
  const { data: adminUser } = await admin
    .from("users")
    .select("id, email, created_at")
    .eq("id", viewer.userId)
    .maybeSingle();

  // Module catalogue
  const { data: catalog } = await admin
    .from("module_catalog")
    .select("module_key, display_name, category, default_for_invitees, sort_order")
    .order("sort_order");

  // Build the admin row — full access, can't be modified
  const adminRow = adminUser ? {
    kind: "admin" as const,
    id: adminUser.id,
    email: adminUser.email,
    created_at: adminUser.created_at,
    is_admin: true,
    access: Object.fromEntries((catalog ?? []).map((c) => [c.module_key, true])),
    invite_id: null,
    signup_count: null,
  } : null;

  // Guest session row — the single active invite link (if any)
  const { data: activeInvite } = await admin
    .from("admin_invite_links")
    .select("id, token, module_access, created_at, signup_count")
    .eq("is_active", true)
    .maybeSingle();

  const guestRow = activeInvite ? {
    kind: "guest" as const,
    id: "guest_" + activeInvite.id,
    email: `Guest session (${activeInvite.signup_count} visit${activeInvite.signup_count !== 1 ? "s" : ""})`,
    created_at: activeInvite.created_at,
    is_admin: false,
    access: Object.fromEntries(
      (catalog ?? []).map((c) => [
        c.module_key,
        Object.prototype.hasOwnProperty.call(activeInvite.module_access ?? {}, c.module_key)
          ? (activeInvite.module_access as Record<string, boolean>)[c.module_key] === true
          : (c.default_for_invitees as boolean),
      ])
    ),
    invite_id: activeInvite.id,
    signup_count: activeInvite.signup_count,
  } : null;

  const users = [adminRow, guestRow].filter(Boolean);

  return NextResponse.json({ users, catalog: catalog ?? [] });
}

export async function PATCH(req: NextRequest) {
  const sb = await createClient();
  const viewer = await resolveViewer(sb);
  if (viewer.kind !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  let body: { invite_id?: string; module_key?: string; granted?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.invite_id || !body.module_key || typeof body.granted !== "boolean") {
    return NextResponse.json({ error: "Need invite_id, module_key, granted" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Read current module_access for the invite, merge the new flag, write back
  const { data: current, error: rErr } = await admin
    .from("admin_invite_links")
    .select("module_access")
    .eq("id", body.invite_id)
    .maybeSingle();
  if (rErr || !current) return NextResponse.json({ error: "Invite not found" }, { status: 404 });

  const merged = { ...(current.module_access as Record<string, boolean> ?? {}), [body.module_key]: body.granted };
  const { error: wErr } = await admin
    .from("admin_invite_links")
    .update({ module_access: merged })
    .eq("id", body.invite_id);
  if (wErr) return NextResponse.json({ error: wErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
