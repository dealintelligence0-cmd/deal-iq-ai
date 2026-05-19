import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { status?: "dismissed" | "resolved" | "active"; reason?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.status) return NextResponse.json({ error: "status required" }, { status: 400 });

  const patch: Record<string, unknown> = { status: body.status };
  if (body.status === "dismissed") {
    patch.dismissed_at = new Date().toISOString();
    if (body.reason) patch.dismissed_reason = body.reason;
  }
  const { error } = await sb.from("executive_signals").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
