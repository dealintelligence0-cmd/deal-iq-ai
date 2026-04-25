export type DealContext = {
  deal_type: "PE Buyout" | "Strategic M&A" | "Merger of Equals" | "VC Investment" | "Carve-out" | "JV";
  industry: string;
  growth_profile: "high" | "moderate" | "low";
  value_driver: string;
  risk_level: "low" | "medium" | "high";
  deal_size_usd: number;
  size_bucket: "mid-market" | "large-cap" | "mega-cap" | "small-cap";
  expected_synergy_revenue_usd: number;
  expected_synergy_cost_usd: number;
  integration_timeline_months: number;
};

const HIGH_GROWTH = ["technology", "ai", "biotech", "fintech", "saas", "cybersecurity", "renewable"];
const LOW_GROWTH = ["utilities", "tobacco", "print", "coal", "mining"];

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
  const value = parseUSD(input.deal_size);

  // Deal type
  let deal_type: DealContext["deal_type"] = "Strategic M&A";
  if (/\b(capital|partners|equity|fund|holdings)\b/.test(buyer) || /pe|buyout/.test(typeIn)) deal_type = "PE Buyout";
  else if (/venture|vc/.test(typeIn) || /ventures/.test(buyer)) deal_type = "VC Investment";
  else if (/carve|spin|divest/.test(typeIn)) deal_type = "Carve-out";
  else if (/jv|joint/.test(typeIn)) deal_type = "JV";
  else if (stake !== null && stake >= 45 && stake <= 55) deal_type = "Merger of Equals";

  // Growth
  const sectorLower = sector.toLowerCase();
  const growth_profile: DealContext["growth_profile"] =
    HIGH_GROWTH.some(k => sectorLower.includes(k)) ? "high"
    : LOW_GROWTH.some(k => sectorLower.includes(k)) ? "low"
    : "moderate";

  // Value driver
  const driverMap: Record<string, string> = {
    "PE Buyout": "operational improvement & multiple arbitrage at exit",
    "Strategic M&A": "revenue synergy + market consolidation",
    "Merger of Equals": "scale economics + combined platform",
    "VC Investment": "growth capital deployment + market capture",
    "Carve-out": "standalone profitability & strategic refocus",
    "JV": "shared risk & capability pooling",
  };
  const value_driver = driverMap[deal_type];

  // Risk
  const risk_level: DealContext["risk_level"] =
    value >= 5e9 ? "high"
    : value >= 5e8 ? "medium"
    : "low";

  // Size bucket
  const size_bucket: DealContext["size_bucket"] =
    value >= 1e10 ? "mega-cap"
    : value >= 1e9 ? "large-cap"
    : value >= 1e8 ? "mid-market"
    : "small-cap";

  // Synergy estimates (industry benchmarks)
  const revPct = growth_profile === "high" ? 0.12 : growth_profile === "moderate" ? 0.08 : 0.04;
  const costPct = deal_type === "PE Buyout" ? 0.15 : deal_type === "Carve-out" ? 0.08 : 0.13;

  return {
    deal_type, industry: sector, growth_profile, value_driver, risk_level,
    deal_size_usd: value, size_bucket,
    expected_synergy_revenue_usd: Math.round(value * revPct),
    expected_synergy_cost_usd: Math.round(value * costPct),
    integration_timeline_months: deal_type === "Carve-out" ? 18 : deal_type === "JV" ? 24 : 12,
  };
}

export function contextToPromptBlock(c: DealContext): string {
  const fmt = (n: number) => n >= 1e9 ? `$${(n/1e9).toFixed(2)}B` : n >= 1e6 ? `$${Math.round(n/1e6)}M` : n > 0 ? `$${n.toLocaleString()}` : "TBD";
  return `
## DEAL CONTEXT (machine-derived, use verbatim)
- deal_type: ${c.deal_type}
- industry: ${c.industry}
- growth_profile: ${c.growth_profile}
- value_driver: ${c.value_driver}
- risk_level: ${c.risk_level}
- size_bucket: ${c.size_bucket}
- deal_size_usd: ${fmt(c.deal_size_usd)}
- expected_synergy_revenue: ${fmt(c.expected_synergy_revenue_usd)} (${Math.round(c.expected_synergy_revenue_usd / Math.max(c.deal_size_usd, 1) * 100)}% of deal value)
- expected_synergy_cost: ${fmt(c.expected_synergy_cost_usd)} (${Math.round(c.expected_synergy_cost_usd / Math.max(c.deal_size_usd, 1) * 100)}% of deal value)
- integration_timeline: ${c.integration_timeline_months} months
`;
}

export function buildAdvisorVerdictPrompt(c: DealContext): string {
  return `
You are a senior MBB partner producing a CEO-ready advisory verdict.

REQUIRED OUTPUT (exact 5-section structure, no preamble):

## Investment Thesis
[3 sharp bullets — each MUST cite a number (%, $, or timeline) and a cause→effect link]

## Top 3 Risks (Quantified)
[Each risk: ONE-LINE description + impact in % / $ / timeline + mitigation]

## Top 3 Synergies (With Impact)
[Each: source + sized impact + realisation timeline. Use the synergy estimates from DEAL CONTEXT verbatim]

## Key Unknowns
[3-5 specific unanswered questions that materially change the verdict]

## Recommendation: GO / CONDITIONAL GO / NO-GO
[Verdict + 2-3 sentence justification anchored in the numbers above]

ABSOLUTE RULES:
- ZERO generic phrases. Banned: "market is growing", "there are risks", "synergies include cost savings", "leverage", "value-add", "best-in-class".
- EVERY claim must cite a number or specific assumption.
- Use cause→effect reasoning: "Given X, this implies Y, leading to Z impact".
- If research is provided, convert each finding into "Given [fact], implies [Y], impact [Z]".
- If user provides Custom Insights, weave them into Risks AND Synergies AND Thesis — never drop them.
- Decision-maker lens: would a CEO / IC approve this deal? What could break it?

DEAL CONTEXT BLOCK:
${contextToPromptBlock(c)}
`;
}
