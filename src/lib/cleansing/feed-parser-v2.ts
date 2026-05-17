

/**
 * Deal IQ AI — Mergermarket-style intelligence-feed parser, v2.
 *
 * REDESIGN INTENT
 * ---------------
 * The previous parser made two structural mistakes:
 *   1. It used the wrong primary signal. It tried to extract buyer/target from
 *      the Heading column even when Mergermarket itself had already populated
 *      structured Bidders/Targets columns.
 *   2. It treated digest articles ("Weekly Wrap", "M&A Monitor", "Week Ahead")
 *      as if they were single deals, smushing 10-30 unrelated entities into
 *      one row's buyer/target.
 *
 * This v2 implements the real Mergermarket reading order:
 *
 *   PRIORITY 1 — TOPIC SIGNAL: If `Topics` or `Heading` indicates a digest
 *                article, DROP THE ROW. Digests are for browsing, not pipeline.
 *
 *   PRIORITY 2 — STRUCTURED COLUMNS: If Bidders/Targets/Vendors/Issuers cells
 *                are populated and contain ≤3 entities each (a single-deal
 *                article), trust them. Split on `;`, clean each, use directly.
 *
 *   PRIORITY 3 — HEADING PATTERN MATCH: If structured cells are empty, run
 *                the pattern library against the Heading prose.
 *
 *   PRIORITY 4 — OPPORTUNITY FIRST SENTENCE: If heading didn't match, try
 *                the first sentence of the Opportunity body.
 *
 *   PRIORITY 5 — NEEDS REVIEW: Flag the row, keep the heading visible for
 *                analyst inspection, do not invent buyer/target.
 *
 * Every row carries a parse_confidence (0..1) and a parse_path label so
 * partners can audit exactly how the row was produced.
 */

import { cleanCompany, cleanCompanyList } from "./companies";

// ============================================================================
// TYPES
// ============================================================================

export type RawFeedRow = Record<string, unknown>;

export type FeedParseResult = {
  // Canonical fields (null = couldn't determine, NOT empty string)
  buyer: string | null;
  target: string | null;
  vendor: string | null;          // seller, distinct from buyer for clarity
  sector: string | null;
  country: string | null;
  deal_type: string | null;
  status: "announced" | "live" | "completed" | "abandoned";
  stake_percent: number | null;
  deal_value_usd_m: number | null;
  deal_value_raw: string | null;
  deal_value_currency: string | null;

  // Audit / preservation
  heading: string;
  opportunity: string | null;
  intelligence_type: string | null;
  size_bucket: string | null;   // Mergermarket's coarse size classification (e.g. "INR 2bn-4bn")

  // Triage
  is_digest: boolean;
  is_capital_markets: boolean;
  confidence: number;     // 0..1
  parse_path: string;     // "structured" | "heading_pattern" | "opportunity_first_sentence" | "digest" | "needs_review"
  needs_review: boolean;
  drop_row: boolean;      // true → don't insert this row into the deals table at all

  // Reason for low confidence or drop, surfaced in UI
  notes: string[];
};

// ============================================================================
// 1. CASE-INSENSITIVE COLUMN ACCESS
// ============================================================================

function getCol(row: RawFeedRow, ...candidates: string[]): string | null {
  const normMap = new Map<string, string>();
  for (const k of Object.keys(row)) normMap.set(k.toLowerCase().trim(), k);
  for (const c of candidates) {
    const original = normMap.get(c.toLowerCase().trim());
    if (original) {
      const v = row[original];
      if (v === null || v === undefined) continue;
      const s = String(v).trim();
      if (s) return s;
    }
  }
  return null;
}

// ============================================================================
// 2. DIGEST DETECTION (PRIORITY 1)
// ============================================================================

const DIGEST_HEADING_KEYWORDS = [
  "digest", "weekly", "monthly", "week ahead", "month ahead", "week in review",
  "monitor", "tracker", "round-up", "roundup", "wrap-up", "wrap up",
  "watchlist", "newsletter", "briefing", "espresso", "the week",
  "primer", "snapshot", "outlook", "recap",
];

const DIGEST_TOPIC_KEYWORDS = [
  "weekly", "monthly", "monitor", "tracker", "watchlist", "digest",
];

/**
 * Returns true if this row is a multi-deal "digest" article that shouldn't
 * be treated as one deal. We check both the Heading and the Topics column —
 * Mergermarket consistently tags digests in Topics with "Weekly", "Monthly",
 * "Tracker", "Monitor".
 */
function isDigest(heading: string, topics: string | null): boolean {
  const h = heading.toLowerCase();
  if (DIGEST_HEADING_KEYWORDS.some((k) => h.includes(k))) return true;

  if (topics) {
    const t = topics.toLowerCase();
    if (DIGEST_TOPIC_KEYWORDS.some((k) => t.includes(k))) return true;
  }
  return false;
}

// ============================================================================
// 3. ENTITY VALIDATION (REJECT JUNK)
// ============================================================================

const ENTITY_BLACKLIST = new Set([
  "investor", "investors", "buyer", "buyers", "bidder", "bidders",
  "sources", "source", "report", "reports", "news", "newsletter",
  "company", "companies", "target", "targets", "asset", "assets",
  "press release", "stock exchange", "announcement", "filing",
  "the company", "the target", "the buyer", "the seller",
  "press", "statement", "release",
  "proprietary intelligence", "company press release",
  "stock exchange announcement", "newswire round-up",
  "tracker", "monitor", "digest", "weekly", "monthly", "espresso",
  "week ahead", "watchlist",
  "unknown", "n/a", "na", "tbd", "tbc",
  "fund", "funds", "private", "public",
  "gp hopes", "lp hopes", "deal", "deal hopes", "hopes",
  "round", "rounds", "stake", "shares",
  "advisor", "advisors", "advisory", "lender", "lenders",
  "consortium", "syndicate", "group", "partners",
]);

/** Validates that a candidate string is actually a company name, not junk. */
function isValidEntity(name: string | null): boolean {
  if (!name) return false;
  const n = name.trim();
  if (n.length < 2 || n.length > 200) return false;

  const lower = n.toLowerCase();
  if (ENTITY_BLACKLIST.has(lower)) return false;

  // Reject heading fragments containing verbs
  if (/\b(acquires?|sells?|buys?|raises?|invests?|announces?|completes?|nears?|set\s+to|in\s+talks|exploring|considers?|reviews?)\b/i.test(n)) {
    return false;
  }

  // Pure number or pure punctuation → junk
  if (!/[a-zA-Z]/.test(n)) return false;

  // Too many tokens → likely a sentence
  if (n.split(/\s+/).length > 8) return false;

  return true;
}

// ============================================================================
// 4. HEADING PATTERN LIBRARY (PRIORITY 3)
// ============================================================================
// Each pattern is a focused regex with capture groups → (buyer, target).
// Patterns are ordered from MOST-SPECIFIC to MOST-GENERAL.
// The first pattern that produces VALID entities wins.

type HeadingPattern = {
  name: string;
  re: RegExp;
  pick: (m: RegExpExecArray) => { buyer: string | null; target: string | null };
  confidence: number;
};

const HEADING_PATTERNS: HeadingPattern[] = [
  // "<Seller> sells <Asset> to <Buyer>"
  { name: "sells_to", confidence: 0.92,
    re: /^(.+?)\s+(?:sells?|sold|divests?|divested)\s+(.+?)\s+to\s+(.+?)(?:\s+for\s|\s*[-—–]|\s*\.|$)/i,
    pick: (m) => ({ buyer: m[3], target: m[2] }) },

  // "<Buyer> to acquire <Target> from <Seller>"
  { name: "to_acquire_from", confidence: 0.92,
    re: /^(.+?)\s+(?:to\s+acquire|set\s+to\s+acquire|agrees?\s+to\s+acquire|plans?\s+to\s+acquire)\s+(.+?)\s+from\s+(.+?)(?:\s+for\s|\s*[-—–]|\s*\.|$)/i,
    pick: (m) => ({ buyer: m[1], target: m[2] }) },

  // "<Buyer> acquires <Target> from <Seller>"
  { name: "acquires_from", confidence: 0.92,
    re: /^(.+?)\s+(?:acquires?|acquired|buys?|bought|purchases?|purchased)\s+(.+?)\s+from\s+(.+?)(?:\s+for\s|\s*[-—–]|\s*\.|$)/i,
    pick: (m) => ({ buyer: m[1], target: m[2] }) },

  // "<Target> acquired by <Buyer>"
  { name: "acquired_by", confidence: 0.9,
    re: /^(.+?)\s+acquired\s+by\s+(.+?)(?:\s+for\s|\s*[-—–]|\s*\.|\s*\(|$)/i,
    pick: (m) => ({ buyer: m[2], target: m[1] }) },

  // "<Buyer> to acquire <Target>"
  { name: "to_acquire", confidence: 0.85,
    re: /^(.+?)\s+(?:to\s+acquire|set\s+to\s+acquire|agrees?\s+to\s+acquire|plans?\s+to\s+acquire|near\s+(?:agreement|deal)\s+to\s+acquire)\s+(.+?)(?:\s+for\s|\s+in\s+|\s*[-—–]|\s*\.|\s*\(|$)/i,
    pick: (m) => ({ buyer: m[1], target: m[2] }) },

  // "<Buyer> acquires <Target>"
  { name: "acquires", confidence: 0.85,
    re: /^(.+?)\s+(?:acquires?|acquired|buys?|bought|purchases?|purchased)\s+(.+?)(?:\s+for\s|\s+in\s+|\s*[-—–]|\s*\.|\s*\(|$)/i,
    pick: (m) => ({ buyer: m[1], target: m[2] }) },

  // "<Seller> agrees to sell <Asset> to <Buyer>"
  { name: "agrees_to_sell_to", confidence: 0.9,
    re: /^(.+?)\s+agrees?\s+to\s+sell\s+(.+?)\s+to\s+(.+?)(?:\s+for\s|\s*[-—–]|\s*\.|$)/i,
    pick: (m) => ({ buyer: m[3], target: m[2] }) },

  // "<Buyer> wins/lands/clinches <Target>"
  { name: "wins", confidence: 0.7,
    re: /^(.+?)\s+(?:wins?|lands?|clinches?)\s+(.+?)(?:\s+deal|\s+acquisition|\s*[-—–]|\s*\.|\s*\(|$)/i,
    pick: (m) => ({ buyer: m[1], target: m[2] }) },

  // "<Buyer> takes/acquires minority/majority stake in <Target>"
  { name: "takes_stake_in", confidence: 0.9,
    re: /^(.+?)\s+(?:takes?|acquires?|adds?|grabs?|purchases?|buys?)\s+(?:a\s+)?(?:minority|majority|controlling|strategic|small|equity)?\s*(?:stake|position|shareholding)\s+in\s+(.+?)(?:\s+for\s|\s*[-—–]|\s*\.|\s*\(|$)/i,
    pick: (m) => ({ buyer: m[1], target: m[2] }) },

  // "<Buyer> emerges as sole/lead/preferred bidder for <Target>"
  { name: "sole_bidder_for", confidence: 0.85,
    re: /^(.+?)\s+emerges?\s+as\s+(?:sole|lead|preferred|frontrunner)\s+bidder\s+for\s+(.+?)(?:\s*[-—–]|\s*\.|$)/i,
    pick: (m) => ({ buyer: m[1], target: m[2] }) },

  // "<Target> nears <amount> led by <Buyer>"
  { name: "nears_led_by", confidence: 0.75,
    re: /^(.+?)\s+(?:nears?|secures?|closes?|raises?)\s+.+?\s+led\s+by\s+(.+?)(?:\s*[-—–]|\s*\.|\s+report|$)/i,
    pick: (m) => ({ buyer: m[2], target: m[1] }) },

  // "<Target> raises <amount> from <Buyer>"
  { name: "raises_from", confidence: 0.8,
    re: /^(.+?)\s+raises?\s+.+?\s+from\s+(.+?)(?:\s*[-—–]|\s*\.|\s+report|$)/i,
    pick: (m) => ({ buyer: m[2], target: m[1] }) },

  // "<Target> in talks (for/to raise/secure) <amount>" → target-only
  { name: "in_talks_to_raise", confidence: 0.7,
    re: /^(.+?)\s+in\s+talks\s+(?:for|to)\s+(?:raise|secure|fundraise|up\s+to)\b/i,
    pick: (m) => ({ buyer: null, target: m[1] }) },

  // "<Buyer> in talks to invest/acquire <Target>"
  { name: "in_talks_to", confidence: 0.7,
    re: /^(.+?)\s+in\s+talks\s+(?:to\s+(?:invest\s+in|acquire|buy)|for|with)\s+(.+?)(?:\s*[-—–]|\s*\.|\s+report|$)/i,
    pick: (m) => ({ buyer: m[1], target: m[2] }) },

  // "<Buyer> to invest in <Target>"
  { name: "to_invest_in", confidence: 0.8,
    re: /^(.+?)\s+to\s+invest\s+in\s+(.+?)(?:\s*[-—–]|\s*\.|\s+report|$)/i,
    pick: (m) => ({ buyer: m[1], target: m[2] }) },

  // "<Buyer> submits bid/proposal for <Target>"
  { name: "submits_proposal_for", confidence: 0.8,
    re: /^(.+?)\s+submits?\s+.+?\s+(?:to\s+acquire|for|bid\s+for|offer\s+for)\s+(.+?)(?:\s+for\s|\s*[-—–]|\s*\.|\s*\(|$)/i,
    pick: (m) => ({ buyer: m[1], target: m[2] }) },

  // "<Buyer> completes/closes acquisition of <Target>"
  { name: "completes_acquisition_of", confidence: 0.85,
    re: /^(.+?)\s+(?:completes?|closes?|finalises?|finalizes?)\s+(?:the\s+)?(?:acquisition|purchase|deal|takeover)\s+of\s+(.+?)(?:\s*[-—–]|\s*\.|$)/i,
    pick: (m) => ({ buyer: m[1], target: m[2] }) },

  // "<Buyer> announces acquisition of <Target>"
  { name: "announces_acquisition_of", confidence: 0.8,
    re: /^(.+?)\s+announces?\s+(?:the\s+)?(?:acquisition|purchase|deal|takeover|investment\s+in)\s+(?:of\s+)?(.+?)(?:\s*[-—–]|\s*\.|$)/i,
    pick: (m) => ({ buyer: m[1], target: m[2] }) },

  // "<Buyer> eyes <Target>"
  { name: "eyes_target", confidence: 0.65,
    re: /^(.+?)\s+eyes?\s+(?:acquisition\s+of\s+|stake\s+in\s+|investment\s+in\s+)?(.+?)(?:\s*[-—–]|\s*\.|\s+report|\s*\(|$)/i,
    pick: (m) => ({ buyer: m[1], target: m[2] }) },

  // Target-only patterns (no buyer)
  { name: "for_sale_by", confidence: 0.65,
    re: /^(.+?)\s+(?:put\s+up\s+for\s+sale|set\s+for\s+sale|on\s+the\s+block)\s+by\s+(.+?)(?:\s*[-—–]|\s*\.|$)/i,
    pick: (m) => ({ buyer: null, target: m[1] }) },

  { name: "puts_up_for_sale", confidence: 0.65,
    re: /^(.+?)\s+puts?\s+(?:itself|up)\s+(?:up\s+)?for\s+sale/i,
    pick: (m) => ({ buyer: null, target: m[1] }) },

  { name: "seeks_buyer", confidence: 0.55,
    re: /^(.+?)\s+seeks?\s+(?:bidders?|buyers?|offers?|bids|partners?|investors?|strategic\s+partner|acquirer|funding)\b/i,
    pick: (m) => ({ buyer: null, target: m[1] }) },

  { name: "reviews_options", confidence: 0.55,
    re: /^(.+?)\s+(?:reviews?|exploring|considers?|weighs?|evaluates?)\s+(?:strategic\s+options|sale|options|alternatives|exit|stake\s+sale)/i,
    pick: (m) => ({ buyer: null, target: m[1] }) },
];

/** Strip leading/trailing junk from a candidate entity string. */
function tidyEntity(s: string | null): string | null {
  if (!s) return null;
  let out = s.trim();
  out = out.replace(/\s+(?:set|agrees?|plans?|set\s+to|expected|likely|reportedly)\s*$/i, "");
  out = out.replace(/\s+(from|for|by|to|with|and|in|on|the|a|an|of|after|amid|as|via|at)\s*$/i, "");
  out = out.replace(/\s+&\s*$/, "");        // trailing standalone "&"
  out = out.replace(/[\s\-—–:,.;]+$/, "");
  out = out.replace(/^[\s\-—–:,.;]+/, "");
  out = out.replace(/^[\u2018\u2019\u201C\u201D'"`]+/, "").replace(/[\u2018\u2019\u201C\u201D'"`]+$/, "");
  out = out.replace(/\s*\(translated\)\s*$/i, "");
  return out.trim() || null;
}

function tryHeadingPatterns(heading: string): { buyer: string | null; target: string | null; confidence: number; pattern: string } | null {
  for (const pat of HEADING_PATTERNS) {
    const m = pat.re.exec(heading);
    if (!m) continue;
    const picked = pat.pick(m);
    const b = tidyEntity(picked.buyer);
    const t = tidyEntity(picked.target);
    if (!isValidEntity(b) && !isValidEntity(t)) continue;
    return {
      buyer: isValidEntity(b) ? b : null,
      target: isValidEntity(t) ? t : null,
      confidence: pat.confidence,
      pattern: pat.name,
    };
  }
  return null;
}

// ============================================================================
// 5. VALUE EXTRACTION (USD MILLIONS)
// ============================================================================

const FX_TO_USD: Record<string, number> = {
  USD: 1, EUR: 1.08, GBP: 1.26, JPY: 0.0064, CNY: 0.137, RMB: 0.137,
  NZD: 0.6, AUD: 0.66, HKD: 0.128, SGD: 0.74, KRW: 0.00072,
  INR: 0.012, SAR: 0.266, AED: 0.272, CHF: 1.13, CAD: 0.73,
  IDR: 0.000063, THB: 0.028, MYR: 0.21, PHP: 0.017, VND: 0.000041,
  TWD: 0.031, BRL: 0.18, MXN: 0.05, ZAR: 0.054, RUB: 0.012,
};

function unitToMultiplier(unit: string): number {
  const u = unit.toLowerCase();
  if (u.startsWith("tn") || u.startsWith("tri")) return 1_000_000;
  if (u.startsWith("bn") || u.startsWith("bil")) return 1_000;
  if (u.startsWith("m") || u.startsWith("mil")) return 1;
  if (u.startsWith("k") || u.startsWith("tho")) return 0.001;
  return 1;
}

/** Extract first value from text, returns USD millions and raw display string. */
function extractValueFromText(text: string): { usd: number | null; currency: string | null; raw: string | null } {
  if (!text) return { usd: null, currency: null, raw: null };
  const rx = /\b(USD|INR|EUR|GBP|JPY|CNY|RMB|NZD|AUD|HKD|SGD|KRW|SAR|AED|CHF|CAD|IDR|THB|MYR|PHP|VND|TWD|BRL|MXN|ZAR|RUB)\s*([\d,.]+)\s*(bn|billion|m|million|k|thousand|tn|trillion)?\b/gi;
  const matches: Array<{ currency: string; m: number; raw: string }> = [];
  let mm: RegExpExecArray | null;
  while ((mm = rx.exec(text)) !== null) {
    const currency = mm[1].toUpperCase();
    const num = parseFloat(mm[2].replace(/,/g, ""));
    if (!isFinite(num)) continue;
    const mult = mm[3] ? unitToMultiplier(mm[3]) : 1;
    matches.push({ currency, m: num * mult, raw: mm[0] });
  }
  if (matches.length === 0) return { usd: null, currency: null, raw: null };
  // Pick the LARGEST value — typically the headline deal size, not bid increments
  matches.sort((a, b) => b.m - a.m);
  const p = matches[0];
  return { usd: p.m * (FX_TO_USD[p.currency] ?? 1), currency: p.currency, raw: p.raw };
}

// ============================================================================
// 6. STAKE EXTRACTION
// ============================================================================

function extractStakeFromText(text: string): number | null {
  if (!text) return null;
  // Avoid % matches inside multi-decimal numbers (e.g. version "v1.5%" is rare but defensive)
  const m = /\b(\d{1,3}(?:\.\d{1,2})?)\s*%/.exec(text);
  if (!m) return null;
  const pct = parseFloat(m[1]);
  if (pct < 0 || pct > 100) return null;
  return pct;
}

// ============================================================================
// 7. STATUS / DEAL TYPE MAPPING
// ============================================================================

function mapStatusAndType(
  intelType: string | null,
  intelGrade: string | null,
  heading: string,
): {
  status: "announced" | "live" | "completed" | "abandoned";
  deal_type: string;
  is_capital_markets: boolean;
} {
  const tags = (intelType ?? "").toLowerCase().split(",").map((t) => t.trim());
  const grade = (intelGrade ?? "").toLowerCase();
  const h = heading.toLowerCase();

  const is_capital_markets =
    tags.includes("ipo") || tags.includes("rights issues") ||
    tags.includes("convertibles") || h.includes("ipo") ||
    h.includes("rights issue") || h.includes("fpo") || h.includes("public offering");

  // Completed
  if (/\b(completes?|completed|closes?|closed|finalised|finalized|wraps?\s+up)\b/.test(h)) {
    return { status: "completed", deal_type: "Acquisition", is_capital_markets };
  }
  // Abandoned
  if (/\b(abandons|abandoned|terminates?|terminated|withdraws?|fails?|collapses?|scrapped|drops?\s+bid|walks?\s+away)\b/.test(h)) {
    return { status: "abandoned", deal_type: "Acquisition", is_capital_markets };
  }

  // Intelligence Grade is Mergermarket's own signal
  // "Confirmed" / "Strong evidence" = announced; "Speculation" / "Some evidence" = live
  if (grade.includes("speculation") || grade.includes("some evidence")) {
    return liveStatus();
  }

  // Live signals from heading
  if (
    /\b(in\s+talks|nears?|exploring|considers?|reviews?|weighs?|seeks?|for\s+sale|on\s+the\s+block|set\s+for\s+sale|eyes?|to\s+launch|plans?\s+to|approaches?|reportedly|may\s+acquire|expected\s+to)\b/.test(h) ||
    tags.includes("companies for sale") ||
    tags.includes("auction/privatization")
  ) {
    return liveStatus();
  }

  // Default: announced
  let dt = "Acquisition";
  if (tags.includes("private equity related")) {
    if (/\b(invest|investment|funding|round|raise|raises)\b/.test(h)) dt = "Investment";
    else if (/\b(acquires?|acquired|buys?|bought)\b/.test(h)) dt = "Buyout";
  }
  if (tags.includes("takeover situations") && dt === "Acquisition") dt = "Takeover";
  if (is_capital_markets) dt = tags.includes("ipo") ? "IPO" : "Capital Markets";
  return { status: "announced", deal_type: dt, is_capital_markets };

  function liveStatus() {
    let dt = "Acquisition";
    if (tags.includes("private equity related") && /\b(raise|fundraise|funding|round|series)\b/.test(h)) dt = "Investment";
    if (is_capital_markets) dt = tags.includes("ipo") ? "IPO" : "Capital Markets";
    return { status: "live" as const, deal_type: dt, is_capital_markets };
  }
}

// ============================================================================
// 8. STRUCTURED-COLUMN PARSING (PRIORITY 2)
// ============================================================================

/**
 * Read Bidders/Targets/Vendors/Issuers cells from Mergermarket. These are
 * COMMA OR SEMICOLON-SEPARATED entity lists pre-parsed by Mergermarket.
 *
 * For Bidders, we allow up to 10 entities (consortium rounds legitimately
 * have many investors).
 * For Targets, we cap strict at 3 — more than that is digest contamination.
 *
 * Filters out junk like "Company Record Pending" placeholders.
 */
const STRUCTURED_BLACKLIST_PATTERNS = [
  /^company\s+record\s+pending$/i,
  /^undisclosed/i,
  /^unknown/i,
  /^n\/?a$/i,
  /^tbd$/i,
  /^tba$/i,
];

function parseStructuredEntities(raw: string | null, max = 3): string[] | null {
  if (!raw) return null;
  const parts = raw.split(/[;,|]/).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.length > max) return null;     // too many entities → digest contamination
  const clean: string[] = [];
  for (const p of parts) {
    // Reject Mergermarket placeholders
    if (STRUCTURED_BLACKLIST_PATTERNS.some((rx) => rx.test(p.trim()))) continue;
    const c = cleanCompany(p);
    if (c && isValidEntity(c)) clean.push(c);
  }
  return clean.length > 0 ? Array.from(new Set(clean)) : null;
}

// ============================================================================
// 9. MAIN PARSE ENTRY
// ============================================================================

export function parseFeedRow(row: RawFeedRow): FeedParseResult {
  const heading = getCol(row, "Heading", "Headline", "Title") ?? "";
  const opportunity = getCol(row, "Opportunity", "Notes", "Description");
  const intelType = getCol(row, "Intelligence Type", "Deal Type", "Transaction Type");
  const intelGrade = getCol(row, "Intelligence Grade", "Confidence", "Grade");
  const topics = getCol(row, "Topics");
  const sector = getCol(row, "Dominant Sector", "Sector", "Sectors", "Primary Sector", "Industry");
  const country = getCol(row, "Dominant Geography", "Geography", "Country", "Region");
  const stakeRaw = getCol(row, "Stake Value", "Stake", "Stake %", "Stake Percent");

  const bidders = getCol(row, "Bidders", "Buyer", "Acquirer", "Buyers", "Acquirers");
  const targets = getCol(row, "Targets", "Target", "Target Company");
  const vendors = getCol(row, "Vendors", "Seller", "Sellers", "Vendor");
  const issuers = getCol(row, "Issuers", "Issuer");

  const valueINR = getCol(row, "Value INR(m)", "Value INR", "Value INR (m)");
  const valueDesc = getCol(row, "Value Description", "Value Display", "Value");
  // Intelligence Size is a Mergermarket BUCKET classification like "INR 2bn-4bn"
  // or "> INR 21bn" — keep it separate; don't treat as precise value.
  const sizeBucket = getCol(row, "Intelligence Size", "Size", "Size Range");

  const notes: string[] = [];

  // ----- PRIORITY 1: Digest detection — drop entire row -----
  const is_digest = isDigest(heading, topics);
  const stmap = mapStatusAndType(intelType, intelGrade, heading);

  if (is_digest) {
    return {
      buyer: null, target: null, vendor: null,
      sector, country,
      deal_type: stmap.deal_type,
      status: stmap.status,
      stake_percent: null,
      deal_value_usd_m: null, deal_value_raw: null, deal_value_currency: null,
      heading, opportunity, intelligence_type: intelType,
      size_bucket: sizeBucket,
      is_digest: true,
      is_capital_markets: stmap.is_capital_markets,
      confidence: 0,
      parse_path: "digest",
      needs_review: true,
      drop_row: true,
      notes: ["Multi-deal digest article — skipped to avoid contaminating buyer/target."],
    };
  }

  // ----- PRIORITY 2: Structured Bidders/Targets/Vendors/Issuers columns -----
  let buyer: string | null = null;
  let target: string | null = null;
  let vendor: string | null = null;
  let confidence = 0;
  let parse_path = "";

  // Buyer = Bidders OR Issuers (capital markets). Allow up to 10 (consortium funding rounds).
  const buyerEntities = parseStructuredEntities(bidders ?? issuers, 10);
  // Target = Targets OR Issuers. Strict cap of 3 — multiple unrelated targets = digest contamination.
  const targetEntities = parseStructuredEntities(targets ?? issuers, 3);
  // Vendor (seller). For asset-sale headings like "X places division on sales block",
  // Mergermarket leaves Targets empty and puts the parent company in Vendors.
  // In that case the user expects the Target column to show the parent (it's what's
  // for sale at the company level).
  const vendorEntities = parseStructuredEntities(vendors, 5);

  if (buyerEntities && buyerEntities.length > 0) {
    buyer = buyerEntities.join("; ");
    confidence = 0.9;
    parse_path = "structured";
  }
  if (targetEntities && targetEntities.length > 0) {
    target = targetEntities.join("; ");
    if (parse_path !== "structured") {
      confidence = 0.9;
      parse_path = "structured";
    }
  }
  if (vendorEntities && vendorEntities.length > 0) {
    vendor = vendorEntities.join("; ");
  }

  // Asset-sale / for-sale heading: if target is still empty but we have a vendor,
  // use vendor as the deal-target (company whose business is being divested).
  if (!target && vendor) {
    const looksLikeAssetSale = /\b(sells?|sold|for\s+sale|on\s+(?:the|sales?)\s+block|places?\s+(?:on|up)|divests?|exits?|carve\W?out|spin\W?off|asset\s+sale|disposal|stake\s+sale|set\s+for\s+sale)\b/i.test(heading);
    if (looksLikeAssetSale) {
      target = vendor;
      notes.push("Vendor promoted to target (asset-sale or stake-sale style heading).");
    }
  }

  // ----- PRIORITY 3: Heading pattern match for missing entities -----
  if ((!buyer || !target) && heading) {
    const hit = tryHeadingPatterns(heading);
    if (hit) {
      if (!buyer && hit.buyer) buyer = hit.buyer;
      if (!target && hit.target) target = hit.target;
      if (parse_path === "") {
        confidence = hit.confidence;
        parse_path = `heading:${hit.pattern}`;
      } else if (parse_path === "structured" && hit.confidence > 0) {
        // Mix of structured + heading-derived — keep structured confidence, append note
        notes.push(`Filled missing field from heading pattern '${hit.pattern}'.`);
      }
    }
  }

  // ----- PRIORITY 4: First sentence of Opportunity as last resort -----
  if (!buyer && !target && opportunity) {
    const firstSentence = opportunity.split(/[.\n]/)[0]?.trim();
    if (firstSentence && firstSentence.length > 15) {
      const hit = tryHeadingPatterns(firstSentence);
      if (hit && (hit.buyer || hit.target)) {
        // Apply stricter validation — opportunity-derived entities are less reliable
        const b = hit.buyer && isValidEntity(hit.buyer) && hit.buyer.split(/\s+/).length <= 5 ? hit.buyer : null;
        const t = hit.target && isValidEntity(hit.target) && hit.target.split(/\s+/).length <= 5 ? hit.target : null;
        if (b || t) {
          buyer = b ?? null;
          target = t ?? null;
          confidence = Math.max(0.4, hit.confidence - 0.25);    // additional penalty
          parse_path = `opportunity:${hit.pattern}`;
          notes.push("Buyer/target inferred from opportunity body — verify before AI proposals.");
        }
      }
    }
  }

  if (!buyer && !target) {
    notes.push("Could not identify buyer or target from any source.");
    parse_path = parse_path || "needs_review";
    confidence = Math.max(0.05, confidence);
  }

  // ----- VALUE: Prefer structured columns, fall back to text extraction -----
  let deal_value_usd_m: number | null = null;
  let deal_value_raw: string | null = null;
  let deal_value_currency: string | null = null;

  // Mergermarket's Value INR(m) column is the most reliable
  if (valueINR && /\d/.test(valueINR)) {
    const inrNum = parseFloat(valueINR.replace(/[^\d.]/g, ""));
    if (isFinite(inrNum) && inrNum > 0) {
      deal_value_usd_m = inrNum * FX_TO_USD.INR;
      deal_value_currency = "INR";
      deal_value_raw = `INR ${inrNum}m`;
    }
  }
  // Value Description (often empty)
  if (!deal_value_usd_m && valueDesc) {
    const v = extractValueFromText(valueDesc);
    if (v.usd) { deal_value_usd_m = v.usd; deal_value_currency = v.currency; deal_value_raw = v.raw; }
  }
  // Heading prose (specific numbers like "INR 1.4bn", "USD 200m")
  if (!deal_value_usd_m) {
    const v = extractValueFromText(`${heading} ${opportunity ?? ""}`);
    if (v.usd) { deal_value_usd_m = v.usd; deal_value_currency = v.currency; deal_value_raw = v.raw; }
  }
  // size_bucket is preserved as-is, NEVER converted to a precise value —
  // it's a Mergermarket category like "INR 2bn-4bn" or "> INR 21bn".

  // ----- STAKE -----
  let stake_percent: number | null = null;
  if (stakeRaw) {
    const s = extractStakeFromText(stakeRaw);
    if (s !== null) stake_percent = s;
  }
  if (stake_percent === null) {
    stake_percent = extractStakeFromText(`${heading} ${opportunity ?? ""}`);
  }

  // ----- Final confidence adjustments -----
  if (buyer && target) confidence = Math.min(1, confidence + 0.05);
  if (deal_value_usd_m) confidence = Math.min(1, confidence + 0.03);
  if (sector) confidence = Math.min(1, confidence + 0.02);

  const needs_review = confidence < 0.6 || (!buyer && !target);

  return {
    buyer, target, vendor,
    sector, country,
    deal_type: stmap.deal_type,
    status: stmap.status,
    stake_percent,
    deal_value_usd_m,
    deal_value_raw,
    deal_value_currency,
    heading,
    opportunity,
    intelligence_type: intelType,
    size_bucket: sizeBucket,
    is_digest: false,
    is_capital_markets: stmap.is_capital_markets,
    confidence,
    parse_path,
    needs_review,
    drop_row: false,
    notes,
  };
}

// ============================================================================
// 10. DETECT INTELLIGENCE-FEED SHAPE
// ============================================================================

/**
 * Returns true if this looks like a Mergermarket-style intelligence feed.
 * The defining signature is: Heading + Opportunity + (Topics OR Intelligence Type).
 */
export function isIntelligenceFeed(row: RawFeedRow): boolean {
  const keys = new Set(Object.keys(row).map((k) => k.toLowerCase().trim()));
  const hasHeading = keys.has("heading");
  const hasOpportunity = keys.has("opportunity");
  const hasIntel = keys.has("topics") || keys.has("intelligence type") ||
                   keys.has("intelligence grade");
  return hasHeading && (hasOpportunity || hasIntel);
}
