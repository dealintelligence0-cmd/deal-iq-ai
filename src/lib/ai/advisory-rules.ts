

// Conditionally-included advisory rules. Only emits the slice that matches the inputs,
// keeping system prompts compact (saves 2-3K tokens per call).

const MANDATE_POV: Record<string, string> = {
  buy_side: "BUY-SIDE: emphasize investment thesis, synergy case, diligence priorities, walk-away valuation, integration readiness.",
  sell_side: "SELL-SIDE: emphasize equity story, buyer universe, valuation maximization, auction tactics, carve-out readiness, QoE prep, competitive tension.",
  pmi_only: "PMI ONLY: skip thesis sections; emphasize Day-1, IMO governance, 100-day plan, synergy tracking, operating model, RACI.",
  carve_out: "CARVE-OUT: emphasize TSA framework, separation complexity, stranded cost management, standalone capability ramp, regulatory severance.",
  synergy_capture: "SYNERGY CAPTURE: skip mandate sales pitch; emphasize bottom-up synergy model, governance, capture milestones, KPI linkage.",
  value_creation: "VALUE CREATION: emphasize EBITDA bridge, levers, exit positioning, multiple expansion path.",
  distressed: "DISTRESSED: emphasize liquidity, restructuring options, stakeholder management, turnaround levers, 13-week cash flow.",
};

const BUYER_LENS: Record<string, string> = {
  pe: "PE BUYER: lead with IRR, leverage capacity, exit routes (3-5yr), bolt-on roadmap, MIP structure.",
  strategic: "STRATEGIC BUYER: lead with revenue/cost synergies, capability fit, competitive positioning.",
  family_office: "FAMILY OFFICE: lead with long-term hold, dividend yield, succession alignment.",
  sovereign: "SOVEREIGN/INFRA: lead with regulatory comfort, ESG, long-duration capital fit.",
  founder: "FOUNDER BUYER: lead with operational fit, cultural alignment, financing structure.",
};

const OWNERSHIP_LENS: Record<string, string> = {
  minority: "MINORITY: NO control assumptions. Focus on governance rights, board seats, veto matters, information rights, exit routes (drag/tag/ROFR).",
  majority: "MAJORITY: reserved matters + delegated authority matrix; consolidation method (full/equity).",
  full: "FULL (100%): full integration mandate; legal entity simplification; cost-out.",
  jv: "JV: governance, capital commitments, exit options, deadlock resolution.",
  merger: "MERGER OF EQUALS: integration co-leadership, cultural integration, brand strategy.",
};

const INTEGRATION_STYLE: Record<string, string> = {
  light_touch: "LIGHT TOUCH: retain target management autonomy; minimal IMO; reporting overlay only; selective synergies (procurement + treasury); NO ERP replacement Y1.",
  controlled_autonomy: "CONTROLLED AUTONOMY: governance + selective shared services; finance consolidation; HR policies harmonised; technology kept separate Y1.",
  functional: "FUNCTIONAL INTEGRATION: shared back-office (Finance/HR/IT/Procurement); operations remain separate; consolidated reporting; partial systems integration.",
  full_absorption: "FULL ABSORPTION: complete org redesign; ERP/CRM consolidation; legal entity simplification; duplicate cost removal; single brand; combined GTM.",
  standalone_holdco: "STANDALONE HOLDCO: target operates as independent unit; reporting line to holdco only; financial controls + capital allocation only.",
};

const SECTOR_LEVERS: Record<string, string> = {
  tech: "SAAS/TECH: ARR uplift, NRR, CAC payback, cloud cost pooling, engineering rationalization, product bundling, cross-sell attach, churn reduction.",
  saas: "SAAS/TECH: ARR uplift, NRR, CAC payback, cloud cost pooling, engineering rationalization, product bundling, cross-sell attach, churn reduction.",
  pharma: "HEALTHCARE/LIFE SCIENCES: GPO leverage, API/excipient procurement, R&D portfolio rationalization, regulatory pathway sharing, payer mix, QMS harmonization, CRO consolidation.",
  health: "HEALTHCARE/LIFE SCIENCES: GPO leverage, API/excipient procurement, R&D portfolio rationalization, regulatory pathway sharing, payer mix, QMS harmonization, CRO consolidation.",
  life: "HEALTHCARE/LIFE SCIENCES: GPO leverage, API/excipient procurement, R&D portfolio rationalization, regulatory pathway sharing, payer mix, QMS harmonization, CRO consolidation.",
  manufacturing: "MANUFACTURING: plant utilization, OEE, procurement scale, footprint optimization, yield improvement, SKU rationalization, working-capital release.",
  industrials: "MANUFACTURING/INDUSTRIALS: plant utilization, OEE, procurement scale, footprint optimization, yield improvement, SKU rationalization, working-capital release.",
  consumer: "CONSUMER/RETAIL: distribution reach, pricing power, trade-spend optimization, SKU rationalization, private-label penetration, digital channel mix, category management.",
  retail: "CONSUMER/RETAIL: distribution reach, pricing power, trade-spend optimization, SKU rationalization, private-label penetration, digital channel mix, category management.",
  financial: "FINANCIAL SERVICES: NIM expansion, cost-to-income, RWA optimization, core platform consolidation, branch rationalization, cross-sell, regulatory capital efficiency.",
  banking: "FINANCIAL SERVICES: NIM expansion, cost-to-income, RWA optimization, core platform consolidation, branch rationalization, cross-sell, regulatory capital efficiency.",
  energy: "ENERGY/RESOURCES: asset utilization, capex portfolio, trading-book consolidation, contractor spend, HSE harmonization, workforce productivity.",
  logistics: "LOGISTICS: route density, fleet utilization, warehouse occupancy, OTIF, fuel procurement scale, last-mile network, empty-mile reduction.",
};

function pickSectorLever(sector: string): string {
  const s = sector.toLowerCase();
  for (const k of Object.keys(SECTOR_LEVERS)) {
    if (s.includes(k)) return SECTOR_LEVERS[k];
  }
  return "Apply first-principles synergy framework: revenue scale levers, cost scale levers, asset utilization levers.";
}

export function buildAdvisoryRules(opts: {
  mandateType?: string;
  buyerType?: string;
  ownershipType?: string;
  integrationStyle?: string;
  sector?: string;
}): string {
  const parts: string[] = [];

  if (opts.mandateType && MANDATE_POV[opts.mandateType]) parts.push("MANDATE POV — " + MANDATE_POV[opts.mandateType]);
  if (opts.buyerType && BUYER_LENS[opts.buyerType]) parts.push("BUYER LENS — " + BUYER_LENS[opts.buyerType]);
  if (opts.ownershipType && OWNERSHIP_LENS[opts.ownershipType]) parts.push("OWNERSHIP — " + OWNERSHIP_LENS[opts.ownershipType]);
  if (opts.integrationStyle && INTEGRATION_STYLE[opts.integrationStyle]) parts.push("INTEGRATION — " + INTEGRATION_STYLE[opts.integrationStyle]);
  if (opts.sector) parts.push("SECTOR LEVERS — " + pickSectorLever(opts.sector));

  parts.push("SYNERGY LOGIC: every $ figure shows derivation (e.g. '8% of $500M SG&A = $40M'). Confidence label per line: HIGH/MEDIUM/STRETCH. No bare numbers.");
  parts.push("SO WHAT: each section answers Why now, Why this buyer, What if nothing.");
  parts.push("BANNED phrases: 'leverage operational efficiencies', 'best-in-class', 'value-add', 'unlock potential', 'industry-leading', 'cost savings opportunity' without base.");

  return parts.join("\n\n");
}
