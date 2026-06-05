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

  let body: { id?: string; done?: boolean; notes?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const admin = createAdminClient();

  // SECURITY: verify the checklist item belongs to a workspace the user can edit.
  const { data: item } = await admin.from("pmi_checklist").select("id, playbook_id").eq("id", body.id).maybeSingle();
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });
  const { data: pb } = await admin.from("pmi_playbooks").select("workspace_id").eq("id", (item as any).playbook_id).maybeSingle();
  if (!pb || !(await userCanAccessWorkspace(viewer.userId, (pb as any).workspace_id, { write: true }))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const patch: any = {};
  if (typeof body.done === "boolean") patch.done = body.done;
  if (typeof body.notes === "string")  patch.notes = body.notes.slice(0, 500);

  const { error } = await admin.from("pmi_checklist").update(patch).eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
