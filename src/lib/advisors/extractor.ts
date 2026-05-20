/**
 * Phase 6 — Advisor extractor.
 *
 * For each deal, asks the AI to identify:
 *   - Named advisors mentioned in the heading (high confidence)
 *   - Inferred most-likely advisors based on buyer + size + sector (low confidence)
 *
 * Returns up to 4 advisors per deal with role (buyer/target/lender/legal), side, and confidence.
 */

import { routedCall, type RouteConfig } from "@/lib/ai/router";

export type ExtractedAdvisor = {
  advisor_name: string;     // raw name as AI returned it
  role: "buyer_advisor" | "target_advisor" | "lender" | "legal" | "unknown";
  side: "buy" | "sell" | "both" | null;
  confidence: number;       // 0..1
  source_quote: string | null;  // word-for-word phrase from heading IF named explicitly
};

export type DealForExtraction = {
  id: string;
  heading: string;
  buyer: string | null;
  target: string | null;
  sector: string | null;
  geography: string | null;
  size_band: string | null;
};

const SYSTEM_PROMPT = `You identify financial advisors for M&A deals.

Given deal metadata, return advisors you can identify, in two confidence bands:
  - HIGH (0.7-1.0): Advisor is NAMED in the heading or context (must include source_quote)
  - LOW (0.3-0.5): Likely advisor INFERRED from buyer size, sector norms, geography

Examples of named advisors in headlines: "Goldman Sachs leads", "Lazard mandated", "advised by Rothschild".
For inferred advisors, use M&A norms (e.g. a USD 5bn US-tech sell-side process typically draws Goldman/MS/JPM/Qatalyst; an India regional bank-deal typically draws Avendus/Kotak).

OUTPUT — strict JSON only, no markdown:
{
  "advisors": [
    {
      "advisor_name": "Goldman Sachs",
      "role": "buyer_advisor" | "target_advisor" | "lender" | "legal" | "unknown",
      "side": "buy" | "sell" | "both" | null,
      "confidence": 0.0-1.0,
      "source_quote": "exact text from heading if named, else null"
    }
  ]
}

RULES:
- Return at most 4 advisors per deal
- If nothing can be identified (truly generic heading, no inference possible), return {"advisors":[]}
- DO NOT invent specific quotes — only include source_quote if the heading literally contains the phrase
- Use canonical names (e.g. "Goldman Sachs", "Morgan Stanley", "Lazard") — not casual abbreviations
- Output MUST be valid JSON. No trailing commas. No comments.`;

function safeParseJson(s: string): Record<string, unknown> | null {
  if (!s) return null;
  const clean = s.replace(/```(?:json)?/gi, "").trim();
  const a = clean.indexOf("{");
  if (a < 0) return null;
  const lastBrace = clean.lastIndexOf("}");
  if (lastBrace > a) {
    try { return JSON.parse(clean.slice(a, lastBrace + 1)); } catch { /* fall through */ }
  }
  // Truncation repair
  const body = clean.slice(a);
  let inString = false; let escape = false; const stack: string[] = [];
  let lastCompleteValueEnd = -1;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (escape) { escape = false; continue; }
    if (c === "\\") { escape = true; continue; }
    if (inString) { if (c === '"') inString = false; continue; }
    if (c === '"') { inString = true; continue; }
    if (c === "{" || c === "[") stack.push(c);
    else if (c === "}" || c === "]") { stack.pop(); if (stack.length === 0) lastCompleteValueEnd = i; }
  }
  let repaired = body;
  if (inString) repaired += '"';
  if (lastCompleteValueEnd > 0 && (stack.length > 0 || inString)) {
    repaired = body.slice(0, lastCompleteValueEnd + 1);
    stack.length = 0; inString = false; escape = false;
    for (let i = 0; i < repaired.length; i++) {
      const c = repaired[i];
      if (escape) { escape = false; continue; }
      if (c === "\\") { escape = true; continue; }
      if (inString) { if (c === '"') inString = false; continue; }
      if (c === '"') { inString = true; continue; }
      if (c === "{" || c === "[") stack.push(c);
      else if (c === "}" || c === "]") stack.pop();
    }
  }
  while (stack.length > 0) { const top = stack.pop(); repaired += top === "{" ? "}" : "]"; }
  try { return JSON.parse(repaired); } catch { return null; }
}

const VALID_ROLES = new Set(["buyer_advisor","target_advisor","lender","legal","unknown"]);
const VALID_SIDES = new Set(["buy","sell","both"]);

function clampConfidence(n: unknown): number {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return 0.5;
  return Math.max(0, Math.min(1, x));
}

/** Extract advisors for a batch of deals. Returns one entry per deal. */
export async function extractAdvisorsBatch(
  routeCfg: RouteConfig,
  deals: DealForExtraction[]
): Promise<{ byDeal: Map<string, ExtractedAdvisor[]>; cost_usd: number; error: string | null; provider: string | null; model: string | null }> {
  const byDeal = new Map<string, ExtractedAdvisor[]>();
  let totalCost = 0;
  let lastError: string | null = null;
  let lastProvider: string | null = null;
  let lastModel: string | null = null;

  // Process deals sequentially with a small batch size in the prompt — keeps each request
  // bounded so JSON output stays parseable and we can attribute errors per-deal
  const CHUNK = 5;
  for (let i = 0; i < deals.length; i += CHUNK) {
    const chunk = deals.slice(i, i + CHUNK);
    const block = chunk.map((d, idx) =>
      `Deal ${idx + 1} (id=${d.id}):
  Heading: "${d.heading.slice(0, 200)}"
  Buyer: ${d.buyer ?? "—"} → Target: ${d.target ?? "—"}
  Sector: ${d.sector ?? "—"} · Geo: ${d.geography ?? "—"} · Size: ${d.size_band ?? "—"}`
    ).join("\n\n");

    const userPrompt = `Analyse these ${chunk.length} deals and return advisors per deal.

OUTPUT — strict JSON only:
{
  "by_deal": {
    "<id>": { "advisors": [ ... ] },
    ...
  }
}

DEALS
=====
${block}`;

    try {
      const res = await routedCall(routeCfg, [
        { role: "system", content: SYSTEM_PROMPT, stable: true },
        { role: "user", content: userPrompt },
      ], 2500);
      totalCost += ((res.inputTokens / 1000) * 0.0015) + ((res.outputTokens / 1000) * 0.006);
      lastProvider = res.provider; lastModel = res.model;

      if (res.model === "rules-v1" || res.text.startsWith("[rule-based]")) {
        lastError = `AI fell through to rules-v1 (provider ${res.provider} failed)`;
        continue;
      }

      const parsed = safeParseJson(res.text);
      const byId = (parsed?.by_deal ?? {}) as Record<string, { advisors?: unknown[] }>;
      for (const d of chunk) {
        const entry = byId[d.id];
        const list = Array.isArray(entry?.advisors) ? entry!.advisors as Array<Record<string, unknown>> : [];
        const cleaned: ExtractedAdvisor[] = [];
        for (const a of list.slice(0, 4)) {
          const name = String(a.advisor_name ?? "").trim();
          if (!name || name.length < 2) continue;
          const role = String(a.role ?? "unknown");
          const side = a.side ? String(a.side) : null;
          cleaned.push({
            advisor_name: name.slice(0, 200),
            role: (VALID_ROLES.has(role) ? role : "unknown") as ExtractedAdvisor["role"],
            side: (side && VALID_SIDES.has(side) ? side : null) as ExtractedAdvisor["side"],
            confidence: clampConfidence(a.confidence),
            source_quote: a.source_quote ? String(a.source_quote).slice(0, 300) : null,
          });
        }
        byDeal.set(d.id, cleaned);
      }
    } catch (e: any) {
      lastError = e?.message ?? String(e);
      // Continue to next chunk
    }
  }

  return { byDeal, cost_usd: totalCost, error: lastError, provider: lastProvider, model: lastModel };
}
