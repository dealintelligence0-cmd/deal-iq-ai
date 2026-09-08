// src/lib/ingestion/ai-usefulness.ts
//
// PHASE 7E — skip the ingestion AI call when it provably cannot change the outcome.
//
// WHY THIS IS DIFFERENT FROM A HEURISTIC
// Ingestion is already deterministic-first: runAIFallback() fires only for rows whose
// row_confidence lands inside the band [0.40, 0.70). But the band measures CONFIDENCE,
// not COMPLETENESS, and those are not the same thing. A row can sit in the band because
// several fields were extracted with weak evidence, while still having a value for
// every field.
//
// That matters because of how the merge is written. Every field in runAIFallback() is
// merged as:
//
//     if (!merged.<field>.value && payload.<field>) { ...take the AI value... }
//
// The AI can only ever FILL AN EMPTY FIELD — it never overwrites one that already has a
// value. So when none of the mergeable fields is empty, every branch is skipped and the
// call cannot alter a single extracted value. What remains is cosmetic: row_confidence
// is recomputed from field confidences that did not change, uncertainty_reasons is
// rebuilt from the same values, and " + ai_fallback" is appended to parse_path.
//
// This is therefore not a quality/cost trade-off. The skipped call is a provable no-op,
// so there is nothing to trade.
//
// ON is_digest
// runAIFallback can also flip is_digest false → true. That is not a loss here: the
// extraction prompt defines a digest as a multi-deal article that "leaves entity fields
// null", and this gate only skips when EVERY entity field — buyer and target included —
// already resolved. A row with a confidently extracted buyer and target is not the
// shape a digest takes, so the flip is not available on the rows this skips anyway.

import type { ExtractionResult, FieldEvidence } from "./types";

// Exactly the fields runAIFallback() is capable of merging, in the order it merges them.
// If this list and that merge block ever diverge, the gate becomes wrong — so they are
// documented as a pair, and the test asserts the list matches the merge block.
export const AI_FILLABLE_FIELDS = [
  "buyer",
  "target",
  "vendor",
  "dominant_sector",
  "dominant_geography",
  "intelligence_size",
  "stake_value",
  "deal_type",
  "deal_status",
] as const;

export type AiUsefulness = {
  /** True when at least one mergeable field is empty, so the call can still add something. */
  useful: boolean;
  /** Which fields the AI could actually fill. Empty when the call would be a no-op. */
  fillable: string[];
};

/**
 * Could an AI fallback call change anything about this row?
 *
 * Returns useful:false only when every mergeable field already holds a value, which is
 * precisely the condition under which every merge branch in runAIFallback() is skipped.
 */
export function assessAiUsefulness(result: ExtractionResult): AiUsefulness {
  const fillable: string[] = [];
  for (const field of AI_FILLABLE_FIELDS) {
    const evidence = result[field as keyof ExtractionResult] as FieldEvidence | undefined;
    // A field counts as empty when it has no value at all. Whitespace-only is treated as
    // empty too: the merge would not fire on it, but it is not a real extraction either,
    // so calling the AI for it is legitimate rather than wasted.
    const value = evidence?.value;
    if (!value || !String(value).trim()) fillable.push(field);
  }
  return { useful: fillable.length > 0, fillable };
}
