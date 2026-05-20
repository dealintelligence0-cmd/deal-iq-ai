import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveViewer } from "@/lib/auth/permissions";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const sb = await createClient();
  const viewer = await resolveViewer(sb);
  if (viewer.kind !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  let body: { workspace_id?: string; user_id?: string; role?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.workspace_id || !body.user_id) return NextResponse.json({ error: "workspace_id + user_id required" }, { status: 400 });

  const role = ["owner","editor","viewer"].includes(body.role ?? "") ? body.role! : "viewer";
  const admin = createAdminClient();
  const { error } = await admin.from("workspace_members").upsert({
    workspace_id: body.workspace_id,
    user_id: body.user_id,
    role,
    added_by: viewer.userId,
  }, { onConflict: "workspace_id,user_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const sb = await createClient();
  const viewer = await resolveViewer(sb);
  if (viewer.kind !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  let body: { id?: string; role?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.id || !["owner","editor","viewer"].includes(body.role ?? "")) {
    return NextResponse.json({ error: "id + valid role required" }, { status: 400 });
  }
  const admin = createAdminClient();
  const { error } = await admin.from("workspace_members").update({ role: body.role }).eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const sb = await createClient();
  const viewer = await resolveViewer(sb);
  if (viewer.kind !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from("workspace_members").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
