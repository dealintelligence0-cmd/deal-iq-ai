import type { Deal } from "@/lib/analytics";

export type TriggerEvent = {
  code: string;
  label: string;
  severity: "high" | "medium" | "low";
  rationale: string;
  recommendedAction: string;
};

const RULES: Array<{
  code: string;
  label: string;
  severity: TriggerEvent["severity"];
  pattern: RegExp;
  action: string;
}> = [
  { code: "carve_out", label: "Carve-out / separation signal", severity: "high", pattern: /carve[- ]?out|divest|separation|spin[- ]?off|disposal/i, action: "Prepare TSA, Day-1 readiness, stranded-cost, and separation workstream pitch." },
  { code: "cross_border", label: "Cross-border complexity", severity: "high", pattern: /cross[- ]?border|foreign|overseas|multi[- ]?country|eu|usa|uk|singapore|japan|germany/i, action: "Add regulatory, tax, data-residency, and multi-jurisdiction approval workstreams." },
  { code: "auction", label: "Competitive auction / bidder pressure", severity: "high", pattern: /auction|bidder|bidding|competing|rival|consortium|shortlist/i, action: "Run outside-in diligence, value story, and rapid bid-support sprint." },
  { code: "distress", label: "Distress / restructuring trigger", severity: "high", pattern: /distress|insolvenc|bankrupt|debt|lender|turnaround|restructur/i, action: "Prioritise cash, creditor, downside, and 13-week liquidity diagnostics." },
  { code: "regulatory", label: "Regulatory / antitrust signal", severity: "medium", pattern: /antitrust|competition|regulat|approval|cma|ftc|cci|sebi|rbi|fda|merger control/i, action: "Build approvals map, remedy scenarios, and regulator narrative." },
  { code: "technology", label: "Technology / cyber integration", severity: "medium", pattern: /technology|software|saas|cyber|data|platform|ai|cloud|erp/i, action: "Scope IT diligence, cyber separation, data migration, and platform synergy plan." },
  { code: "minority", label: "Minority stake governance", severity: "medium", pattern: /minority|stake|joint venture|jv|strategic investment/i, action: "Focus on governance rights, reserved matters, exit rights, and value tracking." },
];

function dealText(deal: Partial<Deal> & Record<string, unknown>): string {
  return [
    deal.heading,
    deal.deal_summary,
    deal.opportunity,
    deal.priority_reason,
    deal.advisory_reason,
    deal.risk_reason,
    deal.targeting_reason,
    deal.why_not,
    deal.deal_type,
    deal.country,
    deal.geographies_involved,
    deal.sector,
  ].filter(Boolean).join("\n");
}

export function scanTriggerEvents(deal: Partial<Deal> & Record<string, unknown>): TriggerEvent[] {
  const haystack = dealText(deal);
  const events = RULES.filter((rule) => rule.pattern.test(haystack)).map((rule) => ({
    code: rule.code,
    label: rule.label,
    severity: rule.severity,
    rationale: `Detected ${rule.label.toLowerCase()} in imported deal context for ${deal.buyer ?? "buyer"} → ${deal.target ?? "target"}.`,
    recommendedAction: rule.action,
  }));

  if ((deal.normalized_value_usd ?? 0) >= 1_000_000_000) {
    events.push({
      code: "large_deal",
      label: "Large-deal execution risk",
      severity: "medium",
      rationale: "Deal value exceeds $1B, increasing synergy, governance, and approvals complexity.",
      recommendedAction: "Add executive SteerCo, value-capture office, and approvals war-room scope.",
    });
  }

  return events;
}
