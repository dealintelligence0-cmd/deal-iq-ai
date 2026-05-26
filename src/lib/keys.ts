export const COGNITION_KEYS = {
  synergy: {
    costRunRateM: "synergy.cost_run_rate_m",
    revenueRunRateM: "synergy.revenue_run_rate_m",
    totalRunRateM: "synergy.total_run_rate_m",
    paybackMonths: "synergy.payback_months",
    realizeY1Pct: "synergy.realize_y1_pct",
  },
  pmi: {
    activeWorkstreams: "pmi.active_workstreams",
    totalWeeks: "pmi.total_weeks",
    executionRiskBand: "pmi.execution_risk_band",
  },
  tsa: {
    totalDurationMonths: "tsa.total_duration_months",
    totalBudgetK: "tsa.total_budget_k",
  },
  valuation: {
    anchorMultiple: "valuation.anchor_multiple",
  },
  buyer: {
    priorityBand: "buyer.priority_band",
  },
} as const;

export const COGNITION_PREFIXES = ["synergy", "pmi", "tsa", "valuation", "buyer"] as const;

/**
 * Business-language labels for cognition keys. Single source of truth shared by
 * the synthesis layer, the frontend indicators, and the explain endpoint so that
 * users never see raw system keys (e.g. "tsa.total_duration_months").
 */
export const COGNITION_LABELS: Record<string, string> = {
  [COGNITION_KEYS.synergy.costRunRateM]: "Cost synergy run-rate",
  [COGNITION_KEYS.synergy.revenueRunRateM]: "Revenue synergy run-rate",
  [COGNITION_KEYS.synergy.totalRunRateM]: "Total synergy run-rate",
  [COGNITION_KEYS.synergy.paybackMonths]: "Synergy payback window",
  [COGNITION_KEYS.synergy.realizeY1Pct]: "Year-1 synergy capture",
  [COGNITION_KEYS.pmi.activeWorkstreams]: "Integration workstream count",
  [COGNITION_KEYS.pmi.totalWeeks]: "Integration timeline",
  [COGNITION_KEYS.pmi.executionRiskBand]: "Integration execution risk",
  [COGNITION_KEYS.tsa.totalDurationMonths]: "TSA transition timeline",
  [COGNITION_KEYS.tsa.totalBudgetK]: "TSA transition budget",
  [COGNITION_KEYS.valuation.anchorMultiple]: "Valuation anchor",
  [COGNITION_KEYS.buyer.priorityBand]: "Buyer prioritization",
};

/**
 * Resolve any cognition key (including "flag.*" wrappers) to a business label.
 * Falls back to a humanised version of the key — never exposes the raw prefix.
 */
export function labelForKey(key: string): string {
  const bare = key.startsWith("flag.") ? key.slice("flag.".length) : key;
  return (
    COGNITION_LABELS[bare] ??
    bare.replace(/^[a-z]+\./, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

