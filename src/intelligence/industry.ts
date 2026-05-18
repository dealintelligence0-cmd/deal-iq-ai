/* ─── LEVEL 1: SECTORS ─── */
export const SECTORS = ["Consumer", "Energy & Resources", "Financial Services", "Life Sciences & Healthcare", "Technology, Media & Telecom", "Industrials & Manufacturing", "Government & Public Sector"] as const;
export type Sector = typeof SECTORS[number];

/* ─── LEVEL 2: SUB-SECTORS ─── */
export const SUB_SECTORS: Record<string, string[]> = {
  "Consumer":                    ["Retail", "FMCG", "E-commerce", "Luxury", "Food & Beverage", "Consumer Services"],
  "Energy & Resources":          ["Oil & Gas", "Renewables", "Utilities", "Mining", "Chemicals"],
  "Financial Services":          ["Banking", "Insurance", "Asset Management", "Fintech", "Payments", "Wealth Management"],
  "Life Sciences & Healthcare":  ["Pharma", "MedTech", "Hospitals & Providers", "Healthcare IT", "Biotech", "CRO/CMO"],
  "Technology, Media & Telecom": ["SaaS", "Platforms", "Telecom", "Media & Publishing", "Semiconductors", "Cybersecurity", "IT Services"],
  "Industrials & Manufacturing": ["Automotive", "Aerospace & Defence", "Chemicals", "Capital Goods", "Logistics", "Packaging"],
  "Government & Public Sector":  ["Defence", "Infrastructure", "Education", "Public Health", "Smart Cities"],
};

/* ─── LEVEL 3: ARCHETYPES ─── */
export type Archetype = { assetProfile: "heavy" | "light" | "medium"; model: "platform" | "product" | "services"; regulation: "high" | "medium" | "low"; customerBase: "B2B" | "B2C" | "B2G" | "Mixed" };
export const ARCHETYPES: Record<string, Archetype> = {
  "SaaS":          { assetProfile: "light",  model: "platform", regulation: "low",    customerBase: "B2B" },
  "Banking":       { assetProfile: "heavy",  model: "services", regulation: "high",   customerBase: "Mixed" },
  "Pharma":        { assetProfile: "heavy",  model: "product",  regulation: "high",   customerBase: "B2B" },
  "Retail":        { assetProfile: "heavy",  model: "product",  regulation: "low",    customerBase: "B2C" },
  "Oil & Gas":     { assetProfile: "heavy",  model: "product",  regulation: "medium", customerBase: "B2B" },
  "Automotive":    { assetProfile: "heavy",  model: "product",  regulation: "medium", customerBase: "B2C" },
  "Telecom":       { assetProfile: "heavy",  model: "platform", regulation: "high",   customerBase: "Mixed" },
  "E-commerce":    { assetProfile: "light",  model: "platform", regulation: "low",    customerBase: "B2C" },
  "MedTech":       { assetProfile: "medium", model: "product",  regulation: "high",   customerBase: "B2B" },
  "Cybersecurity": { assetProfile: "light",  model: "platform", regulation: "medium", customerBase: "B2B" },
};

/* ─── SYNERGY BENCHMARKS ─── */
export type SynergyBenchmark = { costLow: number; costHigh: number; revLow: number; revHigh: number; focusAreas: string[]; keyRisks: string[]; integrationMonths: number };
export const SYNERGY_BENCHMARKS: Record<string, SynergyBenchmark> = {
  "Technology, Media & Telecom": { costLow: 0.05, costHigh: 0.12, revLow: 0.03, revHigh: 0.08, focusAreas: ["Product roadmap overlap elimination", "Engineering org rationalization", "GTM model consolidation", "Cloud & infra stack merge", "Customer success model unification"], keyRisks: ["Talent attrition in engineering", "Product fragmentation", "Customer churn during transition", "Platform incompatibility"], integrationMonths: 18 },
  "SaaS":                        { costLow: 0.06, costHigh: 0.13, revLow: 0.04, revHigh: 0.09, focusAreas: ["ARR consolidation & dedup", "Cloud cost optimization", "GTM rationalization (PLG vs enterprise)", "Churn reduction via combined CS", "Pricing harmonization"], keyRisks: ["ARR churn post-close", "Engineering culture clash", "Logo concentration risk", "NRR dilution"], integrationMonths: 15 },
  "Financial Services":          { costLow: 0.08, costHigh: 0.16, revLow: 0.02, revHigh: 0.05, focusAreas: ["Branch & channel overlap removal", "Core banking platform migration", "Risk & compliance framework merge", "Back-office consolidation", "Regulatory capital optimization"], keyRisks: ["Regulatory change-of-control approval", "Core platform migration risk", "Customer attrition", "Capital adequacy post-close"], integrationMonths: 24 },
  "Life Sciences & Healthcare":  { costLow: 0.04, costHigh: 0.09, revLow: 0.02, revHigh: 0.06, focusAreas: ["Procurement & GPO leverage", "Clinical operations merge", "Distribution network sync", "R&D portfolio rationalization", "Regulatory pathway alignment"], keyRisks: ["FDA/EMA approval continuity", "Trial protocol disruption", "Payer mix concentration", "Clinical talent retention"], integrationMonths: 24 },
  "Industrials & Manufacturing": { costLow: 0.04, costHigh: 0.10, revLow: 0.02, revHigh: 0.05, focusAreas: ["Plant footprint consolidation", "Procurement scale rebid", "SKU rationalization", "Logistics network redesign", "Capex prioritization"], keyRisks: ["Union/labor disruption", "Supply chain fragility", "Commodity exposure", "EHS compliance"], integrationMonths: 21 },
  "Consumer":                    { costLow: 0.05, costHigh: 0.12, revLow: 0.03, revHigh: 0.07, focusAreas: ["Store network optimization", "Pricing architecture harmonization", "Brand portfolio rationalization", "Inventory & supply chain sync", "Omnichannel integration"], keyRisks: ["Brand dilution", "Consumer sentiment", "Margin compression", "Inventory write-down"], integrationMonths: 18 },
  "Energy & Resources":          { costLow: 0.03, costHigh: 0.08, revLow: 0.01, revHigh: 0.04, focusAreas: ["Asset base optimization", "HSE system alignment", "Supply chain integration", "Capex portfolio rationalization", "Workforce & contractor rationalization"], keyRisks: ["Commodity cycle", "Regulatory approval", "Environmental liability", "Operational continuity"], integrationMonths: 24 },
};

/* ─── GEOGRAPHY OVERLAY ─── */
export type GeoContext = { complexity: "low" | "medium" | "high"; regulatoryNote: string; laborNote: string; executionRisk: string };

export function getGeoContext(geo: string): GeoContext {
  const g = (geo || "").toLowerCase();
  if (/india|pakistan|bangladesh|southeast asia|vietnam|indonesia/.test(g)) return { complexity: "medium", regulatoryNote: "CCI filing likely if thresholds exceeded; sector-specific approval may apply", laborNote: "Lower labor cost base — headcount synergies achievable at lower financial cost but higher social sensitivity", executionRisk: "Higher execution variability; informal operational practices require structured integration protocols" };
  if (/china|beijing|shanghai/.test(g)) return { complexity: "high", regulatoryNote: "SAMR review required above RMB thresholds; VIE structures complicate integration; data sovereignty rules apply", laborNote: "State-directed workforce norms; redundancy constraints in SOE-adjacent sectors", executionRisk: "Geopolitical exposure; data localisation adds IT integration complexity; high integration variability" };
  if (/europe|eu|germany|france|italy|spain|netherlands|denmark|sweden|poland|belgium|austria/.test(g)) return { complexity: "high", regulatoryNote: "EU Merger Regulation + national competition authorities; GDPR compliance mandatory; Works Councils have co-determination rights", laborNote: "Strong employment protections; redundancy processes 6-18 months; collective agreements require consultation", executionRisk: "Longer integration timeline vs US; cultural differences across markets; stricter ESG disclosure requirements" };
  if (/uk|united kingdom|britain/.test(g)) return { complexity: "medium", regulatoryNote: "CMA jurisdiction; FCA change-of-control for financial services; NSI Act for sensitive sectors", laborNote: "TUPE regulations protect employees on transfer; consultation requirements 30-90 days", executionRisk: "Post-Brexit cross-border complexity if EU operations exist; moderate integration speed vs US" };
  if (/middle east|uae|saudi|gulf/.test(g)) return { complexity: "medium", regulatoryNote: "FDI restrictions in certain sectors; government ownership/approval may be required; local content rules", laborNote: "Significant expatriate workforce; local ownership and Saudisation/Emiratisation quotas apply", executionRisk: "Relationship-based business culture; integration requires senior leadership continuity; informal decision-making" };
  if (/usa|united states|north america|canada/.test(g)) return { complexity: "low", regulatoryNote: "HSR pre-merger notification for qualifying deals; DOJ/FTC review; CFIUS for foreign buyers of sensitive assets", laborNote: "At-will employment facilitates faster restructuring; WARN Act for mass layoffs (60-day notice)", executionRisk: "Fastest integration pace globally; litigation risk is higher; activist shareholder scrutiny" };
  return { complexity: "medium", regulatoryNote: "Local competition authority review may apply; assess merger control thresholds with local counsel", laborNote: "Local labor laws govern workforce changes; assess collective agreements and consultation requirements", executionRisk: "Assess cross-border complexity if acquirer and target are in different jurisdictions" };
}

/* ─── SECTOR MATCHER ─── */
export function matchSector(input: string): Sector {
  const s = (input || "").toLowerCase();
  if (/saas|software|tech|digital|ai|cloud|cyber|platform|data|internet/.test(s)) return "Technology, Media & Telecom";
  if (/bank|financ|insur|asset|wealth|fintech|payment|lending/.test(s)) return "Financial Services";
  if (/pharma|health|medtech|hospital|biotech|life science|cro|cmo/.test(s)) return "Life Sciences & Healthcare";
  if (/manufactur|industrial|auto|aerospace|chemical|logistic|packaging|capital good/.test(s)) return "Industrials & Manufacturing";
  if (/retail|consumer|fmcg|ecommerce|food|luxury|beverage/.test(s)) return "Consumer";
  if (/energy|oil|gas|power|utility|mining|renewable/.test(s)) return "Energy & Resources";
  if (/government|public|defence|defense|infrastructure|education/.test(s)) return "Government & Public Sector";
  return "Technology, Media & Telecom";
}

export function getSynergyBenchmark(sector: string): SynergyBenchmark {
  const matched = matchSector(sector);
  return SYNERGY_BENCHMARKS[matched] ?? SYNERGY_BENCHMARKS["Technology, Media & Telecom"];
}

export function buildIndustryContextBlock(sector: string, geography: string): string {
  const matched = matchSector(sector);
  const bench = getSynergyBenchmark(sector);
  const geo = getGeoContext(geography);
  const subs = SUB_SECTORS[matched]?.join(", ") ?? "";
  return `
## INDUSTRY INTELLIGENCE
Sector: ${matched}
Sub-sectors in scope: ${subs}
Cost synergy range: ${Math.round(bench.costLow*100)}–${Math.round(bench.costHigh*100)}% of EV
Revenue synergy range: ${Math.round(bench.revLow*100)}–${Math.round(bench.revHigh*100)}% of EV
Key integration focus areas: ${bench.focusAreas.join(" · ")}
Top integration risks: ${bench.keyRisks.join(" · ")}
Typical integration duration: ${bench.integrationMonths} months

## GEOGRAPHY OVERLAY
Geography: ${geography}
Regulatory: ${geo.regulatoryNote}
Labor: ${geo.laborNote}
Execution risk: ${geo.executionRisk}
Cross-border complexity: ${geo.complexity.toUpperCase()}
`;
}
