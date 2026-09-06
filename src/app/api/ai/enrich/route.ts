

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { routedCall, type RouteConfig } from "@/lib/ai/router";
import {
  buildEnrichPrompt,
  parseEnrichmentResponse,
  type EnrichmentInput,
} from "@/lib/ai/enrichment";
import type { ProviderId } from "@/lib/ai/providers";
import { assessEnrichmentT0, deriveEnrichmentT0 } from "@/lib/ai/enrich-t0";
import { recordAiEvent } from "@/lib/ai/telemetry";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { checkRateLimit, logActivity } = await import("@/lib/security");
  const allowed = await checkRateLimit(supabase, "ai_enrich", 20, 60);
  if (!allowed) return NextResponse.json({ error: "Rate limit: 20 calls/min" }, { status: 429 });

  const { deal_ids } = await req.json() as { deal_ids: string[] };
  if (!Array.isArray(deal_ids) || deal_ids.length === 0) {
    return NextResponse.json({ error: "deal_ids array required" }, { status: 400 });
  }
  if (deal_ids.length > 50) {
    return NextResponse.json({ error: "Max 50 deals per batch" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: settings } = await admin
    .from("ai_settings")
    .select("bulk_provider, bulk_model, bulk_key_encrypted")
    .eq("user_id", user.id)
    .maybeSingle();

  let apiKey: string | null = null;
  if (settings?.bulk_key_encrypted) {
    try {
      const { data: dec } = await admin.rpc("decrypt_key", {
        cipher: settings.bulk_key_encrypted,
      });
      apiKey = dec as string | null;
    } catch { /* fallback */ }
  }

  const cfg: RouteConfig = {
    tier: "fast",
    primaryProvider: (settings?.bulk_provider as ProviderId) ?? "free",
    primaryKey: apiKey,
    primaryModel: settings?.bulk_model ?? undefined,
    // PHASE 7A: telemetry attribution only. This route makes ONE cloud call PER DEAL —
    // the highest-volume path in the app and the Phase 7D baseline.
    telemetry: { userId: user.id, module: "enrich", operation: "deal_summary" },
  };

  // SECURITY: only ever read/write the caller's OWN deals. The admin client
  // bypasses RLS, so we must scope by created_by — otherwise an authenticated
  // user could pass arbitrary deal_ids and read/overwrite another tenant's data.
  const { data: deals, error: dealsErr } = await admin
    .from("deals")
    .select("id,buyer,target,sector,country,deal_type,value_raw,normalized_value_usd,stake_percent,status")
    .in("id", deal_ids)
    .eq("created_by", user.id);

  if (dealsErr) {
    return NextResponse.json({ error: dealsErr.message }, { status: 500 });
  }

  const results: {
    id: string;
    ok: boolean;
    summary?: string;
    error?: string;
    viaFallback?: boolean;
    // PHASE 7D: true when deterministic logic answered and no cloud call was made.
    viaT0?: boolean;
  }[] = [];

  for (const deal of (deals ?? []) as EnrichmentInput[]) {
    try {
      // PHASE 7D — skip the cloud call when deterministic logic already has the answer.
      // The gate only passes when every field the model would classify is ALREADY
      // canonical, so the cloud's structured output would match the rules'. Anything
      // missing or unrecognised falls through to the unchanged cloud path below.
      const t0 = assessEnrichmentT0(deal);
      if (t0.sufficient) {
        const derived = deriveEnrichmentT0(deal);
        const { error: t0Err } = await admin.from("deals").update({
          buyer:          derived.clean_buyer || deal.buyer,
          target:         derived.clean_target || deal.target,
          deal_type:      derived.classified_deal_type,
          status:         derived.deal_status,
          ai_summary:     derived.ai_summary,
          priority_score: derived.priority_score,
          advisory_score: derived.advisory_score,
          risk_flag:      derived.risk_flag,
          ai_confidence:  derived.confidence,
          ai_enriched_at: new Date().toISOString(),
        }).eq("id", deal.id);

        // A cloud call avoided — the headline KPI. Same module/operation as the cloud
        // path so before/after is measured on identical terms.
        recordAiEvent({
          userId: user.id,
          module: "enrich",
          operation: "deal_summary",
          decision: "t0_answered",
        });

        results.push({ id: deal.id, ok: !t0Err, summary: derived.ai_summary, viaT0: true, error: t0Err?.message });
        continue;
      }

      const messages = buildEnrichPrompt(deal);
      const res = await routedCall(cfg, messages, 1200);
      const enriched = parseEnrichmentResponse(deal.id, res.text, deal);

      if (enriched) {
        const { error: updErr } = await admin.from("deals").update({
          buyer:               enriched.clean_buyer   || deal.buyer,
          target:              enriched.clean_target  || deal.target,
          deal_type:           enriched.classified_deal_type,
          status:              enriched.deal_status,
          ai_summary:          enriched.ai_summary,
          priority_score:      enriched.priority_score,
          advisory_score:      enriched.advisory_score,
          risk_flag:           enriched.risk_flag,
          ai_confidence:       enriched.confidence,
          ai_enriched_at:      new Date().toISOString(),
        }).eq("id", deal.id);

        results.push({
          id: deal.id,
          ok: !updErr,
          summary: enriched.ai_summary,
          viaFallback: res.viaFallback,
          error: updErr?.message,
        });
      } else {
        results.push({ id: deal.id, ok: false, error: "AI response parse failed" });
      }
    } catch (e) {
      results.push({ id: deal.id, ok: false, error: String(e) });
    }
  }

  const succeeded = results.filter((r) => r.ok).length;
  await logActivity(supabase, "enrich_batch", "deals", undefined, { count: results.length, succeeded });
  return NextResponse.json({ total: results.length, succeeded, results });
}
