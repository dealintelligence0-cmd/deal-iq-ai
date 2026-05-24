/**
 * GET /api/boltons/shortlists      → list all user shortlists (header only)
 * GET /api/boltons/shortlists?id=X → fetch one shortlist with all targets
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveDataOwner } from "@/lib/auth/data-owner";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sb = await createClient();
  const owner = await resolveDataOwner(sb);
  if (!owner.ok) return NextResponse.json({ error: owner.error }, { status: owner.status });

  const admin = createAdminClient();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  if (id) {
    const { data: shortlist, error: sErr } = await admin
      .from("bolt_on_shortlists")
      .select("*, buyer_profiles(id, total_deals, deals_last_24m, primary_sectors, primary_geographies, typical_deal_band, acquisition_thesis)")
      .eq("id", id)
      .eq("created_by", owner.ownerId)
      .maybeSingle();
    if (sErr || !shortlist) return NextResponse.json({ error: sErr?.message ?? "Not found" }, { status: 404 });

    const { data: targets, error: tErr } = await admin
      .from("bolt_on_targets")
      .select("*")
      .eq("shortlist_id", id)
      .order("rank_position", { ascending: true });
    if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });

    return NextResponse.json({ shortlist, targets: targets ?? [] });
  }

  const { data: shortlists, error } = await admin
    .from("bolt_on_shortlists")
    .select("id, buyer_name, request_brief, target_tier, total_targets, ai_provider, ai_model, cost_usd, status, created_at, refreshed_at")
    .eq("created_by", owner.ownerId)
    .eq("status", "active")
    .order("refreshed_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ shortlists: shortlists ?? [], isReadOnly: owner.isReadOnly });
}
