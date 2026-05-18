

/**
 * Deal IQ AI — Mergermarket-style intelligence-feed parser.
 *
 * Source data shape (typical Mergermarket / Bloomberg / DealStreetAsia export):
 *   [Opportunity ID, Date, Value INR(m), Value Description, Heading, Opportunity,
 *    Source, Intelligence Type]
 *
 * The feed gives ONE row per news item, not per deal. We have to:
 *   1. Identify and SKIP "digest" / "weekly" / "monthly" round-up articles
 *      that bundle 10+ deals into one row (these contaminate buyer/target fields).
 *   2. Extract Buyer and Target from the Heading using a pattern library.
 *   3. Fall back to the Opportunity prose for entity hints if heading is ambiguous.
 *   4. Pull the deal value from the heading or opportunity bullet points (since
 *      the structured Value INR(m) column is blank for ~95% of rows).
 *   5. Map Intelligence Type tags → canonical status / stage / deal_type.
 *   6. Score each row's parsing confidence so partners can triage low-confidence
 *      rows for manual review.
 *
 * Design principles:
 *   - High precision over recall. We'd rather mark a row as "needs review"
 *     than silently invent a buyer/target pair that's wrong.
 *   - Preserve the original Heading verbatim — it's a source-data audit field.
 *   - Never compose buyer/target from sentence fragments.
 */

export type IntelligenceFeedRow = {
  opportunity_id?: string | null;
  date?: string | null;
  value_inr_m?: string | null;
  value_description?: string | null;
  heading: string;
  opportunity?: string | null;
  source?: string | null;
  intelligence_type?: string | null;
};

export type IntelligenceParseResult = {
  // Canonical fields
  buyer: string | null;
  target: string | null;
  deal_value_usd: number | null;
  deal_value_currency: string | null;
  deal_value_raw: string | null;
  status: "announced" | "live" | "completed" | "abandoned";
  deal_type: string | null;
  stake_percent: number | null;
  // Source-preservation fields
  heading: string;
  opportunity: string | null;
  intelligence_type: string | null;
  // Quality / triage
  is_digest: boolean;        // true → multi-deal round-up, don't trust buyer/target
  is_capital_markets: boolean; // IPO/rights/convertible
  confidence: number;        // 0..1
  parse_pattern: string;     // which pattern matched (for debugging / QA)
  needs_review: boolean;     // true → low confidence, manual review recommended
};

// ============================================================================
// 1. DIGEST DETECTION
// ============================================================================

const DIGEST_KEYWORDS = [
  "digest", "weekly", "monthly", "week ahead", "month ahead",
  "monitor", "round-up", "roundup", "wrap-up", "wrap",
  "watchlist", "newsletter", "briefing",
];

/**
 * Returns true if the heading is a multi-deal "digest" article.
 * These articles describe 5–30 unrelated deals in one row and ruin buyer/target
 * extraction. We mark them, optionally skip them, and keep them as themed
 * background reading rather than structured deal rows.
 */
export function isDigestHeading(heading: string): boolean {
  const h = heading.toLowerCase();
  return DIGEST_KEYWORDS.some((k) => h.includes(k));
}

// ============================================================================
// 2. ENTITY-LEVEL NOISE FILTER
// ============================================================================

/** Words that look like company names but aren't — junk we must never accept. */
const ENTITY_BLACKLIST = new Set([
  "investor", "investors", "buyer", "buyers", "bidder", "bidders",
  "sources", "source", "report", "reports", "news", "newsletter",
  "company", "companies", "target", "targets", "asset", "assets",
  "press release", "stock exchange", "announcement", "filing",
  "the company", "the target", "the buyer", "the seller",
  "press", "statement", "release",
  "proprietary intelligence", "company press release",
  "stock exchange announcement", "newswire round-up",
]);

const VERB_FRAGMENTS = new Set([
  "to acquire", "set to acquire", "in talks to", "in talks for",
  "to invest", "to raise", "to sell", "plans to", "considers",
  "exploring", "agrees to", "expected to", "completes", "announces",
]);

function isJunkEntity(name: string): boolean {
  if (!name) return true;
  const n = name.trim().toLowerCase();
  if (n.length < 2) return true;
  if (ENTITY_BLACKLIST.has(n)) return true;
  for (const v of VERB_FRAGMENTS) if (n.includes(v)) return true;
  // Too many tokens = sentence fragment
  if (n.split(/\s+/).length > 6) return true;
  // All non-letter characters
  if (!/[a-z]/i.test(n)) return true;
  return false;
}

/** Trim trailing prepositions / conjunctions / dashes that come from sloppy patterns. */
function tidyEntity(s: string): string {
  let out = s.trim();
  // Strip trailing "set to", "agrees to", "to acquire" etc. fragments from buyer side
  out = out.replace(/\s+(?:set|agrees?|plans?|set\s+to|expected|likely|reportedly)\s*$/i, "");
  // Strip trailing prepositions
  out = out.replace(/\s+(from|for|by|to|with|and|in|on|the|a|an|of|after|amid|as|via|at)\s*$/i, "");
  // Strip trailing punctuation, dashes
  out = out.replace(/[\s\-—–:,.;]+$/, "");
  out = out.replace(/^[\s\-—–:,.;]+/, "");
  // Strip surrounding quotes
  out = out.replace(/^[\u2018\u2019\u201C\u201D'"`]+/, "").replace(/[\u2018\u2019\u201C\u201D'"`]+$/, "");
  // Remove "(translated)" suffix
  out = out.replace(/\s*\(translated\)\s*$/i, "");
  return out.trim();
}

// ============================================================================
// 3. PATTERN LIBRARY — heading → (buyer, target)
// ============================================================================
// Ordered from most-specific to most-general. First match wins.

type HeadingPattern = {
  name: string;
  re: RegExp;
  /** which capture-group is the buyer, which is the target */
  pick: (m: RegExpExecArray) => { buyer: string | null; target: string | null };
  /** confidence score 0..1 if this pattern matches */
  confidence: number;
};

const PATTERNS: HeadingPattern[] = [
  // "<Seller> sells <Asset> to <Buyer>" — buyer is at end
  {
    name: "sells_X_to_Y",
    re: /^(.+?)\s+(?:sells|sold|divests|divested)\s+(.+?)\s+to\s+(.+?)(?:\s*[-—–]|\s*\.|$)/i,
    pick: (m) => ({ buyer: m[3], target: m[2] }),  // target = the asset, not the seller
    confidence: 0.85,
  },
  // "<Buyer> to acquire <Target> from <Seller>"
  {
    name: "to_acquire_from",
    re: /^(.+?)\s+(?:to\s+acquire|set\s+to\s+acquire|agrees?\s+to\s+acquire|plans?\s+to\s+acquire)\s+(.+?)\s+from\s+(.+?)(?:\s*[-—–]|\s*\.|$)/i,
    pick: (m) => ({ buyer: m[1], target: m[2] }),
    confidence: 0.9,
  },
  // "<Buyer> acquires <Target> from <Seller>"
  {
    name: "acquires_from",
    re: /^(.+?)\s+(?:acquires|acquired|buys|bought|purchases?|purchased)\s+(.+?)\s+from\s+(.+?)(?:\s*[-—–]|\s*\.|$)/i,
    pick: (m) => ({ buyer: m[1], target: m[2] }),
    confidence: 0.9,
  },
  // "<Buyer> to acquire <Target>" / "<Buyer> set to acquire <Target>"
  {
    name: "to_acquire",
    re: /^(.+?)\s+(?:to\s+acquire|set\s+to\s+acquire|agrees?\s+to\s+acquire|plans?\s+to\s+acquire|near\s+(?:agreement|deal)\s+to\s+acquire)\s+(.+?)(?:\s+for\s|\s+in\s|\s*[-—–]|\s*\.|\s*\(|$)/i,
    pick: (m) => ({ buyer: m[1], target: m[2] }),
    confidence: 0.85,
  },
  // "<Buyer> acquires <Target>" (simple)
  {
    name: "acquires",
    re: /^(.+?)\s+(?:acquires?|acquired|buys|bought|purchases?|purchased)\s+(.+?)(?:\s+for\s|\s+in\s|\s*[-—–]|\s*\.|\s*\(|$)/i,
    pick: (m) => ({ buyer: m[1], target: m[2] }),
    confidence: 0.85,
  },
  // "<Target> nears <round-description> led by <Buyer>"
  {
    name: "nears_led_by",
    re: /^(.+?)\s+(?:nears?|secures?|closes?|raises?)\s+.+?\s+(?:led\s+by|from)\s+(.+?)(?:\s*[-—–]|\s*\.|\s+report|$)/i,
    pick: (m) => ({ buyer: m[2], target: m[1] }),
    confidence: 0.75,
  },
  // "<Buyer> in talks to invest in <Target>" / "<Buyer> in talks for/with <Target>"
  {
    name: "in_talks_to_invest",
    re: /^(.+?)\s+in\s+talks\s+(?:to\s+(?:invest\s+in|acquire|buy)|for|with)\s+(.+?)(?:\s*[-—–]|\s*\.|\s+report|$)/i,
    pick: (m) => ({ buyer: m[1], target: m[2] }),
    confidence: 0.7,
  },
  // "<Buyer> to invest in <Target>"
  {
    name: "to_invest_in",
    re: /^(.+?)\s+to\s+invest\s+in\s+(.+?)(?:\s*[-—–]|\s*\.|\s+report|$)/i,
    pick: (m) => ({ buyer: m[1], target: m[2] }),
    confidence: 0.8,
  },
  // "<Buyer> invests in <Target>"
  {
    name: "invests_in",
    re: /^(.+?)\s+invests?\s+in\s+(.+?)(?:\s*[-—–]|\s*\.|\s+report|$)/i,
    pick: (m) => ({ buyer: m[1], target: m[2] }),
    confidence: 0.8,
  },
  // "<Buyer> emerges as sole bidder for <Target>"
  {
    name: "sole_bidder_for",
    re: /^(.+?)\s+(?:emerges?\s+as\s+(?:sole|lead|preferred)\s+bidder\s+for|wins?\s+auction\s+for|frontrunner\s+(?:for|in)\s+auction\s+(?:for|of))\s+(.+?)(?:\s*[-—–]|\s*\.|$)/i,
    pick: (m) => ({ buyer: m[1], target: m[2] }),
    confidence: 0.85,
  },
  // "<Target> put up for sale by <Seller>" — no buyer yet, treat seller as target's owner
  {
    name: "for_sale_by",
    re: /^(.+?)\s+(?:put\s+up\s+for\s+sale|set\s+for\s+sale|on\s+the\s+block)\s+by\s+(.+?)(?:\s*[-—–]|\s*\.|$)/i,
    pick: (m) => ({ buyer: null, target: m[1] }),
    confidence: 0.7,
  },
  // "<Target> seeks <amount> from <Buyer>"
  {
    name: "seeks_from",
    re: /^(.+?)\s+seeks?\s+.+?\s+from\s+(.+?)(?:\s*[-—–]|\s*\.|\s+report|$)/i,
    pick: (m) => ({ buyer: m[2], target: m[1] }),
    confidence: 0.65,
  },
  // "<Target> in talks to raise/secure" — target only, no buyer
  {
    name: "in_talks_to_raise",
    re: /^(.+?)\s+in\s+talks\s+(?:to|for)\s+(?:raise|secure|fundraise)\b/i,
    pick: (m) => ({ buyer: null, target: m[1] }),
    confidence: 0.55,
  },
  // "<Target> raises <amount> from <Buyer>"
  {
    name: "raises_from",
    re: /^(.+?)\s+raises?\s+.+?\s+from\s+(.+?)(?:\s*[-—–]|\s*\.|\s+report|$)/i,
    pick: (m) => ({ buyer: m[2], target: m[1] }),
    confidence: 0.8,
  },
  // "<Target> seeks investor" — target only
  {
    name: "seeks_investor",
    re: /^(.+?)\s+(?:seeks?|seeking)\s+(?:investor|investors|buyer|buyers|strategic\s+partner|acquirer|funding)/i,
    pick: (m) => ({ buyer: null, target: m[1] }),
    confidence: 0.5,
  },
  // "<Target> reviews strategic options" — target only
  {
    name: "reviews_options",
    re: /^(.+?)\s+(?:reviews?|exploring|considers?|weighs?|evaluates?)\s+(?:strategic\s+options|sale|options|alternatives|exit|stake\s+sale)/i,
    pick: (m) => ({ buyer: null, target: m[1] }),
    confidence: 0.55,
  },
  // "<Buyer> completes/closes acquisition of <Target>"
  {
    name: "completes_acquisition_of",
    re: /^(.+?)\s+(?:completes?|closes?|finalises?|finalizes?)\s+(?:the\s+)?(?:acquisition|purchase|deal|takeover)\s+of\s+(.+?)(?:\s*[-—–]|\s*\.|$)/i,
    pick: (m) => ({ buyer: m[1], target: m[2] }),
    confidence: 0.85,
  },
  // "<Buyer> submits proposal/bid/offer to acquire <Target>" / "submits proposal for <Target>"
  {
    name: "submits_proposal_to_acquire",
    re: /^(.+?)\s+submits?\s+.+?\s+(?:to\s+acquire|for|bid\s+for|offer\s+for)\s+(.+?)(?:\s*[-—–]|\s*\.|\s*\(|$)/i,
    pick: (m) => ({ buyer: m[1], target: m[2] }),
    confidence: 0.8,
  },
  // "<Buyer> plans takeover/bid for <Target>"
  {
    name: "plans_takeover_for",
    re: /^(.+?)\s+plans?\s+(?:takeover|bid|offer|acquisition)\s+(?:bid\s+)?for\s+(.+?)(?:\s*[-—–]|\s*\.|\s+report|$)/i,
    pick: (m) => ({ buyer: m[1], target: m[2] }),
    confidence: 0.75,
  },
  // "<Buyer> secures control of <Target>"
  {
    name: "secures_control_of",
    re: /^(.+?)\s+secures?\s+(?:control|majority|stake|shareholding)\s+(?:of|in)\s+(.+?)(?:\s*[-—–]|\s*\.|\s*\(|$)/i,
    pick: (m) => ({ buyer: m[1], target: m[2] }),
    confidence: 0.85,
  },
  // "<Buyer> takes stake/share in <Target>"
  {
    name: "takes_stake_in",
    re: /^(.+?)\s+(?:takes?|acquires?|buys?)\s+(?:a\s+)?(?:stake|share|holding|position)\s+in\s+(.+?)(?:\s*[-—–]|\s*\.|\s*\(|$)/i,
    pick: (m) => ({ buyer: m[1], target: m[2] }),
    confidence: 0.85,
  },
  // "<Buyer> wins/lands <Target>" 
  {
    name: "wins_target",
    re: /^(.+?)\s+(?:wins?|lands?|clinches?)\s+(.+?)(?:\s+deal|\s+acquisition|\s*[-—–]|\s*\.|\s*\(|$)/i,
    pick: (m) => ({ buyer: m[1], target: m[2] }),
    confidence: 0.7,
  },
  // "<Target> acquired by <Buyer>"
  {
    name: "acquired_by",
    re: /^(.+?)\s+acquired\s+by\s+(.+?)(?:\s*[-—–]|\s*\.|\s*\(|$)/i,
    pick: (m) => ({ buyer: m[2], target: m[1] }),
    confidence: 0.9,
  },
  // "<Target> sale to <Buyer>"
  {
    name: "sale_to",
    re: /^(.+?)\s+sale\s+to\s+(.+?)(?:\s*[-—–]|\s*\.|\s*\(|$)/i,
    pick: (m) => ({ buyer: m[2], target: m[1] }),
    confidence: 0.85,
  },
  // "<Buyer> set to announce ... acquisition" — buyer-only signal
  {
    name: "set_to_announce_acquisition",
    re: /^(.+?)\s+(?:set\s+to|expected\s+to|plans?\s+to)\s+announce\s+.+?\s+(?:acquisition|deal|transaction|purchase)/i,
    pick: (m) => ({ buyer: m[1], target: null }),
    confidence: 0.55,
  },
  // "<Target> seeks/looking for buyer/investor"  
  {
    name: "looking_for_buyer",
    re: /^(.+?)\s+(?:looking|hunting|searching|on\s+the\s+hunt)\s+for\s+(?:investor|investors|buyer|buyers|acquirer|partner)/i,
    pick: (m) => ({ buyer: null, target: m[1] }),
    confidence: 0.5,
  },
  // "<Buyer> ends/closes <Round> investment in <Target>"
  {
    name: "investment_in",
    re: /^(.+?)\s+(?:leads?|closes?|ends?|completes?|joins?)\s+.+?(?:investment|round|funding)\s+in\s+(.+?)(?:\s*[-—–]|\s*\.|$)/i,
    pick: (m) => ({ buyer: m[1], target: m[2] }),
    confidence: 0.75,
  },
  // "<Buyer> announces acquisition of <Target>"
  {
    name: "announces_acquisition_of",
    re: /^(.+?)\s+announces?\s+(?:the\s+)?(?:acquisition|purchase|deal|takeover|investment\s+in)\s+(?:of\s+)?(.+?)(?:\s*[-—–]|\s*\.|$)/i,
    pick: (m) => ({ buyer: m[1], target: m[2] }),
    confidence: 0.8,
  },
  // "<Seller> agrees to sell <Asset> to <Buyer>"
  {
    name: "agrees_to_sell_to",
    re: /^(.+?)\s+agrees?\s+to\s+sell\s+(.+?)\s+to\s+(.+?)(?:\s*[-—–]|\s+for\s|\s*\.|$)/i,
    pick: (m) => ({ buyer: m[3], target: m[2] }),
    confidence: 0.9,
  },
  // "<Buyer> agrees rescue deal for <Target>"
  {
    name: "rescue_deal_for",
    re: /^(.+?)\s+agrees?\s+rescue\s+deal\s+for\s+(.+?)(?:\s*[-—–]|\s*\.|$)/i,
    pick: (m) => ({ buyer: m[1], target: m[2] }),
    confidence: 0.85,
  },
  // "<Target> sold to <Buyer>" / "<Target> sold for <amount>"
  {
    name: "sold_to",
    re: /^(.+?)\s+sold\s+to\s+(.+?)(?:\s*[-—–]|\s+for\s|\s*\.|\s*\(|$)/i,
    pick: (m) => ({ buyer: m[2], target: m[1] }),
    confidence: 0.85,
  },
  // "<Target> attracts/draws interest/bidders/buyers"  — target only signal
  {
    name: "attracts_interest",
    re: /^(.+?)\s+(?:attracts?|draws?|receives?)\s+(?:interest|bidders|buyers|offers|bids)/i,
    pick: (m) => ({ buyer: null, target: m[1] }),
    confidence: 0.55,
  },
  // "<Buyer> eyes <Target>" / "<Buyer> eyes acquisition of <Target>"
  {
    name: "eyes_target",
    re: /^(.+?)\s+eyes?\s+(?:acquisition\s+of\s+|stake\s+in\s+|investment\s+in\s+)?(.+?)(?:\s*[-—–]|\s*\.|\s+report|\s*\(|$)/i,
    pick: (m) => ({ buyer: m[1], target: m[2] }),
    confidence: 0.65,
  },
  // "<Buyer> takes/acquires minority/majority stake in <Target>"
  {
    name: "takes_stake_in_v2",
    re: /^(.+?)\s+(?:takes?|acquires?|adds?|grabs?|purchases?|buys?)\s+(?:a\s+)?(?:minority|majority|controlling|strategic|small|equity)\s+stake\s+in\s+(.+?)(?:\s*[-—–]|\s*\.|\s*\(|$)/i,
    pick: (m) => ({ buyer: m[1], target: m[2] }),
    confidence: 0.9,
  },
  // "<Buyer> buys/acquires assets of <Target>"
  {
    name: "buys_assets_of",
    re: /^(.+?)\s+(?:buys?|acquires?|takes?\s+over)\s+(?:the\s+)?assets\s+of\s+(.+?)(?:\s*[-—–]|\s*\.|\s*\(|$)/i,
    pick: (m) => ({ buyer: m[1], target: m[2] }),
    confidence: 0.85,
  },
  // "<Target> taps/hires <Advisor> to approach buyers/sell" — target only
  {
    name: "taps_advisor",
    re: /^(.+?)\s+(?:taps?|hires?|appoints?|mandates?)\s+.+?\s+(?:to\s+(?:approach|advise|run|find|seek|explore))/i,
    pick: (m) => ({ buyer: null, target: m[1] }),
    confidence: 0.55,
  },
  // "<Target> puts up for sale" / "<Target> put on the block"
  {
    name: "puts_up_for_sale",
    re: /^(.+?)\s+puts?\s+(?:itself|up)\s+(?:up\s+)?for\s+sale/i,
    pick: (m) => ({ buyer: null, target: m[1] }),
    confidence: 0.65,
  },
  // "<Target> to list via combination with SPAC <Buyer>" / IPO via SPAC
  {
    name: "to_list_via_spac",
    re: /^(.+?)\s+to\s+list\s+via\s+(?:combination|merger|business\s+combination)\s+with\s+(?:SPAC\s+)?(.+?)(?:\s+in\s|\s*[-—–]|\s*\.|$)/i,
    pick: (m) => ({ buyer: m[2], target: m[1] }),
    confidence: 0.8,
  },
  // "<Buyer> prepares <Target> for IPO" 
  {
    name: "prepares_for_ipo",
    re: /^(.+?)\s+prepares?\s+(.+?)\s+for\s+(?:IPO|listing|public\s+offering)/i,
    pick: (m) => ({ buyer: m[1], target: m[2] }),
    confidence: 0.8,
  },
  // "<Target> seeks bidders/buyers" — target only
  {
    name: "seeks_bidders",
    re: /^(.+?)\s+seeks?\s+(?:bidders?|buyers?|offers?|bids|partners?|investors?)\b/i,
    pick: (m) => ({ buyer: null, target: m[1] }),
    confidence: 0.55,
  },
  // "<Buyer> bid for <Target>"
  {
    name: "bid_for",
    re: /^(.+?)\s+(?:bid|offer)\s+for\s+(.+?)(?:\s*[-—–]|\s*\.|\s*\(|$)/i,
    pick: (m) => ({ buyer: m[1], target: m[2] }),
    confidence: 0.7,
  },
  // "<Buyer> backs/leads round in <Target>"
  {
    name: "backs_round_in",
    re: /^(.+?)\s+(?:backs?|leads?|joins?|enters?|participates?\s+in)\s+(?:funding\s+|investment\s+)?round\s+(?:in|for|of)\s+(.+?)(?:\s*[-—–]|\s*\.|$)/i,
    pick: (m) => ({ buyer: m[1], target: m[2] }),
    confidence: 0.8,
  },
  // "<Buyer> takes minority stake in <Target>" + variations
  {
    name: "takes_stake_in_v3",
    re: /^(.+?)\s+(?:takes?|acquires?|buys?|purchases?)\s+minority\s+(?:stake|position|shareholding)\s+in\s+(.+?)(?:\s*[-—–]|\s*\.|$)/i,
    pick: (m) => ({ buyer: m[1], target: m[2] }),
    confidence: 0.9,
  },
];

// ============================================================================
// 4. VALUE EXTRACTION
// ============================================================================

const VALUE_RX = /\b(USD|INR|EUR|GBP|JPY|CNY|NZD|AUD|HKD|SGD|KRW|SAR|AED|CHF|CAD)\s*([\d,.]+)\s*(?:bn|billion|m|million|k|thousand|tn|trillion)\b/gi;

function unitToMultiplier(unit: string): number {
  const u = unit.toLowerCase();
  if (u.startsWith("tn") || u.startsWith("tri")) return 1_000_000;
  if (u.startsWith("bn") || u.startsWith("bil")) return 1_000;
  if (u.startsWith("m") || u.startsWith("mil")) return 1;
  if (u.startsWith("k") || u.startsWith("tho")) return 0.001;
  return 1;
}

const FX_TO_USD: Record<string, number> = {
  USD: 1, EUR: 1.08, GBP: 1.26, JPY: 0.0064, CNY: 0.137,
  NZD: 0.6, AUD: 0.66, HKD: 0.128, SGD: 0.74, KRW: 0.00072,
  INR: 0.012, SAR: 0.266, AED: 0.272, CHF: 1.13, CAD: 0.73,
};

/**
 * Extract a deal value from heading + opportunity text.
 * Returns USD-equivalent in millions and a raw display string.
 */
export function extractValue(heading: string, opportunity?: string | null): {
  usd: number | null;
  currency: string | null;
  raw: string | null;
} {
  const corpus = `${heading || ""} ${opportunity || ""}`;
  const matches: Array<{ currency: string; m: number; raw: string }> = [];
  const rx = /\b(USD|INR|EUR|GBP|JPY|CNY|NZD|AUD|HKD|SGD|KRW|SAR|AED|CHF|CAD)\s*([\d,.]+)\s*(bn|billion|m|million|k|thousand|tn|trillion)\b/gi;
  let mm: RegExpExecArray | null;
  while ((mm = rx.exec(corpus)) !== null) {
    const currency = mm[1].toUpperCase();
    const num = parseFloat(mm[2].replace(/,/g, ""));
    if (!isFinite(num)) continue;
    const mult = unitToMultiplier(mm[3]);
    matches.push({ currency, m: num * mult, raw: mm[0] });
  }
  if (matches.length === 0) return { usd: null, currency: null, raw: null };
  // Prefer the largest value (typically the headline deal size, not bid increments)
  matches.sort((a, b) => b.m - a.m);
  const pick = matches[0];
  const fx = FX_TO_USD[pick.currency] ?? 1;
  return { usd: pick.m * fx, currency: pick.currency, raw: pick.raw };
}

// ============================================================================
// 5. STAKE EXTRACTION
// ============================================================================

export function extractStake(heading: string, opportunity?: string | null): number | null {
  const corpus = `${heading || ""} ${opportunity || ""}`;
  const m = /\b(\d{1,3}(?:\.\d+)?)\s*%/.exec(corpus);
  if (!m) return null;
  const pct = parseFloat(m[1]);
  if (pct < 0 || pct > 100) return null;
  return pct;
}

// ============================================================================
// 6. STATUS / DEAL TYPE MAPPING
// ============================================================================

/**
 * Map Intelligence Type tags → canonical status + deal_type.
 * Inputs: comma-separated tags like "Auction/Privatization,Cross Border,Private equity related"
 */
export function mapStatus(intelType: string | null | undefined, heading: string): {
  status: "announced" | "live" | "completed" | "abandoned";
  deal_type: string | null;
  is_capital_markets: boolean;
} {
  const tags = (intelType ?? "").toLowerCase().split(",").map((t) => t.trim());
  const h = heading.toLowerCase();
  const is_capital_markets =
    tags.includes("ipo") || tags.includes("rights issues") ||
    tags.includes("convertibles") || h.includes("ipo") ||
    h.includes("rights issue") || h.includes("fpo");

  // Completed signals
  if (/\b(completes?|completed|closes?|closed|finalised|finalized)\b/.test(h)) {
    return { status: "completed", deal_type: "Acquisition", is_capital_markets };
  }
  // Abandoned signals
  if (/\b(abandons|abandoned|terminates?|terminated|withdraws?|fails?|collapses?|scrapped)\b/.test(h)) {
    return { status: "abandoned", deal_type: "Acquisition", is_capital_markets };
  }
  // Live = pre-deal exploration
  if (
    /\b(in\s+talks|nears?|exploring|considers?|reviews?|weighs?|seeks?|for\s+sale|on\s+the\s+block|set\s+for\s+sale)\b/.test(h) ||
    tags.includes("companies for sale") ||
    tags.includes("auction/privatization")
  ) {
    let dt = "Acquisition";
    if (tags.includes("private equity related") && /\b(raise|fundraise|funding|round|series)\b/.test(h)) dt = "Investment";
    if (is_capital_markets) dt = tags.includes("ipo") ? "IPO" : "Capital Markets";
    return { status: "live", deal_type: dt, is_capital_markets };
  }
  // Announced (the default for "acquires / agrees / announces / submits proposal")
  let dt = "Acquisition";
  if (tags.includes("private equity related")) {
    if (/\b(invest|investment|funding|round|raise|raises)\b/.test(h)) dt = "Investment";
    else if (/\b(acquires?|acquired|buys?|bought)\b/.test(h)) dt = "Buyout";
  }
  if (tags.includes("takeover situations") && dt === "Acquisition") dt = "Takeover";
  if (is_capital_markets) dt = tags.includes("ipo") ? "IPO" : "Capital Markets";
  return { status: "announced", deal_type: dt, is_capital_markets };
}

// ============================================================================
// 7. MAIN PARSE ENTRY
// ============================================================================

/**
 * Parse a single intelligence-feed row into canonical deal fields.
 */
export function parseIntelligenceRow(row: IntelligenceFeedRow): IntelligenceParseResult {
  const heading = (row.heading ?? "").trim();
  const opportunity = (row.opportunity ?? "").trim() || null;

  const is_digest = isDigestHeading(heading);
  const stmap = mapStatus(row.intelligence_type, heading);
  const value = extractValue(heading, opportunity);
  const stake = extractStake(heading, opportunity);

  let buyer: string | null = null;
  let target: string | null = null;
  let confidence = 0;
  let parse_pattern = "";

  if (!is_digest && heading) {
    for (const pat of PATTERNS) {
      const m = pat.re.exec(heading);
      if (!m) continue;
      const picked = pat.pick(m);
      const b = picked.buyer ? tidyEntity(picked.buyer) : null;
      const t = picked.target ? tidyEntity(picked.target) : null;
      if (b && isJunkEntity(b)) continue;
      if (t && isJunkEntity(t)) continue;
      if (!b && !t) continue;
      buyer = b;
      target = t;
      confidence = pat.confidence;
      parse_pattern = pat.name;
      break;
    }
  }

  // Confidence adjustments
  if (is_digest) {
    confidence = 0;
    parse_pattern = "digest";
  }
  if (buyer && target) confidence = Math.min(1, confidence + 0.05);
  if (value.usd) confidence = Math.min(1, confidence + 0.05);
  if (!buyer && !target) confidence = Math.max(0.05, confidence - 0.3);

  const needs_review = is_digest || confidence < 0.6 || (!buyer && !target);

  return {
    buyer, target,
    deal_value_usd: value.usd,
    deal_value_currency: value.currency,
    deal_value_raw: value.raw,
    status: stmap.status,
    deal_type: stmap.deal_type,
    stake_percent: stake,
    heading,
    opportunity,
    intelligence_type: row.intelligence_type ?? null,
    is_digest,
    is_capital_markets: stmap.is_capital_markets,
    confidence,
    parse_pattern,
    needs_review,
  };
}

/**
 * Detect whether a raw uploaded row is from a Mergermarket-style intelligence
 * feed. Returns true if the row carries the characteristic columns.
 */
export function isIntelligenceFeedRow(row: Record<string, unknown>): boolean {
  const keys = new Set(Object.keys(row).map((k) => k.toLowerCase().trim()));
  // The feed-defining trio:
  const hasHeading = keys.has("heading");
  const hasOpportunity = keys.has("opportunity");
  const hasIntelType = keys.has("intelligence type") || keys.has("intelligence_type");
  return hasHeading && hasOpportunity && (hasIntelType || keys.has("source"));
}
