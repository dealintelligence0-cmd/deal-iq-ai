export type DealClassification = {
  category: "full_acquisition" | "majority_stake" | "minority_stake" | "pe_buyout_platform" | "pe_buyout_boltOn" | "vc_investment" | "joint_venture" | "strategic_partnership" | "carve_out" | "ipo" | "distressed";
  control: "full" | "partial" | "minority" | "none";
  buyerType: "strategic" | "pe" | "vc" | "sovereign" | "family" | "unknown";
  intent: "growth" | "market_entry" | "exit" | "consolidation" | "turnaround" | "diversification";
  integrationNeed: "full_integration" | "light_touch" | "separation_tsa" | "governance_only" | "hybrid";
  decisionMakers: string[];
  keyRisks: string[];
  mandatoryWorkstreams: string[];
};

export type DealInput = {
  buyer?: string | null;
  target?: string | null;
  sector?: string | null;
  country?: string | null;
  deal_type?: string | null;
  stake_percent?: number | null;
  normalized_value_usd?: number | null;
  notes?: string | null;
  status?: string | null;
};

export function classifyDeal(d: DealInput): DealClassification {
  const stake = d.stake_percent ?? null;
  const type = (d.deal_type ?? "").toLowerCase();
  const notes = (d.notes ?? "").toLowerCase();
  const buyer = (d.buyer ?? "").toLowerCase();
  const size = d.normalized_value_usd ?? 0;

  // Buyer type detection
  let buyerType: DealClassification["buyerType"] = "unknown";
  if (/\b(capital|partners|equity|holdings|fund|lp)\b/.test(buyer) || type.includes("pe") || type.includes("buyout")) buyerType = "pe";
  else if (/\b(ventures|vc)\b/.test(buyer) || type.includes("venture") || type.includes("series")) buyerType = "vc";
  else if (/\b(sovereign|gic|qia|mubadala|pif|adia)\b/.test(buyer)) buyerType = "sovereign";
  else if (buyer) buyerType = "strategic";

  // Category
  let category: DealClassification["category"] = "full_acquisition";
  if (type.includes("carve") || type.includes("spin") || type.includes("divest") || notes.includes("carve")) category = "carve_out";
  else if (type.includes("jv") || type.includes("joint venture") || notes.includes("joint venture")) category = "joint_venture";
  else if (type.includes("partner") || notes.includes("strategic partner")) category = "strategic_partnership";
  else if (type.includes("ipo") || notes.includes("ipo") || notes.includes("listing")) category = "ipo";
  else if (type.includes("distress") || type.includes("bankruptcy") || notes.includes("restructur")) category = "distressed";
  else if (buyerType === "vc") category = "vc_investment";
  else if (buyerType === "pe" && (size >= 5e8 || notes.includes("platform"))) category = "pe_buyout_platform";
  else if (buyerType === "pe") category = "pe_buyout_boltOn";
  else if (stake !== null && stake >= 50 && stake < 100) category = "majority_stake";
  else if (stake !== null && stake < 50) category = "minority_stake";

  // Control
  let control: DealClassification["control"] = "none";
  if (category === "full_acquisition" || category === "pe_buyout_platform" || category === "carve_out") control = "full";
  else if (category === "majority_stake" || category === "pe_buyout_boltOn") control = "partial";
  else if (category === "minority_stake" || category === "vc_investment") control = "minority";
  else if (category === "joint_venture") control = "partial";

  // Intent
  let intent: DealClassification["intent"] = "growth";
  if (category === "carve_out" || category === "ipo") intent = "exit";
  else if (category === "pe_buyout_platform") intent = "consolidation";
  else if (category === "distressed") intent = "turnaround";
  else if (notes.includes("new market") || notes.includes("geograph")) intent = "market_entry";
  else if (notes.includes("diversif")) intent = "diversification";

  // Integration
  let integrationNeed: DealClassification["integrationNeed"] = "full_integration";
  if (control === "minority" || category === "vc_investment") integrationNeed = "governance_only";
  else if (category === "joint_venture" || category === "strategic_partnership") integrationNeed = "governance_only";
  else if (category === "majority_stake") integrationNeed = "light_touch";
  else if (category === "carve_out") integrationNeed = "separation_tsa";
  else if (category === "pe_buyout_boltOn") integrationNeed = "hybrid";

  const decisionMakers: string[] = [];
  if (buyerType === "strategic") decisionMakers.push("CEO", "Board of Directors", "CFO", "Head of Strategy / Corp Dev");
  else if (buyerType === "pe") decisionMakers.push("Managing Partner", "Investment Committee", "Operating Partner", "Portfolio CFO");
  else if (buyerType === "vc") decisionMakers.push("General Partner", "Investment Committee", "Board Observer");
  else decisionMakers.push("CEO", "Board", "Investment Committee");

  const keyRisks: string[] = [];
  if (control === "full" || control === "partial") keyRisks.push("Cultural integration friction", "Key talent retention", "Customer / supplier churn during transition");
  if (integrationNeed === "separation_tsa") keyRisks.push("Stranded costs in seller", "TSA dependency overrun", "IT system separation delays");
  if (category === "joint_venture") keyRisks.push("Governance deadlock", "Misaligned partner incentives", "Exit / dissolution mechanics");
  if (d.country && d.country.toLowerCase() !== "usa" && d.country.toLowerCase() !== "united states") keyRisks.push(`FDI screening in ${d.country}`, "Cross-border regulatory approvals");
  if (size >= 1e9) keyRisks.push("HSR / antitrust merger review", "Market concentration scrutiny");
  if (d.sector === "Technology") keyRisks.push("Data protection (GDPR/CCPA)", "IP continuity & open-source obligations");
  if (d.sector === "Healthcare") keyRisks.push("FDA / licensing change-of-control", "Clinical trial continuity", "HIPAA compliance");
  if (d.sector === "Financial Services") keyRisks.push("Regulator change-of-control approval", "Capital adequacy post-close");
  if (category === "distressed") keyRisks.push("Creditor negotiations", "Going-concern risk", "Employee flight");
  if (keyRisks.length === 0) keyRisks.push("Execution risk", "Value leakage", "Stakeholder alignment");

  const mandatoryWorkstreams: string[] = [];
  if (integrationNeed === "full_integration") mandatoryWorkstreams.push("Integration Management Office", "Synergy capture program", "Day-1 readiness", "100-day plan");
  if (integrationNeed === "separation_tsa") mandatoryWorkstreams.push("Separation roadmap", "TSA design & exit", "Standalone operating model", "Stranded cost removal");
  if (integrationNeed === "light_touch") mandatoryWorkstreams.push("Governance framework", "Value creation plan", "Performance monitoring");
  if (integrationNeed === "governance_only") mandatoryWorkstreams.push("Board / IC reporting cadence", "Value protection rights", "Information rights");
  if (integrationNeed === "hybrid") mandatoryWorkstreams.push("Selective integration (commercial)", "Back-office consolidation", "Platform synergy plan");

  return { category, control, buyerType, intent, integrationNeed, decisionMakers, keyRisks, mandatoryWorkstreams };
}

// ─── SERVICE ENGINE ──────────────────────────────────────────

export type Service = {
  id: string;
  name: string;
  type: "core" | "optional" | "custom";
  selected: boolean;
  objective?: string;
  scope?: string[];
  activities?: string[];
  deliverables?: string[];
  valueImpact?: string;
};

export function generateServices(c: DealClassification, d: DealInput): Service[] {
  const services: Service[] = [];
  const cat = c.category;
  const add = (id: string, name: string, type: "core" | "optional") =>
    services.push({ id, name, type, selected: type === "core" });

  // Acquisition-style deals
  if (cat === "full_acquisition" || cat === "majority_stake" || cat === "pe_buyout_platform" || cat === "pe_buyout_boltOn") {
    add("comm_dd", "Commercial Due Diligence", "core");
    add("fin_dd", "Financial Due Diligence", "core");
    add("ops_dd", "Operational Due Diligence", "core");
    add("tech_dd", "Technology & IT Due Diligence", "optional");
    add("legal_dd", "Legal & Regulatory Due Diligence", "optional");
    add("integ_plan", "Integration Planning & IMO Setup", "core");
    add("syn_capture", "Synergy Identification & Capture", "core");
    add("day1", "Day-1 Readiness", "core");
    add("100day", "100-Day Value Creation Plan", "core");
    add("talent", "Talent Retention & Org Design", "optional");
    add("culture", "Culture Integration", "optional");
  }

  // PE-specific
  if (cat === "pe_buyout_platform" || cat === "pe_buyout_boltOn") {
    add("vcp", "Value Creation Plan (3-5 year)", "core");
    add("exit_strat", "Exit Strategy & Readiness", "optional");
    add("portfolio", "Portfolio Optimization", cat === "pe_buyout_platform" ? "core" : "optional");
    add("kpi_mon", "KPI Monitoring & Board Reporting", "optional");
  }

  // Carve-out
  if (cat === "carve_out") {
    add("sep_plan", "Separation Planning & Roadmap", "core");
    add("tsa_design", "TSA Design & Management", "core");
    add("standalone", "Standalone Operating Model", "core");
    add("it_sep", "IT Separation & Cutover", "core");
    add("stranded", "Stranded Cost Identification", "core");
    add("day1_carve", "Day-1 / Legal Close Readiness", "core");
  }

  // JV
  if (cat === "joint_venture") {
    add("jv_gov", "JV Governance Design", "core");
    add("jv_op", "JV Operating Model", "core");
    add("jv_shareholder", "Shareholder Agreement Support", "core");
    add("jv_exit", "JV Exit / Dissolution Mechanics", "optional");
  }

  // Minority / VC
  if (cat === "minority_stake" || cat === "vc_investment") {
    add("ic_memo", "Investment Committee Memo", "core");
    add("val_diligence", "Valuation & Cap Table Diligence", "core");
    add("board_obs", "Board Observer / Rights Framework", "optional");
    add("portfolio_sup", "Portfolio Support Playbook", "optional");
  }

  // Strategic partnership
  if (cat === "strategic_partnership") {
    add("partner_gov", "Partnership Governance", "core");
    add("partner_value", "Value-Share & Commercial Structure", "core");
    add("partner_ops", "Operating Model & Interfaces", "optional");
  }

  // IPO
  if (cat === "ipo") {
    add("ipo_ready", "IPO Readiness Assessment", "core");
    add("ipo_equity", "Equity Story Development", "core");
    add("ipo_fin", "Financial Reporting Uplift", "core");
    add("ipo_gov", "Board & Governance Readiness", "core");
  }

  // Distressed
  if (cat === "distressed") {
    add("rapid_dd", "Rapid Diligence & Cash Diagnostic", "core");
    add("restructure", "Operational Restructuring Plan", "core");
    add("creditor", "Creditor / Stakeholder Strategy", "core");
    add("turnaround", "Turnaround 100-Day Plan", "core");
  }

  // Risk + regulatory (universal optional)
  add("reg_nav", "Regulatory Strategy & Navigation", "optional");
  add("cyber_dd", "Cyber Due Diligence", "optional");
  add("esg_dd", "ESG Due Diligence", "optional");

  return services;
}

// Expand one service into full MBB-grade detail
export function expandService(s: Service, c: DealClassification, d: DealInput): Service {
  if (s.objective) return s; // already expanded
  const sector = d.sector ?? "the sector";
  const geo = d.country ?? "the target geography";
  const target = d.target ?? "Target";
  const buyer = d.buyer ?? "Buyer";

  const E: Record<string, Partial<Service>> = {
    comm_dd: {
      objective: `Validate ${target}'s top-line growth thesis and competitive position in ${sector} across ${geo}, confirming the revenue assumptions underpinning ${buyer}'s bid.`,
      scope: ["Market sizing & growth dynamics", "Customer concentration & retention analysis", "Competitive benchmarking", "Pricing power assessment", "Revenue quality (recurring vs one-time)", "Win/loss drivers via customer interviews"],
      activities: ["20-30 customer reference calls", "Win/loss debriefs with lost prospects", "Competitive teardown (top 5 rivals)", "Bottom-up market model", "Management presentation review"],
      deliverables: ["Red Flag report (week 2)", "Full CDD report with 3-year forecast bridge", "Risk-adjusted base/upside cases", "Board-ready summary deck"],
      valueImpact: "Enables 5-10% bid adjustment confidence and identifies 2-3 post-close value levers worth 10-15% of deal value.",
    },
    fin_dd: {
      objective: `Validate quality of ${target}'s earnings, cash conversion, and balance sheet; identify normalized EBITDA and working capital.`,
      scope: ["Quality of Earnings (QoE)", "Normalization adjustments", "Working capital analysis", "Debt-like items & off-balance sheet exposures", "Tax diligence", "Forecast stress-testing"],
      activities: ["3-year P&L / BS / CF analysis", "Revenue recognition review", "Adjusted EBITDA build", "Net debt reconciliation"],
      deliverables: ["QoE report", "Adjusted EBITDA waterfall", "Net debt schedule", "Tax & accounting red flags"],
      valueImpact: "Typically identifies 3-8% adjusted EBITDA delta, directly impacting purchase price negotiation.",
    },
    ops_dd: {
      objective: `Assess ${target}'s operating model maturity, cost structure, and scalability for ${buyer}'s thesis.`,
      scope: ["Cost structure benchmarking", "Operational KPI diagnostic", "Supply chain / procurement review", "Footprint & capacity analysis", "Digital / automation maturity"],
      activities: ["Site visits / virtual tours", "Cost benchmark vs peers", "Quick wins identification"],
      deliverables: ["Operational risk register", "Quick wins opportunity list", "3-year cost trajectory view"],
      valueImpact: "Typically surfaces 5-15% cost synergy envelope and 2-3 quick wins deliverable within 6 months.",
    },
    integ_plan: {
      objective: `Design and mobilize the Integration Management Office (IMO) to deliver the ${buyer}-${target} integration thesis within 12-18 months.`,
      scope: ["IMO structure & governance", "Workstream chartering (HR, IT, Finance, Ops, Commercial, Culture)", "Day-1 readiness", "Communication architecture", "Synergy tracking cadence"],
      activities: ["IMO mobilization (week 1-2)", "Workstream lead appointments", "Day-1 checklist development", "Governance cadence setup"],
      deliverables: ["IMO operating charter", "Day-1 playbook", "Integration dashboard", "Executive steering deck"],
      valueImpact: "Structured IMO captures 80%+ of planned synergies vs 40-50% benchmark for ad-hoc integrations.",
    },
    syn_capture: {
      objective: `Identify, validate, and track synergy realization across revenue, cost, and strategic dimensions.`,
      scope: ["Revenue synergy hypothesis library", "Cost synergy quantification (G&A, procurement, footprint, tech)", "Dis-synergies identification", "Initiative ownership assignment", "Monthly tracking"],
      activities: ["Synergy workshops with functional leads", "Bottom-up initiative sizing", "Risk-adjusted value assessment"],
      deliverables: ["Synergy register (100+ initiatives typical)", "Waterfall by workstream", "Monthly tracking dashboard"],
      valueImpact: `For deals this size, typical cost synergies are 5-8% of combined cost base; revenue synergies 2-4% of combined revenue.`,
    },
    sep_plan: {
      objective: `Design the separation of ${target} from its parent, ensuring clean Day-1 and minimal business disruption.`,
      scope: ["Separation blueprint by function", "Asset & contract separation", "Employee transfer (TUPE where applicable)", "Customer & supplier re-papering", "Brand separation"],
      activities: ["Functional separation playbooks", "Legal entity design", "Employee communication plan"],
      deliverables: ["Separation blueprint", "Function-by-function Day-1 plan", "Dependency register"],
      valueImpact: "Well-planned separation preserves 95%+ customer retention and enables 20-30% faster standalone profitability.",
    },
    tsa_design: {
      objective: `Design Transitional Service Agreements with the seller to bridge Day-1 to standalone operation, minimizing duration and cost.`,
      scope: ["TSA service catalog", "Duration & pricing negotiation", "Exit criteria per service", "Governance & SLAs", "Dispute resolution"],
      activities: ["TSA scoping workshops", "Service-by-service cost build", "Exit milestone mapping"],
      deliverables: ["TSA schedule", "Exit roadmap with milestones", "Governance RACI"],
      valueImpact: "Optimized TSA typically saves 15-25% vs seller's initial asks and enables full exit within 12-18 months.",
    },
    vcp: {
      objective: `Define the 3-5 year value creation thesis for ${target} that will drive the equity return at exit.`,
      scope: ["Revenue growth levers", "Margin expansion initiatives", "Capital efficiency plays", "M&A / bolt-on strategy", "Multiple arbitrage thesis"],
      activities: ["Lever prioritization workshops", "Initiative sizing", "Milestone-based roadmap"],
      deliverables: ["Value Creation Plan (100+ page)", "Board-ready VCP deck", "Quarterly milestone dashboard"],
      valueImpact: "Structured VCP typically drives 2-3x MOIC target achievement vs 1.5-2x for unstructured holds.",
    },
    jv_gov: {
      objective: `Design governance structure balancing partner interests, decision rights, and operational efficiency.`,
      scope: ["Board composition & rotation", "Reserved matters list", "Voting thresholds", "Deadlock resolution", "IC / management reporting"],
      activities: ["Governance workshop with partners", "Reserved matters drafting", "Deadlock mechanism design"],
      deliverables: ["Governance framework document", "Reserved matters schedule", "Board / IC charters"],
      valueImpact: "Clear governance reduces JV failure rate (industry baseline ~50%) to under 20%.",
    },
    "100day": {
      objective: `Execute the 100-day plan to deliver early wins, prove the thesis, and build integration momentum.`,
      scope: ["Quick wins (30 days)", "Structural initiatives (60 days)", "Strategic initiatives (100 days)", "Communication cadence", "Risk monitoring"],
      activities: ["Weekly executive steering", "Initiative-level tracking", "Escalation management"],
      deliverables: ["100-day roadmap", "Weekly progress reports", "Day-100 milestone review"],
      valueImpact: "Delivering first 3-5 quick wins in 30 days builds 70%+ organizational buy-in for the full program.",
    },
  };

  const ext = E[s.id];
  if (!ext) {
    // Generic fallback expansion
    return {
      ...s,
      objective: `Deliver ${s.name.toLowerCase()} tailored to ${buyer}-${target} transaction context in ${sector}.`,
      scope: ["Scoping & planning", "Execution", "Reporting & recommendations"],
      activities: ["Stakeholder interviews", "Analysis & benchmarking", "Workshop facilitation"],
      deliverables: ["Final report", "Executive summary deck"],
      valueImpact: "Reduces execution risk and improves transaction outcome.",
    };
  }
  return { ...s, ...ext };
}

// Custom service — expand free-text intent
export function expandCustomService(
  name: string,
  c: DealClassification,
  d: DealInput
): Service {
  const id = "custom_" + Date.now();
  return expandService(
    { id, name, type: "custom", selected: true },
    c,
    d
  );
}
