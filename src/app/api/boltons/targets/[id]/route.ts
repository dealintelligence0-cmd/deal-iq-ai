/**
 * PATCH /api/boltons/targets/[id]
 *
 * Body: { status?: "shortlisted"|"pursued"|"dismissed", partner_notes?: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { status?: string; partner_notes?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const patch: Record<string, unknown> = {};
  if (body.status && ["shortlisted","pursued","dismissed"].includes(body.status)) patch.status = body.status;
  if (body.partner_notes !== undefined) patch.partner_notes = body.partner_notes;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "no valid fields" }, { status: 400 });

  const { error } = await sb.from("bolt_on_targets").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
