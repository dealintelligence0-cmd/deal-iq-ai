export type DealContext = {
  deal_type: "PE Buyout" | "Strategic M&A" | "Merger of Equals" | "VC Investment" | "Carve-out" | "JV";
  deal_archetype: "roll-up" | "turnaround" | "growth" | "synergy" | "capability" | "platform";
  industry: string;
  buyer_type: "PE" | "Strategic" | "Seller" | "VC";
  growth_profile: "high" | "moderate" | "low";
  value_driver: string;
  risk_level: "low" | "medium" | "high";
  deal_size_usd: number;
  size_bucket: "mid-market" | "large-cap" | "mega-cap" | "small-cap";
  expected_synergy_revenue_usd: number;
  expected_synergy_cost_usd: number;
  one_time_costs_usd: number;
  integration_timeline_months: number;
  industry_levers: string[];
  benchmark_multiple: string;
  benchmark_note: string;
};

const HIGH_GROWTH = ["technology", "ai", "biotech", "fintech", "saas", "cybersecurity", "renewable"];
const LOW_GROWTH = ["utilities", "tobacco", "print", "coal", "mining"];

// Industry-anchored synergy benchmarks (source: aggregated MBB / Big4 deal study averages)
const SYNERGY_BENCHMARKS: Record<string, { revPct: number; costPct: number; multiple: string; note: string }> = {
  technology:    { revPct: 0.08, costPct: 0.12, multiple: "12-20x EBITDA", note: "SaaS deals: cross-sell + cloud rationalization" },
  saas:          { revPct: 0.10, costPct: 0.13, multiple: "15-25x EBITDA / 5-12x ARR", note: "Net retention + ARPU expansion typical" },
  manufacturing: { revPct: 0.04, costPct: 0.10, multiple: "8-12x EBITDA", note: "Procurement leverage drives most savings" },
  retail:        { revPct: 0.05, costPct: 0.08, multiple: "6-10x EBITDA", note: "Inventory + private label key levers" },
  healthcare:    { revPct: 0.06, costPct: 0.09, multiple: "12-18x EBITDA", note: "Service line + payer mix optimization" },
  financial:     { revPct: 0.05, costPct: 0.11, multiple: "8-14x EBITDA / 1.5-3x BV", note: "Cost-to-income ratio is primary lever" },
  industrial:    { revPct: 0.04, costPct: 0.09, multiple: "8-12x EBITDA", note: "Aftermarket + footprint optimization" },
  energy:        { revPct: 0.03, costPct: 0.08, multiple: "6-10x EBITDA", note: "Asset utilization + lifting cost reduction" },
  fintech:       { revPct: 0.09, costPct: 0.11, multiple: "10-18x Revenue", note: "Customer base cross-sell" },
  biotech:       { revPct: 0.07, costPct: 0.06, multiple: "Pipeline NPV-driven", note: "R&D consolidation + clinical synergies" },
};

function getBenchmark(sector: string) {
  const s = sector.toLowerCase();
  for (const [k, v] of Object.entries(SYNERGY_BENCHMARKS)) {
    if (s.includes(k)) return v;
  }
  return { revPct: 0.06, costPct: 0.10, multiple: "8-15x EBITDA", note: "diversified industry average" };
}
const SECTOR_LEVERS: Record<string, string[]> = {
  technology: ["ARPU expansion", "net retention rate (NRR)", "logo retention", "upsell motion", "cloud cost optimization"],
  saas: ["ARPU", "churn reduction", "upsell rate", "CAC payback", "gross margin expansion"],
  manufacturing: ["procurement leverage", "plant utilization", "automation capex", "SKU rationalization", "logistics optimization"],
  retail: ["same-store sales", "private label penetration", "inventory turns", "omnichannel mix", "store footprint optimization"],
  healthcare: ["payer mix improvement", "service line consolidation", "physician productivity", "supply chain rebates", "facility utilization"],
  financial: ["cost-to-income ratio", "AUM growth", "fee compression defense", "digital adoption", "credit quality"],
  industrial: ["service attach rate", "installed base monetization", "aftermarket revenue", "energy efficiency capex", "footprint optimization"],
  energy: ["asset utilization", "lifting cost reduction", "renewable transition capex", "hedging strategy"],
};

function getLevers(sector: string): string[] {
  const s = sector.toLowerCase();
  for (const [k, v] of Object.entries(SECTOR_LEVERS)) {
    if (s.includes(k)) return v;
  }
  return ["margin expansion", "revenue growth", "capital efficiency", "working capital optimization", "G&A leverage"];
}

function parseUSD(s: string | null | undefined): number {
  if (!s) return 0;
  const m = /\$?\s*([\d,.]+)\s*([KMBkmb])?/.exec(s);
  if (!m) return 0;
  const n = parseFloat(m[1].replace(/,/g, ''));
  const u = (m[2] || '').toUpperCase();
  if (u === 'B') return n * 1e9;
  if (u === 'M') return n * 1e6;
  if (u === 'K') return n * 1e3;
  return n;
}

export function buildDealContext(input: {
  buyer: string; target: string; sector: string; geography: string;
  deal_size: string; stake_percent?: number; deal_type_input?: string;
  client_role?: string; notes?: string;
}): DealContext {
  const buyer = (input.buyer || "").toLowerCase();
  const sector = input.sector || "Diversified";
  const stake = input.stake_percent ?? null;
  const typeIn = (input.deal_type_input || "").toLowerCase();
  const role = (input.client_role || "").toLowerCase();
  const value = parseUSD(input.deal_size);
  const notes = (input.notes || "").toLowerCase();

  // Buyer type
  let buyer_type: DealContext["buyer_type"] = "Strategic";
  if (role.includes("seller")) buyer_type = "Seller";
  else if (/\b(capital|partners|equity|fund|holdings)\b/.test(buyer) || role.includes("pe")) buyer_type = "PE";
  else if (/ventures|vc/.test(buyer) || /venture/.test(typeIn)) buyer_type = "VC";

  // Deal type
  let deal_type: DealContext["deal_type"] = "Strategic M&A";
  if (buyer_type === "PE") deal_type = "PE Buyout";
  else if (buyer_type === "VC") deal_type = "VC Investment";
  else if (/carve|spin|divest/.test(typeIn)) deal_type = "Carve-out";
  else if (/jv|joint/.test(typeIn)) deal_type = "JV";
  else if (stake !== null && stake >= 45 && stake <= 55) deal_type = "Merger of Equals";

  // Archetype
  let deal_archetype: DealContext["deal_archetype"] = "synergy";
  if (notes.includes("turnaround") || notes.includes("distressed")) deal_archetype = "turnaround";
  else if (notes.includes("roll-up") || notes.includes("consolidat")) deal_archetype = "roll-up";
  else if (notes.includes("capability") || notes.includes("technology") || notes.includes("ip")) deal_archetype = "capability";
  else if (deal_type === "PE Buyout" && value >= 5e8) deal_archetype = "platform";
  else if (deal_type === "VC Investment" || HIGH_GROWTH.some(k => sector.toLowerCase().includes(k))) deal_archetype = "growth";

  // Growth
  const sectorLower = sector.toLowerCase();
  const growth_profile: DealContext["growth_profile"] =
    HIGH_GROWTH.some(k => sectorLower.includes(k)) ? "high"
    : LOW_GROWTH.some(k => sectorLower.includes(k)) ? "low"
    : "moderate";

  // Value driver — buyer-type specific
  const driverMap: Record<string, string> = {
    "PE Buyout": "operational improvement, multiple arbitrage at exit, leverage-driven IRR",
    "Strategic M&A": "revenue synergy, market consolidation, capability fit",
    "Merger of Equals": "scale economics, combined platform value",
    "VC Investment": "growth capital deployment, market capture",
    "Carve-out": "standalone profitability, strategic refocus, parent simplification",
    "JV": "shared risk, capability pooling, market entry",
  };
  const value_driver = driverMap[deal_type];

  // Risk
  const risk_level: DealContext["risk_level"] =
    value >= 5e9 ? "high" : value >= 5e8 ? "medium" : "low";

  // Size
  const size_bucket: DealContext["size_bucket"] =
    value >= 1e10 ? "mega-cap" : value >= 1e9 ? "large-cap" : value >= 1e8 ? "mid-market" : "small-cap";

  // Synergy estimates
 // Synergy estimates — anchored to sector benchmarks
  const bench = getBenchmark(sector);
  // Adjust for buyer type: PE captures more cost; strategic captures more revenue
  const buyerCostMultiplier = deal_type === "PE Buyout" ? 1.2 : deal_type === "Carve-out" ? 0.7 : 1.0;
  const buyerRevMultiplier = buyer_type === "Strategic" ? 1.15 : 0.9;
  const revPct = bench.revPct * buyerRevMultiplier;
  const costPct = bench.costPct * buyerCostMultiplier;
  const oneTimePct = 0.04;

  return {
    deal_type, deal_archetype, industry: sector, buyer_type,
    growth_profile, value_driver, risk_level, deal_size_usd: value, size_bucket,
    expected_synergy_revenue_usd: Math.round(value * revPct),
    expected_synergy_cost_usd: Math.round(value * costPct),
    one_time_costs_usd: Math.round(value * oneTimePct),
    integration_timeline_months: deal_type === "Carve-out" ? 18 : deal_type === "JV" ? 24 : 12,
    industry_levers: getLevers(sector),
    benchmark_multiple: bench.multiple,
    benchmark_note: bench.note,
  };
}

function fmt(n: number): string {
  return n >= 1e9 ? `$${(n/1e9).toFixed(2)}B` : n >= 1e6 ? `$${Math.round(n/1e6)}M` : n > 0 ? `$${n.toLocaleString()}` : "TBD";
}

export function contextToPromptBlock(c: DealContext): string {
  return `
## DEAL CONTEXT (machine-derived, use verbatim)
- deal_type: ${c.deal_type}
- deal_archetype: ${c.deal_archetype}
- buyer_type: ${c.buyer_type}
- industry: ${c.industry}
- growth_profile: ${c.growth_profile}
- value_driver: ${c.value_driver}
- risk_level: ${c.risk_level}
- size_bucket: ${c.size_bucket}
- deal_size: ${fmt(c.deal_size_usd)}
- expected_revenue_synergy: ${fmt(c.expected_synergy_revenue_usd)} (${Math.round(c.expected_synergy_revenue_usd / Math.max(c.deal_size_usd, 1) * 100)}% of EV)
- expected_cost_synergy: ${fmt(c.expected_synergy_cost_usd)} (${Math.round(c.expected_synergy_cost_usd / Math.max(c.deal_size_usd, 1) * 100)}% of EV)
- one_time_integration_cost: ${fmt(c.one_time_costs_usd)} (${Math.round(c.one_time_costs_usd / Math.max(c.deal_size_usd, 1) * 100)}% of EV)
- integration_timeline: ${c.integration_timeline_months} months
- industry_value_levers: ${c.industry_levers.join(", ")}
- benchmark_multiple_range: ${c.benchmark_multiple}
- benchmark_note: ${c.benchmark_note}
- synergy_assumption_basis: revenue ${Math.round(c.expected_synergy_revenue_usd / Math.max(c.deal_size_usd, 1) * 100)}% (sector avg) + cost ${Math.round(c.expected_synergy_cost_usd / Math.max(c.deal_size_usd, 1) * 100)}% (sector avg) — anchored, not arbitrary
`;
}
export function buildAdvisorVerdictPrompt(c: DealContext): string {
  const buyerLensMap: Record<string, string> = {
    PE: "Optimize for IRR, exit multiple, leverage capacity, and 3-5 year value creation plan. Frame every recommendation through MOIC and exit thesis.",
    Strategic: "Optimize for revenue synergies, capability gap closure, market position, and platform extension. Frame through strategic moat and competitive defense.",
    Seller: "Optimize for valuation, carve-out cleanliness, stranded cost minimization, and reverse breakage protection.",
    VC: "Optimize for ARR growth, market capture, dilution efficiency, and follow-on optionality.",
  };
  const buyerLens = buyerLensMap[c.buyer_type] || buyerLensMap.Strategic;

  return `
You are an MBB senior partner producing an enterprise-grade IC-ready advisory verdict.

BUYER LENS (apply throughout): ${buyerLens}
INDUSTRY VALUE LEVERS (use these specifically, not generic): ${c.industry_levers.join(", ")}

REQUIRED OUTPUT — exact 10-section structure, in order, no preamble:

## 1. Deal Thesis
- **Strategic:** [1 sentence — capability/market thesis tied to ${c.industry}]
- **Financial:** [1 sentence with IRR or multiple math; e.g. "${c.buyer_type === 'PE' ? '~18-22% IRR over 5 years assuming 2.5x EBITDA expansion' : 'EPS-accretive in Year 2 at ~$X synergy run-rate'}"]
- **Operational:** [1 sentence anchored on ${c.industry_levers.slice(0, 2).join(" + ")}]

## 2. Deal Score
| Dimension | Score (0-10) | Rationale |
| Market | X | [1-line] |
| Company | X | [1-line] |
| Synergy | X | [1-line] |
| Execution Risk (inverted) | X | [1-line] |
**Composite: X / 10 — Verdict: [Strong / Moderate / Weak]**

## 3. Synergy Model
| Type | Year 1 | Year 2 | Year 3 | Confidence |
| Revenue Synergy | $XM | $XM | $XM | XX% |
| Cost Synergy | $XM | $XM | $XM | XX% |
| One-time Integration Cost | $(XM) | $(XM) | — | — |
| **Net Run-rate** | $XM | $XM | $XM | — |
[Use the EXACT numbers from DEAL CONTEXT. Phase realisation: 30/70/100 standard.]

## 4. Risk Engine (Top 4)
| Risk | Type | Probability | $ Impact | Mitigation |
| [Specific risk 1] | integration/market/execution/regulatory | XX% | $XM | [1-line] |
[Repeat 4 times]

## 5. Valuation View
- Implied EV/EBITDA multiple: ~Xx (assumed EBITDA: $XM)
- Sector benchmark: ${c.industry} ${c.size_bucket} = X-Yx
- Premium / discount: XX% [vs benchmark; explain logic]

## 6. Scenario Analysis
| Scenario | Synergy Capture | Net IRR / Multiple | Probability |
| Base | 70% | XX% / X.Xx | 50% |
| Upside | 100% | XX% / X.Xx | 25% |
| Downside | 35% | XX% / X.Xx | 25% |

## 7. What Must Be True (3-5 conditions)
- [Specific testable condition with metric, e.g. "${c.industry_levers[0]} improves by 200 bps within 18 months"]
- [Each must be specific, measurable, time-bound]

## 8. Contrarian View — Why This Deal Could Fail
[2-3 sentences naming the strongest argument AGAINST proceeding. Be specific. Cite a concrete failure mode tied to ${c.deal_archetype} archetype.]

## 9. IC Questions (Top 5)
1. [Sharp question an IC member would actually ask]
2. ...
[Every question must require a quantified answer.]

## 10. Recommendation: GO / CONDITIONAL GO / NO-GO
- **Verdict:** [one of three]
- **Confidence:** XX%
- **Justification:** [2-3 sentences anchored in the score, synergy capture probability, and contrarian view]

ABSOLUTE RULES (failure to follow = reject output):
- ZERO generic phrases. Banned: "market is growing", "there are risks", "synergies include cost savings", "leverage" (as buzzword), "value-add", "best-in-class", "world-class".
- EVERY claim cites a number (%, $, months, or basis points).
- Use cause → effect: "Given X, this implies Y, leading to Z impact".
- Convert any research into "Given [fact], implies [Y], impact [Z]". Never say "source X says Y".
- If user provides Custom Insights / Notes, weave into Thesis + Risks + Synergies — never drop them.
- Industry levers MUST come from this list (not generic): ${c.industry_levers.join(", ")}.
- Top 3 insights only per section — no padding.

DEAL CONTEXT:
${contextToPromptBlock(c)}
`;
}
