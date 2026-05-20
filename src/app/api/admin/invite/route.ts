/**
 * GET   /api/admin/invite        → return the current active invite link (or null)
 * POST  /api/admin/invite        → generate a new link; auto-invalidates the previous active one
 * DELETE /api/admin/invite       → invalidate the active link (no replacement)
 *
 * Admin only.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isUserAdmin } from "@/lib/auth/permissions";
import { randomBytes } from "crypto";

export const runtime = "nodejs";

function makeToken(): string {
  // URL-safe random token, ~43 chars
  return randomBytes(32).toString("base64url");
}

export async function GET() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isUserAdmin(sb, user.id))) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { data: active } = await sb
    .from("admin_invite_links")
    .select("id, token, created_at, signup_count")
    .eq("is_active", true)
    .maybeSingle();

  const { data: history } = await sb
    .from("admin_invite_links")
    .select("id, created_at, invalidated_at, signup_count, is_active")
    .order("created_at", { ascending: false })
    .limit(10);

  return NextResponse.json({ active: active ?? null, history: history ?? [] });
}

export async function POST() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isUserAdmin(sb, user.id))) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  // Insert new active link — trigger will auto-invalidate any previous active row
  const { data, error } = await sb
    .from("admin_invite_links")
    .insert({
      token: makeToken(),
      created_by: user.id,
      is_active: true,
    })
    .select("id, token, created_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, link: data });
}

export async function DELETE() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isUserAdmin(sb, user.id))) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { error } = await sb
    .from("admin_invite_links")
    .update({ is_active: false, invalidated_at: new Date().toISOString() })
    .eq("is_active", true);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
