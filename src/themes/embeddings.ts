/**
 * Lightweight embedding helper for thematic clustering.
 *
 * Supports any OpenAI-compatible /v1/embeddings endpoint. All vectors are
 * normalized to 1024 dimensions for pgvector storage.
 */

export type EmbedConfig = {
  provider: "openai" | "google" | "cohere" | "openrouter" | "nvidia" | "together";
  apiKey: string;
  model?: string;
};

const DEFAULT_MODELS: Record<EmbedConfig["provider"], string> = {
  openai:     "text-embedding-3-small",
  google:     "text-embedding-004",
  cohere:     "embed-english-v3.0",
  openrouter: "openai/text-embedding-3-small",
  nvidia:     "baai/bge-m3",
  together:   "togethercomputer/m2-bert-80M-8k-retrieval",
};

export const TARGET_DIMENSIONS = 1024;

function normalizeVector(v: number[]): number[] {
  if (v.length === TARGET_DIMENSIONS) return v;
  if (v.length > TARGET_DIMENSIONS) return v.slice(0, TARGET_DIMENSIONS);
  const out = v.slice();
  while (out.length < TARGET_DIMENSIONS) out.push(0);
  return out;
}

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
      out.push(...vectors.map((v) => v ? normalizeVector(v) : null));
    } catch (e) {
      console.error(`Embed batch failed (${cfg.provider} ${model}):`, e);
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
    case "openrouter":
    case "nvidia":
    case "together": {
      const baseUrl =
        provider === "openrouter" ? "https://openrouter.ai/api/v1" :
        provider === "nvidia"     ? "https://integrate.api.nvidia.com/v1" :
        provider === "together"   ? "https://api.together.xyz/v1" :
                                    "https://api.openai.com/v1";
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      };
      if (provider === "openrouter") {
        headers["HTTP-Referer"] = "https://deal-iq-ai.vercel.app";
        headers["X-Title"] = "Deal IQ AI";
      }
      const body: Record<string, unknown> = { model, input: texts };
      // OpenAI text-embedding-3-* supports the `dimensions` parameter for downscaling
      if (model.includes("text-embedding-3")) body.dimensions = TARGET_DIMENSIONS;

      const r = await fetch(`${baseUrl}/embeddings`, {
        method: "POST", headers, body: JSON.stringify(body),
      });
      if (!r.ok) {
        const errText = (await r.text()).slice(0, 400);
        throw new Error(`${provider} embed ${r.status}: ${errText}`);
      }
      const j = await r.json();
      const data = (j.data as Array<{ embedding: number[] }>) ?? [];
      return data.map((d) => d.embedding);
    }
    case "google": {
      const results = await Promise.all(texts.map(async (text) => {
        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${apiKey}`,
          { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: { parts: [{ text }] }, taskType: "CLUSTERING" }) }
        );
        if (!r.ok) {
          console.error(`google embed ${r.status}: ${(await r.text()).slice(0, 200)}`);
          return null;
        }
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
      if (!r.ok) {
        const errText = (await r.text()).slice(0, 400);
        throw new Error(`cohere embed ${r.status}: ${errText}`);
      }
      const j = await r.json();
      return (j.embeddings as number[][]) ?? [];
    }
  }
}

export function cosineSim(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

export function meanVector(vectors: number[][]): number[] {
  if (vectors.length === 0) return [];
  const n = vectors[0].length;
  const out = new Array(n).fill(0);
  for (const v of vectors) for (let i = 0; i < n; i++) out[i] += v[i];
  for (let i = 0; i < n; i++) out[i] /= vectors.length;
  return out;
}

export function toPgVector(v: number[]): string {
  return `[${v.join(",")}]`;
}
