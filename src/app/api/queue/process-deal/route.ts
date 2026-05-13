

/**
 * QStash background worker — receives messages published by
 * /api/ai/enrich-batch/enqueue and runs the real enrichment pipeline for
 * a chunk of deals. Marks the enrichment_jobs row done/error so the UI
 * can stop polling.
 *
 * Security: verifySignatureAppRouter rejects any request whose signature
 * doesn't match QSTASH_CURRENT_SIGNING_KEY (or the rotation key).
 * In local dev where signing keys are unset, set
 *   QSTASH_NEXT_SIGNING_KEY=skip
 * to disable verification (the wrapper treats unset keys as skip).
 */

import { NextResponse } from "next/server";
import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { routedCall, type RouteConfig } from "@/lib/ai/router";
import {
  buildEnrichPrompt,
  parseEnrichmentResponse,
  type EnrichmentInput,
} from "@/lib/ai/enrichment";
import type { ProviderId } from "@/lib/ai/providers";

type Payload = {
  job_id: string;
  user_id: string;
  deal_ids: string[];
};

async function handler(request: Request) {
  let payload: Payload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }
  const { job_id, user_id, deal_ids } = payload;
  if (!job_id || !user_id || !Array.isArray(deal_ids) || deal_ids.length === 0) {
    return NextResponse.json({ error: "Missing job_id / user_id / deal_ids" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Mark job processing
  await admin
    .from("enrichment_jobs")
    .update({ status: "processing", started_at: new Date().toISOString() })
    .eq("id", job_id);

  // Resolve enrichment key (Fast tier) via the multi-key library, falling back
  // to the legacy bulk_* slot in ai_settings for users who haven't migrated yet.
  let provider: ProviderId = "free";
  let apiKey: string | null = null;
  let model: string | undefined = undefined;
  try {
    const { resolveKey } = await import("@/lib/ai/key-resolver");
    const resolved = await resolveKey(admin, user_id, "fast");
    provider = (resolved.provider as ProviderId) ?? "free";
    apiKey = resolved.apiKey;
    model = resolved.model ?? undefined;
  } catch { /* fall through */ }

  if (!apiKey || provider === "free") {
    await admin
      .from("enrichment_jobs")
      .update({
        status: "error",
        finished_at: new Date().toISOString(),
        error_message: "No Fast-tier AI key configured. Add one in Settings → API Key Library.",
      })
      .eq("id", job_id);
    // Return 200 so QStash doesn't retry — the user needs to fix config first.
    return NextResponse.json({ ok: false, reason: "no-key" });
  }

  const cfg: RouteConfig = {
    tier: "fast",
    primaryProvider: provider,
    primaryKey: apiKey,
    primaryModel: model,
    blockFreeFallback: true,
  };

  // Pull the deal rows
  const { data: deals, error: dealsErr } = await admin
    .from("deals")
    .select("id,buyer,target,sector,country,deal_type,value_raw,normalized_value_usd,stake_percent,status")
    .in("id", deal_ids);

  if (dealsErr) {
    await admin
      .from("enrichment_jobs")
      .update({
        status: "error",
        finished_at: new Date().toISOString(),
        error_message: `Failed to fetch deals: ${dealsErr.message}`,
      })
      .eq("id", job_id);
    return NextResponse.json({ ok: false, reason: "fetch-failed" });
  }

  let succeeded = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const deal of (deals ?? []) as EnrichmentInput[]) {
    try {
      const messages = buildEnrichPrompt(deal);
      const res = await routedCall(cfg, messages, 1200);
      const enriched = parseEnrichmentResponse(deal.id, res.text, deal);

      if (enriched) {
        const { error: updErr } = await admin.from("deals").update({
          buyer:          enriched.clean_buyer  || deal.buyer,
          target:         enriched.clean_target || deal.target,
          deal_type:      enriched.classified_deal_type,
          status:         enriched.deal_status,
          ai_summary:     enriched.ai_summary,
          priority_score: enriched.priority_score,
          advisory_score: enriched.advisory_score,
          risk_flag:      enriched.risk_flag,
          ai_confidence:  enriched.confidence,
          ai_enriched_at: new Date().toISOString(),
        }).eq("id", deal.id);

        if (updErr) {
          failed++;
          errors.push(`${deal.id}: ${updErr.message}`);
        } else {
          succeeded++;
        }
      } else {
        failed++;
        errors.push(`${deal.id}: parse failed`);
      }
    } catch (e) {
      failed++;
      errors.push(`${deal.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  await admin
    .from("enrichment_jobs")
    .update({
      status: failed === deal_ids.length ? "error" : "done",
      finished_at: new Date().toISOString(),
      succeeded,
      failed,
      error_message: errors.length > 0 ? errors.slice(0, 5).join(" | ") : null,
    })
    .eq("id", job_id);

  return NextResponse.json({ ok: true, succeeded, failed });
}

export const POST = verifySignatureAppRouter(handler);
