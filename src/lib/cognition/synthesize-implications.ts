

/**
 * Implication synthesis (Phase 3).
 *
 * Turns raw revisions + propagation flags into executive-friendly business
 * implications. Never shows users system keys like "tsa.total_duration_months".
 *
 * Strategy:
 *   1. Group recent revisions by impact theme (timing / value / risk / scope).
 *   2. For each theme, apply a deterministic template that explains:
 *      - what happened in business terms
 *      - what it means for the deal
 *      - what action to consider
 *   3. Severity is derived from confidence drop + magnitude of change.
 *
 * Zero AI tokens. Pure templating. If a partner wants more detail, the
 * "Explain" button on individual revisions remains the AI-on-demand path
 * (cached, 7-day TTL — already built in Phase 2).
 */

import type { Revision } from "./orchestrator";

export type Implication = {
  id: string;                  // stable key derived from the underlying revisions
  severity: "info" | "watch" | "action";
  theme: "timing" | "value" | "risk" | "scope" | "strategic";
  headline: string;            // ≤ 90 chars, executive language
  detail: string;              // ≤ 240 chars, what it means + suggested action
  evidenceRevisionIds: string[];  // for "show me what changed" drill-in
  surfacedAt: string;
};

// Map of system keys -> business-language labels (kept narrow)
const KEY_LABELS: Record<string, string> = {
  "synergy.cost_run_rate_m": "Cost synergy run-rate",
  "synergy.revenue_run_rate_m": "Revenue synergy run-rate",
  "synergy.total_run_rate_m": "Total synergy run-rate",
  "synergy.payback_months": "Synergy payback window",
  "synergy.realize_y1_pct": "Year-1 synergy capture",
  "pmi.active_workstreams": "Integration workstream count",
  "pmi.total_weeks": "Integration timeline",
  "pmi.execution_risk_band": "Integration execution risk",
  "tsa.total_duration_months": "TSA transition timeline",
  "tsa.total_budget_k": "TSA transition budget",
  "valuation.anchor_multiple": "Valuation anchor",
  "buyer.priority_band": "Buyer prioritization",
};

function labelFor(key: string): string {
  return KEY_LABELS[key] ?? key.replace(/^[a-z]+\./, "").replace(/_/g, " ");
}

/**
 * Main entry — input revisions, output executive implications.
 * Deterministic, no AI, fast.
 */
export function synthesizeImplications(revisions: Revision[]): Implication[] {
  if (revisions.length === 0) return [];

  const out: Implication[] = [];
  const byKey = groupBy(revisions, (r) => r.key);

  // ---------- 1. TSA timeline shift -> synergy realization risk ----------
  const tsaDuration = byKey["tsa.total_duration_months"]?.[0];
  if (tsaDuration) {
    const before = numOrNull(tsaDuration.before_value);
    const after = numOrNull(tsaDuration.after_value);
    const delta = before !== null && after !== null ? after - before : null;
    if (delta !== null && Math.abs(delta) >= 3) {
      out.push({
        id: `impl-tsa-timing-${tsaDuration.id}`,
        severity: Math.abs(delta) >= 6 ? "action" : "watch",
        theme: "timing",
        headline: delta > 0
          ? `TSA transition extended by ${delta} months`
          : `TSA transition compressed by ${Math.abs(delta)} months`,
        detail: delta > 0
          ? "Extended TSA timelines typically delay full synergy realization by 1-2 quarters. Consider re-baselining Year-1 capture targets and pressure-testing buyer migration readiness."
          : "Compressed TSA may accelerate synergy capture but raises execution risk on buyer-side infrastructure cutover. Validate buyer readiness for shortened transition.",
        evidenceRevisionIds: [tsaDuration.id],
        surfacedAt: tsaDuration.revised_at,
      });
    }
  }

  // ---------- 2. Synergy run-rate material movement -> valuation review ----------
  const costRR = byKey["synergy.cost_run_rate_m"]?.[0];
  const revRR = byKey["synergy.revenue_run_rate_m"]?.[0];
  for (const rev of [costRR, revRR].filter(Boolean) as Revision[]) {
    const before = numOrNull(rev.before_value);
    const after = numOrNull(rev.after_value);
    if (before !== null && after !== null && before > 0) {
      const pctDelta = ((after - before) / before) * 100;
      if (Math.abs(pctDelta) >= 15) {
        const label = labelFor(rev.key);
        const direction = pctDelta > 0 ? "increased" : "decreased";
        out.push({
          id: `impl-synergy-${rev.id}`,
          severity: Math.abs(pctDelta) >= 30 ? "action" : "watch",
          theme: "value",
          headline: `${label} ${direction} ${Math.abs(Math.round(pctDelta))}%`,
          detail: pctDelta > 0
            ? `${label} now $${after}M (was $${before}M). Upside warrants tighter validation of underlying initiatives before partner committee — consider stress-testing the top 2 line items.`
            : `${label} now $${after}M (was $${before}M). Downside may compress investment thesis returns — review valuation anchor and engagement pricing assumptions.`,
          evidenceRevisionIds: [rev.id],
          surfacedAt: rev.revised_at,
        });
      }
    }
  }

  // ---------- 3. PMI workstream count -> integration complexity ----------
  const workstreams = byKey["pmi.active_workstreams"]?.[0];
  if (workstreams) {
    const after = numOrNull(workstreams.after_value);
    if (after !== null) {
      if (after >= 7) {
        out.push({
          id: `impl-pmi-complexity-${workstreams.id}`,
          severity: after >= 9 ? "action" : "watch",
          theme: "risk",
          headline: `Integration scope now spans ${after} workstreams`,
          detail: after >= 9
            ? "Workstream count at this level historically signals execution risk: parallel dependencies, governance overhead, and resource conflict. Consider sequencing into waves or appointing a dedicated IMO lead."
            : "Workstream count is elevated. Validate that critical-path dependencies are mapped and that the integration management office has bandwidth to coordinate.",
          evidenceRevisionIds: [workstreams.id],
          surfacedAt: workstreams.revised_at,
        });
      } else if (after >= 1 && after <= 3) {
        out.push({
          id: `impl-pmi-narrow-${workstreams.id}`,
          severity: "info",
          theme: "scope",
          headline: `Integration scope is narrow (${after} workstream${after === 1 ? "" : "s"})`,
          detail: "Narrow scope reduces complexity but may indicate underspecified integration plan. Confirm key functions (IT, Finance, HR) are intentionally out-of-scope rather than overlooked.",
          evidenceRevisionIds: [workstreams.id],
          surfacedAt: workstreams.revised_at,
        });
      }
    }
  }

  // ---------- 4. TSA budget material movement -> deal economics review ----------
  const tsaBudget = byKey["tsa.total_budget_k"]?.[0];
  if (tsaBudget) {
    const before = numOrNull(tsaBudget.before_value);
    const after = numOrNull(tsaBudget.after_value);
    if (before !== null && after !== null && before > 0) {
      const pctDelta = ((after - before) / before) * 100;
      if (Math.abs(pctDelta) >= 20) {
        out.push({
          id: `impl-tsa-budget-${tsaBudget.id}`,
          severity: Math.abs(pctDelta) >= 40 ? "action" : "watch",
          theme: "value",
          headline: pctDelta > 0
            ? `TSA budget expanded by ${Math.round(pctDelta)}%`
            : `TSA budget reduced by ${Math.abs(Math.round(pctDelta))}%`,
          detail: pctDelta > 0
            ? `TSA cost now $${Math.round(after)}K (was $${Math.round(before)}K). Higher transition cost compresses net synergy capture — re-verify pricing basis and service durations.`
            : `TSA cost now $${Math.round(after)}K (was $${Math.round(before)}K). Compressed scope may improve net economics but check whether necessary services were removed prematurely.`,
          evidenceRevisionIds: [tsaBudget.id],
          surfacedAt: tsaBudget.revised_at,
        });
      }
    }
  }

  // ---------- 5. Surface raw propagation flags as soft implications ----------
  // Flag rows have key like "flag.<target_key>" and after_value is the rule's message.
  // We re-template them so users never see the raw rule text.
  const flagRevisions = revisions.filter((r) => r.key.startsWith("flag."));
  for (const f of flagRevisions) {
    const targetKey = f.key.replace(/^flag\./, "");
    const targetLabel = labelFor(targetKey);
    // Suppress if we already surfaced a richer implication covering the same target
    const alreadyCovered = out.some((i) => i.evidenceRevisionIds.length > 0 &&
      revisions.find((r) => i.evidenceRevisionIds.includes(r.id) && r.key.split(".").slice(0, 2).join(".") === targetKey.split(".").slice(0, 2).join(".")));
    if (alreadyCovered) continue;

    out.push({
      id: `impl-flag-${f.id}`,
      severity: "watch",
      theme: targetKey.startsWith("valuation") ? "value"
            : targetKey.startsWith("pmi") ? "risk"
            : targetKey.startsWith("synergy") ? "value"
            : targetKey.startsWith("buyer") ? "strategic"
            : "risk",
      headline: `${targetLabel} flagged for partner review`,
      detail: businessLangFromFlag(targetKey),
      evidenceRevisionIds: [f.id],
      surfacedAt: f.revised_at,
    });
  }

  // Sort: action > watch > info, then most recent first
  const sevOrder = { action: 0, watch: 1, info: 2 } as const;
  out.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity] || b.surfacedAt.localeCompare(a.surfacedAt));

  return out;
}

// ---------- helpers ----------

function groupBy<T>(arr: T[], keyFn: (t: T) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const item of arr) {
    const k = keyFn(item);
    (out[k] ??= []).push(item);
  }
  return out;
}

function numOrNull(v: any): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return isFinite(n) ? n : null;
}

/**
 * Stable business-language messages for each known target_key.
 * These are the ONLY user-facing texts associated with propagation flags.
 * Raw rule messages from the DB are never surfaced to the UI.
 */
function businessLangFromFlag(targetKey: string): string {
  switch (targetKey) {
    case "synergy.realize_y1_pct":
      return "Recent timing or scope changes may shift Year-1 synergy capture. Worth a quick review of capture targets with the integration team before the next partner sync.";
    case "valuation.anchor_multiple":
      return "Material movement in synergy or risk assumptions suggests the valuation anchor may need a refresh before committee. Consider re-running the multiple sensitivity.";
    case "pmi.execution_risk_band":
      return "Integration complexity or signal load has shifted execution risk. Recommend pressure-testing the timeline and contingency buffers.";
    case "buyer.priority_band":
      return "Strategic context has shifted — current buyer prioritization may no longer be optimal. Consider re-ranking the target list against updated theme momentum.";
    default:
      return "A recent change in the deal model may have downstream implications worth a quick partner review.";
  }
}
