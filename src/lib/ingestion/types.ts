

/**
 * Deal IQ AI — Ingestion v2 — shared types.
 *
 * Contracts between extractor → confidence engine → router → DB.
 * Keep this file free of runtime code so it can be imported anywhere.
 */

/** Raw uploaded row preserved verbatim. */
export type RawRow = Record<string, unknown>;

/** Mergermarket-style canonical column names normalised case-insensitively. */
export const FEED_COLUMNS = {
  HEADING:       ["Heading", "Headline", "Title"],
  OPPORTUNITY:   ["Opportunity", "Notes", "Description"],
  BIDDERS:       ["Bidders", "Buyer", "Acquirer", "Buyers", "Acquirers"],
  TARGETS:       ["Targets", "Target", "Target Company"],
  VENDORS:       ["Vendors", "Seller", "Sellers", "Vendor"],
  ISSUERS:       ["Issuers", "Issuer"],
  INTEL_TYPE:    ["Intelligence Type", "Deal Type", "Transaction Type"],
  INTEL_SIZE:    ["Intelligence Size", "Size", "Size Range"],
  INTEL_GRADE:   ["Intelligence Grade", "Confidence", "Grade"],
  STAKE_VALUE:   ["Stake Value", "Stake", "Stake %", "Stake Percent"],
  SECTOR:        ["Dominant Sector", "Sector", "Sectors", "Primary Sector", "Industry"],
  GEOGRAPHY:     ["Dominant Geography", "Geography", "Country", "Region"],
  TOPICS:        ["Topics"],
  DATE:          ["Date", "Deal Date", "Announcement Date", "Announced Date"],
  VALUE_INR:     ["Value INR(m)", "Value INR", "Value INR (m)"],
  VALUE_DESC:    ["Value Description", "Value Display", "Value"],
} as const;

/** Per-field confidence value 0..1 plus the evidence that produced it. */
export type FieldEvidence = {
  value: string | null;
  confidence: number;          // 0..1
  source: "structured" | "heading_pattern" | "opportunity_pattern" | "ai_fallback" | "correction_example" | "default" | "none";
  reasoning?: string;
};

/** Full extraction result for one raw row. */
export type ExtractionResult = {
  heading: string;
  is_digest: boolean;
  digest_reason: string | null;

  // Per-field results
  buyer: FieldEvidence;
  target: FieldEvidence;
  vendor: FieldEvidence;
  dominant_sector: FieldEvidence;
  dominant_geography: FieldEvidence;
  intelligence_size: FieldEvidence;
  intelligence_grade: FieldEvidence;
  stake_value: FieldEvidence;
  deal_type: FieldEvidence;
  deal_status: FieldEvidence;

  // Aggregate
  row_confidence: number;       // 0..1
  parse_path: string;           // human-readable path label
  needs_review: boolean;
  uncertainty_reasons: string[];

  // Audit
  evidence_json: Record<string, unknown>;

  // For learning loop
  intent_tags: string[];

  // Date (best-effort)
  deal_date: string | null;     // ISO YYYY-MM-DD
};

/** Output of the router decision step. */
export type RouterDecision =
  | { kind: "canonical";  result: ExtractionResult }
  | { kind: "digest";     result: ExtractionResult }
  | { kind: "resolution"; result: ExtractionResult };

/** Confidence thresholds — central source of truth. */
export const CONFIDENCE = {
  AUTO_CANONICAL: 0.75,    // ≥ this and not flagged → canonical_deals
  AUTO_REVIEW:    0.40,    // < CANONICAL and ≥ this → resolution_tasks
  // < AUTO_REVIEW                       → resolution_tasks with high-priority flag
} as const;
