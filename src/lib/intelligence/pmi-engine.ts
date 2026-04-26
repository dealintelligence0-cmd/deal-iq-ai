export type PmiInput = {
  buyer: string;
  target: string;
  sector: string;
  geography: string;
  deal_size: string;
  synergy_ambition: "low" | "medium" | "high";
  key_risks: string;
  public_private: "public" | "private";
  listed: "listed" | "unlisted";
  known_issues: string;
  tsa_needed: boolean;
  cross_border: boolean;
  notes: string;
};

// Sector-specific synergy benchmarks (consulting study averages)
const SECTOR_BENCHMARKS: Record<string, {
  cost_low: number; cost_high: number;
  rev_low: number; rev_high: number;
  focus: string;
  functions: string[];
}> = {
  manufacturing: { cost_low: 0.03, cost_high: 0.08, rev_low: 0.02, rev_high: 0.05, focus: "plant footprint, sourcing, SKU complexity, manufacturing optimization", functions: ["Operations", "Supply Chain", "Procurement", "Sales & GTM"] },
  tech:          { cost_low: 0.05, cost_high: 0.10, rev_low: 0.02, rev_high: 0.07, focus: "product overlap, engineering org, GTM motion, cloud stack consolidation", functions: ["Technology", "Product & Engineering", "Sales & GTM", "Customer Success"] },
  saas:          { cost_low: 0.06, cost_high: 0.11, rev_low: 0.03, rev_high: 0.08, focus: "ARR consolidation, cloud cost, GTM rationalization, churn reduction", functions: ["Technology", "Customer Success", "Sales & GTM", "Finance"] },
  healthcare:    { cost_low: 0.04, cost_high: 0.09, rev_low: 0.02, rev_high: 0.06, focus: "regulatory continuity, patient continuity, procurement leverage, payer mix", functions: ["Operations", "Risk & Compliance", "Procurement", "Finance"] },
  retail:        { cost_low: 0.05, cost_high: 0.12, rev_low: 0.03, rev_high: 0.07, focus: "store network, pricing architecture, inventory turns, omnichannel", functions: ["Sales & GTM", "Supply Chain", "Operations", "Finance"] },
  consumer:      { cost_low: 0.05, cost_high: 0.12, rev_low: 0.03, rev_high: 0.07, focus: "SG&A consolidation, channel optimization, brand portfolio rationalization", functions: ["Sales & GTM", "Supply Chain", "Operations", "Finance"] },
  financial:     { cost_low: 0.08, cost_high: 0.15, rev_low: 0.02, rev_high: 0.05, focus: "branch overlap, control framework, platform migration, regulatory capital", functions: ["Operations", "Technology", "Risk & Compliance", "Finance"] },
  bfsi:          { cost_low: 0.08, cost_high: 0.15, rev_low: 0.02, rev_high: 0.05, focus: "branch overlap, control framework, platform migration, regulatory capital", functions: ["Operations", "Technology", "Risk & Compliance", "Finance"] },
  energy:        { cost_low: 0.04, cost_high: 0.09, rev_low: 0.02, rev_high: 0.04, focus: "asset base optimization, HSE alignment, supply chain integration, capex prioritization", functions: ["Operations", "HSE", "Supply Chain", "Finance"] },
};

export function getBenchmark(sector: string) {
  const s = sector.toLowerCase();
  for (const [k, v] of Object.entries(SECTOR_BENCHMARKS)) {
    if (s.includes(k)) return v;
  }
  return { cost_low: 0.04, cost_high: 0.10, rev_low: 0.02, rev_high: 0.05, focus: "diversified sector synergy levers", functions: ["Operations", "Sales & GTM", "Finance", "Technology"] };
}

function parseUSD(s: string): number {
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

function fmtM(n: number): string {
  if (!n) return "TBD";
  return n >= 1e9 ? `$${(n/1e9).toFixed(2)}B` : `$${Math.round(n/1e6)}M`;
}

export function computeSynergies(p: PmiInput) {
  const value = parseUSD(p.deal_size);
  const b = getBenchmark(p.sector);
  const ambitionMult = p.synergy_ambition === "high" ? 1.0 : p.synergy_ambition === "medium" ? 0.7 : 0.5;
  const cost_pct = ((b.cost_low + b.cost_high) / 2) * ambitionMult;
  const rev_pct = ((b.rev_low + b.rev_high) / 2) * ambitionMult;
  const cost_value = value * cost_pct;
  const rev_value = value * rev_pct;
  return {
    value,
    benchmark: b,
    cost_pct, rev_pct,
    cost_value, rev_value,
    total_value: cost_value + rev_value,
    one_time_cost: value * 0.04,
    cost_y1: cost_value * 0.30, cost_y2: cost_value * 0.70, cost_y3: cost_value,
    rev_y1: rev_value * 0.20, rev_y2: rev_value * 0.60, rev_y3: rev_value,
    fmtM,
  };
}

export function generatePmiProposal(p: PmiInput): string {
  const s = computeSynergies(p);
  const b = s.benchmark;
  const out: string[] = [];
  const B = p.buyer || "Buyer";
  const T = p.target || "Target";
  const S = p.sector || "the sector";
  const G = p.geography || "the target geography";
  const V = p.deal_size || "indicative value";
  const hasValue = s.value > 0;

  out.push(`## Executive Summary

**Why this deal matters:** ${B}'s acquisition of ${T} in ${S}${G !== "the target geography" ? ` (${G})` : ""} represents a strategic platform play with ${hasValue ? `${s.fmtM(s.total_value)} in identified synergy potential` : "directional synergy upside pending diligence"} — equivalent to ${hasValue ? `${Math.round((s.total_value/s.value)*100)}% of consideration` : "industry-typical capture"}.

**Strategic logic:** ${b.focus}. The transaction creates scale, capability depth, and a defensible position against sector consolidators within 24-36 months post-close.

**Integration imperative:** ${p.tsa_needed ? "TSA-dependent transition requires disciplined separation and re-platforming sequencing. " : ""}${p.cross_border ? "Cross-border execution adds regulatory, cultural, and operating-model complexity. " : ""}Value capture demands a structured IMO with ${b.functions.length} parallel workstreams led by named accountable owners.

**Expected value creation:** ${hasValue ? `Cost synergies ${s.fmtM(s.cost_value)} (${Math.round(s.cost_pct*100)}% of EV) realised on a 30/70/100 curve; revenue synergies ${s.fmtM(s.rev_value)} (${Math.round(s.rev_pct*100)}%) on a 20/60/100 curve. Net of one-time integration cost ~${s.fmtM(s.one_time_cost)}, NPV-positive within 18-24 months.` : "Synergy quantification pending Phase 1 commercial and operational diligence."}`);

  out.push(`## Deal Context & Strategic Rationale

| Dimension | View |
|---|---|
| Industry Trends | ${S} consolidation accelerating; ${b.focus} |
| Consolidation Logic | Platform-of-scale thesis; market share defence + capability stacking |
| Strategic Fit | ${B}'s portfolio gains ${T}'s ${S}-specific capabilities; geographic complementarity${G !== "the target geography" ? ` in ${G}` : ""} |
| Growth vs Defensive | ${p.synergy_ambition === "high" ? "Offensive growth play — synergy-led value creation" : p.synergy_ambition === "medium" ? "Balanced growth + cost capture" : "Defensive consolidation — cost synergy primary"} |
| Status | ${p.public_private} ${p.listed} ${p.cross_border ? "· cross-border" : "· domestic"} |`);

  out.push(`## Value Creation Thesis

| Lever | Mechanism | Owner | Indicative Impact |
|---|---|---|---|
| Revenue | Cross-sell into combined customer base; pricing optimisation; geographic expansion | Sales & GTM | ${hasValue ? s.fmtM(s.rev_value) + ` (${Math.round(s.rev_pct*100)}%)` : "TBD"} |
| Cost | ${b.focus.split(',')[0]}; SG&A consolidation; technology rationalisation | Operations + Tech | ${hasValue ? s.fmtM(s.cost_value) + ` (${Math.round(s.cost_pct*100)}%)` : "TBD"} |
| Working Capital | Payment terms harmonisation; inventory turns; receivables management | Finance | ${hasValue ? s.fmtM(s.value * 0.015) : "TBD"} |
| Capital Efficiency | Capex prioritisation; portfolio rationalisation; asset utilisation | CFO + COO | ${hasValue ? s.fmtM(s.value * 0.02) : "TBD"} |
| Risk Reduction | ${p.public_private === "public" ? "Disclosure simplification; " : ""}${p.cross_border ? "Cross-border governance; " : ""}control framework hardening | Risk & Audit | qualitative |`);

  out.push(`## Synergy Opportunity Model — Revenue

**Total: ${hasValue ? s.fmtM(s.rev_value) + ` (${Math.round(s.rev_pct*100)}% of EV)` : "TBD"}** · Realisation curve: 20% Y1 / 60% Y2 / 100% Y3

| Initiative | Mechanism | Year 1 | Year 2 | Year 3 |
|---|---|---|---|---|
| Cross-sell | Combined customer base — ${B} portfolio into ${T} accounts | ${hasValue ? s.fmtM(s.rev_y1*0.40) : "TBD"} | ${hasValue ? s.fmtM(s.rev_y2*0.40) : "TBD"} | ${hasValue ? s.fmtM(s.rev_y3*0.40) : "TBD"} |
| Geographic Expansion | ${G !== "the target geography" ? G : "Buyer regions"} via combined distribution | ${hasValue ? s.fmtM(s.rev_y1*0.25) : "TBD"} | ${hasValue ? s.fmtM(s.rev_y2*0.25) : "TBD"} | ${hasValue ? s.fmtM(s.rev_y3*0.25) : "TBD"} |
| Pricing Power | Combined product portfolio bundling | ${hasValue ? s.fmtM(s.rev_y1*0.20) : "TBD"} | ${hasValue ? s.fmtM(s.rev_y2*0.20) : "TBD"} | ${hasValue ? s.fmtM(s.rev_y3*0.20) : "TBD"} |
| New Product / Bundling | Co-developed offering using both IPs | ${hasValue ? s.fmtM(s.rev_y1*0.15) : "TBD"} | ${hasValue ? s.fmtM(s.rev_y2*0.15) : "TBD"} | ${hasValue ? s.fmtM(s.rev_y3*0.15) : "TBD"} |`);

  out.push(`## Synergy Opportunity Model — Cost

**Total: ${hasValue ? s.fmtM(s.cost_value) + ` (${Math.round(s.cost_pct*100)}% of EV)` : "TBD"}** · Realisation curve: 30% Y1 / 70% Y2 / 100% Y3 · One-time cost: ${hasValue ? s.fmtM(s.one_time_cost) : "TBD"}

| Initiative | Mechanism | Year 1 | Year 2 | Year 3 |
|---|---|---|---|---|
| Procurement Leverage | Combined spend rebid; preferred supplier; category alignment | ${hasValue ? s.fmtM(s.cost_y1*0.30) : "TBD"} | ${hasValue ? s.fmtM(s.cost_y2*0.30) : "TBD"} | ${hasValue ? s.fmtM(s.cost_y3*0.30) : "TBD"} |
| Technology Rationalisation | Cloud stack, ERP, redundant systems decommission | ${hasValue ? s.fmtM(s.cost_y1*0.25) : "TBD"} | ${hasValue ? s.fmtM(s.cost_y2*0.25) : "TBD"} | ${hasValue ? s.fmtM(s.cost_y3*0.25) : "TBD"} |
| SG&A Consolidation | Finance, HR, Legal, Executive overlap removal | ${hasValue ? s.fmtM(s.cost_y1*0.25) : "TBD"} | ${hasValue ? s.fmtM(s.cost_y2*0.25) : "TBD"} | ${hasValue ? s.fmtM(s.cost_y3*0.25) : "TBD"} |
| Footprint / Facilities | Site consolidation; lease exit; layout optimisation | ${hasValue ? s.fmtM(s.cost_y1*0.10) : "TBD"} | ${hasValue ? s.fmtM(s.cost_y2*0.10) : "TBD"} | ${hasValue ? s.fmtM(s.cost_y3*0.10) : "TBD"} |
| Headcount Overlap | Org redesign; spans of control; layered management | ${hasValue ? s.fmtM(s.cost_y1*0.10) : "TBD"} | ${hasValue ? s.fmtM(s.cost_y2*0.10) : "TBD"} | ${hasValue ? s.fmtM(s.cost_y3*0.10) : "TBD"} |`);

  out.push(`## Functional Integration POV

${b.functions.map((fn, i) => `### ${i+1}. ${fn}
- **Day-1 Priority:** ${fn === "Operations" ? "operational continuity, no service disruption" : fn === "Sales & GTM" ? "no customer-facing change; quota protection" : fn === "Technology" ? "system access provisioning; no production change" : fn === "Finance" ? "consolidated reporting cadence; cash management" : "stakeholder alignment + standstill"}
- **30-Day Action:** target operating model design + workstream charter
- **90-Day Milestone:** ${fn} integration plan approved + initiatives launched
- **Year-1 Outcome:** ${Math.round(((b.cost_low+b.cost_high)/2)*100)}% of cost synergies in this function realised`).join("\n\n")}

**Other functions:** Tax (entity simplification, transfer pricing), Legal (contract novation, change-of-control notices), Risk (control framework alignment), ESG (combined reporting, transition plan).`);

  out.push(`## IMO Design

**Governance Structure:**

| Body | Composition | Cadence | Purpose |
|---|---|---|---|
| Steering Committee | CEO, CFO, COO from both entities + IMO Lead | Bi-weekly | Strategic decisions; escalations; synergy commitments |
| IMO Core Team | IMO Lead + ${b.functions.length} workstream leads + PMO | Weekly | Cross-workstream coordination; risk/issue management |
| Workstreams | Function lead + 2-4 SMEs per workstream | Daily Day 1-30, then weekly | Execution; initiative tracking; deliverable production |
| Board Update | CEO + IMO Lead | Monthly | Synergy capture; risks; resource needs |

**KPI Tracking:** Synergy capture % vs plan · One-time cost vs budget · Customer retention · Employee retention (top 100) · Day-1 readiness checklist completion · Issue/risk register velocity.`);

  out.push(`## Day 0 / Day 1 / 100-Day Plan

| Phase | Timeframe | Focus | Critical Outputs |
|---|---|---|---|
| Day 0 (Pre-close) | Sign to Close | Planning + readiness | Integration charter; IMO mobilised; Day-1 checklist; ${p.tsa_needed ? "TSA negotiation" : "standalone planning"} |
| Day 1 (Close) | Day 1 | Activation + continuity | Customer/employee comms; system access; legal close; trading commences |
| Days 2-30 | Stabilise | Governance + baseline | TOM design; KPI baseline; retention locks (top 100); workstream charters |
| Days 31-60 | Integrate | Initiatives + restructure | Org design announced; synergy initiatives launched; combined GTM activated |
| Days 61-100 | Accelerate | Execute + validate | First restructuring wave; Y1 synergy trajectory validated; Day-100 board pack |`);

  out.push(`## Pre-Day-1 / Post-Day-1 Roadmap (Gantt View)

| Workstream | T-90 | T-60 | T-30 | Day 1 | D+30 | D+60 | D+100 |
|---|---|---|---|---|---|---|---|
| IMO Mobilisation | Charter | Leads named | Tooling live | Active | — | — | — |
| Day-1 Readiness | Scope | Checklist v1 | Checklist final | Go/No-Go | — | — | — |
| ${b.functions[0]} | Diligence | TOM draft | TOM final | Activate | Initiatives launched | Mid-review | Validate |
| ${b.functions[1]} | Diligence | Plan | Approval | Activate | Quick wins | Restructure | Day-100 |
| ${b.functions[2]} | Diligence | Plan | Approval | Activate | Initiatives | Tracking | Day-100 |
| Synergy Capture | Hypothesis | Sized | Owners named | Tracking on | Y1 commits locked | Mid-review | Y1 trajectory |
| Communications | Strategy | Drafts | Finals | Day-1 launch | Cadence | Cadence | Day-100 update |`);

  out.push(`## Risks & Mitigation

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Regulatory clearance delays${p.cross_border ? " (cross-border multi-jurisdiction)" : ""} | ${p.cross_border ? "45%" : "30%"} | ${hasValue ? s.fmtM(s.value * 0.02) : "~2% EV"} | Pre-filing engagement; remedy package prepared |
| Talent attrition (top 100 in ${b.functions[0]} + leadership) | 45% | ${hasValue ? s.fmtM(s.rev_value * 0.20) : "~20% rev synergy"} | Retention bonuses 12/24/36-mo + equity acceleration |
| Synergy capture shortfall vs plan | 50% | ${hasValue ? s.fmtM(s.total_value * 0.30) : "~30% plan"} | IMO governance + named owners + milestone incentives |
| Customer churn during transition | 25% | ${hasValue ? s.fmtM(s.rev_value * 0.20) : "~20% rev synergy"} | Top 50 account exec outreach; service continuity SLAs |
${p.tsa_needed ? `| TSA dependency overrun | 35% | ${hasValue ? s.fmtM(s.value * 0.015) : "~1.5% EV"} | TSA exit milestones; standalone capability ramp |` : ""}
${p.cross_border ? `| Cultural integration friction (cross-border) | 40% | qualitative | Culture diagnostics Day 30; leadership programme; integration champions |` : ""}
${p.known_issues ? `| Known issue: ${p.known_issues.slice(0,80)} | — | — | Specific mitigation drafted in Phase 1 diligence |` : ""}

${p.key_risks ? `\n**Client-flagged risks:** ${p.key_risks}` : ""}`);

  return out.join("\n\n");
}
