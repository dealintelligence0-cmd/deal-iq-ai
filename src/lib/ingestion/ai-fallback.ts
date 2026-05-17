

/**
 * Deal IQ AI — Ingestion v2 — AI fallback.
 *
 * Called only for rows where deterministic extraction left fields unresolved.
 * NEVER invents values — null when uncertain. Strict JSON output, no markdown.
 *
 * Provider-agnostic: works with any provider the platform supports
 * (OpenAI, Anthropic, Google/Gemini, Mistral, DeepSeek, Alibaba, xAI, Cohere,
 * Groq, NVIDIA, OpenRouter, Together, HuggingFace, Replicate). The
 * provider/model/key are supplied by the caller via the platform's standard
 * `resolveKey()` flow.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { type ExtractionResult, type FieldEvidence } from "./types";
import { readMergermarket } from "./columns";
import { getFewShotExamples, formatExamplesForPrompt } from "./few-shot";
import { callProvider, type ProviderId, type ChatMessage } from "@/lib/ai/providers";

const SYSTEM_PROMPT = `You are an M&A data extraction engine. Read the row and return a STRICT JSON object.

RULES:
- Output VALID JSON ONLY. No markdown, no prose, no commentary, no code fences.
- If a field cannot be determined from the row with high certainty, return null for it.
- NEVER invent buyer, target, sector, country, deal_type, deal_status, or stake.
- Preserve original entity names verbatim (do not translate, do not paraphrase).
- Use the structured columns when they are internally consistent.
- If the row is a multi-deal digest article (Weekly Wrap, Monitor, Tracker, etc.), set is_digest = true and leave entity fields null.

OUTPUT SCHEMA (must match exactly):
{
  "buyer": string | null,
  "target": string | null,
  "vendor": string | null,
  "dominant_sector": string | null,
  "dominant_geography": string | null,
  "intelligence_size": string | null,
  "stake_value": string | null,
  "deal_type": "Acquisition" | "Buyout" | "Investment" | "Merger" | "Takeover" | "IPO" | "Capital Markets" | null,
  "deal_status": "announced" | "live" | "completed" | "abandoned" | null,
  "is_digest": boolean,
  "field_confidence": {
    "buyer": 0..1,
    "target": 0..1,
    "deal_type": 0..1,
    "deal_status": 0..1
  },
  "reasoning": string
}`;

type AIPayload = {
  buyer: string | null;
  target: string | null;
  vendor: string | null;
  dominant_sector: string | null;
  dominant_geography: string | null;
  intelligence_size: string | null;
  stake_value: string | null;
  deal_type: string | null;
  deal_status: string | null;
  is_digest: boolean;
  field_confidence: Record<string, number>;
  reasoning: string;
};

/** What the caller supplies. Provider-agnostic. */
export type AIFallbackOptions = {
  provider: ProviderId;
  model: string;
  apiKey: string;
};

function userPromptFor(row: Record<string, unknown>): string {
  const m = readMergermarket(row);
  const lines: string[] = ["INPUT ROW:"];
  if (m.heading)     lines.push(`  Heading: ${m.heading}`);
  if (m.opportunity) lines.push(`  Opportunity: ${m.opportunity.slice(0, 1200)}`);
  if (m.bidders)     lines.push(`  Bidders: ${m.bidders}`);
  if (m.targets)     lines.push(`  Targets: ${m.targets}`);
  if (m.vendors)     lines.push(`  Vendors: ${m.vendors}`);
  if (m.issuers)     lines.push(`  Issuers: ${m.issuers}`);
  if (m.intel_type)  lines.push(`  Intelligence Type: ${m.intel_type}`);
  if (m.intel_size)  lines.push(`  Intelligence Size: ${m.intel_size}`);
  if (m.intel_grade) lines.push(`  Intelligence Grade: ${m.intel_grade}`);
  if (m.stake)       lines.push(`  Stake Value: ${m.stake}`);
  if (m.sector)      lines.push(`  Sector: ${m.sector}`);
  if (m.geography)   lines.push(`  Geography: ${m.geography}`);
  if (m.topics)      lines.push(`  Topics: ${m.topics}`);
  lines.push("");
  lines.push("Return JSON only.");
  return lines.join("\n");
}

function safeJsonParse(text: string): AIPayload | null {
  let s = text.trim();
  s = s.replace(/^```(?:json)?\s*/, "").replace(/```\s*$/, "");
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start < 0 || end < 0) return null;
  try {
    return JSON.parse(s.slice(start, end + 1)) as AIPayload;
  } catch {
    return null;
  }
}

export async function runAIFallback(
  sb: SupabaseClient,
  row: Record<string, unknown>,
  base: ExtractionResult,
  opts: AIFallbackOptions
): Promise<{ result: ExtractionResult; ai_payload: AIPayload | null }> {
  const examples = await getFewShotExamples(sb, base.intent_tags);
  const exampleBlock = formatExamplesForPrompt(examples);
  const systemContent = exampleBlock ? `${SYSTEM_PROMPT}\n\n${exampleBlock}` : SYSTEM_PROMPT;

  const messages: ChatMessage[] = [
    { role: "system", content: systemContent, stable: true },
    { role: "user",   content: userPromptFor(row) },
  ];

  let text: string;
  try {
    const result = await callProvider(opts.provider, opts.model, opts.apiKey, messages, 800);
    text = result.text;
  } catch {
    return { result: base, ai_payload: null };
  }

  const payload = safeJsonParse(text);
  if (!payload) return { result: base, ai_payload: null };

  const merged: ExtractionResult = { ...base };
  const ev = (value: string | null, conf: number, reason: string): FieldEvidence => ({
    value, confidence: conf, source: "ai_fallback", reasoning: reason,
  });

  const fc = payload.field_confidence ?? {};
  if (!merged.buyer.value && payload.buyer) {
    merged.buyer = ev(payload.buyer, Math.min(0.85, fc.buyer ?? 0.6), "AI fallback");
  }
  if (!merged.target.value && payload.target) {
    merged.target = ev(payload.target, Math.min(0.85, fc.target ?? 0.6), "AI fallback");
  }
  if (!merged.vendor.value && payload.vendor) {
    merged.vendor = ev(payload.vendor, 0.7, "AI fallback");
  }
  if (!merged.dominant_sector.value && payload.dominant_sector) {
    merged.dominant_sector = ev(payload.dominant_sector, 0.7, "AI fallback");
  }
  if (!merged.dominant_geography.value && payload.dominant_geography) {
    merged.dominant_geography = ev(payload.dominant_geography, 0.7, "AI fallback");
  }
  if (!merged.intelligence_size.value && payload.intelligence_size) {
    merged.intelligence_size = ev(payload.intelligence_size, 0.7, "AI fallback");
  }
  if (!merged.stake_value.value && payload.stake_value) {
    merged.stake_value = ev(payload.stake_value, 0.7, "AI fallback");
  }
  if (!merged.deal_type.value && payload.deal_type) {
    merged.deal_type = ev(payload.deal_type, Math.min(0.85, fc.deal_type ?? 0.65), "AI fallback");
  }
  if (!merged.deal_status.value && payload.deal_status) {
    merged.deal_status = ev(payload.deal_status, Math.min(0.85, fc.deal_status ?? 0.65), "AI fallback");
  }
  if (payload.is_digest && !merged.is_digest) {
    merged.is_digest = true;
    merged.digest_reason = "AI classified as digest";
  }

  const w = { buyer: 0.20, target: 0.20, dominant_sector: 0.10, dominant_geography: 0.10,
              intelligence_size: 0.08, intelligence_grade: 0.05, stake_value: 0.07,
              deal_type: 0.10, deal_status: 0.10 } as const;
  type K = keyof typeof w;
  let conf = 0;
  for (const k of Object.keys(w) as K[]) {
    conf += (merged[k as keyof ExtractionResult] as FieldEvidence).confidence * w[k];
  }
  merged.row_confidence = Math.max(merged.row_confidence, Math.min(1, conf));

  const u: string[] = [];
  if (!merged.buyer.value) u.push("buyer unresolved");
  if (!merged.target.value) u.push("target unresolved");
  if (!merged.deal_status.value) u.push("deal_status unresolved");
  if (!merged.deal_type.value) u.push("deal_type unresolved");
  merged.uncertainty_reasons = u;
  merged.parse_path = merged.parse_path + " + ai_fallback";

  merged.evidence_json = {
    ...(merged.evidence_json as object),
    ai_fallback: payload,
    ai_provider: opts.provider,
    ai_model: opts.model,
    ai_examples_used: examples.length,
  };

  return { result: merged, ai_payload: payload };
}
