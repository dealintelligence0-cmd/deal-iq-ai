

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
  const genericLanguagePenalty = /best-in-class|robust framework|world-class|seamless integration/gi.test(content) ? 10 : 0;

  let score = 100;
  if (numericDensity < 2) score -= 20;
  score -= repeatedPhrasePenalty;
  score -= missingOwnerPenalty;
  score -= missingJurisdictionPenalty;
  score -= genericLanguagePenalty;

  return { score: Math.max(0, Math.min(100, score)), numericDensity, repeatedPhrasePenalty, missingOwnerPenalty, missingJurisdictionPenalty, genericLanguagePenalty };
}
