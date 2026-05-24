/**
 * GET /api/signals
 *
 * Query params:
 *   watchlist_id  — filter to one company
 *   severity      — min severity (low|medium|high|critical)
 *   status        — active (default) | dismissed | resolved
 *   signal_type   — filter to one type
 *   limit         — default 50
 *
 * Returns signals with their parent company info, ordered by severity then date.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveDataOwner } from "@/lib/auth/data-owner";

export const runtime = "nodejs";

const SEVERITY_RANK: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };

export async function GET(req: NextRequest) {
  const sb = await createClient();
  const owner = await resolveDataOwner(sb);
  if (!owner.ok) return NextResponse.json({ error: owner.error }, { status: owner.status });

  const admin = createAdminClient();
  const url = new URL(req.url);
  const watchlistId = url.searchParams.get("watchlist_id");
  const severity = url.searchParams.get("severity");
  const status = url.searchParams.get("status") ?? "active";
  const signalType = url.searchParams.get("signal_type");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10), 200);

  let q = admin.from("executive_signals")
    .select("id, watchlist_id, filing_id, signal_type, category, severity, confidence, headline, evidence_quote, evidence_page, context, pitch_angle, advisory_angle, target_focus, signal_ref, status, created_at, watchlist_companies!inner(id, company_name, ticker, sector, country)")
    .eq("created_by", owner.ownerId)
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (watchlistId) q = q.eq("watchlist_id", watchlistId);
  if (signalType)  q = q.eq("signal_type", signalType);
  const category = url.searchParams.get("category");
  if (category) q = q.eq("category", category);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let signals = data ?? [];
  if (severity) {
    const minRank = SEVERITY_RANK[severity] ?? 0;
    signals = signals.filter((s) => (SEVERITY_RANK[s.severity as string] ?? 0) >= minRank);
  }
  signals.sort((a, b) => {
    const sa = SEVERITY_RANK[a.severity as string] ?? 0;
    const sb2 = SEVERITY_RANK[b.severity as string] ?? 0;
    if (sa !== sb2) return sb2 - sa;
    return (b.created_at as string).localeCompare(a.created_at as string);
  });

  const { data: lastRun } = await admin
    .from("signal_scan_runs")
    .select("status, started_at, completed_at, signals_extracted, companies_scanned, error")
    .eq("created_by", owner.ownerId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({ signals, lastRun, isReadOnly: owner.isReadOnly });
}
