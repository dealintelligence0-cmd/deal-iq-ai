/**
 * Deal IQ AI — Ingestion v2 — few-shot retrieval.
 *
 * Pulls 3-5 most recent relevant correction examples that match the
 * current row's intent tags. These are injected into the AI fallback prompt
 * so corrections compound over time without any fine-tuning.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type CorrectionExample = {
  heading: string;
  opportunity: string | null;
  structured_fields: Record<string, unknown>;
  bad_extraction: Record<string, unknown> | null;
  good_extraction: Record<string, unknown>;
  intent_tags: string[];
};

const MAX_EXAMPLES = 5;

/**
 * Retrieve the most relevant + most recent correction examples.
 *
 * Strategy:
 *   1. Pull the 30 most recent corrections that share AT LEAST ONE intent tag.
 *   2. Rank by tag-overlap, break ties by recency.
 *   3. Return top 5.
 *
 * If no tagged matches, returns the 3 most recent corrections overall as
 * generic-style examples.
 */
export async function getFewShotExamples(
  sb: SupabaseClient,
  intentTags: string[]
): Promise<CorrectionExample[]> {
  if (intentTags.length === 0) {
    const { data } = await sb
      .from("correction_examples")
      .select("heading,opportunity,structured_fields,bad_extraction,good_extraction,intent_tags")
      .order("created_at", { ascending: false })
      .limit(3);
    return (data ?? []) as CorrectionExample[];
  }

  // Postgres array-overlap (`&&`) match via .overlaps()
  const { data } = await sb
    .from("correction_examples")
    .select("heading,opportunity,structured_fields,bad_extraction,good_extraction,intent_tags")
    .overlaps("intent_tags", intentTags)
    .order("created_at", { ascending: false })
    .limit(30);

  if (!data || data.length === 0) {
    // Fall back to recent non-tagged
    const { data: recent } = await sb
      .from("correction_examples")
      .select("heading,opportunity,structured_fields,bad_extraction,good_extraction,intent_tags")
      .order("created_at", { ascending: false })
      .limit(3);
    return (recent ?? []) as CorrectionExample[];
  }

  // Rank by tag overlap count
  const scored = (data as CorrectionExample[]).map((ex) => {
    const overlap = ex.intent_tags.filter((t) => intentTags.includes(t)).length;
    return { ex, overlap };
  });
  scored.sort((a, b) => b.overlap - a.overlap);

  return scored.slice(0, MAX_EXAMPLES).map((s) => s.ex);
}

/**
 * Format examples as a structured block for inclusion in the AI prompt.
 */
export function formatExamplesForPrompt(examples: CorrectionExample[]): string {
  if (examples.length === 0) return "";
  const blocks = examples.map((ex, i) => {
    const struct = JSON.stringify(ex.structured_fields, null, 0);
    const bad = ex.bad_extraction ? JSON.stringify(ex.bad_extraction, null, 0) : "null";
    const good = JSON.stringify(ex.good_extraction, null, 0);
    return [
      `EXAMPLE ${i + 1}:`,
      `  heading: ${ex.heading}`,
      `  opportunity: ${(ex.opportunity ?? "").slice(0, 240)}`,
      `  structured: ${struct.slice(0, 320)}`,
      `  WRONG_extraction: ${bad}`,
      `  CORRECT_extraction: ${good}`,
    ].join("\n");
  });
  return [
    "PRIOR CORRECTIONS (use the CORRECT_extraction pattern when similar):",
    "",
    ...blocks,
    "",
    "End of prior corrections.",
  ].join("\n");
}
