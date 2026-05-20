/**
 * GET    /api/admin/invite        → current active invite + history
 * POST   /api/admin/invite        → generate new link (auto-invalidates previous)
 * DELETE /api/admin/invite        → invalidate active link, no replacement
 *
 * Admin only.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveViewer } from "@/lib/auth/permissions";
import { randomBytes } from "crypto";

export const runtime = "nodejs";

function makeToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function GET() {
  const sb = await createClient();
  const viewer = await resolveViewer(sb);
  if (viewer.kind !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const admin = createAdminClient();
  const { data: active } = await admin
    .from("admin_invite_links")
    .select("id, token, created_at, signup_count, module_access")
    .eq("is_active", true)
    .maybeSingle();
  const { data: history } = await admin
    .from("admin_invite_links")
    .select("id, created_at, invalidated_at, signup_count, is_active")
    .order("created_at", { ascending: false })
    .limit(10);

  return NextResponse.json({ active: active ?? null, history: history ?? [] });
}

export async function POST() {
  const sb = await createClient();
  const viewer = await resolveViewer(sb);
  if (viewer.kind !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const admin = createAdminClient();

  // Build default module_access map — all non-admin modules ON
  const { data: catalog } = await admin
    .from("module_catalog")
    .select("module_key, default_for_invitees");
  const defaultAccess: Record<string, boolean> = {};
  for (const c of catalog ?? []) {
    defaultAccess[c.module_key as string] = c.default_for_invitees as boolean;
  }

  const { data, error } = await admin
    .from("admin_invite_links")
    .insert({
      token: makeToken(),
      created_by: viewer.userId,
      is_active: true,
      module_access: defaultAccess,
    })
    .select("id, token, created_at, module_access")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, link: data });
}

export async function DELETE() {
  const sb = await createClient();
  const viewer = await resolveViewer(sb);
  if (viewer.kind !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const admin = createAdminClient();
  const { error } = await admin
    .from("admin_invite_links")
    .update({ is_active: false, invalidated_at: new Date().toISOString() })
    .eq("is_active", true);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
