

// Intelligent Deal Identification (Triage Matrix)
// Filters noise so we only send high-probability targets to expensive LLMs

export interface TriageScore {
  score: number; // 0-100
  decision: 'PURSUE' | 'HOLD' | 'REJECT';
  reasons: string[];
}

export function evaluateDealPreLLM(dealData: {
  revenue_mm?: number;
  ebitda_margin?: number;
  sector?: string;
  description?: string;
}): TriageScore {
  let score = 0;
  const reasons: string[] = [];

  // 1. Size / Revenue Guardrails (Big4 target sizing)
  if (dealData.revenue_mm) {
    if (dealData.revenue_mm > 500) {
      score += 40;
      reasons.push("Strong Revenue Profile (>$500M)");
    } else if (dealData.revenue_mm > 100) {
      score += 25;
      reasons.push("Acceptable Revenue Profile ($100M-$500M)");
    } else {
      reasons.push("Warning: Sub-scale target (<$100M)");
    }
  }

  // 2. Sector Attractiveness
  const hotSectors = ['technology', 'healthcare', 'life sciences', 'fintech'];
  if (dealData.sector && hotSectors.some(s => dealData.sector?.toLowerCase().includes(s))) {
    score += 30;
    reasons.push("High-priority target sector");
  }

  // 3. Strategic Keywords Check
  const triggerWords = ['distressed', 'carve-out', 'spin-off', 'restructuring', 'synergy'];
  if (dealData.description && triggerWords.some(w => dealData.description?.toLowerCase().includes(w))) {
    score += 30;
    reasons.push("Contains strategic trigger events in description");
  }

  // Final Decision Matrix
  let decision: 'PURSUE' | 'HOLD' | 'REJECT' = 'REJECT';
  if (score >= 70) decision = 'PURSUE';
  else if (score >= 40) decision = 'HOLD';

  return { score, decision, reasons };
}
