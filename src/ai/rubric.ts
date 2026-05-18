

/**
 * Provider-neutral model rubric.
 *
 * Scores every model the user has configured against weighted criteria.
 * No vendor is preferred or hardcoded. The user can edit weights in Settings → AI → Rubric.
 *
 * Default weights are balanced: cost, quality, latency, context size, and capability flags
 * are each treated as comparable inputs. The user can move a slider toward any one of them
 * and the recommendation moves accordingly.
 */

import { MODEL_COSTS, lookupCost, type ModelCost } from "./cost-estimator";

export type RubricWeights = {
  cost: number;        // higher weight → cheaper models score higher
  quality: number;     // higher weight → frontier models score higher
  latency: number;     // higher weight → fast models score higher
  context: number;     // higher weight → larger context wins
  caching: number;     // higher weight → models with cached-input discount win
};

export const DEFAULT_WEIGHTS_BY_MODULE: Record<string, RubricWeights> = {
  proposal: { cost: 0.20, quality: 0.40, latency: 0.10, context: 0.20, caching: 0.10 },
  pmi:      { cost: 0.30, quality: 0.30, latency: 0.10, context: 0.10, caching: 0.20 },
  synergy:  { cost: 0.25, quality: 0.35, latency: 0.10, context: 0.15, caching: 0.15 },
  tsa:      { cost: 0.30, quality: 0.30, latency: 0.10, context: 0.15, caching: 0.15 },
  insights: { cost: 0.40, quality: 0.20, latency: 0.30, context: 0.05, caching: 0.05 },
  research: { cost: 0.40, quality: 0.20, latency: 0.30, context: 0.05, caching: 0.05 },
};

function normalize01(value: number, min: number, max: number): number {
  if (max <= min) return 0.5;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

export type ScoredModel = {
  modelId: string;
  provider: string;
  totalScore: number;
  components: {
    cost: number; quality: number; latency: number; context: number; caching: number;
  };
  cost: ModelCost;
  why: string;
};

/**
 * Score every available model against the rubric.
 * `availableModels` is the set the user has keys for (or self-hosted endpoints they've configured).
 */
export function scoreModels(
  availableModels: Array<{ provider: string; modelId: string }>,
  weights: RubricWeights,
  userOverrides?: Record<string, Partial<ModelCost>>,
): ScoredModel[] {
  if (availableModels.length === 0) return [];

  const enriched = availableModels.map((m) => ({ ...m, cost: lookupCost(m.provider, m.modelId, userOverrides) }));

  // Per-criterion min/max across the set (so scoring is relative to what the user has)
  const inputCosts = enriched.map((e) => e.cost.input);
  const outputCosts = enriched.map((e) => e.cost.output);
  const blendedCosts = enriched.map((e) => e.cost.input * 0.3 + e.cost.output * 0.7); // typical LLM call shape
  const qualities = enriched.map((e) => e.cost.qualityTier ?? 3);
  const latencies = enriched.map((e) => e.cost.latencyTier ?? 2);
  const contexts = enriched.map((e) => e.cost.contextK ?? 128);
  const minCost = Math.min(...blendedCosts), maxCost = Math.max(...blendedCosts);
  const minQual = Math.min(...qualities), maxQual = Math.max(...qualities);
  const minLat = Math.min(...latencies), maxLat = Math.max(...latencies);
  const minCtx = Math.min(...contexts), maxCtx = Math.max(...contexts);

  return enriched.map((e) => {
    const blended = e.cost.input * 0.3 + e.cost.output * 0.7;
    // Cost: inverted (cheaper → higher score)
    const costScore = 1 - normalize01(blended, minCost, maxCost);
    const qualityScore = normalize01(e.cost.qualityTier ?? 3, minQual, maxQual);
    const latencyScore = normalize01(e.cost.latencyTier ?? 2, minLat, maxLat);
    const contextScore = normalize01(e.cost.contextK ?? 128, minCtx, maxCtx);
    const cachingScore = e.cost.cachedInput != null ? 1 : 0;

    const totalScore =
      weights.cost * costScore +
      weights.quality * qualityScore +
      weights.latency * latencyScore +
      weights.context * contextScore +
      weights.caching * cachingScore;

    const reasons: string[] = [];
    if (costScore > 0.66) reasons.push("low cost");
    if (qualityScore > 0.66) reasons.push("frontier quality");
    if (latencyScore > 0.66) reasons.push("fast latency");
    if (contextScore > 0.66) reasons.push("large context");
    if (cachingScore === 1 && weights.caching >= 0.15) reasons.push("supports caching");

    return {
      modelId: e.modelId,
      provider: e.provider,
      totalScore: Math.round(totalScore * 100) / 100,
      components: { cost: costScore, quality: qualityScore, latency: latencyScore, context: contextScore, caching: cachingScore },
      cost: e.cost,
      why: reasons.length ? reasons.join(" · ") : "balanced trade-off",
    };
  }).sort((a, b) => b.totalScore - a.totalScore);
}

/**
 * Convenience: top-scored model from the user's configured set, given a module.
 * Returns null if the user has no models configured.
 */
export function topModel(
  availableModels: Array<{ provider: string; modelId: string }>,
  module: keyof typeof DEFAULT_WEIGHTS_BY_MODULE,
  userWeights?: RubricWeights,
  userOverrides?: Record<string, Partial<ModelCost>>,
): ScoredModel | null {
  const weights = userWeights ?? DEFAULT_WEIGHTS_BY_MODULE[module] ?? DEFAULT_WEIGHTS_BY_MODULE.proposal;
  const scored = scoreModels(availableModels, weights, userOverrides);
  return scored[0] ?? null;
}
