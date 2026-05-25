

/**
 * TSA cognition extractor (Phase 3).
 *
 * Reads the markdown TSA framework the AI produces and pulls:
 *   - tsa.total_duration_months (the planned TSA length)
 *   - tsa.total_budget_k       (total TSA cost in $K, USD)
 *
 * Markdown stays primary. This is a side-effect extraction — failures are silent.
 */

export type TsaSidecar = {
  total_duration_months: number | null;
  total_budget_k: number | null;
  function_count: number | null;
};

const MONTHS_RE = /([0-9]+(?:\.[0-9]+)?)\s?months?/i;
const BUDGET_RE = /(?:total|grand\s+total|tsa\s+total)[\s\S]{0,80}?(?:US\$|USD|\$)\s?([0-9,]+(?:\.[0-9]+)?)\s?K/i;

export function extractTsaSidecar(markdown: string, requestedDuration?: string, functionCount?: number): TsaSidecar {
  let total_duration_months: number | null = null;

  // Prefer the user-requested duration (highest fidelity)
  if (requestedDuration) {
    const n = parseFloat(requestedDuration);
    if (isFinite(n)) total_duration_months = n;
  }

  // Fall back to first months mention in the markdown if not provided
  if (total_duration_months === null) {
    const m = markdown.match(MONTHS_RE);
    if (m) {
      const n = parseFloat(m[1]);
      if (isFinite(n)) total_duration_months = n;
    }
  }

  // Total budget — look for "Total $XXXK" pattern
  let total_budget_k: number | null = null;
  const budgetMatch = markdown.match(BUDGET_RE);
  if (budgetMatch) {
    const cleaned = budgetMatch[1].replace(/,/g, "");
    const n = parseFloat(cleaned);
    if (isFinite(n)) total_budget_k = n;
  }

  return {
    total_duration_months,
    total_budget_k,
    function_count: functionCount ?? null,
  };
}
