/**
 * GET /api/keepalive
 *
 * WHY THIS EXISTS
 * Supabase pauses a free-tier project that does not receive enough database
 * activity. A paused project takes the whole app down until someone restores it
 * by hand. This endpoint issues real database queries so the project stays active
 * without anyone opening the site.
 *
 * THE RULE IS A DAILY VOLUME, NOT A 7-DAY TIMER — DO NOT "OPTIMISE" THE CADENCE
 * Supabase's own guidance: a project is inactive if it lacks "sufficient user
 * database activity over the past week", and "typically a few user requests to the
 * database each day over the previous week is enough to keep the project from being
 * paused". So ONE request every couple of days is not enough, even though it never
 * leaves a 7-day gap. An earlier version of this file pinged once every 2 days —
 * roughly 0.5 requests/day — and the project paused anyway despite every scheduled
 * run reporting success. Hence: several queries per visit, several visits per day.
 *
 * WHY IT DOES NOT REUSE THE EXISTING CRONS
 * /api/cron/refresh-themes and /api/cron/scan-signals both return 503 in
 * production BEFORE they touch Supabase when CRON_SECRET is unset, so neither can
 * be relied on to keep the project awake. They are also both already registered,
 * and the Vercel Hobby plan allows only two cron jobs — so this one is driven by
 * GitHub Actions (.github/workflows/keepalive.yml) instead, which costs no Vercel
 * cron slot and keeps working even if the Vercel plan changes.
 *
 * WHY IT IS SAFE TO LEAVE PUBLIC
 * It uses the ANON key only — never the service role — so it can read exactly
 * what an anonymous visitor could read, which under RLS is nothing. It returns no
 * row data: only whether the database answered. An RLS refusal is a SUCCESS here,
 * because being refused by Postgres proves Postgres ran the query.
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
// Must never be prerendered or cached: a cached response would return 200 while
// sending no traffic to Supabase at all, which is the exact failure this guards.
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Probed in order; the first table that produces a reply from Postgres wins.
// Several are listed so a schema change to any single table cannot silently
// disable the keepalive.
const PROBE_TABLES = ["deals", "ai_outputs", "provider_keys"] as const;

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return NextResponse.json(
      {
        ok: false,
        database: "unreachable",
        error: "Supabase environment variables are not configured on this deployment.",
        checkedAt: new Date().toISOString(),
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const sb = createClient(url, anonKey, { auth: { persistSession: false } });
  const startedAt = Date.now();
  let lastError = "";
  const answered: string[] = [];

  // Every table is queried on every call — deliberately NOT stopping at the first
  // success. Supabase counts the NUMBER of user queries per day, so one query per
  // visit is too thin a signal; this turns each visit into several.
  for (const table of PROBE_TABLES) {
    try {
      // A real, minimal SELECT. Deliberately NOT head:true — a HEAD reply carries no
      // body, so a permission/RLS error would arrive with an empty code and be
      // indistinguishable from the database being unreachable. One id column with
      // limit(1) is just as cheap and keeps the error detail we need.
      const { error } = await sb.from(table).select("id").limit(1);

      // No error, or an error Postgres itself produced (RLS refusal, unknown table),
      // both mean the database answered. Only transport failures mean it did not.
      if (!error || isDatabaseReply(error)) {
        answered.push(table);
        continue;
      }
      lastError = error.message;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }

  if (answered.length > 0) {
    return NextResponse.json(
      {
        ok: true,
        database: "reachable",
        queries: answered.length,
        probes: answered,
        latencyMs: Date.now() - startedAt,
        checkedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    {
      ok: false,
      database: "unreachable",
      error: lastError || "No response from Supabase.",
      latencyMs: Date.now() - startedAt,
      checkedAt: new Date().toISOString(),
    },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * Did this error come FROM Postgres, or did we fail to reach it?
 *
 * PostgREST surfaces database errors with a SQLSTATE-style code (42501 = RLS /
 * permission denied, 42P01 = undefined table) or a PGRST* code. Any of those is
 * proof the request reached the database, which is all the keepalive needs.
 * Network, DNS and TLS failures arrive with no such code.
 */
function isDatabaseReply(error: { code?: string | null }): boolean {
  const code = error.code ?? "";
  return /^(PGRST|[0-9A-Z]{5}$)/.test(code) && code !== "";
}
