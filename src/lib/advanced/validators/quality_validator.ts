

export type QualityScore = {
  score: number;
  numericDensity: number;
  repeatedPhrasePenalty: number;
  missingOwnerPenalty: number;
  missingJurisdictionPenalty: number;
  genericLanguagePenalty: number;
};

export function evaluateProposalQuality(content: string): QualityScore {
  const sections = content.split(/^##\s+/m).filter(Boolean);
  const numMatches = (content.match(/\$?\d+[\d.,]*%?/g) ?? []).length;
  const numericDensity = sections.length ? numMatches / sections.length : 0;

  const repeatedPatterns = ["the deal", "is expected to", "strategic rationale"];
  const repeatedPhrasePenalty = repeatedPatterns.reduce((acc, phrase) => {
    const count = (content.toLowerCase().match(new RegExp(phrase, "g")) ?? []).length;
    return acc + Math.max(0, count - 6);
  }, 0);

  const ownerCount = (content.match(/owner\s*:/gi) ?? []).length;
  const riskCount = (content.match(/risk/gi) ?? []).length;
  const missingOwnerPenalty = riskCount > 0 && ownerCount === 0 ? 15 : 0;

  const hasJurisdiction = /HSR|EU Merger|CCI|CMA|DOJ|FTC|jurisdiction/i.test(content);
  const missingJurisdictionPenalty = hasJurisdiction ? 0 : 10;
  const bannedHits = (content.match(/best-in-class|robust framework|robust pipeline|world-class|seamless integration|leverage operational efficiencies|leverage the strengths|leveraging the strengths|leveraging the capabilities|industry-leading|unlock potential|cost savings opportunity|drive growth and expansion/gi) ?? []).length;
  const genericLanguagePenalty = Math.min(20, bannedHits * 4);

  let score = 100;
  if (numericDensity < 2) score -= 20;
  score -= repeatedPhrasePenalty;
  score -= missingOwnerPenalty;
  score -= missingJurisdictionPenalty;
  score -= genericLanguagePenalty;

  return { score: Math.max(0, Math.min(100, score)), numericDensity, repeatedPhrasePenalty, missingOwnerPenalty, missingJurisdictionPenalty, genericLanguagePenalty };
}

export type QualitySummary = {
  score: number;
  passesBar: boolean;
  weakest: string;        // named dimension dragging the score down most
  dimensions: Record<string, number>;
};

/**
 * Turn the raw penalties into a partner-legible scorecard: pass/fail against a
 * ship bar and the single weakest dimension to fix. Makes the rubric a gate
 * with a named failure mode, not an opaque number.
 */
export function summarizeQuality(content: string, bar = 70): QualitySummary {
  const q = evaluateProposalQuality(content);
  const dimensions: Record<string, number> = {
    "Evidence density": q.numericDensity < 2 ? 20 : 0,
    "Language discipline": q.genericLanguagePenalty,
    "Risk ownership": q.missingOwnerPenalty,
    "Regulatory specificity": q.missingJurisdictionPenalty,
    "Non-repetition": q.repeatedPhrasePenalty,
  };
  let weakest = "none";
  let worst = 0;
  for (const [dim, penalty] of Object.entries(dimensions)) {
    if (penalty > worst) { worst = penalty; weakest = dim; }
  }
  return { score: q.score, passesBar: q.score >= bar, weakest, dimensions };
}
