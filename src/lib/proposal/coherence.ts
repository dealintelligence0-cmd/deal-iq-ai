/**
 * Deal IQ AI — Deck / proposal coherence gate (Sprint 0 release blocker).
 *
 * PURPOSE
 * A generated proposal must never contradict the deal record it claims to be
 * about. The single worst failure mode observed in review was an "entity
 * data-bleed": a deck titled `Eicher Motors → Volvo Financial Services India`
 * whose entire narrative described `Sodexo / Shashi Catering Services`. The
 * title layer (deal record `meta`) and the narrative layer (AI `proposalMd`)
 * came from different sources with no consistency check between them.
 *
 * This module is that check. It is PURE and DETERMINISTIC (no I/O, no model
 * calls) so it can run both server-side (post-generation, to trigger a
 * corrective retry) and client-side (pre-export, to block a wrong-company deck).
 *
 * It deliberately errs toward NOT blocking: a hard block fires only on
 * high-confidence bleed (the deal's own parties are essentially absent from the
 * narrative AND a different company dominates it). Softer issues — a synergy
 * figure rendered into the EV slot, mixed headline currencies — are returned as
 * non-blocking warnings.
 */

export interface CoherenceMeta {
  buyer: string;
  target: string;
  sector?: string;
  geography?: string;
}

export type CoherenceKind = "entity" | "numeric" | "currency";

export interface CoherenceViolation {
  kind: CoherenceKind;
  severity: "block" | "warn";
  /** User-facing, actionable, free of raw model internals. */
  message: string;
}

export interface CoherenceResult {
  ok: boolean;
  /** True when at least one `severity: "block"` violation is present. */
  blocking: boolean;
  violations: CoherenceViolation[];
  /** Proper-noun entities that dominate the narrative (diagnostic). */
  dominantEntities: string[];
}

// Generic tokens that carry no identifying signal for a company name. A name is
// matched on its *distinctive* tokens (everything here removed).
const GENERIC_NAME_TOKENS = new Set([
  "the", "and", "of", "for", "a", "an",
  "inc", "incorporated", "ltd", "limited", "plc", "llc", "llp", "lp",
  "gmbh", "ag", "sa", "sas", "sarl", "bv", "nv", "co", "corp", "corporation",
  "company", "group", "holdings", "holding", "partners", "capital",
  "services", "service", "solutions", "systems", "technologies", "technology",
  "international", "global", "india", "deutschland", "uk", "usa", "europe",
]);

// Section/label vocabulary that appears capitalised in decks but is not a
// company. Prevents false "alien entity" hits on deck furniture.
const DECK_VOCAB = new Set([
  "deal", "iq", "ai", "confidential", "executive", "summary", "verdict",
  "recommendation", "conditional", "go", "risk", "register", "synergy", "model",
  "scenario", "analysis", "valuation", "thesis", "strategic", "financial",
  "operational", "integration", "governance", "regulatory", "market", "context",
  "year", "day", "phase", "revenue", "cost", "net", "run", "rate", "base",
  "upside", "downside", "conditions", "kill", "switches", "immediate", "steps",
  "investment", "committee", "questions", "prepared", "july", "june", "confidence",
  "enterprise", "value", "ebitda", "irr", "npv", "wacc", "mitigation", "probability",
  "impact", "type", "owner", "cfo", "cio", "chro", "cco", "coo", "imo", "ceo",
  "board", "target", "buyer", "acquirer", "seller", "workstream", "workstreams",
  "western", "eastern", "southern", "northern", "form", "phase",
]);

function distinctiveTokens(name: string): string[] {
  return (name || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !GENERIC_NAME_TOKENS.has(t));
}

/** The brand-anchor token of a name (first distinctive token, e.g. "volvo"). */
function brandToken(name: string): string {
  return distinctiveTokens(name)[0] ?? "";
}

/** Count non-overlapping, word-boundary occurrences of `token` in `hay`. */
function countToken(hay: string, token: string): number {
  if (!token) return 0;
  const re = new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
  return (hay.match(re) ?? []).length;
}

/** How many times any distinctive token of `name` appears in the narrative. */
function nameHits(hay: string, name: string): number {
  return distinctiveTokens(name).reduce((sum, t) => sum + countToken(hay, t), 0);
}

/**
 * Extract capitalised multi-word proper nouns (candidate company names) and
 * count their frequency, excluding the deal's own parties, sector/geography,
 * and deck vocabulary.
 */
function dominantAlienEntities(
  md: string,
  meta: CoherenceMeta,
): { name: string; count: number }[] {
  const ownTokens = new Set<string>([
    ...distinctiveTokens(meta.buyer),
    ...distinctiveTokens(meta.target),
    ...distinctiveTokens(meta.sector ?? ""),
    ...distinctiveTokens(meta.geography ?? ""),
  ]);

  const counts = new Map<string, number>();

  // Sequences of 2+ capitalised words (e.g. "Shashi Catering Services").
  const multi = /\b([A-Z][a-zA-Z]+(?:\s+(?:[A-Z][a-zA-Z]+|&|and)){1,4})\b/g;
  for (const m of md.matchAll(multi)) {
    const phrase = m[1].replace(/\s+(and)\s+/gi, " ").trim();
    const toks = phrase.toLowerCase().split(/\s+/).filter((t) => t.length >= 3);
    // Drop if every token is deck vocabulary, or it overlaps the deal parties.
    const allVocab = toks.every((t) => DECK_VOCAB.has(t));
    const overlapsOwn = toks.some((t) => ownTokens.has(t));
    const distinctive = toks.filter((t) => !DECK_VOCAB.has(t) && !GENERIC_NAME_TOKENS.has(t));
    if (allVocab || overlapsOwn || distinctive.length === 0) continue;
    counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
  }

  // Single-word proper nouns repeated heavily (e.g. "Sodexo") — the multi-word
  // pass misses these but they are the strongest bleed signal.
  const single = new Map<string, number>();
  for (const m of md.matchAll(/\b([A-Z][a-z]{3,})\b/g)) {
    const w = m[1];
    const lw = w.toLowerCase();
    if (DECK_VOCAB.has(lw) || GENERIC_NAME_TOKENS.has(lw) || ownTokens.has(lw)) continue;
    single.set(w, (single.get(w) ?? 0) + 1);
  }
  for (const [w, n] of single) {
    if (n >= 5) counts.set(w, Math.max(counts.get(w) ?? 0, n));
  }

  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .filter((e) => e.count >= 3)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

// ---- numeric / currency helpers (headline figures only) --------------------

function parseMoneyToken(s: string): { value: number; currency: string } | null {
  const m = /([₹$€£])\s?([\d.,]+)\s*([BMK])?/i.exec(s);
  if (!m) return null;
  let v = parseFloat(m[2].replace(/,/g, ""));
  const u = (m[3] || "M").toUpperCase();
  if (u === "B") v *= 1000;
  else if (u === "K") v /= 1000;
  return { value: Math.round(v * 100) / 100, currency: m[1] };
}

function findHeadline(md: string, re: RegExp): string | null {
  const m = re.exec(md);
  return m ? m[1].replace(/\s+/g, "") : null;
}

/**
 * Analyse a generated proposal against the deal record it claims to describe.
 */
export function analyzeProposalCoherence(md: string, meta: CoherenceMeta): CoherenceResult {
  const violations: CoherenceViolation[] = [];
  const text = md || "";

  // ---- 1. ENTITY COHERENCE (the release-blocker) -------------------------
  // Presence is judged on the BRAND anchor ("volvo", "eicher") to avoid false
  // positives from generic tokens like "financial" that recur in sector prose.
  const buyerHits = countToken(text, brandToken(meta.buyer));
  const targetHits = countToken(text, brandToken(meta.target));
  // Full-name hits (all distinctive tokens) drive the dominance-margin test.
  const buyerFull = nameHits(text, meta.buyer);
  const targetFull = nameHits(text, meta.target);
  const alien = dominantAlienEntities(text, meta);
  const top = alien[0];
  const dominantEntities = alien.map((a) => a.name);

  const buyerNamed = !meta.buyer || buyerHits > 0;
  const targetNamed = !meta.target || targetHits > 0;
  const partiesAbsent =
    (!!meta.buyer && buyerHits === 0) && (!!meta.target && targetHits === 0);
  // A different company clearly dominates the narrative over the deal's parties.
  const alienDominates = !!top && top.count >= 4 && top.count > buyerFull + targetFull;

  if ((partiesAbsent && !!top) || alienDominates) {
    // High confidence: the narrative is about a different transaction than the
    // deal record on the cover — the Eicher/Sodexo bleed. Block the export.
    violations.push({
      kind: "entity",
      severity: "block",
      message:
        `The generated narrative is about "${top!.name}", not this deal ` +
        `(${meta.buyer} → ${meta.target}). Regenerate before exporting — do not send this deck.`,
    });
  } else if (!buyerNamed || !targetNamed) {
    // One party missing: strong warning, not an automatic block.
    const missing = [!buyerNamed ? meta.buyer : null, !targetNamed ? meta.target : null]
      .filter(Boolean)
      .join(" and ");
    violations.push({
      kind: "entity",
      severity: "warn",
      message: `The narrative never names ${missing}. Confirm the deck is about the intended parties.`,
    });
  }

  // ---- 2. NUMERIC COHERENCE (EV vs synergy field-mapping bug) -------------
  const evRaw = findHeadline(text, /enterprise\s+value[^₹$€£\d]*([₹$€£]\s?[\d.,]+\s*[BMK])/i);
  const synRaw = findHeadline(
    text,
    /net\s+(?:run[-\s]?rate\s+)?synergy[^₹$€£\d]*([₹$€£]\s?[\d.,]+\s*[BMK])/i,
  );
  if (evRaw && synRaw) {
    const ev = parseMoneyToken(evRaw);
    const syn = parseMoneyToken(synRaw);
    if (ev && syn && ev.value === syn.value && ev.currency === syn.currency) {
      violations.push({
        kind: "numeric",
        severity: "warn",
        message:
          "Enterprise Value equals the net-synergy figure — the synergy number is likely rendered " +
          "in the EV slot. Verify EV on the cover before sending.",
      });
    }
  }

  // ---- 3. CURRENCY CONSISTENCY (headline figures) ------------------------
  const symbols = new Set((text.match(/[₹$€£]/g) ?? []));
  if (symbols.size > 1) {
    violations.push({
      kind: "currency",
      severity: "warn",
      message:
        `Headline figures mix currencies (${[...symbols].join(" ")}). ` +
        "Report the whole deck in the deal's primary currency.",
    });
  }

  const blocking = violations.some((v) => v.severity === "block");
  return { ok: violations.length === 0, blocking, violations, dominantEntities };
}

/**
 * Pre-export guard. Throws a user-facing error when a blocking (high-confidence
 * entity-bleed) violation is present, so a wrong-company deck is never written.
 */
export function assertProposalCoherence(md: string, meta: CoherenceMeta): CoherenceResult {
  const result = analyzeProposalCoherence(md, meta);
  if (result.blocking) {
    const first = result.violations.find((v) => v.severity === "block");
    throw new Error(`Deck blocked — coherence check failed. ${first?.message ?? ""}`);
  }
  return result;
}
