/**
 * GET /api/boltons/shortlists      → list all user shortlists (header only)
 * GET /api/boltons/shortlists?id=X → fetch one shortlist with all targets
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  if (id) {
    // Single shortlist with targets
    const { data: shortlist, error: sErr } = await sb
      .from("bolt_on_shortlists")
      .select("*, buyer_profiles(id, total_deals, deals_last_24m, primary_sectors, primary_geographies, typical_deal_band, acquisition_thesis)")
      .eq("id", id)
      .maybeSingle();
    if (sErr || !shortlist) return NextResponse.json({ error: sErr?.message ?? "Not found" }, { status: 404 });

    const { data: targets, error: tErr } = await sb
      .from("bolt_on_targets")
      .select("*")
      .eq("shortlist_id", id)
      .order("rank_position", { ascending: true });
    if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });

    return NextResponse.json({ shortlist, targets: targets ?? [] });
  }

  // List all shortlists
  const { data: shortlists, error } = await sb
    .from("bolt_on_shortlists")
    .select("id, buyer_name, request_brief, target_tier, total_targets, ai_provider, ai_model, cost_usd, status, created_at, refreshed_at")
    .eq("status", "active")
    .order("refreshed_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ shortlists: shortlists ?? [] });
}
