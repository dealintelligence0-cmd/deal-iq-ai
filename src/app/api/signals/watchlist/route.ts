/**
 * GET  /api/signals/watchlist          → list user's watchlist
 * POST /api/signals/watchlist          → add a company { company_name, ticker?, cik?, sector?, country?, notes? }
 *
 * Company can be added via name+ticker (US, will resolve CIK on first scan)
 * or name+CIK directly. Sector/country are optional.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await sb
    .from("watchlist_companies")
    .select("id, company_name, ticker, cik, sector, country, is_active, notes, last_scanned_at, created_at")
    .order("company_name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Annotate with signal counts (active signals only)
  const ids = (data ?? []).map((c) => c.id as string);
  if (ids.length === 0) return NextResponse.json({ companies: [] });

  const { data: counts } = await sb
    .from("executive_signals")
    .select("watchlist_id, severity")
    .in("watchlist_id", ids)
    .eq("status", "active");

  const countMap = new Map<string, { total: number; high: number; critical: number }>();
  for (const row of counts ?? []) {
    const id = row.watchlist_id as string;
    const c = countMap.get(id) ?? { total: 0, high: 0, critical: 0 };
    c.total++;
    if (row.severity === "high") c.high++;
    else if (row.severity === "critical") c.critical++;
    countMap.set(id, c);
  }

  return NextResponse.json({
    companies: (data ?? []).map((c) => ({
      ...c,
      signal_count: countMap.get(c.id as string)?.total ?? 0,
      high_severity_count: countMap.get(c.id as string)?.high ?? 0,
      critical_severity_count: countMap.get(c.id as string)?.critical ?? 0,
    })),
  });
}

export async function POST(req: NextRequest) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { company_name?: string; ticker?: string; cik?: string; sector?: string; country?: string; notes?: string; related_deal_id?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.company_name?.trim()) return NextResponse.json({ error: "company_name required" }, { status: 400 });

  const { data, error } = await sb.from("watchlist_companies").insert({
    created_by: user.id,
    company_name: body.company_name.trim(),
    ticker: body.ticker?.trim().toUpperCase() || null,
    cik: body.cik?.trim().padStart(10, "0") || null,
    sector: body.sector?.trim() || null,
    country: body.country?.trim() || null,
    notes: body.notes?.trim() || null,
    related_deal_id: body.related_deal_id || null,
    added_via: body.related_deal_id ? "deal_import" : "manual",
  }).select().single();

  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "Company already on watchlist" }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, company: data });
}
