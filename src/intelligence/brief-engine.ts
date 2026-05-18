

import type { Deal } from "@/lib/analytics";

export type DealBrief = {
  investmentThesis: string[];
  whyNow: string;
  valueDrivers: string[];
  keyRisks: string[];
  dealTension: string[];
  advisoryAngle: string;
  dealTakeaway: string;
};

export function deriveExpandedBrief(d: Deal): DealBrief {
  const buyer = d.buyer ?? "Buyer";
  const target = d.target ?? "Target";
  const sector = d.sector ?? "sector";
  const country = d.country ?? "country";
  const flow = d.india_flow ?? "other";
  const dealType = d.deal_type ?? "Strategic";
  const stakeStatus = d.stake_status ?? "unknown";
  const value = d.deal_value_usd_range ?? d.deal_value_inr_range ?? "undisclosed value";

  // Investment Thesis
  const investmentThesis: string[] = [];
  if (dealType === "Acquisition")
    investmentThesis.push(`${buyer} acquires ${target} to consolidate ${sector} market presence in ${country}.`);
  else if (dealType === "Merger")
    investmentThesis.push(`${buyer} merges with ${target} to create a combined entity with enhanced scale in ${sector}.`);
  else if (dealType === "IPO")
    investmentThesis.push(`${target} targets public markets via IPO to fund growth and liquidity in the ${sector} space.`);
  else if (dealType === "JV")
    investmentThesis.push(`${buyer} forms a joint venture with ${target} to co-develop ${sector} capabilities in ${country}.`);
  else if (dealType === "Minority")
    investmentThesis.push(`${buyer} takes a minority stake in ${target} to gain strategic exposure to ${sector} without full control.`);
  else
    investmentThesis.push(`${buyer} pursues a strategic arrangement with ${target} to strengthen its ${sector} position in ${country}.`);

  if (flow === "outbound")
    investmentThesis.push(`Outbound play: Indian acquirer expanding internationally into ${country}.`);
  else if (flow === "inbound")
    investmentThesis.push(`Inbound capital: foreign acquirer targeting Indian ${sector} assets.`);
  else if (flow === "domestic")
    investmentThesis.push(`Domestic consolidation within the Indian ${sector} market.`);

  // Why Now
  const status = d.status ?? "announced";
  let whyNow = "";
  if (status === "live")
    whyNow = `Active live process — near-term closure expected; immediate advisory engagement window.`;
  else if (status === "announced")
    whyNow = `Recently announced; integration planning and BD advisory window are open now.`;
  else if (status === "rumor")
    whyNow = `Early-stage intelligence; first-mover advisory positioning available before advisors are mandated.`;
  else if (status === "closed")
    whyNow = `Deal closed — post-merger integration and synergy capture phase is underway.`;
  else
    whyNow = `${sector} sector experiencing active consolidation; timing aligns with deal cycle.`;

  if (flow === "outbound" || flow === "inbound")
    whyNow += ` Cross-border regulatory windows and FDI approval timelines make immediate engagement critical.`;

  // Value Drivers
  const valueDrivers: string[] = [];
  if (stakeStatus === "control" || stakeStatus === "majority")
    valueDrivers.push(`Full/majority control enables deep operational integration and synergy extraction.`);
  else if (stakeStatus === "minority")
    valueDrivers.push(`Minority entry provides optionality for full acquisition at a favourable future valuation.`);

  if (dealType === "Acquisition" || dealType === "Merger") {
    valueDrivers.push(`Revenue synergies: cross-sell, market share gains, and combined product portfolio.`);
    valueDrivers.push(`Cost synergies: G&A consolidation, procurement leverage, and headcount rationalisation.`);
  } else if (dealType === "JV") {
    valueDrivers.push(`Shared IP and co-development reduces R&D cost without full integration overhead.`);
    valueDrivers.push(`Access to partner distribution channels and local market expertise.`);
  } else if (dealType === "IPO") {
    valueDrivers.push(`Capital raise funds organic growth, debt reduction, or bolt-on acquisitions.`);
    valueDrivers.push(`Public currency and brand visibility for future M&A activity.`);
  } else {
    valueDrivers.push(`Strategic alignment accelerates market penetration and reduces go-to-market friction.`);
    valueDrivers.push(`Access to ${target}'s customer base and operational capabilities.`);
  }

  // Key Risks
  const keyRisks: string[] = [];
  if (d.risk_reason) {
    const sentences = d.risk_reason.split(/[.;]/).map((s) => s.trim()).filter((s) => s.length > 12);
    keyRisks.push(...sentences.slice(0, 2));
  }
  if (keyRisks.length < 3) {
    if (flow !== "domestic")
      keyRisks.push(`Cross-border regulatory scrutiny: FDI clearance, CCI/antitrust review, and FEMA compliance.`);
    if (dealType === "Merger" || dealType === "Acquisition")
      keyRisks.push(`Integration execution risk: cultural misalignment, IT system complexity, and talent retention.`);
    if (stakeStatus === "minority")
      keyRisks.push(`Limited governance rights; promoter resistance to dilution may block full exit optionality.`);
    if (dealType === "IPO")
      keyRisks.push(`Market timing risk: IPO window sensitive to macro volatility and sector sentiment shifts.`);
    if (keyRisks.length < 3 && flow === "domestic")
      keyRisks.push(`Domestic concentration risk: limited geographic diversification post-deal.`);
  }

  // Deal Tension
  const advisoryScore = d.advisory_score ?? 0;
  const riskScore = d.risk_score ?? 0;
  const dealTension: string[] = [];

  if (advisoryScore >= 70 && riskScore >= 60)
    dealTension.push(`High advisory value (${advisoryScore}/100) vs. elevated execution risk (${riskScore}/100) — mandated approach preferred over speculative pitch.`);
  else if (advisoryScore >= 70)
    dealTension.push(`Strong advisory demand (${advisoryScore}/100) with manageable risk profile — favourable pursuit ratio.`);
  else
    dealTension.push(`Moderate advisory opportunity; selective engagement recommended to protect partner bandwidth.`);

  if (flow === "outbound" || flow === "inbound")
    dealTension.push(`Cross-border premium (complexity uplift) is offset by longer regulatory time-to-close.`);
  else if (stakeStatus === "minority")
    dealTension.push(`Minority entry lowers deal certainty but preserves optionality for phased full acquisition.`);
  else
    dealTension.push(`Domestic deal offers execution certainty but limits cross-border advisory premium.`);

  // Advisory Angle
  let advisoryAngle = d.advisory_reason ?? "";
  if (!advisoryAngle || advisoryAngle.length < 20) {
    if (dealType === "Acquisition" || dealType === "Merger")
      advisoryAngle = `Integration management: Day-1 readiness, 100-day IMO design, synergy tracking, and regulatory approval coordination.`;
    else if (dealType === "JV")
      advisoryAngle = `JV governance design, profit-sharing mechanics, IP licensing structure, and exit optionality planning.`;
    else if (dealType === "IPO")
      advisoryAngle = `Pre-IPO readiness: financial restructuring, DRHP preparation, ESG uplift, and board governance advisory.`;
    else if (dealType === "Minority")
      advisoryAngle = `Minority investment structuring, shareholder agreement advisory, and future conversion pathway design.`;
    else
      advisoryAngle = `Strategic partnership advisory: deal structuring, commercial due diligence, and value creation roadmap.`;
  }

  // Deal Takeaway
  const targeting = d.targeting_recommendation ?? (d.priority_score != null && d.priority_score >= 75 ? "HIGH" : d.priority_score != null && d.priority_score >= 50 ? "MEDIUM" : "LOW");
  const dealTakeaway =
    d.deal_takeaway && d.deal_takeaway.length > 20
      ? d.deal_takeaway
      : `${buyer}/${target} (${sector}, ${value}): ${dealType} deal with ${stakeStatus} stake. ${targeting} priority — ${d.targeting_reason ?? "engage for " + advisoryAngle.split(":")[0]}.`;

  return {
    investmentThesis: investmentThesis.slice(0, 2),
    whyNow,
    valueDrivers: valueDrivers.slice(0, 3),
    keyRisks: keyRisks.slice(0, 3),
    dealTension: dealTension.slice(0, 2),
    advisoryAngle,
    dealTakeaway,
  };
}
