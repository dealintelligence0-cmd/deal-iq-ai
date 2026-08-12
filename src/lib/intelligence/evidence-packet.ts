// src/lib/intelligence/evidence-packet.ts
//
// Intelligence Packet builder — PHASE 2: pure deterministic T0 only (no AI yet).
//
// Pipeline position:
//   Raw research (ResearchBrief) → [T0 pre-filter: dedupe, source validation,
//   keyword extract] → [T1 on-device AI — added in Phase 4] → [T0 validation:
//   the three-flag confidence model] → IntelligencePacket
//
// The packet SHAPE is identical whether or not T1 later runs; T0-only just yields
// lower-confidence / no-paraphrase claims. Nothing here ever touches the canonical
// Deal Model, and factuallyVerified is NEVER set true (rule 3).

import type { ResearchBrief } from "@/lib/research/web-research";
import {
  PACKET_SCHEMA_VERSION,
  PROCESSOR_VERSION,
  type IntelligencePacket,
  type EvidenceClaim,
  type ClaimCategory,
  type SourceRef,
  type SourceType,
  type PacketDealContext,
  type ModuleSlice,
  type ProposalSlice,
  type SynergySlice,
  type PmiSlice,
  type TsaSlice,
} from "@/lib/intelligence/packet-types";
import { getOnDeviceAI, type OnDeviceAI, type OnDeviceKind } from "@/lib/ai/on-device";

// Minimum re-validation fidelity to ACCEPT an on-device (T1) compression. Below this,
// the compressed text has drifted from the source → reject it and keep the verbatim T0
// claim. This is the safety gate that makes untrusted T1 output usable (rule 3).
const T1_ACCEPT_MIN_FIDELITY = 0.6;

// ─── Text utilities ─────────────────────────────────────────────────────

const STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "into", "over", "under",
  "will", "have", "has", "had", "was", "were", "are", "its", "their", "they",
  "them", "then", "than", "which", "while", "about", "after", "before", "been",
  "being", "such", "also", "more", "most", "some", "any", "all", "can", "could",
  "would", "should", "may", "might", "must", "each", "other", "these", "those",
  "there", "here", "what", "when", "where", "who", "how", "amid", "per", "via",
  "recent", "news", "company", "companies", "overview", "profile", "public", "sources",
]);

function normalizeForDedupe(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

function tokenize(s: string): string[] {
  return normalizeForDedupe(s).split(" ").filter(Boolean);
}

// Fraction of the claim's tokens that also appear in the source text. This is the
// concrete meaning of extractionFidelity: "does this claim's text actually appear
// (verbatim or close paraphrase) in the source?" (rule 3, T0's job). T1 paraphrases
// are re-scored with the SAME function against their source in a later phase.
function computeExtractionFidelity(claimText: string, sourceText: string): number {
  const claimTokens = tokenize(claimText).filter((t) => t.length >= 3 && !STOPWORDS.has(t));
  if (claimTokens.length === 0) return 0;
  const sourceSet = new Set(tokenize(sourceText));
  const hits = claimTokens.filter((t) => sourceSet.has(t)).length;
  return Math.round((hits / claimTokens.length) * 100) / 100;
}

// ─── Source classification + confidence heuristic (T0) ──────────────────

function hostnameOf(url: string): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function classifySourceType(url: string): SourceType {
  const host = hostnameOf(url);
  if (!host) return "unknown";
  if (/\.gov(\.[a-z]{2})?$/.test(host) || /(^|\.)ec\.europa\.eu$/.test(host) ||
      /(sec|ftc|justice)\.gov/.test(host) || /gov\.uk$/.test(host)) return "regulator";
  if (/(reuters|bloomberg|ft|wsj|apnews|cnbc|economist)\.com$/.test(host)) return "wire";
  if (/(prnewswire|businesswire|globenewswire|prweb|newswire)\.com$/.test(host)) return "prwire";
  return "press";
}

// sourceConfidence = reliability of the SOURCE, independent of the claim's content
// or truth. Domain/source-type driven. NOTE: per-article publication dates are not
// available from the brief (only the fetch timestamp), so recency is not yet a factor;
// this is the documented hook for adding it once dated sources flow through.
function sourceConfidenceFor(type: SourceType): number {
  switch (type) {
    case "regulator": return 0.9;
    case "wire": return 0.8;
    case "press": return 0.6;
    case "prwire": return 0.45;
    default: return 0.3; // unknown / no URL
  }
}

// ─── Claim extraction (T0) ──────────────────────────────────────────────

type RawClaim = { text: string; category: ClaimCategory };

// Split a brief section into candidate claims. researchDeal() formats summaries as
// "• {title}: {content}" bullets; prompt-based briefs are free prose. Handle both:
// split on bullets/newlines first, then fall back to sentence splitting for long lines.
function splitIntoClaims(sectionText: string, category: ClaimCategory): RawClaim[] {
  if (!sectionText) return [];
  const t = sectionText.trim();
  if (!t || /^no public sources found\.?$/i.test(t)) return [];

  const out: RawClaim[] = [];
  const lines = t.split(/\n+/).map((l) => l.replace(/^[•\-*]\s*/, "").trim()).filter(Boolean);
  for (const line of lines) {
    if (line.length <= 30) continue;
    // Long, multi-sentence prose (typical of prompt-based briefs) → sentence split.
    if (line.length > 260 && /[.!?]\s/.test(line)) {
      for (const sent of line.split(/(?<=[.!?])\s+/)) {
        const s = sent.trim();
        if (s.length > 30) out.push({ text: s, category });
      }
    } else {
      out.push({ text: line, category });
    }
  }
  return out;
}

// A section bullet looks like "{title}: {content}". Pull the leading title so we can
// attribute the claim to the citation with that exact title.
function leadingTitle(claimText: string): string {
  const idx = claimText.indexOf(":");
  if (idx > 0 && idx < 120) return claimText.slice(0, idx).trim();
  return "";
}

// ─── Keyword extraction (T0) ────────────────────────────────────────────

function extractKeywords(claims: EvidenceClaim[], max = 15): string[] {
  const freq = new Map<string, number>();
  for (const c of claims) {
    for (const tok of tokenize(c.text)) {
      if (tok.length < 4 || STOPWORDS.has(tok) || /^\d+$/.test(tok)) continue;
      freq.set(tok, (freq.get(tok) ?? 0) + 1);
    }
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([w]) => w);
}

// ─── Packet builder ─────────────────────────────────────────────────────

export type BuildPacketOpts = {
  // Inject an OnDeviceAI adapter (tests). Defaults to getOnDeviceAI() feature-detection.
  onDevice?: OnDeviceAI;
  // Force a specific adapter kind, e.g. "null" to verify graceful T0-only fallback.
  forceOnDevice?: OnDeviceKind;
};

// T0 → T1 → T0-validation. On-device T1 (compression) is applied per claim and only kept
// when it re-validates against the source; otherwise the verbatim T0 claim stands. Falls
// back cleanly to a T0-only packet — identical shape — when on-device AI is unavailable
// (server-side, or Null adapter). Never touches the canonical Deal Model.
export async function buildIntelligencePacket(
  brief: ResearchBrief,
  deal: PacketDealContext,
  opts?: BuildPacketOpts,
): Promise<IntelligencePacket> {
  // 1) Sources from citations (deduped by URL already upstream, but guard again).
  const sources: SourceRef[] = [];
  const byTitle = new Map<string, SourceRef>();
  const seenUrl = new Set<string>();
  (brief.citations ?? []).forEach((c, i) => {
    if (c.url && seenUrl.has(c.url)) return;
    if (c.url) seenUrl.add(c.url);
    const type = classifySourceType(c.url);
    const ref: SourceRef = {
      id: `s${i + 1}`,
      title: c.title ?? "",
      url: c.url ?? "",
      sourceType: type,
      fetchedAt: brief.generated_at,
    };
    sources.push(ref);
    if (ref.title) byTitle.set(normalizeForDedupe(ref.title), ref);
  });

  // 2) Candidate claims from each section, tagged by category.
  const sections: Array<[string, ClaimCategory]> = [
    [brief.buyer_profile, "buyer"],
    [brief.target_profile, "target"],
    [brief.sector_signals, "sector"],
    [brief.comparables, "comparables"],
    [brief.live_risks, "risks"],
  ];
  const rawClaims: RawClaim[] = sections.flatMap(([text, cat]) => splitIntoClaims(text, cat));

  // 3) Dedupe (exact-normalized + substring containment) and score each claim.
  //    claimSourceText[i] holds the source text used to score claims[i] — reused by the
  //    T1 validation pass below (empty string when the claim has no attributable source).
  const claims: EvidenceClaim[] = [];
  const claimSourceText: string[] = [];
  const seenNorm: string[] = [];
  for (const rc of rawClaims) {
    const norm = normalizeForDedupe(rc.text);
    if (!norm) continue;
    if (seenNorm.some((n) => n === norm || n.includes(norm) || norm.includes(n))) continue;
    seenNorm.push(norm);

    // Attribute to the citation whose title leads the bullet, if any.
    const title = leadingTitle(rc.text);
    const matched = title ? byTitle.get(normalizeForDedupe(title)) : undefined;

    let extractionFidelity: number;
    let sourceConfidence: number;
    let sourceText = "";
    const sourceRefs: string[] = [];
    if (matched) {
      const snippet = (brief.citations.find((c) => c.title === matched.title)?.snippet) ?? matched.title;
      sourceText = `${matched.title} ${snippet}`;
      extractionFidelity = computeExtractionFidelity(rc.text, sourceText);
      sourceConfidence = sourceConfidenceFor(matched.sourceType);
      sourceRefs.push(matched.id);
    } else {
      // No attributable source — the claim exists in the brief but cannot be checked
      // against a distinct source snippet. Low fidelity, low source confidence.
      extractionFidelity = 0.4;
      sourceConfidence = sourceConfidenceFor("unknown");
    }

    claims.push({
      text: rc.text,
      category: rc.category,
      extractionFidelity,
      sourceConfidence,
      factuallyVerified: false, // NEVER set true — this pipeline does not assert truth.
      sourceRefs,
    });
    claimSourceText.push(sourceText);
  }

  // 4) T1 (on-device, ADVISORY): compress each source-attributed claim, then re-validate.
  const t1Applied = await applyT1Compression(claims, claimSourceText, opts);

  const keywords = extractKeywords(claims);

  return {
    schemaVersion: PACKET_SCHEMA_VERSION,
    processorVersion: PROCESSOR_VERSION,
    generatedAt: new Date().toISOString(),
    briefGeneratedAt: brief.generated_at,
    deal,
    sources,
    claims,
    keywords,
    t1Applied,
  };
}

// ─── T1: on-device compression + T0 re-validation ───────────────────────
// Advisory only. For each claim that has an attributable source, ask on-device AI to
// compress the claim text (task-specific Summarizer API, policy task "research-compress"),
// then RE-VALIDATE the compressed text against the source (T0 fidelity check). A result is
// kept only if it is actually shorter AND re-validates at or above T1_ACCEPT_MIN_FIDELITY;
// otherwise the verbatim T0 claim stands. On-device unavailable / any null → no change.
// Mutates `claims` in place and returns whether any T1 result was accepted.
async function applyT1Compression(
  claims: EvidenceClaim[],
  claimSourceText: string[],
  opts?: BuildPacketOpts,
): Promise<boolean> {
  const ai = opts?.onDevice ?? getOnDeviceAI(opts?.forceOnDevice ? { force: opts.forceOnDevice } : undefined);
  if (!ai.isAvailable()) return false; // Null adapter / server-side → clean T0-only fallback.

  let accepted = false;
  for (let i = 0; i < claims.length; i++) {
    const src = claimSourceText[i];
    if (!src) continue; // no distinct source to re-validate against → never let T1 touch it.
    const original = claims[i].text;

    // T1 compression via the task-specific Summarizer API (rule 5). Untrusted output.
    let compressed: string | null = null;
    try {
      compressed = await ai.summarize("research-compress", original, { context: src, length: "short" });
    } catch {
      compressed = null; // adapters shouldn't throw, but never let T1 break the packet.
    }
    if (!compressed) continue; // graceful: keep T0 claim.

    const trimmed = compressed.trim();
    if (!trimmed || trimmed.length >= original.length) continue; // no real compression → keep T0.

    // T0 VALIDATION PASS: does the T1 output still appear in the source? Reject drift.
    const fidelity = computeExtractionFidelity(trimmed, src);
    if (fidelity < T1_ACCEPT_MIN_FIDELITY) continue; // T1 drifted/hallucinated → keep T0.

    claims[i] = {
      ...claims[i],
      text: trimmed,
      extractionFidelity: fidelity, // honest post-compression fidelity vs. the source.
      factuallyVerified: false,     // still never asserted.
      t1Derived: true,
    };
    accepted = true;
  }
  return accepted;
}

// ─── Per-module slices (rule 2) ─────────────────────────────────────────
// One packet, four consumers. Each extractor returns a module-scoped VIEW; it does
// NOT rebuild or re-compress the packet. PMI/TSA are intentionally empty for now —
// they stay research-free per the Phase-2 decision — but the plumbing exists for
// future phases.

function sliceFor(packet: IntelligencePacket, cats: ClaimCategory[]): ModuleSliceInternal {
  const claims = packet.claims.filter((c) => cats.includes(c.category));
  const refIds = new Set(claims.flatMap((c) => c.sourceRefs));
  const sources = packet.sources.filter((s) => refIds.has(s.id));
  const keywords = extractKeywords(claims);
  return { claims, keywords, sources };
}
type ModuleSliceInternal = { claims: EvidenceClaim[]; keywords: string[]; sources: SourceRef[] };

export function toProposalSlice(packet: IntelligencePacket): ProposalSlice {
  return { module: "proposal", ...sliceFor(packet, ["buyer", "target", "sector", "comparables", "risks"]) };
}
export function toSynergySlice(packet: IntelligencePacket): SynergySlice {
  return { module: "synergy", ...sliceFor(packet, ["sector", "comparables", "buyer", "target"]) };
}
export function toPmiSlice(_packet: IntelligencePacket): PmiSlice {
  return { module: "pmi", claims: [], keywords: [], sources: [] }; // research-free for now
}
export function toTsaSlice(_packet: IntelligencePacket): TsaSlice {
  return { module: "tsa", claims: [], keywords: [], sources: [] }; // research-free for now
}

// Render a slice to a prompt block. NOT consumed by any route in Phase 2 (routes still
// use briefToPromptBlock); wired in Phase 6. Kept here so the plumbing is complete.
export function sliceToPromptBlock(slice: ModuleSlice): string {
  if (slice.claims.length === 0) return "";
  const catLabel: Record<ClaimCategory, string> = {
    buyer: "Buyer Profile", target: "Target Profile", sector: "Sector Signals",
    comparables: "Recent Comparables", risks: "Live Risks & Regulatory",
  };
  const order: ClaimCategory[] = ["buyer", "target", "sector", "comparables", "risks"];
  const lines: string[] = ["## INTELLIGENCE PACKET (T0 evidence — cite by [sN]; not fact-checked)"];
  for (const cat of order) {
    const items = slice.claims.filter((c) => c.category === cat);
    if (!items.length) continue;
    lines.push(`\n### ${catLabel[cat]}`);
    for (const c of items) {
      const refs = c.sourceRefs.length ? ` ${c.sourceRefs.map((r) => `[${r}]`).join("")}` : "";
      lines.push(`- ${c.text}${refs} (fidelity ${c.extractionFidelity}, source ${c.sourceConfidence})`);
    }
  }
  if (slice.sources.length) {
    lines.push("\n### Sources");
    for (const s of slice.sources) lines.push(`[${s.id}] ${s.title} — ${s.url} (${s.sourceType})`);
  }
  return lines.join("\n");
}
