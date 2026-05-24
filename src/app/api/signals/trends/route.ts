/**
 * GET /api/signals/trends
 *
 * Returns aggregated signal trends per company × signal_type with windowed counts.
 * Highlights companies showing acceleration ("3 margin pressure signals in 6 months").
 *
 * Response includes a derived "acceleration" flag for trends where the 30-day
 * count is high relative to the 180-day count — meaning signals are recent
 * and clustering rather than spread out.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveDataOwner } from "@/lib/auth/data-owner";

export const runtime = "nodejs";

const SIGNAL_LABELS: Record<string, string> = {
  margin_pressure: "💸 Margin Pressure",
  transformation_pressure: "🔧 Transformation Pressure",
  activist_activity: "⚔️ Activist Activity",
  acquisition_intent: "🎯 Acquisition Intent",
  leadership_change: "👤 Leadership Change",
};

export async function GET() {
  const sb = await createClient();
  const owner = await resolveDataOwner(sb);
  if (!owner.ok) return NextResponse.json({ error: owner.error }, { status: owner.status });

  const admin = createAdminClient();
  // signal_trends is a view over executive_signals + watchlist_companies. To scope
  // to the owner's data, we join through watchlist_companies.created_by.
  const { data: ownerWatchlist } = await admin
    .from("watchlist_companies").select("id").eq("created_by", owner.ownerId);
  const wlIds = (ownerWatchlist ?? []).map((w) => w.id as string);

  if (wlIds.length === 0) return NextResponse.json({ trends: [], isReadOnly: owner.isReadOnly });

  const { data, error } = await admin
    .from("signal_trends")
    .select("*")
    .in("watchlist_id", wlIds)
    .order("signals_180d", { ascending: false })
    .order("signals_30d", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const trends = (data ?? []).map((t: any) => {
    const s30 = t.signals_30d ?? 0;
    const s90 = t.signals_90d ?? 0;
    const s180 = t.signals_180d ?? 0;
    const accelerating = s180 >= 3 && s30 / Math.max(s180, 1) >= 0.5;
    const sustained = s180 >= 3 && s90 >= 2 && !accelerating;
    return {
      ...t,
      label: SIGNAL_LABELS[t.signal_type as string] ?? t.signal_type,
      accelerating,
      sustained,
      pattern: accelerating ? "accelerating" : sustained ? "sustained" : "single",
    };
  });

  return NextResponse.json({ trends, isReadOnly: owner.isReadOnly });
}
