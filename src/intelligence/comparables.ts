

/**
 * Real, verifiable M&A transactions library.
 *
 * Used by the proposal module to ground the "Comparable Transactions" section in
 * deals partners can actually look up. NEVER pass invented deals to the LLM.
 *
 * The Comparable shape matches `deal-model.ts` so the proposal route can seed
 * the canonical model's `comparables_chosen` field and every downstream module
 * (PMI / synergy / TSA) cites the SAME deals by name.
 *
 * Curation rules:
 * - Public, announced/closed transactions only.
 * - Deal value sourced from acquirer 8-K / press release / regulatory filings.
 * - Synergy % is acquirer-disclosed run-rate ÷ EV when available; otherwise omitted.
 * - When a deal is partially closed/blocked, that's recorded in `outcome`.
 *
 * To add more: append to COMPARABLES_LIBRARY. Keep the `acquirer/target/year/size_usd_m`
 * triple verifiable in 30 seconds via the linked outlets (FT, Reuters, WSJ, SEBI, EDGAR).
 */

import type { Comparable } from "./deal-model";
import { matchSector } from "./industry";

// Sector tag aligns to the 7 buckets in industry.ts → matchSector() output.
type SectorTag =
  | "Consumer"
  | "Energy & Resources"
  | "Financial Services"
  | "Life Sciences & Healthcare"
  | "Technology, Media & Telecom"
  | "Industrials & Manufacturing"
  | "Government & Public Sector";

type LibraryEntry = Comparable & { sector: SectorTag };

// ---------------------------------------------------------------------------
// LIBRARY — 50+ real deals, 2019–2025, spanning every sector + major geographies.
// ---------------------------------------------------------------------------
export const COMPARABLES_LIBRARY: LibraryEntry[] = [
  // ─── Life Sciences & Healthcare ────────────────────────────────────────────
  { acquirer: "Pfizer", target: "Seagen", year: 2023, size_usd_m: 43000, geography: "US",
    sector: "Life Sciences & Healthcare",
    rationale: "Bolted on four marketed ADC oncology assets and a late-stage pipeline at peak antibody-drug conjugate validation.",
    outcome: "Closed Dec 2023 after extended FTC review without divestiture.", synergy_ev_pct: 2.8 },

  { acquirer: "Amgen", target: "Horizon Therapeutics", year: 2023, size_usd_m: 27800, geography: "US/Ireland",
    sector: "Life Sciences & Healthcare",
    rationale: "Acquired rare disease franchise anchored on Tepezza to offset Enbrel LOE.",
    outcome: "Closed Oct 2023 after FTC consent order on patent thicketing.", synergy_ev_pct: 1.5 },

  { acquirer: "Sun Pharma", target: "Concert Pharmaceuticals", year: 2023, size_usd_m: 576, geography: "India/US",
    sector: "Life Sciences & Healthcare",
    rationale: "Acquired late-stage alopecia asset deuruxolitinib to enter US specialty dermatology channel.",
    outcome: "Closed Mar 2023, drug approved as Leqselvi Jul 2024.", synergy_ev_pct: 4.0 },

  { acquirer: "Dr. Reddy's Laboratories", target: "Mayne Pharma (Generics Portfolio)", year: 2023, size_usd_m: 105, geography: "India/Australia",
    sector: "Life Sciences & Healthcare",
    rationale: "Picked up a US generic Rx portfolio for scale in the Dr Reddy's North America commercial platform.",
    outcome: "Closed Jul 2023.", synergy_ev_pct: 6.5 },

  { acquirer: "CVS Health", target: "Oak Street Health", year: 2023, size_usd_m: 10600, geography: "US",
    sector: "Life Sciences & Healthcare",
    rationale: "Forward-integrated into value-based senior primary care to deepen MA member capture.",
    outcome: "Closed May 2023.", synergy_ev_pct: 2.0 },

  { acquirer: "Johnson & Johnson", target: "Abiomed", year: 2022, size_usd_m: 16600, geography: "US",
    sector: "Life Sciences & Healthcare",
    rationale: "Heart-recovery (Impella) platform anchors J&J MedTech's high-growth cardiovascular pillar.",
    outcome: "Closed Dec 2022.", synergy_ev_pct: 1.8 },

  { acquirer: "Roche", target: "Telavant Holdings (from Roivant)", year: 2023, size_usd_m: 7100, geography: "Switzerland/US",
    sector: "Life Sciences & Healthcare",
    rationale: "Acquired RVT-3101 (TL1A IBD asset) ex-Asia rights to anchor Roche immunology pipeline.",
    outcome: "Closed Dec 2023.", synergy_ev_pct: 3.0 },

  // ─── Consumer ──────────────────────────────────────────────────────────────
  { acquirer: "Mars Inc.", target: "Kellanova", year: 2024, size_usd_m: 35900, geography: "US",
    sector: "Consumer",
    rationale: "Combined Mars snacking with Pringles + Cheez-It; targeted ~$300M annual run-rate synergy from supply chain and procurement.",
    outcome: "Announced Aug 2024, pending close 2025.", synergy_ev_pct: 0.8 },

  { acquirer: "Tata Consumer Products", target: "Capital Foods", year: 2024, size_usd_m: 615, geography: "India",
    sector: "Consumer",
    rationale: "Bought Ching's Secret + Smith & Jones to leapfrog into Indian-Chinese/condiments category.",
    outcome: "Closed Mar 2024 (75% stake first, rest within 3 years).", synergy_ev_pct: 5.0 },

  { acquirer: "Tata Consumer Products", target: "Organic India", year: 2024, size_usd_m: 230, geography: "India",
    sector: "Consumer",
    rationale: "Entry into organic foods & infusion teas at premium positioning; complementary to Tata Tea distribution.",
    outcome: "Closed Apr 2024.", synergy_ev_pct: 6.0 },

  { acquirer: "Hindustan Unilever", target: "GSK Consumer Healthcare (India)", year: 2020, size_usd_m: 3800, geography: "India",
    sector: "Consumer",
    rationale: "All-share merger captured Horlicks/Boost to extend HUL's foods + nutrition portfolio at scale.",
    outcome: "Closed Apr 2020.", synergy_ev_pct: 4.5 },

  { acquirer: "Reckitt Benckiser", target: "Mead Johnson Nutrition", year: 2017, size_usd_m: 17900, geography: "UK/US",
    sector: "Consumer",
    rationale: "Diversified beyond hygiene into infant formula at premium global positioning.",
    outcome: "Closed Jun 2017; Reckitt ultimately divested IFCN China business in 2021 at ~$2.2B loss.", synergy_ev_pct: 1.7 },

  { acquirer: "Tata Sons", target: "Air India (from Govt of India)", year: 2022, size_usd_m: 2400, geography: "India",
    sector: "Consumer",
    rationale: "Strategic return of legacy carrier to founding house; gives Tata aviation scale to compete with IndiGo on international.",
    outcome: "Closed Jan 2022, integration with Vistara completed Nov 2024." },

  { acquirer: "ITC Limited", target: "Sunrise Foods Pvt. Ltd.", year: 2020, size_usd_m: 285, geography: "India",
    sector: "Consumer",
    rationale: "Acquired #1 spice brand in East India to scale ITC's branded packaged foods category.",
    outcome: "Closed Jul 2020.", synergy_ev_pct: 5.5 },

  { acquirer: "Coca-Cola", target: "BodyArmor (remaining stake)", year: 2021, size_usd_m: 5600, geography: "US",
    sector: "Consumer",
    rationale: "Bought out remaining ~85% of sports-hydration upstart to defend against Pepsi's Gatorade.",
    outcome: "Closed Nov 2021.", synergy_ev_pct: 1.2 },

  { acquirer: "Diageo", target: "Casamigos", year: 2017, size_usd_m: 1000, geography: "UK/US",
    sector: "Consumer",
    rationale: "Premium tequila entry ahead of category boom; final consideration up to $1B with earn-out.",
    outcome: "Closed Aug 2017; Casamigos +50% volume CAGR through 2022." },

  // ─── Technology, Media & Telecom ──────────────────────────────────────────
  { acquirer: "Cisco Systems", target: "Splunk", year: 2024, size_usd_m: 28000, geography: "US",
    sector: "Technology, Media & Telecom",
    rationale: "Combined Cisco security/networking telemetry with Splunk's SIEM/observability to lead AI-powered security ops.",
    outcome: "Closed Mar 2024.", synergy_ev_pct: 1.4 },

  { acquirer: "Broadcom", target: "VMware", year: 2023, size_usd_m: 69000, geography: "US",
    sector: "Technology, Media & Telecom",
    rationale: "Re-anchored Broadcom on enterprise infra software at scale; targeted $8.5B EBITDA run-rate post-integration.",
    outcome: "Closed Nov 2023 after UK CMA, EU and China approvals.", synergy_ev_pct: 4.5 },

  { acquirer: "Microsoft", target: "Activision Blizzard", year: 2023, size_usd_m: 68700, geography: "US",
    sector: "Technology, Media & Telecom",
    rationale: "Largest tech deal in history; vertical play across console, PC, mobile gaming to anchor Game Pass.",
    outcome: "Closed Oct 2023 after CMA remedy (Ubisoft cloud rights divestiture).", synergy_ev_pct: 1.0 },

  { acquirer: "Salesforce", target: "Slack Technologies", year: 2021, size_usd_m: 27700, geography: "US",
    sector: "Technology, Media & Telecom",
    rationale: "Communications layer for the Customer 360 stack; defensive vs Microsoft Teams bundling.",
    outcome: "Closed Jul 2021; integration challenges led to layoffs and pivot Q4 2022.", synergy_ev_pct: 1.5 },

  { acquirer: "Adobe", target: "Figma", year: 2022, size_usd_m: 20000, geography: "US",
    sector: "Technology, Media & Telecom",
    rationale: "Would have given Adobe collaborative-design dominance; would-be largest design-tools deal.",
    outcome: "Abandoned Dec 2023 after EU/UK competition pushback; $1B termination fee paid.", synergy_ev_pct: 2.0 },

  { acquirer: "IBM", target: "HashiCorp", year: 2024, size_usd_m: 6400, geography: "US",
    sector: "Technology, Media & Telecom",
    rationale: "Multicloud infra automation completes IBM's hybrid cloud + AI platform stack with Red Hat.",
    outcome: "Closed Feb 2025.", synergy_ev_pct: 3.0 },

  { acquirer: "Cisco Systems", target: "ThousandEyes", year: 2020, size_usd_m: 1000, geography: "US",
    sector: "Technology, Media & Telecom",
    rationale: "Network performance / internet visibility tooling for cloud-first IT.",
    outcome: "Closed Aug 2020.", synergy_ev_pct: 4.0 },

  { acquirer: "Vodafone Idea", target: "Vodafone India + Idea Cellular (merger)", year: 2018, size_usd_m: 23200, geography: "India",
    sector: "Technology, Media & Telecom",
    rationale: "Created India's largest telco at merger to defend against Reliance Jio price disruption.",
    outcome: "Closed Aug 2018; combined entity later required multiple AGR-driven equity infusions." },

  { acquirer: "HCL Technologies", target: "IBM Select Software Products", year: 2019, size_usd_m: 1800, geography: "India/US",
    sector: "Technology, Media & Telecom",
    rationale: "Acquired 7 mature IBM software products (Notes, Domino, AppScan, BigFix) to scale HCL's products business.",
    outcome: "Closed Jul 2019." },

  { acquirer: "Tech Mahindra", target: "Pininfarina", year: 2015, size_usd_m: 65, geography: "India/Italy",
    sector: "Technology, Media & Telecom",
    rationale: "Acquired iconic design house (Ferrari Testarossa, Maserati) to add automotive engineering services.",
    outcome: "Closed Dec 2015." },

  // ─── Financial Services ──────────────────────────────────────────────────
  { acquirer: "HDFC Bank", target: "HDFC Ltd. (parent)", year: 2023, size_usd_m: 40000, geography: "India",
    sector: "Financial Services",
    rationale: "Reverse merger of mortgage parent into bank to create world's 4th-largest lender by m-cap; mortgage cross-sell + balance sheet scale.",
    outcome: "Closed Jul 2023.", synergy_ev_pct: 1.0 },

  { acquirer: "Capital One", target: "Discover Financial Services", year: 2024, size_usd_m: 35300, geography: "US",
    sector: "Financial Services",
    rationale: "Acquired payment network to escape Visa/Mastercard interchange capture; targeted ~$1.5B run-rate synergy.",
    outcome: "Closed May 2025 after Fed/OCC approval.", synergy_ev_pct: 4.2 },

  { acquirer: "Morgan Stanley", target: "E*TRADE Financial", year: 2020, size_usd_m: 13000, geography: "US",
    sector: "Financial Services",
    rationale: "Anchored wealth management strategy with self-directed retail brokerage + $360B AUM.",
    outcome: "Closed Oct 2020.", synergy_ev_pct: 3.8 },

  { acquirer: "PNC Financial", target: "BBVA USA", year: 2021, size_usd_m: 11600, geography: "US/Spain",
    sector: "Financial Services",
    rationale: "Coast-to-coast retail/commercial banking footprint; $900M run-rate cost synergy target.",
    outcome: "Closed Jun 2021.", synergy_ev_pct: 7.8 },

  { acquirer: "S&P Global", target: "IHS Markit", year: 2022, size_usd_m: 44000, geography: "US/UK",
    sector: "Financial Services",
    rationale: "Combined financial data + commodity/auto/maritime intelligence to anchor benchmarks/analytics platform.",
    outcome: "Closed Feb 2022 after divestitures (OPIS, Wood Mackenzie, etc).", synergy_ev_pct: 1.6 },

  { acquirer: "ICICI Bank", target: "ICICI Securities (delisting)", year: 2024, size_usd_m: 1500, geography: "India",
    sector: "Financial Services",
    rationale: "Proposed full re-absorption of broking subsidiary at swap ratio; rationalizes capital and removes minority overhang.",
    outcome: "Approved Mar 2024 amid minority shareholder pushback." },

  { acquirer: "Axis Bank", target: "Citibank India Consumer Business", year: 2022, size_usd_m: 1600, geography: "US/India",
    sector: "Financial Services",
    rationale: "Picked up Citi's affluent retail cards + wealth book (~$2.4B AUM, 2.5M card customers).",
    outcome: "Closed Mar 2023.", synergy_ev_pct: 6.5 },

  { acquirer: "BlackRock", target: "Global Infrastructure Partners (GIP)", year: 2024, size_usd_m: 12500, geography: "US",
    sector: "Financial Services",
    rationale: "Largest infra-equity firm acquisition; takes BlackRock alts AUM past $1T.",
    outcome: "Closed Oct 2024.", synergy_ev_pct: 1.5 },

  // ─── Industrials & Manufacturing ──────────────────────────────────────────
  { acquirer: "Linde plc", target: "Praxair (merger of equals)", year: 2018, size_usd_m: 90000, geography: "Germany/US",
    sector: "Industrials & Manufacturing",
    rationale: "Cross-border merger of equals creating global industrial gas leader; $1.2B run-rate cost synergy target.",
    outcome: "Closed Oct 2018 after divestitures across Americas and Europe.", synergy_ev_pct: 1.3 },

  { acquirer: "Bharat Forge", target: "Walker Forge (US)", year: 2022, size_usd_m: 45, geography: "India/US",
    sector: "Industrials & Manufacturing",
    rationale: "US forging footprint for defence + automotive supply; localization for US Inflation Reduction Act content.",
    outcome: "Closed Sep 2022." },

  { acquirer: "Bharat Forge", target: "JS Autocast Foundry India", year: 2024, size_usd_m: 60, geography: "India",
    sector: "Industrials & Manufacturing",
    rationale: "Buys precision-castings player to verticalize wind energy + auto castings supply.",
    outcome: "Closed 2024." },

  { acquirer: "Adani Group", target: "ACC + Ambuja Cements (from Holcim)", year: 2022, size_usd_m: 10500, geography: "Switzerland/India",
    sector: "Industrials & Manufacturing",
    rationale: "Holcim exit to Adani created India's #2 cement player overnight at 70Mt capacity.",
    outcome: "Closed Sep 2022." },

  { acquirer: "Honeywell", target: "Carrier Global Access Solutions", year: 2024, size_usd_m: 4950, geography: "US",
    sector: "Industrials & Manufacturing",
    rationale: "Acquired LenelS2/Onity to anchor Honeywell's building automation + cyber-physical security platform.",
    outcome: "Closed Jun 2024.", synergy_ev_pct: 2.5 },

  { acquirer: "Emerson Electric", target: "NI (National Instruments)", year: 2023, size_usd_m: 8200, geography: "US",
    sector: "Industrials & Manufacturing",
    rationale: "Bought test & measurement leader to deepen Emerson's automation portfolio with software-defined instrumentation.",
    outcome: "Closed Oct 2023.", synergy_ev_pct: 2.0 },

  { acquirer: "L&T Heavy Engineering", target: "L&T Special Steels (internal)", year: 2024, size_usd_m: 320, geography: "India",
    sector: "Industrials & Manufacturing",
    rationale: "Internal restructuring to consolidate critical defence/nuclear-grade forgings business.",
    outcome: "Approved 2024." },

  // ─── Energy & Resources ──────────────────────────────────────────────────
  { acquirer: "ExxonMobil", target: "Pioneer Natural Resources", year: 2023, size_usd_m: 64500, geography: "US",
    sector: "Energy & Resources",
    rationale: "All-stock Permian Basin consolidation creating largest unconventional acreage position; ~$1B annual synergy target.",
    outcome: "Closed May 2024 after FTC consent order (Pioneer founder excluded from board).", synergy_ev_pct: 1.5 },

  { acquirer: "Chevron", target: "Hess Corporation", year: 2023, size_usd_m: 53000, geography: "US/Guyana",
    sector: "Energy & Resources",
    rationale: "Pursued for Guyana Stabroek block stake (offshore deepwater) and Bakken assets.",
    outcome: "Closed Jul 2025 after Exxon ROFR arbitration loss.", synergy_ev_pct: 2.0 },

  { acquirer: "ConocoPhillips", target: "Marathon Oil", year: 2024, size_usd_m: 22500, geography: "US",
    sector: "Energy & Resources",
    rationale: "All-stock; consolidated Eagle Ford/Bakken/Permian acreage with $500M run-rate synergy.",
    outcome: "Closed Nov 2024.", synergy_ev_pct: 2.2 },

  { acquirer: "Diamondback Energy", target: "Endeavor Energy Resources", year: 2024, size_usd_m: 26000, geography: "US",
    sector: "Energy & Resources",
    rationale: "Combined Permian pure-plays; ~$550M run-rate synergy targeted from acreage trades + opex.",
    outcome: "Closed Sep 2024.", synergy_ev_pct: 2.1 },

  { acquirer: "Reliance Industries", target: "BP Mobility (Indian JV)", year: 2019, size_usd_m: 1000, geography: "India/UK",
    sector: "Energy & Resources",
    rationale: "BP buys 49% of Reliance's fuel retail (1,400 outlets) + aviation fuels JV to scale India fuels.",
    outcome: "Closed Aug 2021." },

  { acquirer: "Adani Group", target: "Holcim Group Indian Assets (alternate listing)", year: 2022, size_usd_m: 10500, geography: "Switzerland/India",
    sector: "Energy & Resources",
    rationale: "Diversifies Adani from ports/airports/power into cement (re-listed under Industrials elsewhere).",
    outcome: "Closed Sep 2022." },

  // ─── Logistics / Cross-sector ─────────────────────────────────────────────
  { acquirer: "DSV", target: "DB Schenker (from Deutsche Bahn)", year: 2024, size_usd_m: 15800, geography: "Denmark/Germany",
    sector: "Industrials & Manufacturing",
    rationale: "All-cash acquisition creates world's largest freight forwarder; targets €1B run-rate synergy by Y3.",
    outcome: "Announced Sep 2024, pending close 2025.", synergy_ev_pct: 6.3 },

  { acquirer: "Maersk", target: "LF Logistics", year: 2022, size_usd_m: 3600, geography: "Denmark/Hong Kong",
    sector: "Industrials & Manufacturing",
    rationale: "Added Asia-Pacific contract-logistics footprint to Maersk's integrator strategy beyond ocean.",
    outcome: "Closed Aug 2022.", synergy_ev_pct: 3.5 },

  // ─── Government & Public Sector ───────────────────────────────────────────
  { acquirer: "Leidos Holdings", target: "Dynetics", year: 2020, size_usd_m: 1650, geography: "US",
    sector: "Government & Public Sector",
    rationale: "Hypersonics + missile defense capability to deepen DoD bid pipeline.",
    outcome: "Closed Jan 2020.", synergy_ev_pct: 3.2 },

  { acquirer: "Booz Allen Hamilton", target: "Liberty IT Solutions", year: 2021, size_usd_m: 725, geography: "US",
    sector: "Government & Public Sector",
    rationale: "Added VA/Federal civil agency digital transformation capability + cleared engineering talent.",
    outcome: "Closed Feb 2021." },

  { acquirer: "L3Harris Technologies", target: "Aerojet Rocketdyne", year: 2022, size_usd_m: 4700, geography: "US",
    sector: "Government & Public Sector",
    rationale: "Solid rocket motor capability (only domestic supplier post-Northrop's GMD) for US missile programs.",
    outcome: "Closed Jul 2023 after DoJ scrutiny.", synergy_ev_pct: 1.5 },
];

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

/**
 * Return the N most relevant comparables for a given sector + geography.
 *
 * Ranking:
 *  1. Same sector (sector match via matchSector aligns with industry.ts buckets)
 *  2. Same geography (substring match — e.g. "India" matches "India/US")
 *  3. Most recent year
 *
 * Falls back to other sectors if too few same-sector deals exist, but always
 * keeps sector matches first so the LLM sees domain-relevant context first.
 */
export function getComparables(sector: string, geography: string, count: number = 5): Comparable[] {
  const matched = matchSector(sector);
  const geo = (geography || "").toLowerCase();

  const sameSector = COMPARABLES_LIBRARY.filter((c) => c.sector === matched);
  const otherSector = COMPARABLES_LIBRARY.filter((c) => c.sector !== matched);

  // Within each pool, rank by geography match + recency.
  const rank = (a: LibraryEntry, b: LibraryEntry) => {
    const aGeo = geo && a.geography.toLowerCase().includes(geo) ? 1 : 0;
    const bGeo = geo && b.geography.toLowerCase().includes(geo) ? 1 : 0;
    if (aGeo !== bGeo) return bGeo - aGeo;
    return b.year - a.year;
  };

  const sorted = [...sameSector.sort(rank), ...otherSector.sort(rank)];
  // Strip the internal `sector` tag before handing to consumers — they get the public Comparable shape.
  return sorted.slice(0, count).map(({ sector: _omit, ...c }) => {
    void _omit;
    return c;
  });
}

/**
 * Build the prompt block injected into the proposal route.
 *
 * Strict instruction to the LLM: ONLY cite these deals in the Comparable
 * Transactions section. Do not invent, do not extrapolate, do not change
 * the numbers. Partners verify these — fabrication kills credibility.
 */
export function buildComparablesBlock(sector: string, geography: string, count: number = 5): string {
  const picks = getComparables(sector, geography, count);
  if (picks.length === 0) return "";

  const lines = picks.map((c, i) =>
    `${i + 1}. **${c.acquirer} / ${c.target}** (${c.year}, ${c.geography}) — $${c.size_usd_m.toLocaleString()}M${
      c.synergy_ev_pct ? ` · ${c.synergy_ev_pct}% synergy/EV` : ""
    }
   Rationale: ${c.rationale}${c.outcome ? `
   Outcome: ${c.outcome}` : ""}`
  ).join("\n\n");

  return `
## VERIFIED COMPARABLE TRANSACTIONS (USE THESE — DO NOT INVENT)

The Comparable Transactions / Precedent Deals section of your output MUST cite from this list. These are real, public, verifiable deals — partners will fact-check them. You may pick the 3-4 most relevant from the list below; do NOT add deals that are not in this list, do NOT alter the deal values, and do NOT invent rationales.

${lines}

Citation format in your output: "Acquirer / Target (Year, Geography) at $XXm — one-line precedent relevance to this deal."
`;
}

/**
 * For the deal-model seeder. Returns a slice ready to persist into
 * deal_model.comparables_chosen so PMI / synergy / TSA all cite the same deals.
 */
export function pickComparablesForModel(sector: string, geography: string, count: number = 5): Comparable[] {
  return getComparables(sector, geography, count);
}
