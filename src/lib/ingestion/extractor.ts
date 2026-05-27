

/**
 * Deal IQ AI — Ingestion v2 — deterministic extractor.
 *
 * Reads a raw Mergermarket-style row and produces an ExtractionResult with
 * per-field confidence and evidence.
 *
 * KEY PRINCIPLES (per spec):
 *   1. Use structured fields when internally consistent.
 *   2. Use Heading + Opportunity together as the next signal.
 *   3. Use Intelligence Size as the primary value signal.
 *   4. Use Intelligence Grade as a confidence multiplier.
 *   5. NEVER invent values — return null and let the router send to resolution.
 *   6. Preserve original heading verbatim.
 *   7. Detect digest articles and tag them — do not extract entities from them.
 */

import { type RawRow, type ExtractionResult, type FieldEvidence } from "./types";
import { readMergermarket } from "./columns";
import { cleanCompany } from "@/lib/cleansing/companies";

// ============================================================================
// 1. DIGEST DETECTION
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

function detectDigest(heading: string, topics: string | null): { is_digest: boolean; reason: string | null } {
  const h = heading.toLowerCase();
  const matchedHeading = DIGEST_HEADING_KEYWORDS.find((k) => h.includes(k));
  if (matchedHeading) return { is_digest: true, reason: `heading contains '${matchedHeading}'` };
  if (topics) {
    const t = topics.toLowerCase();
    const matchedTopic = DIGEST_TOPIC_KEYWORDS.find((k) => t.includes(k));
    if (matchedTopic) return { is_digest: true, reason: `topics contains '${matchedTopic}'` };
  }
  return { is_digest: false, reason: null };
}

// ============================================================================
// 2. ENTITY VALIDATION
// ============================================================================
const ENTITY_BLACKLIST = new Set([
  "investor", "investors", "buyer", "buyers", "bidder", "bidders",
  "sources", "source", "report", "reports", "news",
  "company", "companies", "target", "targets", "asset", "assets",
  "press release", "stock exchange", "announcement", "filing",
  "the company", "the target", "the buyer", "the seller",
  "press", "statement", "release",
  "proprietary intelligence", "company press release",
  "stock exchange announcement", "newswire round-up",
  "tracker", "monitor", "digest", "weekly", "monthly", "espresso",
  "unknown", "n/a", "na", "tbd", "tbc", "undisclosed",
  "fund", "funds", "private", "public",
  "gp", "lp", "deal", "round", "stake", "shares",
  "advisor", "advisors", "advisory", "lender", "lenders",
  "consortium", "syndicate", "group", "partners",
]);

const VERB_FRAGMENT_RX = /\b(acquires?|sells?|buys?|raises?|invests?|announces?|completes?|nears?|set\s+to|in\s+talks|exploring|considers?|reviews?)\b/i;

const STRUCTURED_PLACEHOLDERS = [
  /^company\s+record\s+pending$/i, /^undisclosed/i, /^unknown/i,
  /^n\/?a$/i, /^tbd$/i, /^tba$/i,
];

function isValidEntity(name: string | null): boolean {
  if (!name) return false;
  const n = name.trim();
  if (n.length < 2 || n.length > 200) return false;
  const lower = n.toLowerCase();
  if (ENTITY_BLACKLIST.has(lower)) return false;
  if (VERB_FRAGMENT_RX.test(n)) return false;
  if (!/[a-zA-Z]/.test(n)) return false;
  if (n.split(/\s+/).length > 8) return false;
  return true;
}

function tidyEntity(s: string | null): string | null {
  if (!s) return null;
  let out = s.trim();
  out = out.replace(/\s+(?:set|agrees?|plans?|set\s+to|expected|likely|reportedly)\s*$/i, "");
  out = out.replace(/\s+(from|for|by|to|with|and|in|on|the|a|an|of|after|amid|as|via|at)\s*$/i, "");
  out = out.replace(/\s+&\s*$/, "");
  out = out.replace(/[\s\-—–:,.;]+$/, "");
  out = out.replace(/^[\s\-—–:,.;]+/, "");
  out = out.replace(/^[\u2018\u2019\u201C\u201D'"`]+/, "").replace(/[\u2018\u2019\u201C\u201D'"`]+$/, "");
  out = out.replace(/\s*\(translated\)\s*$/i, "");
  return out.trim() || null;
}

// ============================================================================
// 3. STRUCTURED COLUMN PARSING
// ============================================================================
function parseStructured(raw: string | null, max: number): string[] | null {
  if (!raw) return null;
  const parts = raw.split(/[;,|]/).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.length > max) return null;
  const clean: string[] = [];
  for (const p of parts) {
    if (STRUCTURED_PLACEHOLDERS.some((rx) => rx.test(p))) continue;
    const c = cleanCompany(p);
    if (c && isValidEntity(c)) clean.push(c);
  }
  return clean.length > 0 ? Array.from(new Set(clean)) : null;
}

// ============================================================================
// 4. HEADING PATTERN LIBRARY
// ============================================================================
type Pattern = {
  name: string;
  re: RegExp;
  pick: (m: RegExpExecArray) => { buyer: string | null; target: string | null };
  conf: number;
};

const HEADING_PATTERNS: Pattern[] = [
  // JV patterns first — a joint venture must not be mis-parsed as an acquisition
  // by the "acquires"/"forms" verbs that appear in the same headline.
  { name: "jv_form_with", conf: 0.93,
    re: /^(.+?)\s+(?:to\s+form|forms?|to\s+set\s+up|sets?\s+up|to\s+establish|establishes?|to\s+launch|launches?)\s+(?:a\s+)?(?:\d{1,3}\s*[:\/]\s*\d{1,3}\s+)?(?:joint\s+venture|jv)\s+(?:with|alongside|together\s+with)\s+(.+?)(?:\s+for\s|\s+to\s+|\s*[-—–]|\s*\.|\s*\(|$)/i,
    pick: (m) => ({ buyer: m[1], target: m[2] }) },
  { name: "jv_between", conf: 0.9,
    re: /^(?:\d{1,3}\s*[:\/]\s*\d{1,3}\s+)?(?:joint\s+venture|jv)\s+between\s+(.+?)\s+and\s+(.+?)(?:\s+for\s|\s+to\s+|\s*[-—–]|\s*\.|\s*\(|$)/i,
    pick: (m) => ({ buyer: m[1], target: m[2] }) },
  { name: "sells_to", conf: 0.92,
    re: /^(.+?)\s+(?:sells?|sold|divests?|divested)\s+(.+?)\s+to\s+(.+?)(?:\s+for\s|\s*[-—–]|\s*\.|$)/i,
    pick: (m) => ({ buyer: m[3], target: m[2] }) },
  { name: "to_acquire_from", conf: 0.92,
    re: /^(.+?)\s+(?:to\s+acquire|set\s+to\s+acquire|agrees?\s+to\s+acquire|plans?\s+to\s+acquire)\s+(.+?)\s+from\s+(.+?)(?:\s+for\s|\s*[-—–]|\s*\.|$)/i,
    pick: (m) => ({ buyer: m[1], target: m[2] }) },
  { name: "acquires_from", conf: 0.92,
    re: /^(.+?)\s+(?:acquires?|acquired|buys?|bought|purchases?|purchased)\s+(.+?)\s+from\s+(.+?)(?:\s+for\s|\s*[-—–]|\s*\.|$)/i,
    pick: (m) => ({ buyer: m[1], target: m[2] }) },
  { name: "acquired_by", conf: 0.9,
    re: /^(.+?)\s+acquired\s+by\s+(.+?)(?:\s+for\s|\s*[-—–]|\s*\.|\s*\(|$)/i,
    pick: (m) => ({ buyer: m[2], target: m[1] }) },
  { name: "to_acquire", conf: 0.85,
    re: /^(.+?)\s+(?:to\s+acquire|set\s+to\s+acquire|agrees?\s+to\s+acquire|plans?\s+to\s+acquire)\s+(.+?)(?:\s+for\s|\s+in\s+|\s*[-—–]|\s*\.|\s*\(|$)/i,
    pick: (m) => ({ buyer: m[1], target: m[2] }) },
  { name: "acquires", conf: 0.85,
    re: /^(.+?)\s+(?:acquires?|acquired|buys?|bought|purchases?|purchased)\s+(.+?)(?:\s+for\s|\s+in\s+|\s*[-—–]|\s*\.|\s*\(|$)/i,
    pick: (m) => ({ buyer: m[1], target: m[2] }) },
  { name: "in_talks_to_raise", conf: 0.7,
    re: /^(.+?)\s+in\s+talks\s+(?:for|to)\s+(?:raise|secure|fundraise|up\s+to)\b/i,
    pick: (m) => ({ buyer: null, target: m[1] }) },
  { name: "in_talks_to", conf: 0.7,
    re: /^(.+?)\s+in\s+talks\s+(?:to\s+(?:invest\s+in|acquire|buy)|for|with)\s+(.+?)(?:\s*[-—–]|\s*\.|\s+report|$)/i,
    pick: (m) => ({ buyer: m[1], target: m[2] }) },
  { name: "agrees_to_sell_to", conf: 0.9,
    re: /^(.+?)\s+agrees?\s+to\s+sell\s+(.+?)\s+to\s+(.+?)(?:\s+for\s|\s*[-—–]|\s*\.|$)/i,
    pick: (m) => ({ buyer: m[3], target: m[2] }) },
  { name: "takes_stake_in", conf: 0.85,
    re: /^(.+?)\s+(?:takes?|acquires?|adds?|grabs?|purchases?|buys?)\s+(?:a\s+)?(?:minority|majority|controlling|strategic|small|equity)?\s*(?:stake|position|shareholding)\s+in\s+(.+?)(?:\s+for\s|\s*[-—–]|\s*\.|\s*\(|$)/i,
    pick: (m) => ({ buyer: m[1], target: m[2] }) },
  { name: "sole_bidder_for", conf: 0.85,
    re: /^(.+?)\s+emerges?\s+as\s+(?:sole|lead|preferred|frontrunner)\s+bidder\s+for\s+(.+?)(?:\s*[-—–]|\s*\.|$)/i,
    pick: (m) => ({ buyer: m[1], target: m[2] }) },
  { name: "nears_led_by", conf: 0.75,
    re: /^(.+?)\s+(?:nears?|secures?|closes?|raises?)\s+.+?\s+led\s+by\s+(.+?)(?:\s*[-—–]|\s*\.|\s+report|$)/i,
    pick: (m) => ({ buyer: m[2], target: m[1] }) },
  { name: "raises_from", conf: 0.8,
    re: /^(.+?)\s+raises?\s+.+?\s+from\s+(.+?)(?:\s*[-—–]|\s*\.|\s+report|$)/i,
    pick: (m) => ({ buyer: m[2], target: m[1] }) },
  { name: "to_invest_in", conf: 0.8,
    re: /^(.+?)\s+to\s+invest\s+in\s+(.+?)(?:\s*[-—–]|\s*\.|\s+report|$)/i,
    pick: (m) => ({ buyer: m[1], target: m[2] }) },
  { name: "completes_acquisition_of", conf: 0.85,
    re: /^(.+?)\s+(?:completes?|closes?|finalises?|finalizes?)\s+(?:the\s+)?(?:acquisition|purchase|deal|takeover)\s+of\s+(.+?)(?:\s*[-—–]|\s*\.|$)/i,
    pick: (m) => ({ buyer: m[1], target: m[2] }) },
  { name: "announces_acquisition_of", conf: 0.8,
    re: /^(.+?)\s+announces?\s+(?:the\s+)?(?:acquisition|purchase|deal|takeover|investment\s+in)\s+(?:of\s+)?(.+?)(?:\s*[-—–]|\s*\.|$)/i,
    pick: (m) => ({ buyer: m[1], target: m[2] }) },
  { name: "puts_up_for_sale", conf: 0.65,
    re: /^(.+?)\s+puts?\s+(?:itself|up)\s+(?:up\s+)?for\s+sale/i,
    pick: (m) => ({ buyer: null, target: m[1] }) },
  { name: "places_on_block", conf: 0.65,
    re: /^(.+?)\s+places?\s+.+?\s+on\s+(?:the\s+|sales?\s+)block\b/i,
    pick: (m) => ({ buyer: null, target: m[1] }) },
  { name: "reviews_options", conf: 0.55,
    re: /^(.+?)\s+(?:reviews?|exploring|considers?|weighs?|evaluates?)\s+(?:strategic\s+options|sale|options|alternatives|exit|stake\s+sale)/i,
    pick: (m) => ({ buyer: null, target: m[1] }) },
];

function tryHeadingPatterns(heading: string): { buyer: string | null; target: string | null; conf: number; pattern: string } | null {
  for (const p of HEADING_PATTERNS) {
    const m = p.re.exec(heading);
    if (!m) continue;
    const picked = p.pick(m);
    const b = tidyEntity(picked.buyer);
    const t = tidyEntity(picked.target);
    const bOk = isValidEntity(b);
    const tOk = isValidEntity(t);
    if (!bOk && !tOk) continue;
    return { buyer: bOk ? b : null, target: tOk ? t : null, conf: p.conf, pattern: p.name };
  }
  return null;
}

// ============================================================================
// 5. STATUS + DEAL TYPE MAPPING
// ============================================================================
function mapStatus(heading: string, intelType: string | null, intelGrade: string | null): {
  status: string | null; conf: number; reason: string;
} {
  const h = heading.toLowerCase();
  const tags = (intelType ?? "").toLowerCase().split(",").map((t) => t.trim());
  const grade = (intelGrade ?? "").toLowerCase();

  if (/\b(completes?|completed|closes?|closed|finalised|finalized|wraps?\s+up)\b/.test(h)) {
    return { status: "completed", conf: 0.9, reason: "completion verb in heading" };
  }
  if (/\b(abandons|abandoned|terminates?|terminated|withdraws?|fails?|collapses?|scrapped|drops?\s+bid|walks?\s+away)\b/.test(h)) {
    return { status: "abandoned", conf: 0.9, reason: "abandonment verb in heading" };
  }
  if (grade.includes("speculation") || grade.includes("some evidence")) {
    return { status: "live", conf: 0.7, reason: `intelligence_grade '${intelGrade}' implies pre-deal` };
  }
  if (/\b(in\s+talks|nears?|exploring|considers?|reviews?|weighs?|seeks?|for\s+sale|on\s+(?:the|sales?)\s+block|set\s+for\s+sale|eyes?|may\s+acquire|expected\s+to|approaches?|reportedly)\b/.test(h)) {
    return { status: "live", conf: 0.8, reason: "pre-deal verb in heading" };
  }
  if (tags.includes("companies for sale") || tags.includes("auction/privatization")) {
    return { status: "live", conf: 0.8, reason: `intelligence_type tag '${tags.find((t) => t.includes("for sale") || t.includes("auction"))}'` };
  }
  if (/\b(acquires?|acquired|to\s+acquire|agrees?\s+to|announces?)\b/.test(h)) {
    return { status: "announced", conf: 0.85, reason: "announcement verb in heading" };
  }
  return { status: null, conf: 0, reason: "no status signal" };
}

function mapDealType(heading: string, intelType: string | null): { type: string | null; conf: number; reason: string } {
  const tags = (intelType ?? "").toLowerCase().split(",").map((t) => t.trim());
  const h = heading.toLowerCase();
  const isCapMkts = tags.includes("ipo") || tags.includes("rights issues") || tags.includes("convertibles") ||
                    h.includes("ipo") || h.includes("rights issue") || h.includes("fpo") || h.includes("public offering");
  if (isCapMkts) {
    if (tags.includes("ipo") || h.includes("ipo")) return { type: "IPO", conf: 0.9, reason: "IPO tag/keyword" };
    return { type: "Capital Markets", conf: 0.8, reason: "rights/convertible keywords" };
  }
  if (tags.includes("private equity related")) {
    if (/\b(invest|investment|funding|round|raise|raises)\b/.test(h)) {
      return { type: "Investment", conf: 0.85, reason: "PE tag + investment verbs" };
    }
    if (/\b(acquires?|acquired|buys?|bought)\b/.test(h)) {
      return { type: "Buyout", conf: 0.85, reason: "PE tag + acquisition verbs" };
    }
  }
  if (tags.includes("takeover situations")) return { type: "Takeover", conf: 0.8, reason: "takeover tag" };
  if (/\b(acquires?|acquired|buys?|bought|purchases?)\b/.test(h)) return { type: "Acquisition", conf: 0.75, reason: "acquisition verb" };
  if (/\b(merger|merges?|merging)\b/.test(h)) return { type: "Merger", conf: 0.8, reason: "merger verb" };
  return { type: null, conf: 0, reason: "no deal type signal" };
}

// ============================================================================
// 6. STAKE + SIZE + GRADE EXTRACTION
// ============================================================================
function extractStake(stakeRaw: string | null, heading: string, opp: string | null): { value: string | null; conf: number; source: FieldEvidence["source"]; reasoning: string } {
  // Mergermarket Stake Value column is the most reliable
  if (stakeRaw) {
    const trimmed = stakeRaw.trim();
    if (trimmed && !/^n\/?a$/i.test(trimmed) && !/^undisclosed$/i.test(trimmed)) {
      return { value: trimmed, conf: 0.9, source: "structured", reasoning: "from Stake Value column" };
    }
  }
  // Prose extraction (e.g. "20% stake")
  const corpus = `${heading} ${opp ?? ""}`;
  const m = /\b(\d{1,3}(?:\.\d{1,2})?)\s*%/.exec(corpus);
  if (m) {
    const pct = parseFloat(m[1]);
    if (pct >= 0 && pct <= 100) {
      return { value: `${pct}%`, conf: 0.7, source: "heading_pattern", reasoning: `prose match '${m[0]}'` };
    }
  }
  return { value: null, conf: 0, source: "none", reasoning: "no stake signal" };
}

function pickLargestSizeBucket(raw: string | null): string | null {
  if (!raw) return null;
  // Intelligence Size cells look like "INR 2bn-4bn,INR 400m-2bn,< INR 400m" or "> INR 21bn"
  // We choose the LARGEST bucket per spec.
  const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;

  // Convert each bucket to an upper-bound numeric (in INR m) for ranking
  const rank = (p: string): number => {
    if (/^>/.test(p)) return Number.POSITIVE_INFINITY;
    const m = /([\d.]+)\s*(bn|billion|m|million|k)/i.exec(p);
    if (!m) return 0;
    const n = parseFloat(m[1]);
    const u = m[2].toLowerCase();
    if (u.startsWith("b")) return n * 1000;
    if (u.startsWith("m")) return n;
    if (u.startsWith("k")) return n / 1000;
    return n;
  };
  parts.sort((a, b) => rank(b) - rank(a));
  return parts[0];
}

// ============================================================================
// 7. ASSET-SALE HEADING DETECTION
// ============================================================================
const ASSET_SALE_RX = /\b(sells?|sold|for\s+sale|on\s+(?:the|sales?)\s+block|places?\s+(?:on|up)|divests?|exits?|carve\W?out|spin\W?off|asset\s+sale|disposal|stake\s+sale|set\s+for\s+sale)\b/i;

// ============================================================================
// 8. INTENT TAGS (for few-shot retrieval similarity)
// ============================================================================
function deriveIntentTags(heading: string, intelType: string | null): string[] {
  const tags: string[] = [];
  const h = heading.toLowerCase();
  const t = (intelType ?? "").toLowerCase();
  if (ASSET_SALE_RX.test(heading)) tags.push("asset_sale");
  if (t.includes("ipo") || h.includes("ipo")) tags.push("ipo");
  if (h.includes("rights issue") || t.includes("rights issues")) tags.push("rights_issue");
  if (/\b(fundraise|funding|series|round|raises?)\b/.test(h)) tags.push("fundraise");
  if (t.includes("private equity")) tags.push("pe_related");
  if (t.includes("takeover")) tags.push("takeover");
  if (t.includes("cross border")) tags.push("cross_border");
  if (/\b(in\s+talks|near|nears|eyes|exploring)\b/.test(h)) tags.push("pre_deal");
  if (/\b(completes?|completed|closes?|closed)\b/.test(h)) tags.push("completed");
  if (/\b(consortium|consortia)\b/.test(h)) tags.push("consortium");
  if (/\b(reverse\s+merger|spac)\b/.test(h)) tags.push("spac");
  return tags;
}

// ============================================================================
// 9. DATE NORMALIZATION
// ============================================================================
function normalizeDate(raw: string | null): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;
  // ISO already
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // DD/MM/YYYY or DD-MM-YYYY (Mergermarket Indian feed default)
  m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/.exec(s);
  if (m) {
    let [_, d, mo, y] = m;
    if (y.length === 2) y = (Number(y) > 50 ? "19" : "20") + y;
    return `${y}-${mo.padStart(2,"0")}-${d.padStart(2,"0")}`;
  }
  return null;
}

// ============================================================================
// 10. MAIN EXTRACTION
// ============================================================================

const EMPTY_EVIDENCE: FieldEvidence = { value: null, confidence: 0, source: "none" };

function ev(value: string | null, confidence: number, source: FieldEvidence["source"], reasoning?: string): FieldEvidence {
  return { value, confidence, source, reasoning };
}

export function extractRow(row: RawRow): ExtractionResult {
  const m = readMergermarket(row);
  const heading = m.heading ?? "";
  const opp = m.opportunity;
  const uncertainty: string[] = [];

  // ---- Digest detection ----
  const digestResult = detectDigest(heading, m.topics);
  if (digestResult.is_digest) {
    return {
      heading,
      is_digest: true,
      digest_reason: digestResult.reason,
      buyer: EMPTY_EVIDENCE, target: EMPTY_EVIDENCE, vendor: EMPTY_EVIDENCE,
      dominant_sector: ev(m.sector, m.sector ? 0.9 : 0, m.sector ? "structured" : "none"),
      dominant_geography: ev(m.geography, m.geography ? 0.9 : 0, m.geography ? "structured" : "none"),
      intelligence_size: ev(pickLargestSizeBucket(m.intel_size), m.intel_size ? 0.7 : 0, m.intel_size ? "structured" : "none"),
      intelligence_grade: ev(m.intel_grade, m.intel_grade ? 0.95 : 0, m.intel_grade ? "structured" : "none"),
      stake_value: EMPTY_EVIDENCE,
      deal_type: EMPTY_EVIDENCE, deal_status: EMPTY_EVIDENCE,
      row_confidence: 0,
      parse_path: "digest",
      needs_review: false,                 // digests go to digest_records, not resolution
      uncertainty_reasons: ["digest article — entity extraction skipped by design"],
      evidence_json: { digest_reason: digestResult.reason },
      intent_tags: ["digest", ...deriveIntentTags(heading, m.intel_type)],
      deal_date: normalizeDate(m.date),
    };
  }

  // ---- Structured Bidders / Targets / Vendors / Issuers ----
  const bidderEntities = parseStructured(m.bidders ?? m.issuers, 10);
  const targetEntities = parseStructured(m.targets ?? m.issuers, 3);
  const vendorEntities = parseStructured(m.vendors, 5);

  let buyer: FieldEvidence = EMPTY_EVIDENCE;
  let target: FieldEvidence = EMPTY_EVIDENCE;
  let vendor: FieldEvidence = EMPTY_EVIDENCE;

  if (bidderEntities && bidderEntities.length > 0) {
    buyer = ev(bidderEntities.join("; "), 0.9, "structured",
               `Bidders column had ${bidderEntities.length} clean ${bidderEntities.length === 1 ? "entity" : "entities"}`);
  }
  if (targetEntities && targetEntities.length > 0) {
    target = ev(targetEntities.join("; "), 0.9, "structured",
                `Targets column had ${targetEntities.length} clean ${targetEntities.length === 1 ? "entity" : "entities"}`);
  }
  if (vendorEntities && vendorEntities.length > 0) {
    vendor = ev(vendorEntities.join("; "), 0.9, "structured", "Vendors column");
  }

  // ---- Asset-sale promotion: vendor → target ----
  if (!target.value && vendor.value && ASSET_SALE_RX.test(heading)) {
    target = ev(vendor.value, 0.8, "structured", "vendor promoted to target (asset-sale heading)");
  }

  // ---- Heading pattern fallback ----
  let patternHit: ReturnType<typeof tryHeadingPatterns> = null;
  if ((!buyer.value || !target.value) && heading) {
    patternHit = tryHeadingPatterns(heading);
    if (patternHit) {
      if (!buyer.value && patternHit.buyer) {
        buyer = ev(patternHit.buyer, patternHit.conf, "heading_pattern", `pattern '${patternHit.pattern}'`);
      }
      if (!target.value && patternHit.target) {
        target = ev(patternHit.target, patternHit.conf, "heading_pattern", `pattern '${patternHit.pattern}'`);
      }
    }
  }

  // ---- Opportunity body as last deterministic resort ----
  if (!buyer.value && !target.value && opp) {
    const firstSentence = opp.split(/[.\n]/)[0]?.trim();
    if (firstSentence && firstSentence.length > 15) {
      const hit = tryHeadingPatterns(firstSentence);
      if (hit) {
        const tighterConf = Math.max(0.35, hit.conf - 0.25);
        if (hit.buyer && isValidEntity(hit.buyer) && hit.buyer.split(/\s+/).length <= 5) {
          buyer = ev(hit.buyer, tighterConf, "opportunity_pattern", `opportunity first-sentence '${hit.pattern}'`);
        }
        if (hit.target && isValidEntity(hit.target) && hit.target.split(/\s+/).length <= 5) {
          target = ev(hit.target, tighterConf, "opportunity_pattern", `opportunity first-sentence '${hit.pattern}'`);
        }
        if (buyer.value || target.value) uncertainty.push("buyer/target inferred from opportunity body — verify");
      }
    }
  }

  // ---- Sector + geography ----
  // Mergermarket structured columns are already clean — trust them.
  const sector = ev(m.sector, m.sector ? 0.95 : 0, m.sector ? "structured" : "none", m.sector ? "Dominant Sector column" : "");
  const geography = ev(m.geography, m.geography ? 0.95 : 0, m.geography ? "structured" : "none", m.geography ? "Dominant Geography column" : "");

  // ---- Intelligence size (pick largest bucket) ----
  const sizeBucket = pickLargestSizeBucket(m.intel_size);
  const intelligence_size = ev(sizeBucket, sizeBucket ? 0.8 : 0, sizeBucket ? "structured" : "none",
    sizeBucket && m.intel_size && m.intel_size.includes(",") ? "largest of multiple buckets" : (sizeBucket ? "Intelligence Size column" : ""));

  // ---- Intelligence grade ----
  const intelligence_grade = ev(m.intel_grade, m.intel_grade ? 0.95 : 0, m.intel_grade ? "structured" : "none");

  // ---- Stake ----
  const stake = extractStake(m.stake, heading, opp);
  const stake_value = ev(stake.value, stake.conf, stake.source, stake.reasoning);

  // ---- Status + deal type ----
  const sm = mapStatus(heading, m.intel_type, m.intel_grade);
  const deal_status = ev(sm.status, sm.conf, sm.status ? "heading_pattern" : "none", sm.reason);
  const dt = mapDealType(heading, m.intel_type);
  const deal_type = ev(dt.type, dt.conf, dt.type ? "heading_pattern" : "none", dt.reason);

  // ---- Aggregate confidence ----
  // Required fields per spec: heading (always present), buyer, target, sector, geography, size, grade, stake, type, status
  // Row confidence = weighted blend with floor penalty for missing required fields.
  const weights = {
    buyer: 0.20, target: 0.20,
    dominant_sector: 0.10, dominant_geography: 0.10,
    intelligence_size: 0.08, intelligence_grade: 0.05,
    stake_value: 0.07, deal_type: 0.10, deal_status: 0.10,
  } as const;
  type FieldKey = keyof typeof weights;
  const fields: Record<FieldKey, FieldEvidence> = {
    buyer, target,
    dominant_sector: sector, dominant_geography: geography,
    intelligence_size, intelligence_grade,
    stake_value, deal_type, deal_status,
  };
  let row_confidence = 0;
  for (const k of Object.keys(weights) as FieldKey[]) {
    row_confidence += (fields[k]?.confidence ?? 0) * weights[k];
  }

  // Intelligence Grade is the strongest external confidence multiplier.
  // "Strong evidence" / "Confirmed" pushes up; "Speculation" pulls down.
  const grade = (m.intel_grade ?? "").toLowerCase();
  if (grade.includes("confirmed") || grade.includes("strong evidence")) row_confidence = Math.min(1, row_confidence * 1.1);
  else if (grade.includes("speculation")) row_confidence = row_confidence * 0.85;

  // Hard requirement: buyer OR target must be present for canonical
  if (!buyer.value && !target.value) {
    uncertainty.push("Both buyer and target are null");
    row_confidence = Math.min(row_confidence, 0.3);
  }
  if (!buyer.value) uncertainty.push("buyer unresolved");
  if (!target.value) uncertainty.push("target unresolved");
  if (!sm.status) uncertainty.push("deal_status unresolved");
  if (!dt.type) uncertainty.push("deal_type unresolved");

  const parse_path = patternHit
    ? `structured+heading:${patternHit.pattern}`
    : (buyer.source === "structured" || target.source === "structured" ? "structured" :
       (buyer.source === "opportunity_pattern" || target.source === "opportunity_pattern" ? "opportunity_pattern" :
        "deterministic"));

  return {
    heading,
    is_digest: false, digest_reason: null,
    buyer, target, vendor,
    dominant_sector: sector,
    dominant_geography: geography,
    intelligence_size,
    intelligence_grade,
    stake_value,
    deal_type,
    deal_status,
    row_confidence: Math.max(0, Math.min(1, row_confidence)),
    parse_path,
    needs_review: false,    // confidence-engine decides this in router
    uncertainty_reasons: uncertainty,
    evidence_json: {
      buyer: buyer, target: target, vendor: vendor,
      sector: sector, geography: geography,
      intelligence_size: intelligence_size, intelligence_grade: intelligence_grade,
      stake_value: stake_value,
      deal_type: deal_type, deal_status: deal_status,
      pattern_hit: patternHit ?? null,
    },
    intent_tags: deriveIntentTags(heading, m.intel_type),
    deal_date: normalizeDate(m.date),
  };
}
