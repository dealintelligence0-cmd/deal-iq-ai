

/**
 * Executive Brief synthesis (Phase 4).
 *
 * On-demand only. Builds a partner-grade snapshot that ties the cognition layer
 * together: current deal thesis (key drivers), what needs attention (risks),
 * cross-module warnings (propagation flags), and a concise executive summary.
 *
 * Deterministic and zero-AI by default — pure templating over assumptions and
 * the existing implication synthesizer. No daemons, no scheduled jobs, no queue.
 * The per-revision "Explain" endpoint remains the AI-on-demand path (cached).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { listRevisions } from "./orchestrator";
import { synthesizeImplications, type Implication } from "./synthesize-implications";
import { COGNITION_KEYS, labelForKey } from "./keys";

export type ThesisDriver = {
  key: string;
  label: string;
  value: number | string | null;
  unit: string | null;
  currency: string | null;
  confidence: number;
  source: string;
  lastRevisedAt: string | null;
};

export type ExecutiveBrief = {
  id: string | null;
  workspaceId: string | null;
  dealId: string | null;
  ranAt: string;
  trigger: string;
  summaryMd: string;
  thesisState: ThesisDriver[];
  topRisks: Implication[];
  warnings: Implication[];
  implications: Implication[];
  revisionsSince: string | null;
  costUsd: number;
};

// Driver keys shown in the thesis snapshot, in executive reading order.
const THESIS_KEYS: string[] = [
  COGNITION_KEYS.synergy.totalRunRateM,
  COGNITION_KEYS.synergy.costRunRateM,
  COGNITION_KEYS.synergy.revenueRunRateM,
  COGNITION_KEYS.synergy.paybackMonths,
  COGNITION_KEYS.tsa.totalDurationMonths,
  COGNITION_KEYS.tsa.totalBudgetK,
  COGNITION_KEYS.pmi.totalWeeks,
  COGNITION_KEYS.pmi.activeWorkstreams,
  COGNITION_KEYS.valuation.anchorMultiple,
];

/**
 * Build (and persist) an executive brief for a workspace/deal scope.
 * Returns the brief. Always writes a cognition_synthesis_runs row for audit.
 */
export async function synthesize(opts: {
  workspaceId: string | null;
  dealId: string | null;
  trigger: string;
}): Promise<ExecutiveBrief> {
  const admin = createAdminClient();

  // Window since the previous brief, for the "what changed" framing.
  const { data: prev } = await admin
    .from("cognition_synthesis_runs")
    .select("ran_at")
    .eq("workspace_id", opts.workspaceId)
    .eq("deal_id", opts.dealId)
    .order("ran_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const revisionsSince: string | null = prev?.ran_at ?? null;

  const revisions = await listRevisions({
    workspaceId: opts.workspaceId,
    dealId: opts.dealId,
    limit: 50,
  });

  const thesisState = await fetchThesisDrivers(admin, opts.workspaceId, opts.dealId);
  const implications = synthesizeImplications(revisions);
  const topRisks = implications.filter((i) => i.severity === "action" || i.severity === "watch");
  const warnings = implications.filter((i) => i.id.startsWith("impl-flag-"));
  const summaryMd = buildSummary(thesisState, topRisks, implications, revisionsSince);

  console.info("[cognition][synthesis][brief]", {
    workspaceId: opts.workspaceId,
    dealId: opts.dealId,
    drivers: thesisState.length,
    implications: implications.length,
    topRisks: topRisks.length,
    warnings: warnings.length,
  });

  const ranAt = new Date().toISOString();
  const { data: saved } = await admin
    .from("cognition_synthesis_runs")
    .insert({
      workspace_id: opts.workspaceId,
      deal_id: opts.dealId,
      ran_at: ranAt,
      trigger: opts.trigger,
      summary_md: summaryMd,
      thesis_state: thesisState,
      top_risks: topRisks,
      warnings,
      revisions_since: revisionsSince,
      cost_usd: 0,
      ai_run_id: null,
    })
    .select("id, ran_at")
    .single();

  return {
    id: saved?.id ?? null,
    workspaceId: opts.workspaceId,
    dealId: opts.dealId,
    ranAt: saved?.ran_at ?? ranAt,
    trigger: opts.trigger,
    summaryMd,
    thesisState,
    topRisks,
    warnings,
    implications,
    revisionsSince,
    costUsd: 0,
  };
}

/** Map a stored cognition_synthesis_runs row into an ExecutiveBrief. */
export function briefFromRow(row: any): ExecutiveBrief {
  return {
    id: row.id ?? null,
    workspaceId: row.workspace_id ?? null,
    dealId: row.deal_id ?? null,
    ranAt: row.ran_at,
    trigger: row.trigger,
    summaryMd: row.summary_md ?? "",
    thesisState: (row.thesis_state as ThesisDriver[]) ?? [],
    topRisks: (row.top_risks as Implication[]) ?? [],
    warnings: (row.warnings as Implication[]) ?? [],
    implications: [
      ...((row.top_risks as Implication[]) ?? []),
      ...((row.warnings as Implication[]) ?? []),
    ],
    revisionsSince: row.revisions_since ?? null,
    costUsd: Number(row.cost_usd ?? 0),
  };
}

// ---------- helpers ----------

async function fetchThesisDrivers(
  admin: any,
  workspaceId: string | null,
  dealId: string | null,
): Promise<ThesisDriver[]> {
  let q = admin
    .from("cognition_assumptions")
    .select("key, value_numeric, value_text, value_json, unit, currency, confidence, source, last_revised_at")
    .in("key", THESIS_KEYS);
  q = workspaceId === null ? q.is("workspace_id", null) : q.eq("workspace_id", workspaceId);
  q = dealId === null ? q.is("deal_id", null) : q.eq("deal_id", dealId);
  const { data } = await q;
  const rows: any[] = data ?? [];
  const byKey = new Map(rows.map((r) => [r.key, r]));

  const out: ThesisDriver[] = [];
  for (const key of THESIS_KEYS) {
    const r = byKey.get(key);
    if (!r) continue;
    out.push({
      key,
      label: labelForKey(key),
      value: r.value_numeric ?? r.value_text ?? r.value_json ?? null,
      unit: r.unit ?? null,
      currency: r.currency ?? null,
      confidence: Number(r.confidence ?? 0.7),
      source: r.source ?? "default",
      lastRevisedAt: r.last_revised_at ?? null,
    });
  }
  return out;
}

function formatDriver(d: ThesisDriver): string {
  if (d.value === null || d.value === undefined) return "—";
  if (typeof d.value === "number") {
    if (d.unit === "USD_m") return `$${d.value}M`;
    if (d.unit === "USD_k") return `$${d.value}K`;
    if (d.unit === "months") return `${d.value} months`;
    if (d.unit === "weeks") return `${d.value} weeks`;
    return String(d.value);
  }
  return String(d.value);
}

function buildSummary(
  drivers: ThesisDriver[],
  topRisks: Implication[],
  implications: Implication[],
  revisionsSince: string | null,
): string {
  const lines: string[] = [];

  if (drivers.length === 0 && implications.length === 0) {
    return "No deal model values have been generated yet. Run Synergy, PMI, or TSA to populate the executive brief.";
  }

  lines.push("## Deal thesis snapshot");
  if (drivers.length > 0) {
    for (const d of drivers) {
      const conf = Math.round(d.confidence * 100);
      lines.push(`- **${d.label}:** ${formatDriver(d)} _(confidence ${conf}%)_`);
    }
  } else {
    lines.push("- Core value drivers not yet established.");
  }

  lines.push("");
  lines.push("## What needs attention");
  if (topRisks.length > 0) {
    for (const r of topRisks.slice(0, 5)) {
      const tag = r.severity === "action" ? "Action" : "Watch";
      lines.push(`- **[${tag}] ${r.headline}** — ${r.detail}`);
    }
  } else {
    lines.push("- No action or watch items. The model is internally consistent for now.");
  }

  const notes = implications.filter((i) => i.severity === "info");
  if (notes.length > 0) {
    lines.push("");
    lines.push("## Context");
    for (const n of notes.slice(0, 4)) {
      lines.push(`- ${n.headline} — ${n.detail}`);
    }
  }

  if (revisionsSince) {
    lines.push("");
    lines.push(`_Reflects changes through the latest model update; previous brief generated ${new Date(revisionsSince).toLocaleString()}._`);
  }

  return lines.join("\n");
}
