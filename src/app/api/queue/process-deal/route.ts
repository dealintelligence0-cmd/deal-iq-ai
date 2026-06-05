

/**
 * QStash background worker — receives messages published by
 * /api/ai/enrich-batch/enqueue and runs the real enrichment pipeline for
 * a chunk of deals. Marks the enrichment_jobs row done/error so the UI
 * can stop polling.
 *
 * Security: every request is QStash-signature verified against
 * QSTASH_CURRENT_SIGNING_KEY (or the rotation key) before any DB work.
 * Verification is wired lazily (see POST below) so that:
 *   - in PRODUCTION with the signing keys missing we FAIL CLOSED (503), and
 *   - in local dev (keys unset) we don't crash at import/build time and run
 *     the handler unsigned for convenience.
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
  const { job_id } = payload;
  if (!job_id) {
    return NextResponse.json({ error: "Missing job_id" }, { status: 400 });
  }

  const admin = createAdminClient();

  // SECURITY: derive user_id and deal_ids from the PERSISTED job row, never
  // from the request payload. Even though QStash signs the payload, the job
  // row is the single source of truth for who owns this work and which deals
  // it covers — so a replayed/forged body cannot retarget another tenant.
  const { data: job } = await admin
    .from("enrichment_jobs")
    .select("id, user_id, deal_ids")
    .eq("id", job_id)
    .maybeSingle();
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  const user_id = job.user_id as string;
  const deal_ids = (job.deal_ids ?? []) as string[];
  if (!user_id || deal_ids.length === 0) {
    await admin
      .from("enrichment_jobs")
      .update({ status: "error", finished_at: new Date().toISOString(), error_message: "Job row missing user_id / deal_ids" })
      .eq("id", job_id);
    return NextResponse.json({ ok: false, reason: "bad-job-row" });
  }

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

  // Pull the deal rows — scoped to the job owner (defence in depth on top of
  // the enqueue-time ownership filter).
  const { data: deals, error: dealsErr } = await admin
    .from("deals")
    .select("id,buyer,target,sector,country,deal_type,value_raw,normalized_value_usd,stake_percent,status")
    .in("id", deal_ids)
    .eq("created_by", user_id);

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
        }).eq("id", deal.id).eq("created_by", user_id);

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

export async function POST(request: Request): Promise<Response> {
  const hasKeys = Boolean(
    process.env.QSTASH_CURRENT_SIGNING_KEY && process.env.QSTASH_NEXT_SIGNING_KEY,
  );

  if (!hasKeys) {
    // Fail closed in production — never run privileged work on an unverified
    // request. In dev, allow unsigned calls (and avoid constructing the
    // verifier, which throws at import when keys are absent).
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "QStash signing keys not configured" },
        { status: 503 },
      );
    }
    return handler(request);
  }

  // Construct the verified handler lazily so the verifier is only built when
  // the signing keys actually exist (prevents the build-time import crash).
  return verifySignatureAppRouter(handler)(request);
}
