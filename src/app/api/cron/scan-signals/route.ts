/**
 * GET /api/cron/scan-signals
 *
 * Vercel cron — runs daily at 03:00 UTC. For every user with at least one
 * AI key and one active watchlist company, runs a signal scan.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveKey } from "@/lib/ai/key-resolver";
import { scanSignals } from "@/lib/signals/scan";
import type { ProviderId } from "@/lib/ai/providers";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  // Fail closed: in production a missing/blank CRON_SECRET means the endpoint
  // is unauthenticated — reject rather than run service-role loops for all users.
  const authHeader = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
    }
  } else if (authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Find users with at least one active watchlist row
  const { data: rows } = await admin
    .from("watchlist_companies")
    .select("created_by")
    .eq("is_active", true);
  if (!rows) return NextResponse.json({ ok: true, processed: 0, summary: [] });

  const uniqueUsers = Array.from(new Set(rows.map((r) => r.created_by as string)));
  const summary: Array<{ user: string; status: string; signals?: number; error?: string }> = [];

  for (const userId of uniqueUsers) {
    try {
      let resolved = await resolveKey(admin, userId, "smart");
      if (!resolved?.apiKey) resolved = await resolveKey(admin, userId, "economic");
      if (!resolved?.apiKey) resolved = await resolveKey(admin, userId, "fast");
      if (!resolved?.apiKey || !resolved.provider) {
        summary.push({ user: userId, status: "no_key" });
        continue;
      }

      const result = await scanSignals(admin, {
        userId,
        routeConfig: {
          tier: "smart",
          primaryProvider: resolved.provider as ProviderId,
          primaryKey: resolved.apiKey,
          primaryModel: resolved.model ?? undefined,
        },
        maxFilingsPerCompany: 2,   // small cap for cron
        lookbackDays: 90,
      });
      summary.push({
        user: userId,
        status: "ok",
        signals: result.signals_extracted,
      });
    } catch (e: any) {
      summary.push({ user: userId, status: "error", error: e?.message ?? "unknown" });
    }
  }

  return NextResponse.json({ ok: true, processed: uniqueUsers.length, summary });
}
