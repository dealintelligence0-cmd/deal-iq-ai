/**
 * Deal IQ AI — Ingestion v2 — router.
 *
 * Takes an ExtractionResult and decides what lane it goes into:
 *
 *   digest     →  digest_records (separate searchable lane, never reaches proposals)
 *   canonical  →  canonical_deals (auto-flows to existing `deals` via trigger,
 *                 reaches downstream proposal/PMI/TSA/synergy modules)
 *   resolution →  resolution_tasks (backend exception queue; canonical_deals
 *                 entry is created with needs_review=true so it WON'T flow downstream
 *                 until corrected — see the mirror_canonical_to_deals trigger)
 */

import { type ExtractionResult, type RouterDecision, CONFIDENCE } from "./types";

export function routeRow(r: ExtractionResult): RouterDecision {
  if (r.is_digest) return { kind: "digest", result: r };

  // Hard rules — these go straight to resolution regardless of aggregate score:
  if (!r.buyer.value && !r.target.value) {
    return { kind: "resolution", result: { ...r, needs_review: true } };
  }

  if (r.row_confidence >= CONFIDENCE.AUTO_CANONICAL && r.uncertainty_reasons.length === 0) {
    return { kind: "canonical", result: r };
  }

  // Edge case: high aggregate confidence but with one or two minor unknowns
  // (e.g. unresolved deal_type). Still canonical, but flag for soft review.
  if (r.row_confidence >= CONFIDENCE.AUTO_CANONICAL && r.uncertainty_reasons.length <= 2) {
    const minor = r.uncertainty_reasons.every((u) =>
      u.includes("deal_type") || u.includes("deal_status") || u.includes("stake")
    );
    if (minor) return { kind: "canonical", result: r };
  }

  return { kind: "resolution", result: { ...r, needs_review: true } };
}
