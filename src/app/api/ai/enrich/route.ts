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

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
  };

  const { data: deals, error: dealsErr } = await admin
    .from("deals")
    .select("id,buyer,target,sector,country,deal_type,value_raw,normalized_value_usd,stake_percent,status")
    .in("id", deal_ids);

  if (dealsErr) {
    return NextResponse.json({ error: dealsErr.message }, { status: 500 });
  }

  const results: {
    id: string;
    ok: boolean;
    summary?: string;
    error?: string;
    viaFallback?: boolean;
  }[] = [];

  for (const deal of (deals ?? []) as EnrichmentInput[]) {
    try {
      const messages = buildEnrichPrompt(deal);
      const res = await routedCall(cfg, messages, 600);
      const enriched = parseEnrichmentResponse(deal.id, res.text);

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
  return NextResponse.json({ total: results.length, succeeded, results });
}
