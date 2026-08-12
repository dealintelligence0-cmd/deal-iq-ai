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

// Async signature is intentional: Phase 4 slots on-device T1 in here without changing
// the contract. Phase 2 resolves synchronously (pure T0). Falls back cleanly to a
// T0-only packet — identical shape — when no research/T1 is available.
export async function buildIntelligencePacket(
  brief: ResearchBrief,
  deal: PacketDealContext,
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
  const claims: EvidenceClaim[] = [];
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
    const sourceRefs: string[] = [];
    if (matched) {
      const snippet = (brief.citations.find((c) => c.title === matched.title)?.snippet) ?? matched.title;
      extractionFidelity = computeExtractionFidelity(rc.text, `${matched.title} ${snippet}`);
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
  }

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
    t1Applied: false, // pure T0 in Phase 2
  };
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
