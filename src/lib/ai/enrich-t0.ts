// src/lib/ai/enrich-t0.ts
//
// PHASE 7D — eliminate the enrichment cloud call when deterministic logic already
// has the answer.
//
// WHY HERE
// /api/ai/enrich makes ONE cloud call PER DEAL and is the highest-volume AI path in
// the app. Telemetry named it the Phase 7D baseline. It is also the path where the
// cloud most often adds nothing: when a row already carries a recognised deal type, a
// recognised status, a sector and a normalised value, the model is being asked to
// restate fields that are already canonical.
//
// WHY NOT ON-DEVICE AI HERE
// Enrichment writes priority_score, advisory_score and risk_flag. `risk-scoring` and
// `canonical-number-generation` are on the FORBIDDEN list in on-device-policy.ts, so
// browser AI may not produce these values — not "should not", may not. That leaves
// deterministic logic as the only lawful way to avoid this call, which is also the
// stronger option: it needs no browser support, so the saving applies to every user on
// every device rather than only to those running a Chrome build with built-in AI.
//
// THE RULE
// T0 answers only when every field the cloud would classify is ALREADY canonical, so
// the cloud's structured output would match what the rules produce. When anything is
// missing or unrecognised — a free-text deal type, an unknown status, a missing sector
// or value, a name that still needs cleaning — the cloud call runs exactly as before.
//
// What is genuinely lost on the T0 path is prose polish in ai_summary. That is why the
// gate demands complete inputs: the summary is then a factual restatement of known
// fields rather than an inference, and nothing is invented.

import type { EnrichmentInput, EnrichmentOutput } from "@/lib/ai/enrichment";

// Mirrors the vocabularies the cloud prompt itself is constrained to. A value already
// inside these sets cannot be "improved" by asking the model to pick from the same list.
const KNOWN_DEAL_TYPES = new Set([
  "M&A", "PE Buyout", "Venture", "Debt Financing",
  "IPO", "JV", "Merger", "Divestiture", "Asset Sale",
]);

const KNOWN_STATUSES = new Set(["live", "rumor", "announced", "closed", "dropped"]);

export type T0Assessment = {
  sufficient: boolean;
  /** Why the cloud is still needed. Empty when sufficient. */
  gaps: string[];
};

/**
 * Does this name still need AI cleaning?
 *
 * Deliberately conservative: anything that looks even slightly irregular sends the deal
 * to the cloud. A false "needs cleaning" costs one call we would have made anyway; a
 * false "already clean" would leave messy text in a partner-facing field.
 */
function needsCleaning(name: string | null): boolean {
  if (!name) return true;
  const n = name.trim();
  if (!n || n.length > 80) return true;
  if (/\s{2,}/.test(n)) return true;                       // collapsed whitespace damage
  if (/[;|]|\.{2,}|…/.test(n)) return true;                // concatenation / truncation marks
  if (/\b(n\/?a|unknown|tbd|undisclosed)\b/i.test(n)) return true;
  if (/^[^a-zA-Z]*$/.test(n)) return true;                 // no letters at all
  if (n === n.toUpperCase() && n.length > 12) return true; // shouty raw import text
  return false;
}

/**
 * Can deterministic logic fully answer this enrichment?
 *
 * Every condition below is about the INPUT being already canonical, never about the
 * output being "good enough" — the gate must not trade quality for a saved call.
 */
export function assessEnrichmentT0(d: EnrichmentInput): T0Assessment {
  const gaps: string[] = [];

  if (needsCleaning(d.buyer)) gaps.push("buyer name needs normalisation");
  if (needsCleaning(d.target)) gaps.push("target name needs normalisation");
  if (!d.deal_type || !KNOWN_DEAL_TYPES.has(d.deal_type)) gaps.push("deal type not already classified");
  if (!d.status || !KNOWN_STATUSES.has(d.status)) gaps.push("status not already classified");
  // Both scores are functions of sector and size. Without them the deterministic score
  // is a guess, and a guessed score is exactly what must not be written silently.
  if (!d.sector) gaps.push("sector missing — scores would be guessed");
  if (d.normalized_value_usd === null || d.normalized_value_usd === undefined || d.normalized_value_usd <= 0) {
    gaps.push("deal value missing — scores would be guessed");
  }

  return { sufficient: gaps.length === 0, gaps };
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/**
 * Deterministic enrichment for a row that passed the gate.
 *
 * Scoring intentionally uses the SAME thresholds as the existing rule-based fallback in
 * enrichment.ts, so a deal scored on this path is directly comparable with one scored on
 * the fallback path — the number does not depend on which route produced it.
 */
export function deriveEnrichmentT0(d: EnrichmentInput): EnrichmentOutput {
  const size = d.normalized_value_usd ?? 0;
  const priority = size >= 5e9 ? 9 : size >= 1e9 ? 7 : size >= 1e8 ? 5 : 3;
  const advisory =
    (["Technology", "Healthcare", "Financial Services"].includes(d.sector ?? "") ? 2 : 0) +
    (size >= 1e9 ? 6 : size >= 1e8 ? 4 : 2);
  const risk = size >= 5e9 ? "high" : size >= 5e8 ? "medium" : "low";

  // A factual restatement of fields that are already known. It states no inference and
  // makes no claim about how it was produced — every clause is a value from the row.
  const parts = [
    `${d.buyer} / ${d.target}`,
    d.deal_type,
    d.sector,
    d.country,
    size >= 1e9 ? `$${(size / 1e9).toFixed(1)}B` : `$${Math.round(size / 1e6)}M`,
    d.stake_percent ? `${d.stake_percent}% stake` : null,
  ].filter(Boolean);

  return {
    id: d.id,
    clean_buyer: (d.buyer ?? "").trim(),
    clean_target: (d.target ?? "").trim(),
    classified_deal_type: d.deal_type ?? "M&A",
    priority_score: priority,
    advisory_score: clamp(advisory, 1, 10),
    risk_flag: risk,
    deal_status: d.status ?? "announced",
    ai_summary: `${parts.join(" · ")}.`,
    // Deliberately NOT 1.0. These are known inputs restated by rule, which is reliable
    // for the structured fields but carries none of the judgement a model would add.
    confidence: 0.7,
    rationale: "Deterministic: all classification fields already canonical; scores from size and sector.",
    synergy_drivers: [],
    risks: [],
    comparable_deals: [],
  };
}
