

/**
 * GET  /api/cognition/synthesis?workspace_id=&deal_id=
 *      → { brief } — the latest stored executive brief for the scope, or { brief: null }.
 *
 * POST /api/cognition/synthesis
 *      body: { workspace_id, deal_id, trigger? }
 *      → { brief } — generates a fresh brief on demand and persists it.
 *
 * On-demand only. No scheduled generation. Deterministic, zero AI cost.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { synthesize, briefFromRow } from "@/lib/cognition/synthesize";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const workspaceId = url.searchParams.get("workspace_id");
  const dealId = url.searchParams.get("deal_id");

  const admin = createAdminClient();
  let q = admin
    .from("cognition_synthesis_runs")
    .select("*")
    .order("ran_at", { ascending: false })
    .limit(1);
  q = workspaceId ? q.eq("workspace_id", workspaceId) : q.is("workspace_id", null);
  q = dealId ? q.eq("deal_id", dealId) : q.is("deal_id", null);

  const { data } = await q.maybeSingle();
  return NextResponse.json({ brief: data ? briefFromRow(data) : null });
}

export async function POST(req: NextRequest) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  try {
    const brief = await synthesize({
      workspaceId: body.workspace_id ?? null,
      dealId: body.deal_id ?? null,
      trigger: body.trigger ?? "user_request",
    });
    return NextResponse.json({ brief });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Synthesis failed" }, { status: 500 });
  }
}
