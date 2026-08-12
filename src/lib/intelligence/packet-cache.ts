// src/lib/intelligence/packet-cache.ts
//
// Ephemeral, fingerprinted cache for Intelligence Packets (pipeline rules 7 + 8).
//
// STORAGE (rule 7): sessionStorage only — same lifecycle as dealContext.ts / the
// "dealiq:output:*" keys. Dies on browser close, no cross-device sync, NO IndexedDB, NO
// Supabase table. Server-side (no `window`) every read misses and every write no-ops, so
// wiring this around a server-side builder call is a clean pass-through. The real payoff
// is in-browser, where packet building (incl. on-device T1) can be memoized within a
// session.
//
// FINGERPRINT (rule 8): a packet is reused only when ALL of these match; any mismatch →
// full rebuild (no partial reuse in this phase):
//   • deal_id
//   • deal_model version/updated_at — folded in ONLY when the packet depends on model
//     state. Current packets do NOT (deal-model injection is separate, per the pipeline
//     hard rules), so callers pass null and a deal-model edit does not churn the packet
//     cache. That is the deliberate decision to keep research/evidence identity separate
//     from Deal Model changes.
//   • research/source-set version (hash of source IDs + fetch timestamp)
//   • packet schema version (PACKET_SCHEMA_VERSION — bump on shape change)
//   • processor version (PROCESSOR_VERSION — bump on T0/T1 logic change)
//   • prompt version (the research prompt/template the packet content derives from)

import {
  PACKET_SCHEMA_VERSION,
  PROCESSOR_VERSION,
  type IntelligencePacket,
  type PacketDealContext,
} from "@/lib/intelligence/packet-types";
import type { ResearchBrief } from "@/lib/research/web-research";
import { buildIntelligencePacket, type BuildPacketOpts } from "@/lib/intelligence/evidence-packet";

const PACKET_KEY_PREFIX = "dealiq:packet:"; // mirrors dealContext.ts "dealiq:*" convention

// Bump when the research prompt/template the packet content depends on changes.
export const PACKET_PROMPT_VERSION = "research-v1";

// ─── Deterministic, dependency-free string hash (cyrb53) ────────────────────
// Non-cryptographic — only needs stable distribution for cache identity. Works
// identically in Node and the browser.
function cyrb53(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const n = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return n.toString(16).padStart(14, "0");
}

// ─── Fingerprint inputs ─────────────────────────────────────────────────────
export type PacketCacheContext = {
  // deal_model updated_at — pass ONLY when the packet depends on model state; else null.
  dealModelVersion?: string | null;
  // Prompt/template version the packet content derives from. Defaults to PACKET_PROMPT_VERSION.
  promptVersion?: string;
};

// Hash of the research source set: stable source identities + the fetch timestamp.
// Reordering sources does not change identity; a new/changed source or refetch does.
export function hashSourceSet(brief: Pick<ResearchBrief, "citations" | "generated_at">): string {
  const ids = (brief.citations ?? [])
    .map((c) => c.url || c.title)
    .filter((s): s is string => !!s)
    .sort();
  return cyrb53(JSON.stringify({ ids, at: brief.generated_at ?? "" }));
}

// Full packet fingerprint (rule 8). Any field change → different fingerprint → rebuild.
export function computePacketFingerprint(
  brief: Pick<ResearchBrief, "citations" | "generated_at">,
  dealId: string | null,
  ctx?: PacketCacheContext,
): string {
  const canonical = JSON.stringify({
    dealId: dealId ?? null,
    dealModelVersion: ctx?.dealModelVersion ?? null,
    sourceSetVersion: hashSourceSet(brief),
    schemaVersion: PACKET_SCHEMA_VERSION,
    processorVersion: PROCESSOR_VERSION,
    promptVersion: ctx?.promptVersion ?? PACKET_PROMPT_VERSION,
  });
  return cyrb53(canonical);
}

export function packetCacheKey(fingerprint: string): string {
  return PACKET_KEY_PREFIX + fingerprint;
}

// ─── sessionStorage get/set (mirrors dealContext.ts guards) ─────────────────
export function getCachedPacket(fingerprint: string): IntelligencePacket | null {
  if (typeof window === "undefined") return null; // server-side → always a miss
  try {
    const raw = sessionStorage.getItem(packetCacheKey(fingerprint));
    if (!raw) return null;
    const p = JSON.parse(raw) as IntelligencePacket;
    // Defensive: a stored packet from an older shape/logic is treated as a miss even if the
    // key somehow collides (the fingerprint already encodes these, so this rarely triggers).
    if (p.schemaVersion !== PACKET_SCHEMA_VERSION || p.processorVersion !== PROCESSOR_VERSION) return null;
    return p;
  } catch {
    return null;
  }
}

export function setCachedPacket(fingerprint: string, packet: IntelligencePacket): void {
  if (typeof window === "undefined") return; // server-side → no-op
  try {
    sessionStorage.setItem(packetCacheKey(fingerprint), JSON.stringify(packet));
  } catch {
    /* sessionStorage unavailable / quota — cache is best-effort, never fatal */
  }
}

export function clearCachedPacket(fingerprint: string): void {
  if (typeof window === "undefined") return;
  try { sessionStorage.removeItem(packetCacheKey(fingerprint)); } catch { /* ignore */ }
}

// ─── Cache-wrapped builder ──────────────────────────────────────────────────
// The single entry point callers should use: compute fingerprint → return cached packet
// if present → otherwise build, stamp the fingerprint onto the packet, store, and return.
// A cache miss builds exactly what buildIntelligencePacket() would have — identical shape.
export async function getOrBuildIntelligencePacket(
  brief: ResearchBrief,
  deal: PacketDealContext,
  opts?: BuildPacketOpts,
  ctx?: PacketCacheContext,
): Promise<IntelligencePacket> {
  const fingerprint = computePacketFingerprint(brief, deal.deal_id ?? null, ctx);
  const cached = getCachedPacket(fingerprint);
  if (cached) return cached;

  const packet = await buildIntelligencePacket(brief, deal, opts);
  packet.fingerprint = fingerprint;
  setCachedPacket(fingerprint, packet);
  return packet;
}
