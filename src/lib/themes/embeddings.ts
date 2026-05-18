/**
 * Lightweight embedding helper for thematic clustering.
 *
 * Supports OpenAI text-embedding-3-small (1536 dims) and any provider that
 * exposes /v1/embeddings. Falls back gracefully — if no embedding key is
 * available we return null and the cluster pipeline skips.
 *
 * Cost benchmark: ~$0.00002 per deal at OpenAI prices.
 * A 300-deal weekly batch = ~$0.006 (less than a cent).
 */

export type EmbedConfig = {
  provider: "openai" | "google" | "cohere" | "openrouter";
  apiKey: string;
  model?: string;
};

const DEFAULT_MODELS: Record<EmbedConfig["provider"], string> = {
  openai:     "text-embedding-3-small",
  google:     "text-embedding-004",
  cohere:     "embed-english-v3.0",
  openrouter: "openai/text-embedding-3-small",
};

export const EMBEDDING_DIMENSIONS = 1536;

/**
 * Embed an array of texts. Returns array of vectors (same order as input)
 * or null entries for failures.
 *
 * Handles batching internally (max 96 per request).
 */
export async function embedTexts(
  texts: string[],
  cfg: EmbedConfig
): Promise<(number[] | null)[]> {
  if (texts.length === 0) return [];
  const model = cfg.model ?? DEFAULT_MODELS[cfg.provider];

  const out: (number[] | null)[] = [];
  const BATCH = 96;
  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH).map((t) => t.slice(0, 6000));
    try {
      const vectors = await callEmbed(cfg.provider, batch, cfg.apiKey, model);
      out.push(...vectors);
    } catch (e) {
      console.error("Embed batch failed:", e);
      for (let j = 0; j < batch.length; j++) out.push(null);
    }
  }
  return out;
}

async function callEmbed(
  provider: EmbedConfig["provider"], texts: string[], apiKey: string, model: string
): Promise<(number[] | null)[]> {
  switch (provider) {
    case "openai":
    case "openrouter": {
      const baseUrl = provider === "openrouter"
        ? "https://openrouter.ai/api/v1"
        : "https://api.openai.com/v1";
      const r = await fetch(`${baseUrl}/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, input: texts }),
      });
      if (!r.ok) throw new Error(`${provider} embed ${r.status}: ${(await r.text()).slice(0, 200)}`);
      const j = await r.json();
      return (j.data as Array<{ embedding: number[] }>).map((d) => d.embedding);
    }
    case "google": {
      // Gemini embeddings: one call per text. Batch via Promise.all.
      const results = await Promise.all(texts.map(async (text) => {
        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${apiKey}`,
          { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: { parts: [{ text }] } }) }
        );
        if (!r.ok) return null;
        const j = await r.json();
        return j.embedding?.values ?? null;
      }));
      return results;
    }
    case "cohere": {
      const r = await fetch("https://api.cohere.ai/v1/embed", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, texts, input_type: "clustering" }),
      });
      if (!r.ok) throw new Error(`cohere embed ${r.status}`);
      const j = await r.json();
      return (j.embeddings as number[][]) ?? [];
    }
  }
}

/** Cosine similarity between two equal-length vectors. */
export function cosineSim(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

/** Average a set of vectors (centroid). */
export function meanVector(vectors: number[][]): number[] {
  if (vectors.length === 0) return [];
  const n = vectors[0].length;
  const out = new Array(n).fill(0);
  for (const v of vectors) for (let i = 0; i < n; i++) out[i] += v[i];
  for (let i = 0; i < n; i++) out[i] /= vectors.length;
  return out;
}

/**
 * Convert a vector to the Postgres pgvector literal: "[1.0,2.0,...]"
 */
export function toPgVector(v: number[]): string {
  return `[${v.join(",")}]`;
}
