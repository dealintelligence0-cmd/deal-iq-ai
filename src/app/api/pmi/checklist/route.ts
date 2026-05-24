import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveViewer } from "@/lib/auth/permissions";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest) {
  const sb = await createClient();
  const viewer = await resolveViewer(sb);
  if (viewer.kind === "none") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { id?: string; done?: boolean; notes?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const patch: any = {};
  if (typeof body.done === "boolean") patch.done = body.done;
  if (typeof body.notes === "string")  patch.notes = body.notes.slice(0, 500);

  const admin = createAdminClient();
  const { error } = await admin.from("pmi_checklist").update(patch).eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
