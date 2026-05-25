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

