import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveViewer } from "@/lib/auth/permissions";
import { userCanAccessWorkspace } from "@/lib/auth/workspace-access";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest) {
  const sb = await createClient();
  const viewer = await resolveViewer(sb);
  // Read-only viewers (guests) may not mutate PMI data.
  if (viewer.kind !== "admin" && viewer.kind !== "user") {
    return NextResponse.json({ error: "Read-only access" }, { status: 403 });
  }

  let body: { id?: string; progress_pct?: number; title?: string; start_week?: number; end_week?: number };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const admin = createAdminClient();

  // SECURITY: verify the task belongs to a workspace the user can edit before
  // mutating it via the RLS-bypassing admin client.
  const { data: task } = await admin.from("pmi_tasks").select("id, playbook_id").eq("id", body.id).maybeSingle();
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  const { data: pb } = await admin.from("pmi_playbooks").select("workspace_id").eq("id", (task as any).playbook_id).maybeSingle();
  if (!pb || !(await userCanAccessWorkspace(viewer.userId, (pb as any).workspace_id, { write: true }))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const patch: any = {};
  if (typeof body.progress_pct === "number") patch.progress_pct = Math.max(0, Math.min(100, body.progress_pct));
  if (body.title) patch.title = body.title.slice(0, 200);
  if (typeof body.start_week === "number") patch.start_week = Math.max(1, Math.min(40, body.start_week));
  if (typeof body.end_week === "number")   patch.end_week   = Math.max(1, Math.min(40, body.end_week));

  const { error } = await admin.from("pmi_tasks").update(patch).eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
