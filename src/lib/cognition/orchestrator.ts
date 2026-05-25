

/**
 * Cognition Orchestrator (Phase 1)
 *
 * The single spine of the cognition layer. Three functions:
 *   - reviseAssumption(): write an assumption + audit revision + fire rules inline
 *   - getAssumption(): read with fallback chain (workspace -> deal -> default)
 *   - listRevisions(): pull revision log for UI indicators
 *
 * No daemons. No queues. Everything runs synchronously inside the API request that calls it.
 * Free-tier cost: zero ambient compute.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { applyPropagation } from "./rules-engine";

export type AssumptionSource = "user" | "ai" | "derived" | "default" | "signal";
export type RevisionTrigger = "user_edit" | "ai_run" | "propagation_rule" | "signal_ingestion";

export type AssumptionWrite = {
  workspaceId: string | null;
  dealId: string | null;
  key: string;                       // e.g. "synergy.cost_run_rate_m"
  valueNumeric?: number | null;
  valueText?: string | null;
  valueJson?: any;
  unit?: string;
  currency?: string;                 // "USD" | "INR"
  confidence?: number;               // 0..1
  source: AssumptionSource;
  sourceRunId?: string | null;       // FK to cognition_ai_runs if source='ai'
  triggeredBy: RevisionTrigger;
  triggerMeta?: Record<string, any>;
  reason?: string;
  chainDepth?: number;               // internal — propagation recursion guard
};

export type Assumption = {
  id: string;
  deal_id: string | null;
  workspace_id: string | null;
  key: string;
  value_numeric: number | null;
  value_text: string | null;
  value_json: any;
  unit: string | null;
  currency: string | null;
  confidence: number;
  source: string;
  source_run_id: string | null;
  last_revised_at: string;
  revision_count: number;
};

export type Revision = {
  id: string;
  key: string;
  before_value: any;
  after_value: any;
  before_confidence: number | null;
  after_confidence: number | null;
  triggered_by: string;
  trigger_meta: any;
  reason: string | null;
  revised_at: string;
};

/**
 * Write an assumption (insert or update). Always logs a revision row.
 * Fires propagation rules inline, capped at maxChainDepth (default 3).
 *
 * Idempotent on no-change: if value+confidence are identical to current row, no revision row is written.
 */
export async function reviseAssumption(w: AssumptionWrite): Promise<{
  assumption: Assumption;
  revision: Revision | null;
  propagatedRevisions: Revision[];
}> {
  const admin = createAdminClient();
  const depth = w.chainDepth ?? 0;
  const MAX_DEPTH = 3;

  // 1. Read existing (for revision diff)
  const { data: existing } = await admin
    .from("cognition_assumptions")
    .select("*")
    .eq("workspace_id", w.workspaceId)
    .eq("deal_id", w.dealId)
    .eq("key", w.key)
    .maybeSingle();

  const newValueJson = pickValue(w);
  const existingValueJson = existing ? pickValue({
    valueNumeric: existing.value_numeric,
    valueText: existing.value_text,
    valueJson: existing.value_json,
  } as AssumptionWrite) : null;
  const newConfidence = w.confidence ?? existing?.confidence ?? 0.7;

  // 2. No-change short-circuit
  if (existing && deepEqual(existingValueJson, newValueJson) && existing.confidence === newConfidence) {
    return { assumption: existing as Assumption, revision: null, propagatedRevisions: [] };
  }

  // 3. Upsert assumption
  const upsertPayload = {
    workspace_id: w.workspaceId,
    deal_id: w.dealId,
    key: w.key,
    value_numeric: w.valueNumeric ?? null,
    value_text: w.valueText ?? null,
    value_json: w.valueJson ?? null,
    unit: w.unit ?? existing?.unit ?? null,
    currency: w.currency ?? existing?.currency ?? null,
    confidence: newConfidence,
    source: w.source,
    source_run_id: w.sourceRunId ?? null,
    last_revised_at: new Date().toISOString(),
    revision_count: (existing?.revision_count ?? 0) + 1,
  };

  const { data: saved, error: upsertErr } = await admin
    .from("cognition_assumptions")
    .upsert(upsertPayload, { onConflict: "workspace_id,deal_id,key" })
    .select()
    .single();

  if (upsertErr || !saved) {
    throw new Error(`reviseAssumption upsert failed: ${upsertErr?.message}`);
  }

  // 4. Log revision
  const { data: revision } = await admin
    .from("cognition_revisions")
    .insert({
      assumption_id: saved.id,
      deal_id: w.dealId,
      workspace_id: w.workspaceId,
      key: w.key,
      before_value: existingValueJson,
      after_value: newValueJson,
      before_confidence: existing?.confidence ?? null,
      after_confidence: newConfidence,
      triggered_by: w.triggeredBy,
      trigger_meta: w.triggerMeta ?? null,
      reason: w.reason ?? null,
    })
    .select()
    .single();

  // 5. Fire propagation rules (inline, bounded depth)
  let propagatedRevisions: Revision[] = [];
  if (depth < MAX_DEPTH) {
    propagatedRevisions = await applyPropagation({
      triggerKey: w.key,
      triggerValue: w.valueNumeric ?? null,
      previousValue: existing?.value_numeric ?? null,
      workspaceId: w.workspaceId,
      dealId: w.dealId,
      chainDepth: depth + 1,
    });
  }

  return {
    assumption: saved as Assumption,
    revision: revision as Revision | null,
    propagatedRevisions,
  };
}

/**
 * Read an assumption. Returns null if not found.
 * Modules should use getAssumptionWithFallback() for the common case of
 * "give me this value or a sensible default".
 */
export async function getAssumption(
  workspaceId: string | null,
  dealId: string | null,
  key: string,
): Promise<Assumption | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("cognition_assumptions")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("deal_id", dealId)
    .eq("key", key)
    .maybeSingle();
  return (data as Assumption) ?? null;
}

/**
 * Read with a default fallback. The default is treated as source='default'
 * and is NOT persisted unless the caller explicitly writes it back.
 */
export async function getAssumptionWithFallback<T>(
  workspaceId: string | null,
  dealId: string | null,
  key: string,
  fallback: T,
): Promise<{ value: T; source: AssumptionSource; confidence: number; lastRevisedAt: string | null }> {
  const a = await getAssumption(workspaceId, dealId, key);
  if (!a) return { value: fallback, source: "default", confidence: 0.5, lastRevisedAt: null };
  const v = a.value_numeric ?? a.value_text ?? a.value_json ?? fallback;
  return {
    value: v as T,
    source: a.source as AssumptionSource,
    confidence: a.confidence,
    lastRevisedAt: a.last_revised_at,
  };
}

/**
 * List recent revisions — used for UI "what changed" indicators and audit views.
 */
export async function listRevisions(opts: {
  workspaceId?: string | null;
  dealId?: string | null;
  key?: string;
  sinceIso?: string;
  limit?: number;
}): Promise<Revision[]> {
  const admin = createAdminClient();
  let q = admin
    .from("cognition_revisions")
    .select("id, key, before_value, after_value, before_confidence, after_confidence, triggered_by, trigger_meta, reason, revised_at")
    .order("revised_at", { ascending: false })
    .limit(opts.limit ?? 20);
  if (opts.workspaceId !== undefined) q = q.eq("workspace_id", opts.workspaceId);
  if (opts.dealId !== undefined) q = q.eq("deal_id", opts.dealId);
  if (opts.key) q = q.eq("key", opts.key);
  if (opts.sinceIso) q = q.gt("revised_at", opts.sinceIso);
  const { data } = await q;
  return (data as Revision[]) ?? [];
}

// ---------- helpers ----------

function pickValue(w: Partial<AssumptionWrite>): any {
  if (w.valueNumeric !== undefined && w.valueNumeric !== null) return w.valueNumeric;
  if (w.valueText !== undefined && w.valueText !== null) return w.valueText;
  if (w.valueJson !== undefined && w.valueJson !== null) return w.valueJson;
  return null;
}

function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a === "number") return Math.abs(a - b) < 1e-9;
  if (typeof a === "object") return JSON.stringify(a) === JSON.stringify(b);
  return false;
}
