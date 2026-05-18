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

/** Default embedding model per provider, all returning ~1024-dim vectors. */
const DEFAULT_MODELS: Record<EmbedConfig["provider"], string> = {
  openai:     "text-embedding-3-small",
  google:     "text-embedding-004",
  cohere:     "embed-english-v3.0",
  openrouter: "openai/text-embedding-3-small",
  // nv-embedqa-e5-v5 is the most stable NVIDIA NIM embedding model on the free tier (1024 dims).
  // baai/bge-m3 is also available but returns 500s intermittently.
  nvidia:     "nvidia/nv-embedqa-e5-v5",
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
): Promise<{ vectors: (number[] | null)[]; lastError: string | null; modelUsed: string }> {
  if (texts.length === 0) return { vectors: [], lastError: null, modelUsed: "" };
  const model = cfg.model ?? DEFAULT_MODELS[cfg.provider];

  const out: (number[] | null)[] = [];
  let lastError: string | null = null;
  const BATCH = 96;
  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH).map((t) => t.slice(0, 6000));
    try {
      const vectors = await callEmbed(cfg.provider, batch, cfg.apiKey, model);
      out.push(...vectors.map((v) => v ? normalizeVector(v) : null));
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      console.error(`Embed batch failed (${cfg.provider} ${model}): ${msg}`);
      lastError = msg.slice(0, 300);
      for (let j = 0; j < batch.length; j++) out.push(null);
    }
  }
  return { vectors: out, lastError, modelUsed: model };
}

async function callEmbed(
  provider: EmbedConfig["provider"], texts: string[], apiKey: string, model: string
): Promise<(number[] | null)[]> {
  // Defensive: API keys must be ASCII-safe for HTTP headers. Strip whitespace,
  // newlines, and any non-printable-ASCII (e.g. em-dashes from copy-paste).
  const cleanKey = apiKey
    .replace(/[\r\n\t]/g, "")
    .replace(/[^\x20-\x7E]/g, "")  // keep only printable ASCII
    .trim();
  if (!cleanKey) {
    throw new Error(`${provider} embed: API key is empty after sanitisation. Re-save the key in Settings.`);
  }
  if (apiKey.length !== cleanKey.length) {
    console.warn(`${provider} embed: API key contained ${apiKey.length - cleanKey.length} non-ASCII characters that were stripped. Re-save the key in Settings to silence this warning.`);
  }
  // Provider-specific sanity check on key format
  const expectedShape: Partial<Record<EmbedConfig["provider"], { prefix?: string; maxLen: number }>> = {
    openrouter: { prefix: "sk-or-", maxLen: 200 },
    openai:     { prefix: "sk-",    maxLen: 200 },
    nvidia:     { prefix: "nvapi-", maxLen: 200 },
    cohere:     { maxLen: 200 },
    together:   { maxLen: 200 },
    google:     { maxLen: 200 },
  };
  const shape = expectedShape[provider];
  if (shape) {
    if (cleanKey.length > shape.maxLen) {
      throw new Error(`${provider} embed: API key is ${cleanKey.length} chars (expected ≤${shape.maxLen}). Looks like the wrong content was pasted into Settings — re-save with just the API key (e.g. starting with "${shape.prefix ?? '...'}").`);
    }
    if (shape.prefix && !cleanKey.startsWith(shape.prefix)) {
      console.warn(`${provider} embed: API key doesn't start with "${shape.prefix}" — may be wrong format.`);
    }
  }

  switch (provider) {
    case "openai":
    case "openrouter":
    case "together": {
      const baseUrl =
        provider === "openrouter" ? "https://openrouter.ai/api/v1" :
        provider === "together"   ? "https://api.together.xyz/v1" :
                                    "https://api.openai.com/v1";
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cleanKey}`,
      };
      // OpenRouter requires these headers — ASCII-safe values only (no em-dash etc)
      if (provider === "openrouter") {
        headers["HTTP-Referer"] = "https://deal-iq-ai.vercel.app";
        headers["X-Title"] = "Deal IQ AI";
      }
      const body: Record<string, unknown> = { model, input: texts };
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
    case "nvidia": {
      // NVIDIA NIM /v1/embeddings — requires input_type AND truncate fields
      // Their endpoint sometimes 500s on array input; loop one-by-one for stability.
      const baseUrl = "https://integrate.api.nvidia.com/v1";
      const results: (number[] | null)[] = [];
      for (const text of texts) {
        try {
          const r = await fetch(`${baseUrl}/embeddings`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              Authorization: `Bearer ${cleanKey}`,
            },
            body: JSON.stringify({
              model,
              input: [text],
              input_type: "query",
              encoding_format: "float",
              truncate: "END",
            }),
          });
          if (!r.ok) {
            const errText = (await r.text()).slice(0, 300);
            // First failure aborts the batch with full diagnostic so caller can react
            throw new Error(`nvidia embed ${r.status}: ${errText}`);
          }
          const j = await r.json();
          const v = j?.data?.[0]?.embedding;
          results.push(Array.isArray(v) ? v : null);
        } catch (e) {
          // Re-throw the first error so embedTexts records lastError
          throw e;
        }
      }
      return results;
    }
    case "google": {
      // Per-text loop; capture first error so it propagates to lastError
      let firstError: string | null = null;
      const results: (number[] | null)[] = [];
      for (const text of texts) {
        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${encodeURIComponent(cleanKey)}`,
          { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: { parts: [{ text }] }, taskType: "CLUSTERING" }) }
        );
        if (!r.ok) {
          const errText = (await r.text()).slice(0, 300);
          firstError ??= `google embed ${r.status}: ${errText}`;
          results.push(null);
          continue;
        }
        const j = await r.json();
        const v = j?.embedding?.values;
        results.push(Array.isArray(v) ? v : null);
      }
      if (firstError && results.every((v) => v === null)) throw new Error(firstError);
      return results;
    }
    case "cohere": {
      const r = await fetch("https://api.cohere.ai/v1/embed", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${cleanKey}` },
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
