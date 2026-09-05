// PHASE 7C — two-layer cache.
//
//   layer 1 (memory)  : free and instant, but dies with the serverless instance.
//   layer 2 (database): survives instances, which is the only reason a hit is ever
//                       possible for a partner who returns tomorrow.
//
// Baseline telemetry measured layer 1 alone at a 0% hit rate: on Vercel the process
// that wrote an entry is almost never the process that could reuse it. Layer 2 is
// consulted only on a layer-1 miss, and a layer-2 hit is promoted back into memory so
// repeat lookups within one instance stay free.
//
// Both layers apply the SAME matching rules (same user, same module, same
// provider/model salt, same TTL, same similarity threshold), so adding durability
// cannot widen what counts as a match — it only changes how long a match survives.

import type { ChatMessage } from "@/lib/ai/providers";
import { recordAiEvent } from "@/lib/ai/telemetry";
import {
  getDurableExact,
  getDurableCandidates,
  setDurable,
  promptHash,
  type DurableHit,
} from "@/lib/ai/durable-cache";

export type SemanticCacheEntry = {
  key: string;
  userId: string;
  module: string;
  provider?: string;
  model?: string;
  content: string;
  createdAt: number;
  vector: Map<string, number>;
  promptChars: number;
};

const CACHE_TTL_MS = 1000 * 60 * 60 * 24;
const SIMILARITY_THRESHOLD = 0.94;
const MAX_ENTRIES = 250;
const globalCache = globalThis as typeof globalThis & { __dealIqSemanticCache?: SemanticCacheEntry[] };

function cacheStore(): SemanticCacheEntry[] {
  if (!globalCache.__dealIqSemanticCache) globalCache.__dealIqSemanticCache = [];
  return globalCache.__dealIqSemanticCache;
}

function normalize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9₹$€£.%]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && token.length < 40);
}

function vectorize(text: string): Map<string, number> {
  const vector = new Map<string, number>();
  for (const token of normalize(text)) vector.set(token, (vector.get(token) ?? 0) + 1);
  return vector;
}

function cosine(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (const [, value] of a) magA += value * value;
  for (const [, value] of b) magB += value * value;
  const [small, large] = a.size < b.size ? [a, b] : [b, a];
  for (const [token, value] of small) dot += value * (large.get(token) ?? 0);
  return magA && magB ? dot / (Math.sqrt(magA) * Math.sqrt(magB)) : 0;
}

export function messagesToSemanticText(messages: ChatMessage[], salt = ""): string {
  return [salt, ...messages.map((message) => `${message.role}:${message.content}`)].join("\n");
}

/** Does this stored prompt look close enough to be worth scoring? */
function lengthComparable(storedChars: number, promptChars: number): boolean {
  const delta = Math.abs(storedChars - promptChars) / Math.max(storedChars, promptChars, 1);
  return delta <= 0.18;
}

export async function getSemanticCache(args: {
  userId: string;
  module: string;
  messages: ChatMessage[];
  salt?: string;
  threshold?: number;
}): Promise<(SemanticCacheEntry & { similarity: number }) | null> {
  const now = Date.now();
  const store = cacheStore();
  const prompt = messagesToSemanticText(args.messages, args.salt);
  const vector = vectorize(prompt);
  const threshold = args.threshold ?? SIMILARITY_THRESHOLD;
  const salt = args.salt ?? "";

  // ── Layer 1: memory ────────────────────────────────────────────────────────
  let best: (SemanticCacheEntry & { similarity: number }) | null = null;
  for (const entry of store) {
    if (entry.userId !== args.userId || entry.module !== args.module) continue;
    if (now - entry.createdAt > CACHE_TTL_MS) continue;
    if (!lengthComparable(entry.promptChars, prompt.length)) continue;
    const similarity = cosine(vector, entry.vector);
    if (similarity >= threshold && (!best || similarity > best.similarity)) {
      best = { ...entry, similarity };
    }
  }

  // ── Layer 2: database, only when memory missed ─────────────────────────────
  // Exact match is tried first: it is one indexed lookup, and an identical prompt
  // is the strongest possible match, so there is no reason to scan for a weaker one.
  if (!best) {
    const hash = promptHash(prompt);
    const exact = await getDurableExact({ userId: args.userId, module: args.module, salt, hash });
    if (exact) {
      best = { ...toEntry(exact, args.userId, args.module), similarity: 1 };
    } else {
      for (const row of await getDurableCandidates({ userId: args.userId, module: args.module, salt })) {
        if (!lengthComparable(row.promptChars, prompt.length)) continue;
        const similarity = cosine(vector, row.vector);
        if (similarity >= threshold && (!best || similarity > best.similarity)) {
          best = { ...toEntry(row, args.userId, args.module), similarity };
        }
      }
    }
    // Promote a durable hit into memory so further lookups on THIS instance are free.
    if (best) store.unshift({ ...best });
  }

  // PHASE 7A: a hit is a cloud call avoided — the headline KPI. Exactly one event is
  // recorded per lookup regardless of which layer answered, so hit rate stays honest.
  recordAiEvent({
    userId: args.userId,
    module: args.module,
    operation: "semantic_cache",
    decision: best ? "cache_hit" : "cache_miss",
  });
  return best;
}

function toEntry(hit: DurableHit, userId: string, module: string): SemanticCacheEntry {
  return {
    key: `${userId}:${module}:${hit.createdAt}`,
    userId,
    module,
    provider: hit.provider,
    model: hit.model,
    content: hit.content,
    createdAt: hit.createdAt,
    vector: hit.vector,
    promptChars: hit.promptChars,
  };
}

export function setSemanticCache(args: {
  userId: string;
  module: string;
  messages: ChatMessage[];
  content: string;
  provider?: string;
  model?: string;
  salt?: string;
}): void {
  const store = cacheStore();
  const prompt = messagesToSemanticText(args.messages, args.salt);
  const vector = vectorize(prompt);
  store.unshift({
    key: `${args.userId}:${args.module}:${Date.now()}`,
    userId: args.userId,
    module: args.module,
    provider: args.provider,
    model: args.model,
    content: args.content,
    createdAt: Date.now(),
    vector,
    promptChars: prompt.length,
  });
  const fresh = store.filter((entry) => Date.now() - entry.createdAt <= CACHE_TTL_MS).slice(0, MAX_ENTRIES);
  globalCache.__dealIqSemanticCache = fresh;

  // Write through to the durable layer. Fire-and-forget by contract: this must never
  // delay the response the partner is waiting on, and a database failure here must
  // never turn a successful generation into an error.
  setDurable({
    userId: args.userId,
    module: args.module,
    salt: args.salt ?? "",
    hash: promptHash(prompt),
    content: args.content,
    provider: args.provider,
    model: args.model,
    vector,
    promptChars: prompt.length,
  });
}
