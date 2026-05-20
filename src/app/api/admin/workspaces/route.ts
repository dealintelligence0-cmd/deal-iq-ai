/**
 * Admin-only workspace + member management.
 *
 * GET    /api/admin/workspaces       → list ALL workspaces with member counts
 * POST   /api/admin/workspaces       → create workspace { name }
 * DELETE /api/admin/workspaces?id=X  → delete workspace
 *
 * POST  /api/admin/workspaces/members  → add member { workspace_id, user_id, role }
 * PATCH /api/admin/workspaces/members  → change role { id, role }
 * DELETE /api/admin/workspaces/members?id=X → remove member
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveViewer } from "@/lib/auth/permissions";

export const runtime = "nodejs";

export async function GET() {
  const sb = await createClient();
  const viewer = await resolveViewer(sb);
  if (viewer.kind !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const admin = createAdminClient();

  // All workspaces
  const { data: workspaces } = await admin
    .from("workspaces")
    .select("id, name, slug, created_by, is_personal, created_at")
    .order("is_personal", { ascending: false })
    .order("created_at");

  // All members with user info
  const { data: members } = await admin
    .from("workspace_members")
    .select("id, workspace_id, user_id, role, added_at, users!inner(email)");

  // All users (so admin can add anyone as a member)
  const { data: users } = await admin
    .from("users")
    .select("id, email, is_admin")
    .order("email");

  return NextResponse.json({
    workspaces: workspaces ?? [],
    members:    members ?? [],
    users:      users ?? [],
  });
}

export async function POST(req: NextRequest) {
  const sb = await createClient();
  const viewer = await resolveViewer(sb);
  if (viewer.kind !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  let body: { name?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });

  const admin = createAdminClient();
  const slug = body.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50)
    + "-" + Math.random().toString(36).slice(2, 6);

  const { data, error } = await admin.from("workspaces").insert({
    name: body.name.trim(),
    slug,
    created_by: viewer.userId,
    is_personal: false,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Make admin an owner
  await admin.from("workspace_members").insert({
    workspace_id: (data as any).id,
    user_id: viewer.userId,
    role: "owner",
    added_by: viewer.userId,
  });

  return NextResponse.json({ ok: true, workspace: data });
}

export async function DELETE(req: NextRequest) {
  const sb = await createClient();
  const viewer = await resolveViewer(sb);
  if (viewer.kind !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const admin = createAdminClient();

  // Don't allow deleting personal workspaces
  const { data: ws } = await admin.from("workspaces").select("is_personal").eq("id", id).maybeSingle();
  if (ws?.is_personal) {
    return NextResponse.json({ error: "Cannot delete a personal workspace" }, { status: 400 });
  }

  const { error } = await admin.from("workspaces").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
