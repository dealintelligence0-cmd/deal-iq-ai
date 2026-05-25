

/**
 * AI Memory + Cache (Phase 1)
 *
 * Every AI call goes through runAiWithMemory(). It:
 *   1. Hashes the (intent + context_snapshot) to a deterministic key
 *   2. Checks cognition_ai_runs for a fresh cache hit (within TTL)
 *   3. If hit -> returns cached response, logs a "cached_from" run for audit
 *   4. If miss -> calls the supplied AI function, persists the run
 *
 * No external cache infrastructure. Uses Postgres directly. Free-tier friendly.
 *
 * Modules call this only when they actually need AI (synthesis, narrative, reasoning).
 * Deterministic computations (NPV math, billing tally) never come through here.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { createHash } from "crypto";

export type AiIntent =
  | "evaluate_synergy"
  | "assess_risk"
  | "revise_pmi"
  | "synthesize_brief"
  | "explain_revision"
  | "carve_out_rationale"
  | "theme_summary"
  | "boltons_overlay";

export type AiRunResult = {
  runId: string;
  responseText: string;
  responseEvents: any[]; // structured events the AI proposed
  fromCache: boolean;
  provider: string | null;
  model: string | null;
  costUsd: number;
  confidenceSelfReport: number | null;
};

export type AiCaller = (args: { prompt: string; intent: AiIntent }) => Promise<{
  text: string;
  events?: any[];
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  confidence?: number;
}>;

export type RunAiOptions = {
  intent: AiIntent;
  workspaceId: string | null;
  dealId: string | null;
  userId: string | null;
  contextSnapshot: any; // serializable
  prompt: string;
  call: AiCaller;
  ttlHours?: number; // default 24
};

/**
 * Run an AI call through the memory + cache layer.
 */
export async function runAiWithMemory(opts: RunAiOptions): Promise<AiRunResult> {
  const admin = createAdminClient();
  const ttlHours = opts.ttlHours ?? 24;
  const contextHash = hashContext(opts.intent, opts.contextSnapshot, opts.prompt);

  // 1. Cache lookup — same intent, same hash, not expired
  const nowIso = new Date().toISOString();
  const { data: cached } = await admin
    .from("cognition_ai_runs")
    .select("*")
    .eq("context_hash", contextHash)
    .eq("intent", opts.intent)
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cached) {
    // Log a thin "cache hit" row for audit — costs zero AI tokens
    const { data: hitRow } = await admin.from("cognition_ai_runs").insert({
      deal_id: opts.dealId,
      workspace_id: opts.workspaceId,
      user_id: opts.userId,
      intent: opts.intent,
      context_hash: contextHash,
      context_snapshot: opts.contextSnapshot,
      prompt: opts.prompt,
      response_raw: cached.response_raw,
      response_events: cached.response_events,
      provider: cached.provider,
      model: cached.model,
      input_tokens: 0,
      output_tokens: 0,
      cost_usd: 0,
      confidence_self_report: cached.confidence_self_report,
      cached_from: cached.id,
      expires_at: cached.expires_at,
    }).select("id").single();

    return {
      runId: hitRow?.id ?? cached.id,
      responseText: cached.response_raw ?? "",
      responseEvents: (cached.response_events as any[]) ?? [],
      fromCache: true,
      provider: cached.provider,
      model: cached.model,
      costUsd: 0,
      confidenceSelfReport: cached.confidence_self_report,
    };
  }

  // 2. Cache miss — call the AI
  const result = await opts.call({ prompt: opts.prompt, intent: opts.intent });

  // 3. Persist the run
  const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000).toISOString();
  const { data: saved } = await admin.from("cognition_ai_runs").insert({
    deal_id: opts.dealId,
    workspace_id: opts.workspaceId,
    user_id: opts.userId,
    intent: opts.intent,
    context_hash: contextHash,
    context_snapshot: opts.contextSnapshot,
    prompt: opts.prompt,
    response_raw: result.text,
    response_events: result.events ?? [],
    provider: result.provider,
    model: result.model,
    input_tokens: result.inputTokens,
    output_tokens: result.outputTokens,
    cost_usd: result.costUsd,
    confidence_self_report: result.confidence ?? null,
    expires_at: expiresAt,
  }).select("id").single();

  return {
    runId: saved?.id ?? "",
    responseText: result.text,
    responseEvents: result.events ?? [],
    fromCache: false,
    provider: result.provider,
    model: result.model,
    costUsd: result.costUsd,
    confidenceSelfReport: result.confidence ?? null,
  };
}

/**
 * Mark an AI run's events as applied to the cognition graph.
 * Called after the orchestrator commits the proposed assumptions.
 */
export async function markEventsApplied(runId: string): Promise<void> {
  const admin = createAdminClient();
  await admin.from("cognition_ai_runs").update({ events_applied: true }).eq("id", runId);
}

/**
 * Deterministic hash of (intent, context, prompt) — cache key.
 * Uses SHA256 — Node builtin, no extra dependency.
 */
function hashContext(intent: AiIntent, context: any, prompt: string): string {
  const payload = JSON.stringify({
    intent,
    context: stableStringify(context),
    prompt: prompt.trim(),
  });
  return createHash("sha256").update(payload).digest("hex");
}

/**
 * Stable JSON stringify (sorted keys) so {a:1,b:2} and {b:2,a:1} hash the same.
 */
function stableStringify(obj: any): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(stableStringify).join(",") + "]";
  const keys = Object.keys(obj).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify(obj[k])).join(",") + "}";
}
