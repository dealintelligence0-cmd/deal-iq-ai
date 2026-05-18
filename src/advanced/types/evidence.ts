

export type EvidenceSourceType = "web" | "internal" | "proxy" | "assumption";
export type EvidenceConfidence = "low" | "medium" | "high";

export type EvidenceClaim = {
  claim_id: string;
  claim_text: string;
  source_type: EvidenceSourceType;
  source_ref: string;
  confidence: EvidenceConfidence;
  last_verified_date: string;
};
