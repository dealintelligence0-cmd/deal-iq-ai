/**
 * Greedy cluster expansion for thematic intelligence.
 *
 * Why not k-means / HDBSCAN? Because we don't know k, and we want clusters of
 * VERY similar deals (>0.75 cosine), with a minimum cluster size of 3, and the
 * rest staying as un-clustered "long tail". This is a connected-components walk
 * with a similarity threshold — fast, deterministic, no ML library required.
 *
 * Complexity: O(n²) which is fine for ≤2000 deals. Above that we'd switch to
 * pgvector ANN queries.
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
  memberSimilarities: number[];  // similarity of each member to the (final) centroid
};

const SIMILARITY_THRESHOLD = 0.55;   // OpenAI text-embedding-3-small averages ~0.30-0.50 between unrelated business descriptions
const MIN_CLUSTER_SIZE = 3;

export function clusterDeals(deals: DealForClustering[]): Cluster[] {
  if (deals.length < MIN_CLUSTER_SIZE) return [];

  // Build similarity matrix once
  const n = deals.length;
  const sim: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    sim[i][i] = 1;
    for (let j = i + 1; j < n; j++) {
      sim[i][j] = sim[j][i] = cosineSim(deals[i].embedding, deals[j].embedding);
    }
  }

  const visited = new Set<number>();
  const clusters: Cluster[] = [];

  // Sort seed candidates by "average similarity to top-5 neighbors" — pick densest first
  const density: number[] = deals.map((_, i) => {
    const others = sim[i].map((s, j) => ({ s, j })).filter((x) => x.j !== i);
    others.sort((a, b) => b.s - a.s);
    return others.slice(0, 5).reduce((acc, x) => acc + x.s, 0) / 5;
  });
  const seedOrder = deals.map((_, i) => i).sort((a, b) => density[b] - density[a]);

  for (const seed of seedOrder) {
    if (visited.has(seed)) continue;
    // Expand: pull in everyone above the threshold from the seed
    const candidates: number[] = [];
    for (let j = 0; j < n; j++) {
      if (j !== seed && !visited.has(j) && sim[seed][j] >= SIMILARITY_THRESHOLD) {
        candidates.push(j);
      }
    }
    if (candidates.length + 1 < MIN_CLUSTER_SIZE) continue;
    const memberSet = new Set<number>([seed, ...candidates]);
    // Mark visited (cluster claim — first dense seed wins)
    for (const m of memberSet) visited.add(m);

    const memberIds = [...memberSet].map((idx) => deals[idx].id);
    const centroid = meanVector([...memberSet].map((idx) => deals[idx].embedding));
    const memberSimilarities = [...memberSet].map((idx) => cosineSim(deals[idx].embedding, centroid));

    clusters.push({ centroid, memberIds, memberSimilarities });
  }

  return clusters;
}
