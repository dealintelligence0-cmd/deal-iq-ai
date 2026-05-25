

/**
 * Synergy markdown -> structured sidecar extractor.
 *
 * The Synergy AI route returns markdown (preserved untouched).
 * This module post-processes that markdown to extract 4 numeric values
 * that other modules (PMI, TSA, Valuation) might want to read via cognition.
 *
 * Why deterministic instead of asking the AI for JSON:
 *  - Zero extra tokens
 *  - Failure here is silent and recoverable (fields just stay null)
 *  - Markdown remains the canonical, human-readable output
 *
 * Extraction strategy:
 *  - Look for explicit dollar values labelled with synergy keywords
 *  - Fall back to range midpoints
 *  - Confidence scoring based on how many fields we successfully extracted
 */

export type SynergySidecar = {
  cost_run_rate_m: number | null;
  revenue_run_rate_m: number | null;
  total_run_rate_m: number | null;
  payback_months: number | null;
  confidence: number;          // 0..1 — proportion of fields we extracted
  extracted_at: string;
};

// Match patterns like "$24M", "$24 million", "USD 24M", "$24.5M", "INR 200 Cr"
const MONEY_RE = /(?:US\$|USD|\$|INR|₹)\s?([0-9]+(?:\.[0-9]+)?)\s?(?:M|million|Cr|crore|bn|billion)?/i;

function findFirstMoney(text: string, anchorRegex: RegExp): number | null {
  const match = text.match(anchorRegex);
  if (!match) return null;
  // Search ±200 chars around the anchor for the first money value
  const start = Math.max(0, match.index! - 50);
  const end = Math.min(text.length, match.index! + match[0].length + 200);
  const window = text.slice(start, end);
  const m = window.match(MONEY_RE);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return isFinite(n) ? n : null;
}

function findFirstMonths(text: string, anchorRegex: RegExp): number | null {
  const match = text.match(anchorRegex);
  if (!match) return null;
  const start = Math.max(0, match.index! - 50);
  const end = Math.min(text.length, match.index! + match[0].length + 200);
  const window = text.slice(start, end);
  // Match patterns like "18 months", "1.5 years"
  const monthsMatch = window.match(/([0-9]+(?:\.[0-9]+)?)\s?months?/i);
  if (monthsMatch) {
    const n = parseFloat(monthsMatch[1]);
    return isFinite(n) ? n : null;
  }
  const yearsMatch = window.match(/([0-9]+(?:\.[0-9]+)?)\s?years?/i);
  if (yearsMatch) {
    const n = parseFloat(yearsMatch[1]);
    return isFinite(n) ? Math.round(n * 12) : null;
  }
  return null;
}

export function extractSynergySidecar(markdown: string): SynergySidecar {
  const text = markdown.toLowerCase();

  // Run-rate anchors — try multiple phrasings
  const costAnchors = [
    /total\s+cost\s+synerg(?:y|ies)/i,
    /cost\s+synerg(?:y|ies)\s+(?:run[- ]?rate|run[- ]?rate)/i,
    /run[- ]?rate\s+cost/i,
    /cost\s+efficiency/i,
  ];
  const revAnchors = [
    /total\s+revenue\s+synerg(?:y|ies)/i,
    /revenue\s+synerg(?:y|ies)\s+(?:run[- ]?rate|run[- ]?rate)/i,
    /run[- ]?rate\s+revenue/i,
    /cross[- ]?sell/i,
  ];
  const totalAnchors = [
    /total\s+synerg(?:y|ies)/i,
    /combined\s+synerg(?:y|ies)/i,
    /total\s+run[- ]?rate/i,
  ];
  const paybackAnchors = [
    /payback\s+period/i,
    /payback/i,
    /break[- ]?even/i,
  ];

  const cost_run_rate_m = costAnchors.map((a) => findFirstMoney(text, a)).find((v) => v !== null) ?? null;
  const revenue_run_rate_m = revAnchors.map((a) => findFirstMoney(text, a)).find((v) => v !== null) ?? null;
  const total_explicit = totalAnchors.map((a) => findFirstMoney(text, a)).find((v) => v !== null) ?? null;
  const total_run_rate_m = total_explicit ?? (
    cost_run_rate_m !== null && revenue_run_rate_m !== null
      ? cost_run_rate_m + revenue_run_rate_m
      : null
  );
  const payback_months = paybackAnchors.map((a) => findFirstMonths(text, a)).find((v) => v !== null) ?? null;

  // Confidence = fraction of 4 fields we extracted
  const extracted = [cost_run_rate_m, revenue_run_rate_m, total_run_rate_m, payback_months].filter((v) => v !== null).length;
  const confidence = extracted / 4;

  return {
    cost_run_rate_m,
    revenue_run_rate_m,
    total_run_rate_m,
    payback_months,
    confidence: Math.round(confidence * 100) / 100,
    extracted_at: new Date().toISOString(),
  };
}
