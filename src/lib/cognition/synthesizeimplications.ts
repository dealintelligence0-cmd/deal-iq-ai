

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
import { COGNITION_KEYS, labelForKey } from "./keys";

export type Implication = {
  id: string;                  // stable key derived from the underlying revisions
  severity: "info" | "watch" | "action";
  theme: "timing" | "value" | "risk" | "scope" | "strategic";
  headline: string;            // ≤ 90 chars, executive language
  detail: string;              // ≤ 240 chars, what it means + suggested action
  evidenceRevisionIds: string[];  // for "show me what changed" drill-in
  surfacedAt: string;
};

// Business-language labels live in keys.ts (single source of truth shared with
// the frontend and explain endpoint). labelFor is a thin local alias.
const labelFor = labelForKey;

/**
 * Main entry — input revisions, output executive implications.
 * Deterministic, no AI, fast.
 */
export function synthesizeImplications(revisions: Revision[]): Implication[] {
  if (revisions.length === 0) return [];
  console.info("[cognition][synthesis][input]", { count: revisions.length, keys: revisions.map((r) => r.key) });

  const out: Implication[] = [];
  const byKey = groupBy(revisions, (r) => r.key);

  // ---------- 1. TSA timeline shift -> synergy realization risk ----------
  const tsaDuration = byKey[COGNITION_KEYS.tsa.totalDurationMonths]?.[0];
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
  const costRR = byKey[COGNITION_KEYS.synergy.costRunRateM]?.[0];
  const revRR = byKey[COGNITION_KEYS.synergy.revenueRunRateM]?.[0];
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
  const workstreams = byKey[COGNITION_KEYS.pmi.activeWorkstreams]?.[0];
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
  const tsaBudget = byKey[COGNITION_KEYS.tsa.totalBudgetK]?.[0];
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

  // ---------- 4b. First-observation baselines ----------
  // Change-based sections above require a prior value, so a module's FIRST
  // generation would otherwise surface nothing. Emit a concise, info-level
  // baseline for the core value drivers so the panel always has relevant content.
  for (const rev of revisions) {
    const isFirstObservation = numOrNull(rev.before_value) === null && numOrNull(rev.after_value) !== null;
    if (!isFirstObservation) continue;
    const after = numOrNull(rev.after_value)!;
    const baseline = baselineImplication(rev.key, after, rev);
    if (!baseline) continue;
    // Skip if a richer change-based implication already covers this key.
    if (out.some((i) => i.evidenceRevisionIds.includes(rev.id))) continue;
    out.push(baseline);
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
/**
 * Concise info-level baseline shown when a value driver is first established.
 * Returns null for keys we don't baseline (e.g. flags, low-signal fields).
 */
function baselineImplication(key: string, value: number, rev: Revision): Implication | null {
  const label = labelFor(key);
  const mk = (theme: Implication["theme"], headline: string, detail: string): Implication => ({
    id: `impl-baseline-${rev.id}`,
    severity: "info",
    theme,
    headline,
    detail,
    evidenceRevisionIds: [rev.id],
    surfacedAt: rev.revised_at,
  });

  switch (key) {
    case COGNITION_KEYS.synergy.totalRunRateM:
      return mk("value", `${label} established at $${value}M`,
        `Initial combined synergy run-rate of $${value}M now anchors the value case. Validate the top initiatives before committee and watch for movement as integration planning firms up.`);
    case COGNITION_KEYS.synergy.costRunRateM:
      return mk("value", `${label} established at $${value}M`,
        `Cost synergies of $${value}M are the firmest part of the thesis. Confirm the run-rate basis (headcount, procurement, footprint) and a realistic capture timeline.`);
    case COGNITION_KEYS.synergy.revenueRunRateM:
      return mk("value", `${label} established at $${value}M`,
        `Revenue synergies of $${value}M typically carry execution risk and longer realization. Treat as upside rather than base case until cross-sell assumptions are tested.`);
    case COGNITION_KEYS.synergy.paybackMonths:
      return mk("value", `Synergy payback set at ${value} months`,
        `A ${value}-month payback frames the integration investment case. Pressure-test against TSA duration and one-off costs before relying on it with the committee.`);
    case COGNITION_KEYS.tsa.totalDurationMonths:
      return mk("timing", `TSA transition planned over ${value} months`,
        `A ${value}-month transition sets the operational handover window. Confirm it aligns with synergy capture timing and buyer-side cutover readiness.`);
    case COGNITION_KEYS.pmi.activeWorkstreams:
      return mk("scope", `Integration scoped across ${value} workstream${value === 1 ? "" : "s"}`,
        `The initial plan spans ${value} workstream${value === 1 ? "" : "s"}. Confirm critical functions (IT, Finance, HR) are intentionally scoped and dependencies are mapped.`);
    default:
      return null;
  }
}

function businessLangFromFlag(targetKey: string): string {
  switch (targetKey) {
    case COGNITION_KEYS.synergy.realizeY1Pct:
      return "Recent timing or scope changes may shift Year-1 synergy capture. Worth a quick review of capture targets with the integration team before the next partner sync.";
    case COGNITION_KEYS.valuation.anchorMultiple:
      return "Material movement in synergy or risk assumptions suggests the valuation anchor may need a refresh before committee. Consider re-running the multiple sensitivity.";
    case COGNITION_KEYS.pmi.executionRiskBand:
      return "Integration complexity or signal load has shifted execution risk. Recommend pressure-testing the timeline and contingency buffers.";
    case COGNITION_KEYS.buyer.priorityBand:
      return "Strategic context has shifted — current buyer prioritization may no longer be optimal. Consider re-ranking the target list against updated theme momentum.";
    default:
      return "A recent change in the deal model may have downstream implications worth a quick partner review.";
  }
}
