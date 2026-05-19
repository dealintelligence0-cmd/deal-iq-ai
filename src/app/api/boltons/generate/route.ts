/**
 * POST /api/boltons/generate
 *
 * Body: { buyer_name: string, request_brief?: string, target_tier?: "mid"|"large"|"mega"|"any", embed_key_id?: string }
 *
 * Pipeline:
 *  1. Build/refresh buyer profile from canonical_deals (uses smart-tier key for thesis)
 *  2. Pull top 4 themes for thematic context
 *  3. Generate 6-10 target recommendations
 *  4. Persist shortlist + targets
 *  5. Audit row in bolt_on_runs
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveKey } from "@/lib/ai/key-resolver";
import { buildBuyerProfile } from "@/lib/boltons/profile";
import { generateBoltOnShortlist } from "@/lib/boltons/generate";
import type { ProviderId } from "@/lib/ai/providers";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { buyer_name?: string; request_brief?: string; target_tier?: "mid"|"large"|"mega"|"any" };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.buyer_name?.trim()) return NextResponse.json({ error: "buyer_name required" }, { status: 400 });

  const admin = createAdminClient();
  let resolved = await resolveKey(admin, user.id, "smart");
  if (!resolved?.apiKey) resolved = await resolveKey(admin, user.id, "economic");
  if (!resolved?.apiKey) resolved = await resolveKey(admin, user.id, "fast");
  if (!resolved?.apiKey || !resolved.provider) {
    return NextResponse.json({ error: "No AI key configured. Add one in Settings → API Key Library." }, { status: 400 });
  }
  const routeConfig = {
    tier: "smart" as const,
    primaryProvider: resolved.provider as ProviderId,
    primaryKey: resolved.apiKey,
    primaryModel: resolved.model ?? undefined,
  };

  // Audit row
  const { data: runRow } = await sb.from("bolt_on_runs").insert({
    created_by: user.id,
    triggered_by: "manual",
    ai_provider: resolved.provider,
  }).select("id").single();
  const runId = (runRow as { id: string } | null)?.id;

  try {
    // 1. Build profile
    const prof = await buildBuyerProfile(sb, user.id, body.buyer_name.trim(), routeConfig);
    if (!prof.profile) {
      await sb.from("bolt_on_runs").update({
        status: "failed",
        error: prof.error ?? "Failed to build buyer profile",
        completed_at: new Date().toISOString(),
      }).eq("id", runId!);
      return NextResponse.json({ error: prof.error ?? "Failed to build buyer profile" }, { status: 400 });
    }

    // 2. Pull top themes for adjacency context
    const { data: themes } = await sb
      .from("themes")
      .select("display_name, sectors, geographies")
      .eq("status", "active")
      .eq("created_by", user.id)
      .order("deal_count", { ascending: false })
      .limit(4);

    // 3. Generate shortlist
    const result = await generateBoltOnShortlist(sb, {
      userId: user.id,
      routeConfig,
      buyer: prof.profile,
      requestBrief: body.request_brief,
      targetTier: body.target_tier ?? "any",
      themeContext: (themes ?? []).map((t) => ({
        display_name: t.display_name as string,
        sectors: (t.sectors as string[]) ?? [],
        geographies: (t.geographies as string[]) ?? [],
      })),
    });

    const totalCost = (prof.cost_usd ?? 0) + (result.cost_usd ?? 0);

    // Finalize run
    await sb.from("bolt_on_runs").update({
      shortlist_id: result.shortlistId,
      buyers_profiled: 1,
      targets_generated: result.targets.length,
      cost_usd: Math.round(totalCost * 10000) / 10000,
      ai_model: result.model,
      status: result.error && result.targets.length === 0 ? "failed" : "completed",
      error: result.error,
      completed_at: new Date().toISOString(),
    }).eq("id", runId!);

    return NextResponse.json({
      ok: result.targets.length > 0,
      shortlist_id: result.shortlistId,
      total_targets: result.targets.length,
      targets: result.targets,
      cost_usd: totalCost,
      provider: result.provider,
      model: result.model,
      profile_note: prof.error,
      generation_note: result.error,
    });
  } catch (e: any) {
    await sb.from("bolt_on_runs").update({
      status: "failed",
      error: e?.message ?? String(e),
      completed_at: new Date().toISOString(),
    }).eq("id", runId!);
    return NextResponse.json({ error: e?.message ?? "Generation failed" }, { status: 500 });
  }
}
