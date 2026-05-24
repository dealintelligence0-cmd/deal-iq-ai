import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveViewer } from "@/lib/auth/permissions";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest) {
  const sb = await createClient();
  const viewer = await resolveViewer(sb);
  if (viewer.kind === "none") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { id?: string; progress_pct?: number; title?: string; start_week?: number; end_week?: number };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const patch: any = {};
  if (typeof body.progress_pct === "number") patch.progress_pct = Math.max(0, Math.min(100, body.progress_pct));
  if (body.title) patch.title = body.title.slice(0, 200);
  if (typeof body.start_week === "number") patch.start_week = Math.max(1, Math.min(40, body.start_week));
  if (typeof body.end_week === "number")   patch.end_week   = Math.max(1, Math.min(40, body.end_week));

  const admin = createAdminClient();
  const { error } = await admin.from("pmi_tasks").update(patch).eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
