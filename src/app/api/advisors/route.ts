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
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveDataOwner } from "@/lib/auth/data-owner";

export const runtime = "nodejs";

export async function GET() {
  const sb = await createClient();
  const owner = await resolveDataOwner(sb);
  if (!owner.ok) return NextResponse.json({ error: owner.error }, { status: owner.status });

  const admin = createAdminClient();
  const [lbR, hmR, wsR, lrR] = await Promise.all([
    admin.from("advisor_leaderboard").select("*").eq("created_by", owner.ownerId).order("deal_count", { ascending: false }).limit(40),
    admin.from("advisor_sector_heatmap").select("*").eq("created_by", owner.ownerId),
    admin.from("advisor_whitespace_deals").select("id, buyer, target, dominant_sector, dominant_geography, intelligence_size, heading, deal_date")
      .eq("created_by", owner.ownerId).order("deal_date", { ascending: false, nullsFirst: false }).limit(50),
    admin.from("advisor_extraction_runs")
      .select("status, started_at, completed_at, deals_scanned, advisors_found, new_advisors, cost_usd, error")
      .eq("created_by", owner.ownerId).order("started_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  return NextResponse.json({
    leaderboard: lbR.data ?? [],
    heatmap:     hmR.data ?? [],
    whitespace:  wsR.data ?? [],
    lastRun:     lrR.data ?? null,
    isReadOnly:  owner.isReadOnly,
  });
}
