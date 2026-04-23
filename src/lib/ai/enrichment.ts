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
  if (deal.buyer) lines.push(`Buyer: ${deal.buyer}`);
  if (deal.target) lines.push(`Target: ${deal.target}`);
  if (deal.sector) lines.push(`Sector: ${deal.sector}`);
  if (deal.country) lines.push(`Country: ${deal.country}`);
  if (deal.deal_type) lines.push(`Deal Type: ${deal.deal_type}`);
  if (deal.value_raw) lines.push(`Value (raw): ${deal.value_raw}`);
  if (deal.normalized_value_usd) lines.push(`Normalized USD: $${deal.normalized_value_usd.toLocaleString()}`);
  if (deal.stake_percent) lines.push(`Stake: ${deal.stake_percent}%`);
  if (deal.status) lines.push(`Status: ${deal.status}`);

  return [
    {
      role: "system",
      content: `You are an M&A analyst. Respond with ONLY a JSON object, no prose, no markdown fences. Keys:
clean_buyer, clean_target, classified_deal_type (${DEAL_TYPES.join("|")}), priority_score (1-10), advisory_score (1-10), risk_flag (low|medium|high), deal_status (live|rumor|announced|closed|dropped), ai_summary (2-3 sentences), confidence (0-1).`,
    },
    {
      role: "user",
      content: `Deal:\n${lines.join("\n")}\n\nReturn JSON only.`,
    },
  ];
}

export function parseEnrichmentResponse(id: string, text: string, fallback?: EnrichmentInput): EnrichmentOutput | null {
  // Try JSON parse first
  const parsed = tryParseJson(text);
  if (parsed) {
    return {
      id,
      clean_buyer: String(parsed.clean_buyer ?? fallback?.buyer ?? ""),
      clean_target: String(parsed.clean_target ?? fallback?.target ?? ""),
      classified_deal_type: DEAL_TYPES.includes(parsed.classified_deal_type)
        ? parsed.classified_deal_type : (fallback?.deal_type ?? "M&A"),
      priority_score: clamp(Number(parsed.priority_score) || 5, 1, 10),
      advisory_score: clamp(Number(parsed.advisory_score) || 5, 1, 10),
      risk_flag: ["low", "medium", "high"].includes(parsed.risk_flag) ? parsed.risk_flag : "medium",
      deal_status: ["live", "rumor", "announced", "closed", "dropped"].includes(parsed.deal_status)
        ? parsed.deal_status : (fallback?.status ?? "announced"),
      ai_summary: String(parsed.ai_summary ?? "").slice(0, 600),
      confidence: clamp(Number(parsed.confidence) || 0.7, 0, 1),
    };
  }

  // Non-JSON response (free tier or malformed) — derive rule-based enrichment
  if (fallback) {
    return deriveRuleBased(id, fallback);
  }
  return null;
}

function tryParseJson(text: string): Record<string, string | number> | null {
  try {
    const clean = text.replace(/```json|```/g, "").trim();
    // Strip everything before first { and after last }
    const first = clean.indexOf("{");
    const last = clean.lastIndexOf("}");
    if (first === -1 || last === -1 || last <= first) return null;
    const slice = clean.slice(first, last + 1);
    return JSON.parse(slice);
  } catch {
    return null;
  }
}

function deriveRuleBased(id: string, d: EnrichmentInput): EnrichmentOutput {
  const size = d.normalized_value_usd ?? 0;
  const priority = size >= 5e9 ? 9 : size >= 1e9 ? 7 : size >= 1e8 ? 5 : 3;
  const advisory = (["Technology", "Healthcare", "Financial Services"].includes(d.sector ?? "") ? 2 : 0) +
                   (size >= 1e9 ? 6 : size >= 1e8 ? 4 : 2);
  const risk = size >= 5e9 ? "high" : size >= 5e8 ? "medium" : "low";
  const status = d.status && ["live","rumor","announced","closed","dropped"].includes(d.status)
    ? d.status : "announced";
  const summary = `${d.buyer ?? "Buyer"} in deal with ${d.target ?? "target"}${d.sector ? ` in ${d.sector}` : ""}${d.country ? ` (${d.country})` : ""}${size ? `, valued at $${(size/1e6).toFixed(0)}M` : ""}. Rule-based analysis — add AI key in Settings for detailed summary.`;

  return {
    id,
    clean_buyer: d.buyer ?? "",
    clean_target: d.target ?? "",
    classified_deal_type: d.deal_type ?? "M&A",
    priority_score: priority,
    advisory_score: clamp(advisory, 1, 10),
    risk_flag: risk,
    deal_status: status,
    ai_summary: summary,
    confidence: 0.5,
  };
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}
