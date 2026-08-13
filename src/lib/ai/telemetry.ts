// src/lib/ai/telemetry.ts
//
// PHASE 7A — measurement only. This module records WHAT the AI layer did; it never
// changes what the AI layer does. Every function here is fire-and-forget and swallows
// its own errors, so instrumentation can never fail a partner's generation.
//
// Purpose: establish a measurable BASELINE before any optimisation is claimed
// (Phases 7B–7G). The KPI is "cloud AI calls avoided per 100 user actions", so the
// unit of record is a DECISION — what the system did instead of a cloud call — not
// just token counts.
//
// ENTERPRISE SAFETY (non-negotiable):
//   • NO prompt text, NO completion text, NO deal/company names, NO document content.
//     Only counts, identifiers, durations and coarse categories are stored.
//   • Failure reasons are mapped to a fixed CODE, never a raw provider error string
//     (raw errors can echo API keys, URLs, or customer data).
//   • Writes go through the service-role client server-side only; RLS restricts reads
//     to the owning user (see migrations/phase7a_ai_telemetry.sql).
//
// ACTIVATION: telemetry is dormant until the operator applies the SQL migration. With
// no `ai_telemetry` table the insert simply fails and is swallowed — zero behaviour
// change, zero cost, nothing to configure. To switch it off again, set
// AI_TELEMETRY_DISABLED=1 (or drop the table).

import { estimateCost } from "@/lib/ai/cost-estimator";

// What the system DID for this request. Only the first four fire in Phase 7A —
// the local/T0 values are defined now so later phases record into the same schema
// and the before/after comparison stays apples-to-apples.
export type AiDecision =
  | "cloud"           // a cloud AI call was made (primary provider)
  | "cloud_fallback"  // primary failed; fallback provider or offline engine served it
  | "cache_hit"       // an existing result was reused — no cloud call
  | "cache_miss"      // cache was consulted and missed (a cloud call follows)
  | "t0_answered"     // deterministic logic answered — no AI call at all      (7B+)
  | "local_accepted"  // on-device AI produced an accepted result — no cloud   (7D+)
  | "local_escalated";// on-device AI ran but failed validation → cloud        (7D+)

// Did the T0 validation gate accept the (untrusted) local output? "not_applicable"
// whenever no local AI was involved, which is every event in Phase 7A.
export type ValidationOutcome = "not_applicable" | "passed" | "failed";

// Coarse, non-sensitive failure categories. Raw provider errors are NEVER stored.
export type FallbackReason =
  | "rate_limit" | "timeout" | "auth" | "context_length"
  | "provider_error" | "unavailable" | "unknown";

export type TelemetryContext = {
  userId?: string | null;
  module: string;    // proposal | synergy | pmi | tsa | enrich | ingestion | …
  operation: string; // generate | retry_quality | classify_row | …
};

export type AiEvent = TelemetryContext & {
  decision: AiDecision;
  provider?: string | null;
  model?: string | null;
  tier?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  latencyMs?: number;
  fallbackReason?: FallbackReason | null;
  validationOutcome?: ValidationOutcome;
};

// Map a raw provider/transport error to a fixed category. The raw message is
// deliberately discarded — it is the most likely place for a key or customer
// string to leak into storage.
export function classifyFailure(err: unknown): FallbackReason {
  const m = (err instanceof Error ? err.message : String(err ?? "")).toLowerCase();
  if (!m) return "unknown";
  if (m.includes("429") || m.includes("rate limit") || m.includes("quota")) return "rate_limit";
  if (m.includes("timeout") || m.includes("etimedout") || m.includes("aborted")) return "timeout";
  if (m.includes("401") || m.includes("403") || m.includes("api key") || m.includes("unauthor")) return "auth";
  if (m.includes("context length") || m.includes("too many tokens") || m.includes("413")) return "context_length";
  if (m.includes("503") || m.includes("502") || m.includes("unavailable")) return "unavailable";
  if (m.includes("500") || m.includes("provider")) return "provider_error";
  return "unknown";
}

function telemetryEnabled(): boolean {
  if (typeof window !== "undefined") return false;            // server-side only
  return process.env.AI_TELEMETRY_DISABLED !== "1";           // enterprise kill-switch
}

/**
 * Record one AI decision. Fire-and-forget: returns immediately, never throws, and
 * never delays or alters the caller's result. A missing table, missing env, or any
 * insert error is swallowed by design — measurement must never break generation.
 */
export function recordAiEvent(event: AiEvent): void {
  if (!telemetryEnabled()) return;
  void writeEvent(event).catch(() => { /* telemetry must never surface an error */ });
}

async function writeEvent(event: AiEvent): Promise<void> {
  try {
    const inputTokens = Math.max(0, Math.round(event.inputTokens ?? 0));
    const outputTokens = Math.max(0, Math.round(event.outputTokens ?? 0));

    // Cost is derived from the SAME published rate table the app already uses, so the
    // baseline and any later comparison are computed identically. Only meaningful when
    // a cloud call actually happened; reuse/local decisions cost nothing.
    let estCostUsd = 0;
    const billable = event.decision === "cloud" || event.decision === "cloud_fallback";
    if (billable && event.provider && (inputTokens > 0 || outputTokens > 0)) {
      estCostUsd = estimateCost(event.provider, inputTokens, outputTokens, event.model ?? null).cost;
    }

    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = createAdminClient();
    await admin.from("ai_telemetry").insert({
      user_id: event.userId ?? null,
      module: event.module.slice(0, 40),
      operation: event.operation.slice(0, 60),
      decision: event.decision,
      provider: event.provider ?? null,
      model: event.model ? event.model.slice(0, 80) : null,
      tier: event.tier ?? null,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cached_input_tokens: Math.max(0, Math.round(event.cachedInputTokens ?? 0)),
      est_cost_usd: estCostUsd,
      latency_ms: Math.max(0, Math.round(event.latencyMs ?? 0)),
      fallback_reason: event.fallbackReason ?? null,
      validation_outcome: event.validationOutcome ?? "not_applicable",
    });
  } catch {
    /* table not applied yet, or env/network issue — intentionally silent */
  }
}
