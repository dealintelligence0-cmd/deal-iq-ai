/**
 * GET /api/themes — list active themes ranked by heat/deal_count
 *
 * Guests see the admin's themes (same as dashboard).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveDataOwner } from "@/lib/auth/data-owner";

export const runtime = "nodejs";

export async function GET(_req: NextRequest) {
  const sb = await createClient();
  const owner = await resolveDataOwner(sb);
  if (!owner.ok) return NextResponse.json({ error: owner.error }, { status: owner.status });

  const admin = createAdminClient();
  const { data: themes, error } = await admin
    .from("themes")
    .select("id, slug, display_name, emoji, strategic_summary, why_it_matters, drivers, likely_next_targets, pitch_hypothesis, consulting_angle, deal_count, total_value_usd, active_buyers, sectors, geographies, heat, last_refreshed_at")
    .eq("created_by", owner.ownerId)
    .eq("status", "active")
    .order("heat", { ascending: true })
    .order("deal_count", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const heatRank: Record<string, number> = { hot: 0, warm: 1, cool: 2 };
  const sorted = (themes ?? []).sort((a, b) => {
    const r = (heatRank[a.heat as string] ?? 1) - (heatRank[b.heat as string] ?? 1);
    return r !== 0 ? r : (b.deal_count - a.deal_count);
  });

  const { data: lastRun } = await admin
    .from("theme_refresh_runs")
    .select("status, completed_at, started_at, clusters_created, embeddings_added, error")
    .eq("created_by", owner.ownerId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    themes: sorted,
    lastRun,
    totalActive: sorted.length,
    isReadOnly: owner.isReadOnly,
  });
}
