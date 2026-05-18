/**
 * GET  /api/themes              → list active themes ranked by heat/deal_count
 * POST /api/themes/refresh      → trigger a refresh run (manual or cron)
 * GET  /api/themes/[id]         → single theme detail + member deals
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(_req: NextRequest) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: themes, error } = await sb
    .from("themes")
    .select("id, slug, display_name, emoji, strategic_summary, why_it_matters, drivers, likely_next_targets, pitch_hypothesis, consulting_angle, deal_count, total_value_usd, active_buyers, sectors, geographies, heat, last_refreshed_at")
    .eq("status", "active")
    .order("heat", { ascending: true })   // hot first alphabetically by accident — fix with rank
    .order("deal_count", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Sort: hot > warm > cool, then by deal_count
  const heatRank: Record<string, number> = { hot: 0, warm: 1, cool: 2 };
  const sorted = (themes ?? []).sort((a, b) => {
    const r = (heatRank[a.heat as string] ?? 1) - (heatRank[b.heat as string] ?? 1);
    return r !== 0 ? r : (b.deal_count - a.deal_count);
  });

  const { data: lastRun } = await sb
    .from("theme_refresh_runs")
    .select("status, completed_at, started_at, clusters_created, embeddings_added, error")
    .eq("created_by", user.id)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    themes: sorted,
    lastRun,
    totalActive: sorted.length,
  });
}
