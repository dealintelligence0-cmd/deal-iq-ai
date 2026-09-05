// src/lib/ai/durable-cache.ts
//
// PHASE 7C — a cache that survives the serverless instance that created it.
//
// WHY THIS EXISTS
// The semantic cache was held in `globalThis`. On Vercel every cold start gets a fresh
// process, and instances are recycled constantly, so an entry written by one request
// was almost never visible to the next. Baseline telemetry measured the result exactly:
// a 0% hit rate — the cache existed but avoided no cloud calls at all.
//
// This module adds a second layer backed by the database the app already uses, so a
// result written today is still there tomorrow, on whichever instance serves the
// request. The in-memory layer is kept in front of it: it is free and instant when it
// does hit, and it keeps repeat lookups inside one instance off the database.
//
// SAFETY RULES (these are why a cache is allowed to serve partner-facing documents)
//   • Scoped to the owning user. A row is only ever a candidate for the user_id that
//     wrote it — one partner's document can never be served to another.
//   • Scoped to provider AND model via the salt, so switching model never replays an
//     answer produced by a different one.
//   • Time-boxed. Entries expire (24h) so a stale document cannot be served after the
//     underlying deal model has moved on.
//   • Never authoritative. A cache miss is always safe — it just costs a cloud call.
//     Every failure path here degrades to "miss", never to a wrong answer.
//
// ACTIVATION: dormant until the operator applies migrations/phase7c_ai_cache.sql.
// With no `ai_cache` table every query fails and is swallowed, leaving exactly the
// previous in-memory behaviour. Kill-switch: AI_CACHE_DISABLED=1.

import { createHash } from "crypto";

export const CACHE_TTL_MS = 1000 * 60 * 60 * 24;

// Rows are scanned in JS for near-matches, so keep them small. Storing every token of
// a 10,000-token prompt would make each row large and the scan slow; the most frequent
// terms carry the signal that cosine similarity actually turns on.
const MAX_VECTOR_TOKENS = 300;

// Upper bound on rows pulled for a near-match scan. Bounds both the query cost and the
// work done per lookup, at the cost of ignoring very old entries — which the TTL would
// be dropping shortly anyway.
const MAX_CANDIDATES = 40;

export type DurableHit = {
  content: string;
  provider?: string;
  model?: string;
  vector: Map<string, number>;
  promptChars: number;
  createdAt: number;
};

export function promptHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function cacheEnabled(): boolean {
  if (typeof window !== "undefined") return false;      // server-side only
  return process.env.AI_CACHE_DISABLED !== "1";
}

/** Trim a vector to its highest-signal terms so a row stays small. */
function compactVector(vector: Map<string, number>): Record<string, number> {
  const top = [...vector.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_VECTOR_TOKENS);
  return Object.fromEntries(top);
}

function toMap(raw: unknown): Map<string, number> {
  const map = new Map<string, number>();
  if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isFinite(v)) map.set(k, v);
    }
  }
  return map;
}

type CacheRow = {
  content: string;
  provider: string | null;
  model: string | null;
  vector: unknown;
  prompt_chars: number;
  created_at: string;
};

function rowToHit(row: CacheRow): DurableHit {
  return {
    content: row.content,
    provider: row.provider ?? undefined,
    model: row.model ?? undefined,
    vector: toMap(row.vector),
    promptChars: row.prompt_chars ?? 0,
    createdAt: new Date(row.created_at).getTime(),
  };
}

/**
 * Exact-match lookup: the same prompt, for the same user, provider and model.
 *
 * This is the path that matters most in practice — regenerating a deal whose inputs
 * have not changed produces a byte-identical prompt — and it is the safest, because
 * an identical prompt cannot correspond to a different question.
 */
export async function getDurableExact(args: {
  userId: string;
  module: string;
  salt: string;
  hash: string;
}): Promise<DurableHit | null> {
  if (!cacheEnabled()) return null;
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("ai_cache")
      .select("content, provider, model, vector, prompt_chars, created_at")
      .eq("user_id", args.userId)
      .eq("module", args.module)
      .eq("salt", args.salt)
      .eq("prompt_hash", args.hash)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1);
    if (error || !data || data.length === 0) return null;
    return rowToHit(data[0] as CacheRow);
  } catch {
    return null; // table absent or unreachable — a miss is always safe
  }
}

/**
 * Candidate rows for a near-match scan, newest first. Similarity itself is scored by
 * the caller, which already owns the cosine implementation and the threshold.
 */
export async function getDurableCandidates(args: {
  userId: string;
  module: string;
  salt: string;
}): Promise<DurableHit[]> {
  if (!cacheEnabled()) return [];
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("ai_cache")
      .select("content, provider, model, vector, prompt_chars, created_at")
      .eq("user_id", args.userId)
      .eq("module", args.module)
      .eq("salt", args.salt)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(MAX_CANDIDATES);
    if (error || !data) return [];
    return (data as CacheRow[]).map(rowToHit);
  } catch {
    return [];
  }
}

/**
 * Persist one result. Fire-and-forget by contract: the caller must not await this on
 * the response path, and a failure here must never affect the generation that
 * succeeded. Expired rows for the same scope are swept opportunistically so the table
 * cannot grow without bound.
 */
export function setDurable(args: {
  userId: string;
  module: string;
  salt: string;
  hash: string;
  content: string;
  provider?: string;
  model?: string;
  vector: Map<string, number>;
  promptChars: number;
}): void {
  if (!cacheEnabled()) return;
  void (async () => {
    try {
      const { createAdminClient } = await import("@/lib/supabase/admin");
      const admin = createAdminClient();
      const now = Date.now();
      await admin.from("ai_cache").insert({
        user_id: args.userId,
        module: args.module.slice(0, 40),
        salt: args.salt.slice(0, 120),
        prompt_hash: args.hash,
        prompt_chars: args.promptChars,
        vector: compactVector(args.vector),
        content: args.content,
        provider: args.provider ?? null,
        model: args.model ? args.model.slice(0, 80) : null,
        expires_at: new Date(now + CACHE_TTL_MS).toISOString(),
      });
      // Sweep this user's expired rows. Cheap, indexed, and keeps the free-tier
      // database small without needing a scheduled job.
      await admin
        .from("ai_cache")
        .delete()
        .eq("user_id", args.userId)
        .lt("expires_at", new Date(now).toISOString());
    } catch {
      /* table not applied yet, or env/network issue — intentionally silent */
    }
  })();
}
