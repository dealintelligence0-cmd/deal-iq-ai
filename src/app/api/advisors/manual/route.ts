/**
 * POST /api/advisors/manual
 *
 * Body: { canonical_id, advisor_id?, advisor_name?, role, side?, notes? }
 * Either advisor_id (use existing registry row) OR advisor_name (creates a new row).
 *
 * Sets confidence = 1.0 and source = 'manual' — overrides AI inferences.
 *
 * DELETE /api/advisors/manual?id=DEAL_ADVISOR_ID — removes a relationship
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: {
    canonical_id?: string;
    advisor_id?: string;
    advisor_name?: string;
    role?: string;
    side?: string;
    notes?: string;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.canonical_id) return NextResponse.json({ error: "canonical_id required" }, { status: 400 });
  if (!body.advisor_id && !body.advisor_name) {
    return NextResponse.json({ error: "advisor_id or advisor_name required" }, { status: 400 });
  }

  let advisorId = body.advisor_id;
  if (!advisorId && body.advisor_name) {
    // Look up or create
    const displayName = body.advisor_name.trim();
    const key = displayName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80);
    if (!key) return NextResponse.json({ error: "Invalid advisor_name" }, { status: 400 });

    const { data: existing } = await sb.from("advisor_registry").select("id").eq("name", key).maybeSingle();
    if (existing) {
      advisorId = existing.id as string;
    } else {
      const { data: inserted, error: insErr } = await sb.from("advisor_registry")
        .insert({ name: key, display_name: displayName, tier: "other", is_seeded: false })
        .select("id").single();
      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
      advisorId = (inserted as { id: string }).id;
    }
  }

  const role = ["buyer_advisor","target_advisor","lender","legal","unknown"].includes(body.role ?? "")
    ? body.role! : "unknown";
  const side = ["buy","sell","both"].includes(body.side ?? "") ? body.side : null;

  const { error } = await sb.from("deal_advisors").upsert({
    canonical_id: body.canonical_id,
    advisor_id: advisorId,
    created_by: user.id,
    role,
    side,
    confidence: 1.0,
    source: "manual",
    notes: body.notes ?? null,
  }, { onConflict: "canonical_id,advisor_id,role" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await sb.from("deal_advisors").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
