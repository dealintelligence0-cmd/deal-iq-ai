/**
 * POST /api/signals/scan
 *
 * Body: { watchlist_id?: string, max_filings_per_company?: number, lookback_days?: number }
 *
 * Triggers a scan run. If watchlist_id is provided, scans only that company.
 * Otherwise scans all active watchlist entries for the user.
 *
 * Uses smart-tier key (fallback to economic/fast) for signal extraction.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveKey } from "@/lib/ai/key-resolver";
import { scanSignals } from "@/lib/signals/scan";
import type { ProviderId } from "@/lib/ai/providers";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { watchlist_id?: string; max_filings_per_company?: number; lookback_days?: number };
  try { body = await req.json(); } catch { body = {}; }

  const admin = createAdminClient();
  let resolved = await resolveKey(admin, user.id, "smart");
  if (!resolved?.apiKey) resolved = await resolveKey(admin, user.id, "economic");
  if (!resolved?.apiKey) resolved = await resolveKey(admin, user.id, "fast");
  if (!resolved?.apiKey || !resolved.provider) {
    return NextResponse.json({
      error: "No AI key configured. Add one in Settings → API Key Library.",
    }, { status: 400 });
  }

  const routeConfig = {
    tier: "smart" as const,
    primaryProvider: resolved.provider as ProviderId,
    primaryKey: resolved.apiKey,
    primaryModel: resolved.model ?? undefined,
  };

  try {
    const result = await scanSignals(sb, {
      userId: user.id,
      routeConfig,
      watchlistId: body.watchlist_id,
      maxFilingsPerCompany: body.max_filings_per_company ?? 3,
      lookbackDays: body.lookback_days ?? 180,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Scan failed" }, { status: 500 });
  }
}
