

/**
 * Signal extractor — turns raw filing text into 5 typed signals.
 *
 * Five signal categories, each tied to a specific advisory opportunity:
 *   margin_pressure        — cost-out / operating model engagements
 *   transformation_pressure — digital / ERP / cloud migration mandates
 *   activist_activity      — defense, governance, strategic review work
 *   acquisition_intent     — buy-side commercial diligence
 *   leadership_change      — new-CEO 100-day plans, restructuring
 *
 * Architecture: ONE prompt → strict JSON list of signals. The same JSON-repair
 * logic that hardened Phase 2 critique and Phase 1 themes applies here.
 */

import { routedCall, type RouteConfig } from "@/lib/ai/router";

export type Signal = {
  signal_type: "margin_pressure" | "transformation_pressure" | "activist_activity" | "acquisition_intent" | "leadership_change";
  severity: "low" | "medium" | "high" | "critical";
  confidence: number;        // 0..1
  headline: string;
  evidence_quote: string;
  context: string;
  pitch_angle: string;
};

export type ExtractResult = {
  signals: Signal[];
  error: string | null;
  cost_usd: number;
};

const SYSTEM_PROMPT = `You are a senior M&A advisor reading a corporate filing to identify advisory opportunities.

Extract concrete signals across 5 categories ONLY:

1. margin_pressure       — cost pressure, declining margins, peer-trailing margins, cost-program announcements
2. transformation_pressure — ERP/SAP migration delays, cloud migration, digital transformation gaps, tech debt
3. activist_activity     — activist letters, board pressure, governance issues, strategic review demands
4. acquisition_intent    — M&A pipeline mentions, divestiture hints, capital allocation shifts, carve-out signals
5. leadership_change     — CEO/CFO/COO changes, new chairman, succession planning, restructuring announcements

OUTPUT — STRICT JSON only, no markdown:
{
  "signals": [
    {
      "signal_type": "margin_pressure" | "transformation_pressure" | "activist_activity" | "acquisition_intent" | "leadership_change",
      "severity": "low" | "medium" | "high" | "critical",
      "confidence": 0.0-1.0,
      "headline": "≤120 chars — what's the signal in one line",
      "evidence_quote": "≤250 chars — exact phrase from filing supporting this (in quotes)",
      "context": "≤300 chars — 2 sentence analyst interpretation",
      "pitch_angle": "≤200 chars — the specific advisory angle this opens"
    }
  ]
}

RULES:
- Return 0-6 signals max. ONLY include signals with clear evidence. Skip generic forward-looking statements.
- If filing is bland (just routine updates), return {"signals": []}. Don't fabricate signals.
- Quotes must be word-for-word from the filing. If you can't quote it, drop the signal.
- Severity: "critical" = imminent advisory window (next 30 days), "high" = next quarter, "medium" = next 6 months, "low" = monitoring
- NEVER use: "transformational", "synergies", "strategic value", "leverage", "robust"
- Output MUST be valid JSON. No trailing commas. No comments.`;

function buildUserPrompt(companyName: string, filingType: string, fiscalPeriod: string | null, content: string): string {
  // Cap input at 24K chars (~6K tokens) — focuses on the most signal-dense sections
  const truncated = content.slice(0, 24_000);
  return `COMPANY: ${companyName}
FILING TYPE: ${filingType}${fiscalPeriod ? ` (${fiscalPeriod})` : ""}

FILING CONTENT (truncated to ~24K chars)
========================================
${truncated}

Extract advisory signals as JSON. If nothing concrete, return {"signals":[]}.`;
}

/** Robust JSON parse with truncation repair — same logic as critique/labeler. */
function safeJsonParse(text: string): Record<string, unknown> | null {
  if (!text) return null;
  let s = text.replace(/```(?:json)?/gi, "").trim();
  const a = s.indexOf("{");
  if (a < 0) return null;
  const lastBrace = s.lastIndexOf("}");
  if (lastBrace > a) {
    try { return JSON.parse(s.slice(a, lastBrace + 1)); } catch { /* fall through */ }
  }
  // Try repair
  const body = s.slice(a);
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

function clampNum(n: unknown, lo: number, hi: number, def: number): number {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return def;
  return Math.max(lo, Math.min(hi, x));
}

const VALID_TYPES = new Set([
  "margin_pressure", "transformation_pressure", "activist_activity",
  "acquisition_intent", "leadership_change",
]);
const VALID_SEVERITIES = new Set(["low", "medium", "high", "critical"]);

export async function extractSignals(
  routeCfg: RouteConfig,
  companyName: string,
  filingType: string,
  fiscalPeriod: string | null,
  content: string
): Promise<ExtractResult> {
  let cost_usd = 0;
  try {
    const res = await routedCall(routeCfg, [
      { role: "system", content: SYSTEM_PROMPT, stable: true },
      { role: "user", content: buildUserPrompt(companyName, filingType, fiscalPeriod, content) },
    ], 2500);
    cost_usd = ((res.inputTokens / 1000) * 0.0015) + ((res.outputTokens / 1000) * 0.006);

    const parsed = safeJsonParse(res.text);
    if (!parsed) {
      return { signals: [], error: `Could not parse AI response. Preview: "${res.text.slice(0, 200)}…"`, cost_usd };
    }
    const arr = Array.isArray(parsed.signals) ? parsed.signals as Array<Record<string, unknown>> : [];
    const signals: Signal[] = [];
    for (const s of arr.slice(0, 10)) {
      const t = String(s.signal_type ?? "");
      if (!VALID_TYPES.has(t)) continue;
      const sev = String(s.severity ?? "medium");
      const severity = (VALID_SEVERITIES.has(sev) ? sev : "medium") as Signal["severity"];
      const headline = String(s.headline ?? "").slice(0, 200);
      if (!headline) continue;  // require at least a headline
      signals.push({
        signal_type: t as Signal["signal_type"],
        severity,
        confidence: clampNum(s.confidence, 0, 1, 0.7),
        headline,
        evidence_quote: String(s.evidence_quote ?? "").slice(0, 400),
        context: String(s.context ?? "").slice(0, 500),
        pitch_angle: String(s.pitch_angle ?? "").slice(0, 400),
      });
    }
    return { signals, error: null, cost_usd };
  } catch (e: any) {
    return { signals: [], error: e?.message ?? String(e), cost_usd };
  }
}
