import type { ChatMessage } from "./providers";

export interface EnrichmentInput {
  id: string;
  buyer: string | null;
  target: string | null;
  sector: string | null;
  country: string | null;
  deal_type: string | null;
  value_raw: string | null;
  normalized_value_usd: number | null;
  stake_percent: number | null;
  status: string | null;
}

export interface EnrichmentOutput {
  id: string;
  clean_buyer: string;
  clean_target: string;
  classified_deal_type: string;
  priority_score: number;
  advisory_score: number;
  risk_flag: string;
  deal_status: string;
  ai_summary: string;
  confidence: number;
}

const DEAL_TYPES = [
  "M&A", "PE Buyout", "Venture", "Debt Financing",
  "IPO", "JV", "Merger", "Divestiture", "Asset Sale",
];

export function buildEnrichPrompt(deal: EnrichmentInput): ChatMessage[] {
  const lines: string[] = [];
  if (deal.buyer)                 lines.push(`Buyer: ${deal.buyer}`);
  if (deal.target)                lines.push(`Target: ${deal.target}`);
  if (deal.sector)                lines.push(`Sector: ${deal.sector}`);
  if (deal.country)               lines.push(`Country: ${deal.country}`);
  if (deal.deal_type)             lines.push(`Deal Type: ${deal.deal_type}`);
  if (deal.value_raw)             lines.push(`Value (raw): ${deal.value_raw}`);
  if (deal.normalized_value_usd)  lines.push(`Normalized USD: $${deal.normalized_value_usd.toLocaleString()}`);
  if (deal.stake_percent)         lines.push(`Stake: ${deal.stake_percent}%`);
  if (deal.status)                lines.push(`Status: ${deal.status}`);

  return [
    {
      role: "system",
      content: `You are an expert M&A deal intelligence analyst. Analyze the deal data and return ONLY a valid JSON object (no markdown, no explanation) with EXACTLY these fields:
{
  "clean_buyer": "<normalized company name>",
  "clean_target": "<normalized company name>",
  "classified_deal_type": "<one of: ${DEAL_TYPES.join(" | ")}>",
  "priority_score": <integer 1-10>,
  "advisory_score": <integer 1-10>,
  "risk_flag": "<low | medium | high>",
  "deal_status": "<live | rumor | announced | closed | dropped>",
  "ai_summary": "<2-3 sentence strategic summary of this deal>",
  "confidence": <float 0.0-1.0>
}`,
    },
    {
      role: "user",
      content: `Enrich this M&A deal:\n${lines.join("\n")}`,
    },
  ];
}

export function parseEnrichmentResponse(id: string, text: string): EnrichmentOutput | null {
  try {
    const clean = text.replace(/```json|```/g, "").trim();
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);

    return {
      id,
      clean_buyer:           String(parsed.clean_buyer ?? ""),
      clean_target:          String(parsed.clean_target ?? ""),
      classified_deal_type:  DEAL_TYPES.includes(parsed.classified_deal_type)
                               ? parsed.classified_deal_type : "M&A",
      priority_score:        clamp(Number(parsed.priority_score) || 5, 1, 10),
      advisory_score:        clamp(Number(parsed.advisory_score) || 5, 1, 10),
      risk_flag:             ["low","medium","high"].includes(parsed.risk_flag)
                               ? parsed.risk_flag : "medium",
      deal_status:           ["live","rumor","announced","closed","dropped"].includes(parsed.deal_status)
                               ? parsed.deal_status : "announced",
      ai_summary:            String(parsed.ai_summary ?? ""),
      confidence:            clamp(Number(parsed.confidence) || 0.7, 0, 1),
    };
  } catch {
    return null;
  }
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}
