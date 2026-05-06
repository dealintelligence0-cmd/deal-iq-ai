

const FX_INR_USD = 83;

const REGION_MAP: Record<string, string> = {
  India: "APAC", USA: "North America", "United States": "North America",
  Germany: "EU", UK: "EU", "United Kingdom": "EU", France: "EU",
  Italy: "EU", Spain: "EU", Netherlands: "EU",
  UAE: "MEA", "Saudi Arabia": "MEA", Egypt: "MEA",
  China: "APAC", Japan: "APAC", Singapore: "APAC", Australia: "APAC", Indonesia: "APAC",
  Brazil: "LatAm", Mexico: "LatAm", Canada: "North America",
};

const HOT_SECTORS = /tech|saas|software|fintech|life|pharma|healthcare|biotech|renewable|infrastructure|data center|ev|semiconductor|defence|cybersec|consumer|fmcg|beauty|d2c/i;
const REGULATED_SECTORS = /pharma|life|healthcare|financial|banking|bfsi|insurance|energy|defence|telecom|aviation|utilities/i;
const BIG4_KNOWN_BUYERS = /tata|infosys|wipro|hdfc|reliance|adani|kkr|blackstone|carlyle|tpg|warburg|sequoia|bain|temasek|gic|softbank|alibaba|tencent|microsoft|google|amazon|sun pharma|cipla|dr reddy|aditya birla|bharti|jio|l.oreal|loreal|unilever|marico|itc|nestle|reckitt/i;

export type DerivedFields = {
  geographies_involved: string;
  india_flow: string;
  deal_value_inr_range: string;
  deal_value_usd_range: string;
  deal_summary: string;
  stake_status: string;
  priority_score: number;
  advisory_score: number;
  risk_score: number;
  priority_reason: string;
  advisory_reason: string;
  risk_reason: string;
  deal_takeaway: string;
  targeting_recommendation: string;
  targeting_reason: string;
  confidence_level: string;
  insight_sections: {
    thesis: string;
    why_now: string;
    value_drivers: string[];
    risks: string[];
    tensions: string;
    advisory_angle: string;
  };
  advisor_signal: string;
  time_sensitivity: string;
  why_not: string;
  action_verb: string;
};

// ─── helpers ────────────────────────────────────────────────────────────────

function dedupeEntities(parts: string[]): string[] {
  const norm = (s: string) =>
    s.toLowerCase()
      .replace(/\b(ltd|ltdp|pty|inc|llc|sa|plc|pvt|corp|co|limited|private|public|lp|llp)\b\.?/g, "")
      .replace(/\s+/g, " ")
      .trim();
  const seen = new Set<string>();
  return parts.filter((p) => {
    const key = norm(p);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formatMultiParty(s: string | null): {
  display: string; isMulti: boolean; count: number; all: string[];
} {
  if (!s) return { display: "—", isMulti: false, count: 0, all: [] };
  const raw = s.split(/[,;|]/).map((x) => x.trim()).filter((x) => x.length > 1);
  const parts = dedupeEntities(raw);
  if (parts.length <= 1) return { display: parts[0] ?? s, isMulti: false, count: 1, all: parts };
  if (parts.length === 2) return { display: parts.join(" + "), isMulti: true, count: 2, all: parts };
  return {
    display: `${parts[0]} + ${parts.length - 1} others`,
    isMulti: true, count: parts.length, all: parts,
  };
}

function parseCountries(s: string | null): string[] {
  if (!s) return [];
  return s.split(/[,;|/&]/).map((x) => x.trim()).filter(Boolean);
}

function maxNum(s: string | null): number {
  if (!s) return 0;
  const m = String(s).match(/[\d,]+\.?\d*/g);
  if (!m) return 0;
  return Math.max(...m.map((x) => parseFloat(x.replace(/,/g, ""))).filter((n) => !isNaN(n)));
}

function inrRange(inrM: number): string {
  if (inrM <= 0) return "—";
  if (inrM < 1000) return "<₹1bn";
  if (inrM < 5000) return "₹1-5bn";
  if (inrM < 10000) return "₹5-10bn";
  if (inrM < 50000) return "₹10-50bn";
  if (inrM < 100000) return "₹50-100bn";
  return ">₹100bn";
}

function usdRange(usdM: number): string {
  if (usdM <= 0) return "—";
  if (usdM < 50) return "<$50M";
  if (usdM < 250) return "$50-250M";
  if (usdM < 500) return "$250-500M";
  if (usdM < 1000) return "$500M-1B";
  if (usdM < 5000) return "$1-5B";
  if (usdM < 10000) return "$5-10B";
  return ">$10B";
}

function stakeStatus(pct: number | null): string {
  if (pct == null) return "Not disclosed";
  if (pct >= 90) return "control";
  if (pct >= 50) return "majority";
  return "minority";
}

function sizeBucket(usdM: number) {
  if (usdM >= 5000) return { label: "mega", points: 30 };
  if (usdM >= 1000) return { label: "large", points: 25 };
  if (usdM >= 250) return { label: "mid", points: 18 };
  if (usdM >= 50) return { label: "small", points: 10 };
  return { label: "micro", points: 5 };
}

function extractStakeFromText(
  a: string | null, b: string | null, c: string | null
): number | null {
  const text = [a, b, c].filter(Boolean).join(" ").toLowerCase();
  if (!text) return null;
  if (/^\s*\d+(?:\.\d+)?\s*$/.test(text)) {
    const n = parseFloat(text);
    if (n > 0 && n <= 100) return n;
  }
  const between = text.match(/between\s+(\d{1,3}(?:\.\d+)?)\s*%?\s*(?:and|to|-)\s*(\d{1,3}(?:\.\d+)?)\s*%/);
  if (between) return Math.round((parseFloat(between[1]) + parseFloat(between[2])) / 2);
  const more = text.match(/(?:>|more than|greater than|over|above)\s*(\d{1,3}(?:\.\d+)?)\s*%/);
  if (more) return parseFloat(more[1]);
  const less = text.match(/(?:<|less than|below|under)\s*(\d{1,3}(?:\.\d+)?)\s*%/);
  if (less) return Math.max(1, parseFloat(less[1]) - 1);
  if (/n\/?a|not\s*disclosed|undisclosed|tbd/.test(text)) return null;
  const bare = text.match(/(\d{1,3}(?:\.\d+)?)\s*%/);
  if (bare) { const n = parseFloat(bare[1]); if (n > 0 && n <= 100) return n; }
  return null;
}

// ─── scoring ────────────────────────────────────────────────────────────────

function buildScores(
  usdM: number, countries: string[], sector: string | null,
  dealType: string | null, stake: number | null, isConsortium: boolean
) {
  const crossBorder = countries.length >= 2;
  const isHotSector = sector ? HOT_SECTORS.test(sector) : false;
  const isRegulated = sector ? REGULATED_SECTORS.test(sector) : false;
  const isComplex = dealType ? /merger|jv|carve|spin|ipo/i.test(dealType) : false;
  const sb = sizeBucket(usdM);

  const prioParts: string[] = [`Size:${sb.label} (+${sb.points})`];
  let prio = sb.points;
  if (crossBorder) { prio += 20; prioParts.push("Cross-border (+20)"); }
  if (isHotSector) { prio += 18; prioParts.push("Hot sector (+18)"); }
  if (isConsortium) { prio += 15; prioParts.push("Contested auction (+15)"); }
  if (stake != null && stake >= 50) { prio += 12; prioParts.push("Control deal (+12)"); }
  if (dealType && /ipo/i.test(dealType)) { prio += 15; prioParts.push("IPO timing (+15)"); }
  prio = Math.min(100, prio);

  const advParts: string[] = [`Size:${sb.label} (+${sb.points})`];
  let adv = sb.points;
  if (crossBorder) { adv += 22; advParts.push("Multi-jurisdiction (+22)"); }
  if (isComplex) { adv += 25; advParts.push(`${dealType} complexity (+25)`); }
  if (isRegulated) { adv += 18; advParts.push("Regulated sector (+18)"); }
  if (isConsortium) { adv += 20; advParts.push("Auction advisory (+20)"); }
  if (stake != null && stake > 0 && stake < 100) { adv += 10; advParts.push(`${stake}% stake (+10)`); }
  adv = Math.min(100, adv);

  const riskParts: string[] = [];
  let risk = 0;
  if (usdM >= 5000) { risk += 25; riskParts.push("Mega deal exec (+25)"); }
  else if (usdM >= 1000) { risk += 18; riskParts.push("Large deal exec (+18)"); }
  else if (usdM >= 250) { risk += 10; riskParts.push("Mid deal exec (+10)"); }
  if (crossBorder) { risk += 22; riskParts.push("Multi-juris antitrust (+22)"); }
  if (isRegulated) { risk += 22; riskParts.push("Regulatory burden (+22)"); }
  if (isConsortium) { risk += 12; riskParts.push("Auction premium risk (+12)"); }
  if (dealType && /merger|jv/i.test(dealType)) { risk += 15; riskParts.push(`${dealType} integration (+15)`); }
  if (dealType && /carve|spin/i.test(dealType)) { risk += 18; riskParts.push("Separation complexity (+18)"); }
  if (stake != null && stake >= 50 && stake < 90) { risk += 8; riskParts.push("Minority overhang (+8)"); }
  risk = Math.min(100, risk);

  return {
    priority_score: prio, advisory_score: adv, risk_score: risk,
    priority_reason: prioParts.join(" · "),
    advisory_reason: advParts.join(" · "),
    risk_reason: riskParts.join(" · ") || "Standard execution risk",
  };
}

// ─── intelligence ────────────────────────────────────────────────────────────

function buildIntelligence(opts: {
  buyer: string | null; target: string | null; sector: string | null; country: string | null;
  dealType: string | null; usdM: number; stake: number | null; crossBorder: boolean;
  isHotSector: boolean; isRegulated: boolean; advScore: number; prioScore: number;
  notes: string | null; heading: string | null; buyerParts: string[];
}) {
  const {
    buyer, target, sector, dealType, usdM, stake, crossBorder,
    isHotSector, isRegulated, advScore, prioScore, notes, buyerParts,
  } = opts;

  const isConsortium = buyerParts.length > 1;
  const sizeLabel = usdM >= 1000 ? "large" : usdM >= 250 ? "mid-market" : "small-cap";
  const buyerDisplay = isConsortium
    ? `consortium of ${buyerParts.length} bidders (${buyerParts.slice(0, 2).join(" + ")}${buyerParts.length > 2 ? ` + ${buyerParts.length - 2} others` : ""})`
    : (buyer ?? "Acquirer");

  // ── THESIS: ground in Opportunity text (notes column) ──
  let thesis: string;
 if (notes && notes.trim().length > 30) {
    const sentences = notes.split(/[.!?]/).map((s) => s.trim()).filter((s) => s.length > 15);
    const core = sentences.slice(0, 2).join(". ").trim();
    // Use heading as hook if available, then ground in opportunity text
    const hook = heading && heading.trim().length > 5 ? heading.trim() : null;
    if (isConsortium) {
      thesis = hook
        ? `${hook} — competitive auction: ${buyerDisplay} are each bidding: ${core.slice(0, 180)}${core.length > 180 ? "…" : ""}`
        : `Competitive auction — ${buyerDisplay} each bidding for ${target ?? "target"}: ${core.slice(0, 220)}${core.length > 220 ? "…" : ""}`;
    } else {
      thesis = hook
        ? `${hook} — ${buyerDisplay} acquires ${target ?? "target"}: ${core.slice(0, 180)}${core.length > 180 ? "…" : ""}`
        : `${buyerDisplay} acquires ${target ?? "target"}: ${core.slice(0, 220)}${core.length > 220 ? "…" : ""}`;
    }
  } else if (isConsortium) {
    thesis = `Competitive auction for ${target ?? "target"} in ${sector ?? "sector"}: ${buyerDisplay} competing — strategic rationale spans ${isHotSector ? "sector positioning" : "consolidation"}${crossBorder ? " + cross-border expansion" : ""}.`;
  } else if (dealType && /ipo/i.test(dealType)) {
    thesis = `${target ?? "Company"} listing capitalises on ${isHotSector ? "sector momentum" : "current capital availability"}; ${sizeLabel} float in ${sector ?? "sector"}.`;
  } else if (dealType && /merger/i.test(dealType)) {
    thesis = `${buyerDisplay}–${target ?? "Target"} merger creates scale player in ${sector ?? "sector"}, addressing ${crossBorder ? "multi-region presence" : "domestic consolidation"}.`;
  } else {
    thesis = `${buyerDisplay} acquires ${target ?? "target"} to ${isHotSector ? "accelerate position in growing " : "consolidate share in mature "}${sector ?? "sector"}${crossBorder ? "; cross-border footprint expansion" : ""}.`;
  }

  // ── WHY NOW ──
  const why_now = isConsortium
    ? `Multiple credible bidders signal hotly contested asset; auction timeline compressed — first-mover advisory engagement critical to avoid losing mandate.`
    : isHotSector
    ? `${sector} M&A activity elevated; window for strategic positioning before further multiple expansion.`
    : crossBorder
    ? "Cross-border deal timing reflects favourable regulatory + FX conditions."
    : usdM >= 1000
    ? "Deal size signals platform-creation moment; window to establish integration advisory before close."
    : "Tactical bolt-on; speed of execution > timing precision.";

  // ── VALUE DRIVERS ──
  const driverPool: string[] = [];
  if (isConsortium) driverPool.push(`Contested asset — winner gains ${sector ?? "sector"} leadership vs ${buyerParts.length - 1} rivals`);
  if (usdM >= 1000) driverPool.push("Scale economics from combined revenue base");
  if (crossBorder) driverPool.push("Geographic diversification + new market access");
  if (isHotSector) driverPool.push(`${sector} platform consolidation tailwind`);
  if (stake != null && stake >= 50) driverPool.push("Control rights enable full integration playbook");
  if (dealType && /carve/i.test(dealType)) driverPool.push("Carve-out unlocks focused operating model");
  if (isRegulated) driverPool.push("Regulatory scale advantage post-combination");
  if (usdM < 250) driverPool.push("Capability tuck-in — strategic optionality at low entry price");
  if (driverPool.length < 3) driverPool.push("Cost-base optimisation through shared services", "Cross-portfolio talent mobility", "Brand + balance sheet leverage");
  const value_drivers = Array.from(new Set(driverPool)).slice(0, 3);

  // ── RISKS ──
  const risksPool: string[] = [];
  if (isConsortium) risksPool.push("Auction premium risk — competitive bidding may compress returns for winner");
  if (crossBorder) risksPool.push("Antitrust review across multiple jurisdictions");
  if (isRegulated) risksPool.push(`${sector} regulatory clearance + license transfer`);
  if (dealType && /merger|jv/i.test(dealType)) risksPool.push("Integration execution + cultural alignment");
  if (dealType && /carve/i.test(dealType)) risksPool.push("TSA dependency + stranded cost management");
  if (usdM >= 5000) risksPool.push("Synergy realisation under public-market scrutiny");
  if (stake != null && stake < 50) risksPool.push("Minority position limits operational influence");
  if (risksPool.length < 3) risksPool.push("Customer attrition during transition", "Top-100 talent retention", "FX + working-capital shock at close");
  const risks = Array.from(new Set(risksPool)).slice(0, 3);

  // ── TENSIONS ──
  const tensions = isConsortium
    ? `Multiple credible bidders give seller pricing leverage — winner likely overpays vs standalone synergy logic; returns depend on execution speed post-close.`
    : isHotSector && usdM >= 1000
    ? `Strategic logic strong but sector heat implies premium valuation — value creation depends entirely on synergy execution discipline.`
    : crossBorder
    ? "Cross-border thesis attractive but execution risk and regulatory friction are consistently understated at term-sheet stage."
    : isRegulated
    ? "Regulatory pathway can compress or expand timeline by 6-12 months — the key sensitivity for advisory timing."
    : "Bolt-on logic clear; risk concentrated in retention of target leadership and customer continuity.";

  // ── ADVISORY ANGLE ──
  const advisory_angle = isConsortium
    ? `Pitch sell-side auction management to seller (valuation + process) OR buy-side competitive positioning to strongest bidder. Dual mandate opportunity.`
    : advScore >= 70
    ? `Lead with integration playbook + ${crossBorder ? "multi-jurisdiction regulatory navigation" : "synergy capture rigour"}. Position senior partner involvement.`
    : advScore >= 40
    ? `Pitch ${dealType && /carve/i.test(dealType) ? "carve-out and TSA design" : "synergy modelling and IMO setup"}. Mid-tier partner with sector specialist.`
    : "Focused workstream pitch (DD, valuation, or specific function). Lean team. Compete on sector knowledge.";

  // ── TAKEAWAY ──
  const deal_takeaway = prioScore >= 70
    ? `High-priority: ${sizeLabel}, ${crossBorder ? "cross-border" : "domestic"}, ${isConsortium ? "contested auction" : isHotSector ? "hot sector" : "stable sector"}. Pursue actively.`
    : prioScore >= 40
    ? `Medium-priority: worth tracking. Engage if existing buyer/target relationship or sector mandate.`
    : `Low-priority: standard mid-market. Monitor for follow-on advisory opportunities.`;

  // ── TARGETING ──
  const targetScore = (advScore * 0.5) + (prioScore * 0.5);
  const targeting_recommendation = targetScore >= 65 ? "HIGH" : targetScore >= 40 ? "MEDIUM" : "LOW";
  const targeting_reason = targeting_recommendation === "HIGH"
    ? `Strong advisory fit (${advScore}) + strong priority (${prioScore}). ${isConsortium ? "Multi-bidder auction = advisory opportunity regardless of winner" : crossBorder ? "Cross-border complexity" : "Sector momentum"} drives advisory premium.`
    : targeting_recommendation === "MEDIUM"
    ? `Moderate fit. Pursue if relationship leverage exists with ${buyer ?? "buyer"} or sector practice.`
    : `Limited advisory upside. Watch list only.`;

  return { thesis, why_now, value_drivers, risks, tensions, advisory_angle, deal_takeaway, targeting_recommendation, targeting_reason };
}

// ─── signal helpers ──────────────────────────────────────────────────────────

function confidenceLevel(buyer: string | null, target: string | null, sector: string | null, country: string | null, usdM: number): string {
  const score = [buyer, target, sector, country].filter(Boolean).length + (usdM > 0 ? 1 : 0);
  if (score >= 5) return "HIGH";
  if (score >= 3) return "MEDIUM";
  return "LOW";
}

function advisorSignal(buyer: string | null, usdM: number, dealType: string | null, isConsortium: boolean): string {
  if (isConsortium) return "Auction — advisor likely required by seller";
  if (buyer && BIG4_KNOWN_BUYERS.test(buyer)) return "Big4 known relationship";
  if (usdM >= 1000) return "Big4 likely engaged — outreach required";
  if (dealType && /carve|spin|merger|ipo/i.test(dealType)) return "Specialist advisor likely needed";
  if (!buyer || buyer === "—") return "Unknown advisor — opportunity";
  return "Internal team or unknown";
}

function timeSensitivity(dealDate: string | null, status: string | null): string {
  if (!dealDate) return "Unknown";
  const days = Math.floor((Date.now() - new Date(dealDate).getTime()) / (1000 * 60 * 60 * 24));
  if (status && /closed/i.test(status)) return "Late-stage (closed)";
  if (days < 30) return "Early-stage (<30 days)";
  if (days < 90) return "Mid-process (30-90 days)";
  if (days < 180) return "Late-stage (90-180 days)";
  return "Stale (>180 days)";
}

function whyNot(stake: number | null, usdM: number, dealType: string | null, advScore: number): string {
  if (stake != null && stake < 30) return "Minority stake (<30%) — limited advisory scope, governance-only role";
  if (usdM > 0 && usdM < 50) return "Sub-economic deal size — fee economics challenging";
  if (dealType && /ipo/i.test(dealType) && advScore < 50) return "IPO advisory typically captured by ECM bookrunners";
  if (advScore < 35) return "Standard deal — limited differentiation opportunity";
  return "—";
}

function actionVerb(targeting: string, advScore: number): string {
  if (targeting === "HIGH") return "Aggressive Pursuit";
  if (targeting === "MEDIUM" && advScore >= 50) return "Selective Outreach";
  if (targeting === "MEDIUM") return "Monitor";
  return "Do Not Pursue";
}

// ─── main export ─────────────────────────────────────────────────────────────

export function deriveFields(raw: Record<string, unknown>): DerivedFields {
  // ── raw inputs ──
  const country    = (raw.country     as string | null) ?? null;
  const rawBuyer   = (raw.buyer       as string | null) ?? null;
  const target     = (raw.target      as string | null) ?? null;
  const sector     = (raw.sector      as string | null) ?? null;
  const dealType   = (raw.deal_type   as string | null) ?? null;
  const valueRaw   = (raw.value_raw   as string | null) ?? null;
  const notes      = (raw.notes       as string | null) ?? null;
  const heading    = (raw.heading     as string | null) ?? null;
  const dealDate   = (raw.deal_date   as string | null) ?? null;
  const status     = (raw.status      as string | null) ?? null;
  const usdNorm    = (raw.normalized_value_usd as number | null) ?? null;

  // ── stake ──
  let stakePct = (raw.stake_percent as number | null) ?? null;
  if (stakePct == null || stakePct === 0) {
    const stakeRaw = (raw.stake_value as string | null) ?? null;
    stakePct = extractStakeFromText(stakeRaw, notes, valueRaw)
            ?? extractStakeFromText(notes, valueRaw, dealType);
  }

  // ── buyer dedup ──
  const buyerInfo = formatMultiParty(rawBuyer);
  const buyer = buyerInfo.all.length > 0 ? buyerInfo.all.join(", ") : rawBuyer;
  const isConsortium = buyerInfo.all.length > 1;

  // ── geography ──
  const allCountries = parseCountries(country);
  const regions = Array.from(new Set(allCountries.map((c) => REGION_MAP[c] || "Other")));
  const geographies_involved = regions.join(", ") || (country ?? "—");
  let india_flow = "other";
  const hasIndia = allCountries.some((c) => /india/i.test(c));
  if (hasIndia && allCountries.length === 1) india_flow = "domestic";
  else if (hasIndia && country && /india/i.test(country.split(",")[0])) india_flow = "outbound";
  else if (hasIndia) india_flow = "inbound";

  // ── value ──
  let usdM = (usdNorm ?? 0) / 1_000_000;
  if (usdM === 0 && valueRaw) {
    const num = maxNum(valueRaw);
    if      (/B|bn|billion/i.test(valueRaw)) usdM = num * 1000;
    else if (/M|mn|million/i.test(valueRaw)) usdM = num;
    else if (/cr|crore/i.test(valueRaw))     usdM = (num * 10) / FX_INR_USD;
    else if (/inr|₹|rs/i.test(valueRaw))     usdM = num / FX_INR_USD;
    else usdM = num;
  }
  const inrM = usdM * FX_INR_USD;

  // ── flags ──
  const crossBorder = allCountries.length >= 2;
  const isHotSector = sector ? HOT_SECTORS.test(sector) : false;
  const isRegulated = sector ? REGULATED_SECTORS.test(sector) : false;

  // ── scores & intelligence ──
  const scores = buildScores(usdM, allCountries, sector, dealType, stakePct, isConsortium);
  const intel  = buildIntelligence({
    buyer, target, sector, country, dealType, usdM, stake: stakePct,
    crossBorder, isHotSector, isRegulated,
    advScore: scores.advisory_score, prioScore: scores.priority_score,
    notes, heading,
    buyerParts: buyerInfo.all,
  });

  // ── deal summary: prefer heading col, else synthesise ──
  const deal_summary = heading && heading.trim().length > 5
    ? heading.slice(0, 150) + (heading.length > 150 ? "…" : "")
    : notes && notes.trim().length > 10
    ? (notes.split(/[.!?]/)[0]?.trim().slice(0, 150) ?? "—")
    : `${buyer ?? "—"} → ${target ?? "—"}`;

  return {
    geographies_involved,
    india_flow,
    deal_value_inr_range: inrRange(inrM),
    deal_value_usd_range: usdRange(usdM),
    deal_summary,
    stake_status: stakeStatus(stakePct),
    ...scores,
    deal_takeaway:           intel.deal_takeaway,
    targeting_recommendation: intel.targeting_recommendation,
    targeting_reason:        intel.targeting_reason,
    confidence_level:        confidenceLevel(buyer, target, sector, country, usdM),
    insight_sections: {
      thesis:        intel.thesis,
      why_now:       intel.why_now,
      value_drivers: intel.value_drivers,
      risks:         intel.risks,
      tensions:      intel.tensions,
      advisory_angle: intel.advisory_angle,
    },
    advisor_signal:   advisorSignal(buyer, usdM, dealType, isConsortium),
    time_sensitivity: timeSensitivity(dealDate, status),
    why_not:          whyNot(stakePct, usdM, dealType, scores.advisory_score),
    action_verb:      actionVerb(intel.targeting_recommendation, scores.advisory_score),
  };
}
