/**
 * GET /api/advisors
 *
 * Returns the four artefacts for the Advisor Ecosystem dashboard:
 *   - leaderboard:   advisor leaderboard sorted by deal count
 *   - heatmap:       per-sector advisor activity
 *   - whitespace:    deals with no advisor yet (open opportunities)
 *   - lastRun:       most recent extraction audit row
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [lbR, hmR, wsR, lrR] = await Promise.all([
    sb.from("advisor_leaderboard").select("*").eq("created_by", user.id).order("deal_count", { ascending: false }).limit(40),
    sb.from("advisor_sector_heatmap").select("*").eq("created_by", user.id),
    sb.from("advisor_whitespace_deals").select("id, buyer, target, dominant_sector, dominant_geography, intelligence_size, heading, deal_date")
      .eq("created_by", user.id).order("deal_date", { ascending: false, nullsFirst: false }).limit(50),
    sb.from("advisor_extraction_runs")
      .select("status, started_at, completed_at, deals_scanned, advisors_found, new_advisors, cost_usd, error")
      .eq("created_by", user.id).order("started_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  return NextResponse.json({
    leaderboard: lbR.data ?? [],
    heatmap:     hmR.data ?? [],
    whitespace:  wsR.data ?? [],
    lastRun:     lrR.data ?? null,
  });
}
