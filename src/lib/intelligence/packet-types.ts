// src/lib/intelligence/packet-types.ts
//
// Shared types for the Intelligence Packet pipeline (T0→T3 local/cloud AI tiering).
// The packet is a SINGLE module-independent asset built from research; each of the
// four AI modules pulls the slice it needs (rule 2: one packet, four consumers).
//
// THREE-FLAG TRUST MODEL (non-negotiable — pipeline rule 3). "Verified" has three
// distinct meanings and each claim carries all three as separate flags:
//   extractionFidelity — does the claim text actually appear in the source? (T0 checks)
//   sourceConfidence   — how authoritative is the SOURCE itself?          (T0 heuristic)
//   factuallyVerified  — is the claim actually TRUE? T0/T1 CANNOT assert this. Always false.
// "Found in source" is never conflated with "true".

// Bump PACKET_SCHEMA_VERSION when the packet SHAPE changes (fields added/removed/retyped).
// v2: added EvidenceClaim.t1Derived (Phase 4 — on-device T1 compression marker).
export const PACKET_SCHEMA_VERSION = 2 as const;
// Bump PROCESSOR_VERSION when T0/T1 EXTRACTION LOGIC changes (even if the shape is identical).
export const PROCESSOR_VERSION = 1 as const;

export type ModuleId = "proposal" | "synergy" | "pmi" | "tsa";

// Which section of the research brief a claim originated from — lets each module
// slice pull only the categories it cares about.
export type ClaimCategory = "buyer" | "target" | "sector" | "comparables" | "risks";

// Coarse classification of a source, derived deterministically from its URL.
export type SourceType =
  | "regulator" // .gov / competition & securities authorities
  | "wire"      // Reuters, Bloomberg, AP, FT, WSJ, CNBC, Economist
  | "press"     // general news / business press
  | "prwire"    // PR Newswire, Business Wire, GlobeNewswire, company releases
  | "unknown";  // no URL, or an unrecognized domain

export type SourceRef = {
  id: string;          // stable within a packet, e.g. "s1"
  title: string;
  url: string;         // "" for prompt-based (non-web) briefs
  sourceType: SourceType;
  fetchedAt: string;   // ISO — inherited from the brief's generated_at
};

export type EvidenceClaim = {
  text: string;
  category: ClaimCategory;
  // 0..1 — fraction of the claim that verifiably appears in the cited source text.
  // T0 extracts verbatim/near-verbatim so this is high; T1 paraphrases are re-checked
  // against the source in a later phase. Low when no attributable source exists.
  extractionFidelity: number;
  // 0..1 — reliability of the SOURCE, not the claim. Domain / source-type heuristic.
  sourceConfidence: number;
  // Whether the claim is actually TRUE. This pipeline NEVER asserts truth. Always false.
  factuallyVerified: false;
  // Which source(s) back this claim (SourceRef.id values). Empty when the claim is a
  // section-level summary with no single attributable source.
  sourceRefs: string[];
  // True when `text` was replaced by an on-device (T1) compression that PASSED the T0
  // re-validation pass (its tokens still appear in the source). Absent/false = verbatim
  // T0 text. T1 output is advisory: this flag never implies factual truth, only that a
  // compressed rendering was accepted. extractionFidelity is recomputed against the
  // source for the compressed text when this is true.
  t1Derived?: boolean;
};

export type PacketDealContext = {
  deal_id?: string;
  buyer?: string;
  target?: string;
  sector?: string;
  geography?: string;
};

export type IntelligencePacket = {
  schemaVersion: typeof PACKET_SCHEMA_VERSION;
  processorVersion: typeof PROCESSOR_VERSION;
  generatedAt: string;      // ISO — when the packet was built
  briefGeneratedAt: string; // ISO — when the underlying research was fetched
  deal: PacketDealContext;
  sources: SourceRef[];
  claims: EvidenceClaim[];  // the single module-independent asset
  keywords: string[];       // deterministic keyword extraction across all claims
  // True once on-device T1 compression/extraction has been applied (Phase 4+).
  // Pure-T0 (Phase 2) always emits false — the packet SHAPE is identical either way.
  t1Applied: boolean;
  // Populated by packet-cache.ts (Phase 5). Undefined in earlier phases.
  fingerprint?: string;
};

// ─── Per-module slices (rule 2: one packet, four consumers) ─────────────
// A slice is a filtered, module-scoped VIEW of the same packet. Distinct named
// types so each module's consumer has a precise contract, even though they share
// a common base shape today.

export type ModuleSlice = {
  module: ModuleId;
  claims: EvidenceClaim[];
  keywords: string[];
  sources: SourceRef[];
};

export type ProposalSlice = ModuleSlice; // comprehensive: all categories
export type SynergySlice = ModuleSlice;  // sector + comparables + buyer/target
export type PmiSlice = ModuleSlice;      // reserved — PMI stays research-free for now
export type TsaSlice = ModuleSlice;      // reserved — TSA stays research-free for now
