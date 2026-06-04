

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
  const cognitionImplications = synthesizeImplications(revisions);
  // Pull risks / flags directly from the deal model + deal record so the brief
  // reflects the advisory-intelligence layer even when the cognition tables are
  // empty for this scope.
  const dealDerived = await fetchDealDerivedSignals(admin, opts.dealId);
  const implications = [...cognitionImplications, ...dealDerived.risks, ...dealDerived.flags];
  const topRisks = implications.filter((i) => i.severity === "action" || i.severity === "watch");
  const warnings = implications.filter((i) => i.id.startsWith("impl-flag-") || i.id.startsWith("deal-flag-"));
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

// Synthetic driver keys for values that live on the deal model rather than the
// cognition table (the brief sets the label/unit explicitly for these).
const EV_KEY = "valuation.ev_usd_m";
const NET_SYNERGY_KEY = COGNITION_KEYS.synergy.totalRunRateM;
const ONE_TIME_KEY = "integration.one_time_cost_m";
const DEAL_VALUE_KEY = "deal.value_usd_m";

// Exec reading order across both cognition + deal-model-derived drivers.
const DISPLAY_ORDER: string[] = [
  EV_KEY,
  NET_SYNERGY_KEY,
  COGNITION_KEYS.synergy.costRunRateM,
  COGNITION_KEYS.synergy.revenueRunRateM,
  COGNITION_KEYS.synergy.paybackMonths,
  ONE_TIME_KEY,
  COGNITION_KEYS.tsa.totalDurationMonths,
  COGNITION_KEYS.tsa.totalBudgetK,
  COGNITION_KEYS.pmi.totalWeeks,
  COGNITION_KEYS.pmi.activeWorkstreams,
  COGNITION_KEYS.valuation.anchorMultiple,
  DEAL_VALUE_KEY,
];

function confFromBand(band: string | null | undefined): number {
  const b = (band ?? "").toLowerCase();
  if (b.includes("high")) return 0.85;
  if (b.includes("low")) return 0.5;
  if (b.includes("med")) return 0.65;
  return 0.7;
}

const usdM = (n: number | null | undefined): number | null =>
  n === null || n === undefined ? null : Math.round((Number(n) / 1e6) * 10) / 10;

/** Derive thesis drivers from the canonical deal model + deal record. */
function driversFromDealModel(dm: any, deal: any): ThesisDriver[] {
  const out: ThesisDriver[] = [];
  const push = (key: string, label: string, value: number | string | null, unit: string | null, confidence: number) => {
    if (value === null || value === undefined) return;
    out.push({ key, label, value, unit, currency: "USD", confidence, source: "derived", lastRevisedAt: dm?.updated_at ?? null });
  };
  if (dm) {
    push(EV_KEY, "Enterprise value", usdM(dm.ev_usd), "USD_m", 0.8);
    push(NET_SYNERGY_KEY, "Net run-rate synergy (Y3)", usdM(dm.net_runrate_y3), "USD_m", confFromBand(dm.cost_synergy_confidence));
    push(COGNITION_KEYS.synergy.costRunRateM, "Cost synergy run-rate", usdM(dm.cost_synergy_runrate), "USD_m", confFromBand(dm.cost_synergy_confidence));
    push(COGNITION_KEYS.synergy.revenueRunRateM, "Revenue synergy run-rate", usdM(dm.rev_synergy_runrate), "USD_m", confFromBand(dm.rev_synergy_confidence));
    if (dm.payback_months != null) push(COGNITION_KEYS.synergy.paybackMonths, "Synergy payback window", Number(dm.payback_months), "months", 0.7);
    push(ONE_TIME_KEY, "One-time integration cost", usdM(dm.one_time_integration_cost), "USD_m", 0.7);
  }
  if (deal && deal.normalized_value_usd != null) {
    push(DEAL_VALUE_KEY, "Deal value", usdM(deal.normalized_value_usd), "USD_m", 0.75);
  }
  return out;
}

async function fetchThesisDrivers(
  admin: any,
  workspaceId: string | null,
  dealId: string | null,
): Promise<ThesisDriver[]> {
  // 1) Cognition layer (partner-set / AI-tracked values, with provenance).
  let q = admin
    .from("cognition_assumptions")
    .select("key, value_numeric, value_text, value_json, unit, currency, confidence, source, last_revised_at")
    .in("key", THESIS_KEYS);
  q = workspaceId === null ? q.is("workspace_id", null) : q.eq("workspace_id", workspaceId);
  q = dealId === null ? q.is("deal_id", null) : q.eq("deal_id", dealId);
  const { data } = await q;
  const cogRows: any[] = data ?? [];

  // 2) Deal model + deal record (the advisory-intelligence source of truth).
  let dm: any = null;
  let deal: any = null;
  if (dealId) {
    const [{ data: dmRow }, { data: dealRow }] = await Promise.all([
      admin.from("deal_models").select("*").eq("deal_id", dealId).maybeSingle(),
      admin.from("deals").select("normalized_value_usd, sector, deal_type, buyer, target").eq("id", dealId).maybeSingle(),
    ]);
    dm = dmRow; deal = dealRow;
  }

  // Merge: deal-model drivers form the base; cognition values override (they
  // carry partner edits + provenance and are authoritative when present).
  const byKey = new Map<string, ThesisDriver>();
  for (const d of driversFromDealModel(dm, deal)) byKey.set(d.key, d);
  for (const r of cogRows) {
    byKey.set(r.key, {
      key: r.key,
      label: labelForKey(r.key),
      value: r.value_numeric ?? r.value_text ?? r.value_json ?? null,
      unit: r.unit ?? null,
      currency: r.currency ?? null,
      confidence: Number(r.confidence ?? 0.7),
      source: r.source ?? "default",
      lastRevisedAt: r.last_revised_at ?? null,
    });
  }

  const ordered: ThesisDriver[] = [];
  for (const key of DISPLAY_ORDER) {
    const d = byKey.get(key);
    if (d && d.value !== null && d.value !== undefined) ordered.push(d);
  }
  // Append any remaining cognition keys not covered by DISPLAY_ORDER.
  for (const [key, d] of byKey) {
    if (!DISPLAY_ORDER.includes(key) && d.value !== null && d.value !== undefined) ordered.push(d);
  }
  return ordered;
}

/** Risks + cross-module flags pulled straight from the deal model / deal row. */
async function fetchDealDerivedSignals(
  admin: any,
  dealId: string | null,
): Promise<{ risks: Implication[]; flags: Implication[] }> {
  if (!dealId) return { risks: [], flags: [] };
  const [{ data: dm }, { data: deal }] = await Promise.all([
    admin.from("deal_models").select("risk_register, regulatory_filings, downside_case, updated_at").eq("deal_id", dealId).maybeSingle(),
    admin.from("deals").select("risk_reason, why_not, risk_flag, deal_type, country, geographies_involved, time_sensitivity").eq("id", dealId).maybeSingle(),
  ]);
  const now = new Date().toISOString();
  const risks: Implication[] = [];
  const flags: Implication[] = [];

  // Risk register from the deal model.
  const reg: any[] = Array.isArray(dm?.risk_register) ? dm!.risk_register : [];
  reg.slice(0, 6).forEach((r, i) => {
    const headline = String(r.risk ?? r.title ?? r.name ?? r.headline ?? r.category ?? "Risk").trim();
    const detailParts = [r.mitigation ?? r.response ?? r.detail ?? "", r.impact ? `Impact: ${r.impact}.` : ""].filter(Boolean);
    const prob = typeof r.probability === "number" ? r.probability : parseFloat(String(r.probability ?? "").replace(/[^\d.]/g, ""));
    const severity: Implication["severity"] = (isFinite(prob) && prob >= 0.2) || /high/i.test(String(r.probability ?? r.severity ?? "")) ? "action" : "watch";
    if (!headline || headline === "Risk") return;
    risks.push({
      id: `deal-risk-${i}`, severity, theme: "risk",
      headline: headline.slice(0, 90),
      detail: (detailParts.join(" ") || `${r.type ?? "Risk"} requiring active management.`).slice(0, 240),
      evidenceRevisionIds: [], surfacedAt: now,
    });
  });

  // Regulatory filings → watch flags.
  const filings: any[] = Array.isArray(dm?.regulatory_filings) ? dm!.regulatory_filings : [];
  filings.slice(0, 3).forEach((f, i) => {
    const body = String(f.body ?? f.authority ?? f.regulator ?? f.name ?? "").trim();
    if (!body) return;
    flags.push({
      id: `deal-flag-reg-${i}`, severity: "watch", theme: "risk",
      headline: `Regulatory: ${body}`.slice(0, 90),
      detail: String(f.status ?? f.note ?? f.detail ?? "Approval required before close.").slice(0, 240),
      evidenceRevisionIds: [], surfacedAt: now,
    });
  });

  // Deal-level advisory flags (contrarian / why-not / risk reason).
  if (deal?.why_not) {
    flags.push({ id: "deal-flag-whynot", severity: "watch", theme: "strategic", headline: "Contrarian view", detail: String(deal.why_not).slice(0, 240), evidenceRevisionIds: [], surfacedAt: now });
  }
  if (deal?.risk_reason && !risks.length) {
    risks.push({ id: "deal-risk-primary", severity: /high/i.test(String(deal.risk_flag ?? "")) ? "action" : "watch", theme: "risk", headline: "Key deal risk", detail: String(deal.risk_reason).slice(0, 240), evidenceRevisionIds: [], surfacedAt: now });
  }
  const crossBorder = deal?.country || deal?.geographies_involved;
  if (crossBorder && /cross|→|multi|;|,/.test(String(crossBorder))) {
    flags.push({ id: "deal-flag-geo", severity: "info", theme: "scope", headline: "Cross-border execution", detail: `Jurisdictions: ${String(crossBorder).slice(0, 120)}. Plan regulatory and integration timing accordingly.`, evidenceRevisionIds: [], surfacedAt: now });
  }

  return { risks, flags };
}

function formatDriver(d: ThesisDriver): string {
  if (d.value === null || d.value === undefined) return "—";
  if (typeof d.value === "number") {
    if (d.unit === "USD_m") return d.value >= 1000 ? `$${(d.value / 1000).toFixed(2)}B` : `$${d.value}M`;
    if (d.unit === "USD_k") return d.value >= 1000 ? `$${(d.value / 1000).toFixed(1)}M` : `$${d.value}K`;
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
