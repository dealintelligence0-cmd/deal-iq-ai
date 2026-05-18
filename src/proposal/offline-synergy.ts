

/**
 * Deal IQ AI — Offline rule-based Synergy model generator.
 *
 * Deterministic, instant, no AI key required. Mirrors the structure of
 * the AI-generated synergy output (Executive Summary, Cost Synergies,
 * Revenue Synergies, Integration Costs, Net Synergy Waterfall, Risks,
 * Sector Benchmarks) so the visual renderer + PPTX exporter render it
 * with the same look-and-feel.
 */

export type SynergyOfflineInput = {
  buyer: string;
  target: string;
  sector: string;
  geography: string;
  dealSize: string;
  targetRevenue?: string;     // $M
  targetEbitda?: string;      // $M
  buyerRevenue?: string;      // $M
  ambition: "conservative" | "base" | "aggressive" | string;
  notes?: string;
  mandateType?: string;
  buyerType?: string;
  ownershipType?: string;
  integrationStyle?: string;
};

const fmt = (n: number, currency = "$") => {
  if (!isFinite(n) || n <= 0) return "—";
  if (n >= 1000) return `${currency}${(n / 1000).toFixed(1)}B`;
  return `${currency}${n.toFixed(1)}M`;
};

function parseMoney(s: string | undefined): number {
  if (!s) return 0;
  const cleaned = String(s).replace(/[^\d.kKmMbBnN]/g, "");
  const m = /([\d.]+)\s*([kKmMbBnN])?/.exec(cleaned);
  if (!m) return 0;
  const v = parseFloat(m[1]);
  const u = (m[2] || "M").toLowerCase();
  if (u === "b" || u === "n") return v * 1000;
  if (u === "k") return v / 1000;
  return v;
}

// Sector-level benchmarks for synergy as % of combined revenue
const SECTOR_BENCH: Record<string, { cost: number; rev: number; intCost: number; payback: number }> = {
  technology:           { cost: 0.06, rev: 0.04, intCost: 0.08, payback: 18 },
  healthcare:           { cost: 0.05, rev: 0.03, intCost: 0.07, payback: 20 },
  pharma:               { cost: 0.06, rev: 0.035, intCost: 0.07, payback: 20 },
  pharmaceuticals:      { cost: 0.06, rev: 0.035, intCost: 0.07, payback: 20 },
  financial:            { cost: 0.07, rev: 0.025, intCost: 0.08, payback: 22 },
  banking:              { cost: 0.07, rev: 0.025, intCost: 0.08, payback: 22 },
  consumer:             { cost: 0.05, rev: 0.04, intCost: 0.06, payback: 16 },
  retail:               { cost: 0.04, rev: 0.035, intCost: 0.06, payback: 16 },
  industrial:           { cost: 0.06, rev: 0.03, intCost: 0.07, payback: 20 },
  manufacturing:        { cost: 0.06, rev: 0.03, intCost: 0.07, payback: 20 },
  energy:               { cost: 0.07, rev: 0.025, intCost: 0.08, payback: 24 },
  utilities:            { cost: 0.05, rev: 0.02, intCost: 0.06, payback: 22 },
  telecom:              { cost: 0.07, rev: 0.03, intCost: 0.08, payback: 20 },
  media:                { cost: 0.06, rev: 0.04, intCost: 0.07, payback: 18 },
  default:              { cost: 0.055, rev: 0.03, intCost: 0.07, payback: 18 },
};

function getBench(sector: string) {
  const k = sector.toLowerCase().replace(/[^a-z]/g, "");
  for (const key of Object.keys(SECTOR_BENCH)) {
    if (k.includes(key)) return SECTOR_BENCH[key];
  }
  return SECTOR_BENCH.default;
}

const AMBITION_MULT: Record<string, number> = {
  conservative: 0.7,
  base: 1.0,
  aggressive: 1.35,
};

export function generateOfflineSynergy(input: SynergyOfflineInput): string {
  const {
    buyer, target, sector, geography, dealSize,
    targetRevenue, buyerRevenue, ambition, notes,
  } = input;
  const B = buyer || "Buyer";
  const T = target || "Target";
  const S = sector || "the sector";
  const G = geography || "the operating geography";
  const ambKey = (ambition || "base").toLowerCase();
  const mult = AMBITION_MULT[ambKey] ?? 1.0;
  const ambLabel = ambKey === "conservative" ? "Conservative" : ambKey === "aggressive" ? "Aggressive" : "Base Case";

  const tRev = parseMoney(targetRevenue);
  const bRev = parseMoney(buyerRevenue);
  const ev = parseMoney(dealSize);
  const combined = (tRev + bRev) > 0 ? (tRev + bRev) : Math.max(ev * 0.8, 100);

  const bench = getBench(sector);
  const costSyn = combined * bench.cost * mult;
  const revSyn = combined * bench.rev * mult;
  const totalSyn = costSyn + revSyn;
  const intCost = combined * bench.intCost * mult;
  const netNpv = totalSyn * 3.5 - intCost;
  const synEvPct = ev > 0 ? (totalSyn / ev) * 100 : 0;
  const payback = bench.payback;

  const rY1 = revSyn * 0.2;
  const rY2 = revSyn * 0.6;
  const rY3 = revSyn;
  const cY1 = costSyn * 0.3;
  const cY2 = costSyn * 0.7;
  const cY3 = costSyn;

  const costLevers: Array<[string, string, number, string, string]> = [
    ["Procurement Savings",     "Procurement",  0.20, "Combined spend rebid; preferred supplier; category alignment", "Procurement Team"],
    ["SG&A Overlap",            "G&A",          0.30, "Finance, HR, Legal, Executive overlap removal",                "Finance & HR"],
    ["IT Platform Rationalization", "Technology", 0.17, "Cloud stack, ERP, redundant systems decommission",            "IT Department"],
    ["Footprint / Real Estate", "Footprint",    0.12, "Site consolidation; lease exit; layout optimisation",          "Facilities"],
    ["Operations / Headcount",  "Operations",   0.21, "Org redesign; spans of control; layered management",           "COO Office"],
  ];
  const costRows = costLevers.map(([lever, cat, w, mech, owner]) => {
    const y1 = (costSyn * w) * 0.3;
    const y2 = (costSyn * w) * 0.7;
    const y3 = costSyn * w;
    return `| ${lever} | ${cat} | ${fmt(y1)} | ${fmt(y2)} | ${fmt(y3)} | Medium | ${owner} |`;
  }).join("\n");

  const revLevers: Array<[string, string, number, string, string]> = [
    ["Cross-sell",          "Cross-Sell",     0.40, "Combined customer base; portfolio expansion",  "Sales & GTM"],
    ["Pricing Optimization", "Pricing",       0.26, "Combined pricing power; bundle premium",       "Pricing Team"],
    ["Geographic Expansion", "Geographic",    0.17, "Distribution leverage; new market entry",      "Marketing"],
    ["Product Bundling",     "Bundling",      0.11, "Combined product offering; attach rate",       "Product Team"],
    ["New Product Development", "NPD",        0.06, "Co-development using both IPs",                "R&D"],
  ];
  const revRows = revLevers.map(([lever, mech, w, , owner]) => {
    const y1 = (revSyn * w) * 0.2;
    const y2 = (revSyn * w) * 0.6;
    const y3 = revSyn * w;
    return `| ${lever} | ${mech} | ${fmt(y1)} | ${fmt(y2)} | ${fmt(y3)} | Medium | ${owner} |`;
  }).join("\n");

  const intRows = [
    ["Severance / Restructuring", fmt(intCost * 0.30), "Immediate", "Headcount reduction and organizational restructuring"],
    ["Technology Migration",      fmt(intCost * 0.22), "6-12 months", "IT platform rationalisation and system integration"],
    ["Facilities",                fmt(intCost * 0.16), "6-12 months", "Footprint optimisation and warehouse consolidation"],
    ["Professional Fees",         fmt(intCost * 0.12), "Immediate", "Advisory and consulting fees for integration planning"],
    ["Communications & Retention",fmt(intCost * 0.20), "Ongoing",  "Change management and employee retention programmes"],
  ].map((r) => `| ${r[0]} | ${r[1]} | ${r[2]} | ${r[3]} |`).join("\n");

  const wf: Array<[string, number, number, number, number]> = [
    ["Y1", cY1,   rY1, -intCost,        cY1 + rY1 - intCost],
    ["Y2", cY2,   rY2,  0,              cY1 + rY1 - intCost + cY2 + rY2],
    ["Y3", cY3,   rY3,  0,              cY1 + rY1 - intCost + cY2 + rY2 + cY3 + rY3],
    ["Steady State", cY3, rY3, 0,       cY1 + rY1 - intCost + cY2 + rY2 + (cY3 + rY3) * 2],
  ];
  const wfRows = wf.map(([y, c, r, ic, cum]) => `| ${y} | ${fmt(c)} | ${fmt(r)} | ${fmt(ic)} | ${fmt(c + r + ic)} | ${fmt(cum)} |`).join("\n");

  const riskRows = [
    ["Integration Delay", "Execution", "30%", fmt(-intCost * 0.20), "Regular progress monitoring and adjustment of integration timelines"],
    ["Cultural Misalignment", "Talent", "20%", fmt(-totalSyn * 0.06), "Change management and employee retention programmes"],
    ["Regulatory Issues", "Regulatory", "15%", fmt(-totalSyn * 0.10), "Proactive engagement with regulatory bodies and compliance with requirements"],
    ["Market Volatility", "Market", "10%", fmt(-totalSyn * 0.14), "Continuous market monitoring and adaptation of business strategies"],
  ].map((r) => `| ${r[0]} | ${r[1]} | ${r[2]} | ${r[3]} | ${r[4]} |`).join("\n");

  const notesBlock = notes && notes.trim()
    ? `\n\n**Analyst notes:** ${notes.trim()}`
    : "";

  return `## 01. Synergy Executive Summary

The proposed acquisition of **${T}** by **${B}** is expected to generate total gross synergy of **${fmt(totalSyn)}**, with a net synergy of **${fmt(totalSyn - intCost / 3.5)}** considering the one-time integration cost of **${fmt(intCost)}**. The implied synergy / EV is approximately **${synEvPct.toFixed(1)}%**, with a payback period of **${payback} months**. The overall confidence in achieving these synergies is **Medium** under the **${ambLabel}** ambition setting.

The sector-specific rationale for these synergies is based on benchmarks for the **${S}** sector, where comparable acquisitions in **${G}** have delivered cost savings through SG&A overlap removal, procurement consolidation, IT platform rationalisation, and revenue uplift through cross-sell and pricing optimisation.${notesBlock}

## 02. Cost Synergies — ${fmt(costSyn)} Total

Cost synergies are realised through five primary levers, with G&A overlap and Operations/Headcount driving the largest contribution. Realisation curve: 30% Y1 / 70% Y2 / 100% Y3.

| Initiative | Category | Y1 | Y2 | Y3 | Confidence | Primary Owner |
| --- | --- | --- | --- | --- | --- | --- |
${costRows}

> Cost synergies typically realise faster than revenue synergies because they are within the acquirer's direct control. Discipline in the first 90 days post-close is the strongest predictor of full-year-one capture.

## 03. Revenue Synergies — ${fmt(revSyn)} Total

Revenue synergies are slower to materialise but compound over time. Realisation curve: 20% Y1 / 60% Y2 / 100% Y3.

| Initiative | Mechanism | Y1 | Y2 | Y3 | Confidence | Key Dependency |
| --- | --- | --- | --- | --- | --- | --- |
${revRows}

Revenue synergies depend critically on (i) customer-overlap mapping completed within the first 60 days, (ii) sales-force alignment by Day 90, and (iii) pricing-system convergence by Day 180. Slippage on any one of these milestones typically delays Y1 capture by one full quarter.

## 04. Integration Costs (One-Time) — ${fmt(intCost)}

| Category | Amount | Timing | Rationale |
| --- | --- | --- | --- |
${intRows}

## 05. Net Synergy Waterfall

NPV of net synergies at 10% discount rate: **${fmt(netNpv)}**. Break-even month: **${payback}**.

| Year | Gross Cost Syn | Gross Rev Syn | Integration Costs | Net Synergy | Cumulative |
| --- | --- | --- | --- | --- | --- |
${wfRows}

## 06. Synergy Realisation Risks

| Risk | Category | Probability | Impact (Net) | Mitigation |
| --- | --- | --- | --- | --- |
${riskRows}

## 07. Sector Benchmarks

The implied synergy / EV of **${synEvPct.toFixed(1)}%** is in line with comparable transactions in the **${S}** sector, which typically deliver **${(bench.cost * 100).toFixed(1)}-${((bench.cost + bench.rev) * 100).toFixed(1)}% of combined revenue** in total synergy capture, with payback in **${bench.payback - 4}-${bench.payback + 4} months**. The ambition setting (**${ambLabel}**, multiplier ${mult.toFixed(2)}×) is reasonable given the deal characteristics and integration approach.

---

_Generated offline (deterministic, rule-based) — no AI key was used. Numbers are indicative starting baselines for analyst review; replace with bottom-up function-level analysis before committing to investment committee._
`;
}
