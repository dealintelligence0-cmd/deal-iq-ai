/**
 * Greedy cluster expansion for thematic intelligence.
 *
 * Adaptive threshold: rather than hard-coding a cosine value, we look at the
 * similarity distribution across all deal pairs and use the top-percentile
 * value as the threshold. This means the algorithm self-tunes to whatever
 * embedding provider the user picked — Google text-embedding-004 produces
 * tighter distributions (~0.3-0.5) than OpenAI text-embedding-3-small (~0.2-0.7),
 * but the percentile-based threshold gives reasonable clusters in both cases.
 *
 * Complexity: O(n²) which is fine for ≤2000 deals.
 */

import { cosineSim, meanVector } from "./embeddings";

export type DealForClustering = {
  id: string;
  text: string;
  embedding: number[];
};

export type Cluster = {
  centroid: number[];
  memberIds: string[];
  memberSimilarities: number[];
};

export type ClusterDiagnostic = {
  totalDeals: number;
  totalPairs: number;
  similarityMin: number;
  similarityMax: number;
  similarityMean: number;
  similarityP50: number;
  similarityP75: number;
  similarityP90: number;
  similarityP95: number;
  thresholdUsed: number;
  pairsAboveThreshold: number;
  clustersFound: number;
};

const MIN_CLUSTER_SIZE = 3;
const FLOOR_THRESHOLD = 0.30;   // never go below this (random text pairs sit around 0.2-0.3)
const CEILING_THRESHOLD = 0.85; // never demand more than this

/**
 * Cluster deals with an adaptive similarity threshold.
 * Returns both the clusters AND a diagnostic so we can surface "why nothing matched".
 */
export function clusterDeals(deals: DealForClustering[]): { clusters: Cluster[]; diagnostic: ClusterDiagnostic } {
  const diagnostic: ClusterDiagnostic = {
    totalDeals: deals.length, totalPairs: 0,
    similarityMin: 0, similarityMax: 0, similarityMean: 0,
    similarityP50: 0, similarityP75: 0, similarityP90: 0, similarityP95: 0,
    thresholdUsed: 0, pairsAboveThreshold: 0, clustersFound: 0,
  };
  if (deals.length < MIN_CLUSTER_SIZE) return { clusters: [], diagnostic };

  const n = deals.length;
  const sim: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const allSims: number[] = [];

  for (let i = 0; i < n; i++) {
    sim[i][i] = 1;
    for (let j = i + 1; j < n; j++) {
      const s = cosineSim(deals[i].embedding, deals[j].embedding);
      sim[i][j] = sim[j][i] = s;
      allSims.push(s);
    }
  }

  // ---- Distribution statistics ----
  allSims.sort((a, b) => a - b);
  diagnostic.totalPairs = allSims.length;
  diagnostic.similarityMin = allSims[0];
  diagnostic.similarityMax = allSims[allSims.length - 1];
  diagnostic.similarityMean = allSims.reduce((a, b) => a + b, 0) / allSims.length;
  diagnostic.similarityP50 = allSims[Math.floor(allSims.length * 0.50)];
  diagnostic.similarityP75 = allSims[Math.floor(allSims.length * 0.75)];
  diagnostic.similarityP90 = allSims[Math.floor(allSims.length * 0.90)];
  diagnostic.similarityP95 = allSims[Math.floor(allSims.length * 0.95)];

  // ---- Adaptive threshold: P90 means "top 10% of pairs cluster together" ----
  // Clamped to a reasonable range to avoid pathological cases
  let threshold = diagnostic.similarityP90;
  if (threshold < FLOOR_THRESHOLD) threshold = FLOOR_THRESHOLD;
  if (threshold > CEILING_THRESHOLD) threshold = CEILING_THRESHOLD;
  diagnostic.thresholdUsed = threshold;
  diagnostic.pairsAboveThreshold = allSims.filter((s) => s >= threshold).length;

  // ---- Greedy cluster expansion ----
  const visited = new Set<number>();
  const clusters: Cluster[] = [];

  // Seed order: pick rows whose top-5 average neighbor similarity is highest
  const density: number[] = deals.map((_, i) => {
    const others = sim[i].map((s, j) => ({ s, j })).filter((x) => x.j !== i);
    others.sort((a, b) => b.s - a.s);
    return others.slice(0, 5).reduce((acc, x) => acc + x.s, 0) / 5;
  });
  const seedOrder = deals.map((_, i) => i).sort((a, b) => density[b] - density[a]);

  for (const seed of seedOrder) {
    if (visited.has(seed)) continue;
    const candidates: number[] = [];
    for (let j = 0; j < n; j++) {
      if (j !== seed && !visited.has(j) && sim[seed][j] >= threshold) {
        candidates.push(j);
      }
    }
    if (candidates.length + 1 < MIN_CLUSTER_SIZE) continue;
    const memberSet = new Set<number>([seed, ...candidates]);
    for (const m of memberSet) visited.add(m);

    const memberIds = [...memberSet].map((idx) => deals[idx].id);
    const centroid = meanVector([...memberSet].map((idx) => deals[idx].embedding));
    const memberSimilarities = [...memberSet].map((idx) => cosineSim(deals[idx].embedding, centroid));

    clusters.push({ centroid, memberIds, memberSimilarities });
  }

  diagnostic.clustersFound = clusters.length;
  return { clusters, diagnostic };
}
