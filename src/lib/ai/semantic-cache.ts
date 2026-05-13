import type { ChatMessage } from "@/lib/ai/providers";

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

export function getSemanticCache(args: {
  userId: string;
  module: string;
  messages: ChatMessage[];
  salt?: string;
  threshold?: number;
}): (SemanticCacheEntry & { similarity: number }) | null {
  const now = Date.now();
  const store = cacheStore();
  const prompt = messagesToSemanticText(args.messages, args.salt);
  const vector = vectorize(prompt);
  let best: (SemanticCacheEntry & { similarity: number }) | null = null;

  for (const entry of store) {
    if (entry.userId !== args.userId || entry.module !== args.module) continue;
    if (now - entry.createdAt > CACHE_TTL_MS) continue;
    const lengthDelta = Math.abs(entry.promptChars - prompt.length) / Math.max(entry.promptChars, prompt.length, 1);
    if (lengthDelta > 0.18) continue;
    const similarity = cosine(vector, entry.vector);
    if (similarity >= (args.threshold ?? SIMILARITY_THRESHOLD) && (!best || similarity > best.similarity)) {
      best = { ...entry, similarity };
    }
  }
  return best;
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
  store.unshift({
    key: `${args.userId}:${args.module}:${Date.now()}`,
    userId: args.userId,
    module: args.module,
    provider: args.provider,
    model: args.model,
    content: args.content,
    createdAt: Date.now(),
    vector: vectorize(prompt),
    promptChars: prompt.length,
  });
  const fresh = store.filter((entry) => Date.now() - entry.createdAt <= CACHE_TTL_MS).slice(0, MAX_ENTRIES);
  globalCache.__dealIqSemanticCache = fresh;
}
