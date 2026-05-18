/**
 * Deal IQ AI — Critique This Pitch
 *
 * For each persona (PE Partner, CFO, Investment Committee, Activist, Operating
 * Partner), runs one prompt that returns a strict JSON critique. Aggregates
 * scores into four headline numbers (credibility / differentiation / executive
 * relevance / strategic sharpness) and lifts the most damning warnings + the
 * sharpest strengths into a top-line list for the dashboard.
 *
 * The output is what enables the sharpened-version regeneration: each persona
 * tells us where to attack, the regenerator uses those flags as the brief.
 *
 * Architecture deliberately simple — pure prompt chains via the existing
 * routedCall layer. No agents, no fine-tuning, no orchestration framework.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { routedCall, type RouteConfig } from "@/lib/ai/router";
import type { ProviderId } from "@/lib/ai/providers";

// ============================================================================
// TYPES
// ============================================================================

export type PersonaCritique = {
  persona_id: string;
  display_name: string;
  credibility: number;             // 0..100
  differentiation: number;
  executive_relevance: number;
  strategic_sharpness: number;
  flags: Array<{
    severity: "high" | "medium" | "low";
    category: string;              // e.g. "weak_synergy", "generic_messaging"
    text: string;
  }>;
  strengths: string[];             // 1–3 short bullets
  sharpening_suggestions: Array<{
    weakness: string;
    suggested_revision: string;
  }>;
  one_line_verdict: string;
};

export type CritiqueResult = {
  personas: PersonaCritique[];
  overall_credibility:        number;
  overall_differentiation:    number;
  overall_executive_relevance: number;
  overall_strategic_sharpness: number;
  overall_score:              number;     // weighted blend
  top_warnings:  Array<{ persona: string; severity: string; text: string }>;
  top_strengths: Array<{ persona: string; text: string }>;
  cost_usd: number;
  provider: ProviderId;
  model: string;
};

// ============================================================================
// PROMPT BUILDERS
// ============================================================================

const BASE_SCHEMA_INSTRUCTION = `
RESPONSE FORMAT — STRICT JSON ONLY. No markdown, no commentary.

{
  "credibility": 0-100,
  "differentiation": 0-100,
  "executive_relevance": 0-100,
  "strategic_sharpness": 0-100,
  "one_line_verdict": "single sentence — what this pitch is missing most",
  "flags": [
    {"severity": "high|medium|low",
     "category": "weak_synergy|generic_messaging|unsupported_assumption|missing_evidence|weak_differentiation|consulting_jargon|narrative_inconsistency|missing_quantification|weak_commercial_logic|missing_competitive_context|other",
     "text": "specific, actionable critique — 1 sentence"}
  ],
  "strengths": ["1-3 short bullets — what actually works"],
  "sharpening_suggestions": [
    {"weakness": "specific weakness", "suggested_revision": "concrete rewrite suggestion (1-2 sentences)"}
  ]
}

RULES:
- 3-5 flags, ranked by severity (most damaging first)
- Each flag text must be ≤120 characters — concise, actionable
- 1-3 strengths (be honest — many pitches have few). Each ≤80 chars.
- 2-3 sharpening suggestions. Keep each suggestion ≤200 chars total.
- Scores: 70+ means genuinely strong, 50-69 means acceptable but not partner-grade, <50 means problematic
- NEVER use "transformational", "strategic value", "robust framework" or other consulting filler in your own response
- Output MUST be valid JSON. Do not include trailing commas. Do not include comments.
`.trim();

function buildPersonaPrompt(personaPrompt: string, proposalContent: string, proposalMeta: {
  client: string; buyer?: string; target?: string; sector?: string; geography?: string; type?: string;
}): { system: string; user: string } {
  return {
    system: `${personaPrompt}\n\n${BASE_SCHEMA_INSTRUCTION}`,
    user: `PITCH TO CRITIQUE
================
Client: ${proposalMeta.client}
${proposalMeta.buyer ? `Buyer: ${proposalMeta.buyer}\n` : ""}${proposalMeta.target ? `Target: ${proposalMeta.target}\n` : ""}${proposalMeta.sector ? `Sector: ${proposalMeta.sector}\n` : ""}${proposalMeta.geography ? `Geography: ${proposalMeta.geography}\n` : ""}${proposalMeta.type ? `Proposal type: ${proposalMeta.type}\n` : ""}
PITCH BODY
----------
${proposalContent.slice(0, 12000)}

Critique this pitch from your perspective. Return JSON only.`,
  };
}

// ============================================================================
// PARSING
// ============================================================================

/**
 * Safely parse AI-returned JSON, including:
 *  - stripping markdown code fences (``` or ```json) anywhere in the string
 *  - finding the outermost { ... } block
 *  - if the response was truncated, attempting to close it and retry
 *  - last-resort: extract individual top-level numeric fields by regex
 */
function safeJsonParse(text: string): Record<string, unknown> | null {
  if (!text) return null;
  // Strip code fences anywhere (some providers stream ```json then content then ``` at end)
  let s = text.replace(/```(?:json)?/gi, "").trim();
  const a = s.indexOf("{");
  if (a < 0) return null;
  // Try the full block from first { to last }
  const lastBrace = s.lastIndexOf("}");
  if (lastBrace > a) {
    try { return JSON.parse(s.slice(a, lastBrace + 1)); } catch { /* fall through */ }
  }
  // The response was probably truncated. Try to repair it.
  const body = s.slice(a);
  const repaired = tryRepairTruncatedJson(body);
  if (repaired) {
    try { return JSON.parse(repaired); } catch { /* fall through */ }
  }
  // Last resort — pull individual numeric fields out by regex so we at least get scores
  return extractScoresOnly(body);
}

/** Attempt to balance braces/brackets in truncated JSON. */
function tryRepairTruncatedJson(s: string): string | null {
  // Walk through the string tracking open structures, stop if we hit an unterminated string
  let inString = false; let escape = false; const stack: string[] = [];
  let lastCompleteValueEnd = -1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (escape) { escape = false; continue; }
    if (c === "\\") { escape = true; continue; }
    if (inString) { if (c === '"') inString = false; continue; }
    if (c === '"') { inString = true; continue; }
    if (c === "{" || c === "[") stack.push(c);
    else if (c === "}" || c === "]") {
      stack.pop();
      if (stack.length === 0) lastCompleteValueEnd = i;
    }
    else if (c === "," && stack.length === 1) {
      // top-level field boundary — safe trim point
      lastCompleteValueEnd = i - 1;
    }
  }
  // If we're mid-string, close it
  let repaired = s;
  if (inString) repaired += '"';
  // If we have a trailing partial value after the last safe comma, trim back
  if (lastCompleteValueEnd > 0 && (stack.length > 0 || inString)) {
    repaired = s.slice(0, lastCompleteValueEnd + 1);
    // Recompute stack from the trimmed prefix
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
  // Close every open structure
  while (stack.length > 0) {
    const top = stack.pop();
    repaired += top === "{" ? "}" : "]";
  }
  return repaired;
}

/** Pull individual numeric fields out by regex — last-resort fallback. */
function extractScoresOnly(s: string): Record<string, unknown> | null {
  const num = (field: string): number | undefined => {
    const m = s.match(new RegExp(`"${field}"\\s*:\\s*(\\d+)`));
    return m ? parseInt(m[1], 10) : undefined;
  };
  const credibility         = num("credibility");
  const differentiation     = num("differentiation");
  const executive_relevance = num("executive_relevance");
  const strategic_sharpness = num("strategic_sharpness");
  if (credibility === undefined && differentiation === undefined &&
      executive_relevance === undefined && strategic_sharpness === undefined) {
    return null;
  }
  const verdictMatch = s.match(/"one_line_verdict"\s*:\s*"([^"]*)"/);
  return {
    credibility, differentiation, executive_relevance, strategic_sharpness,
    flags: [], strengths: [], sharpening_suggestions: [],
    one_line_verdict: verdictMatch ? verdictMatch[1] : "(response truncated — partial parse)",
    _partial: true,
  };
}

function clamp(n: unknown, lo = 0, hi = 100): number {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return 50;
  return Math.max(lo, Math.min(hi, Math.round(x)));
}

// ============================================================================
// RUNNERS
// ============================================================================

export async function critiquePitch(
  sb: SupabaseClient,
  routeCfg: RouteConfig,
  proposal: { id: string; content: string; client_name: string; buyer?: string; target?: string; sector?: string; geography?: string; proposal_type?: string },
  personaIds?: string[]
): Promise<CritiqueResult> {
  // Load personas (caller can restrict by passing personaIds)
  let q = sb.from("pitch_critique_personas").select("id,display_name,system_prompt,sort_order").eq("is_active", true);
  if (personaIds && personaIds.length > 0) q = q.in("id", personaIds);
  const { data: personasRows } = await q.order("sort_order");
  const personas = (personasRows ?? []) as Array<{ id: string; display_name: string; system_prompt: string }>;

  if (personas.length === 0) throw new Error("No active critique personas configured.");

  // Run each persona in parallel
  const personaResults: PersonaCritique[] = [];
  const personaErrors: string[] = [];
  let totalCost = 0; let lastProvider: ProviderId = routeCfg.primaryProvider; let lastModel = "";

  const promises = personas.map(async (p) => {
    const { system, user } = buildPersonaPrompt(p.system_prompt, proposal.content, {
      client: proposal.client_name,
      buyer: proposal.buyer, target: proposal.target, sector: proposal.sector,
      geography: proposal.geography, type: proposal.proposal_type,
    });
    try {
      const res = await routedCall(routeCfg, [
        { role: "system", content: system, stable: true },
        { role: "user", content: user },
      ], 2500);
      const parsed = safeJsonParse(res.text);
      if (!parsed) {
        const preview = res.text.slice(0, 300).replace(/\n/g, " ");
        const tokenHint = res.outputTokens >= 2400
          ? " (response hit max-tokens limit — likely truncated)"
          : "";
        personaErrors.push(`${p.display_name}: could not parse AI response${tokenHint}. Preview: "${preview}…"`);
        return null;
      }
      lastProvider = res.provider; lastModel = res.model;
      totalCost += ((res.inputTokens / 1000) * 0.0015) + ((res.outputTokens / 1000) * 0.006);
      return {
        persona_id: p.id,
        display_name: p.display_name,
        credibility:         clamp(parsed.credibility),
        differentiation:     clamp(parsed.differentiation),
        executive_relevance: clamp(parsed.executive_relevance),
        strategic_sharpness: clamp(parsed.strategic_sharpness),
        flags: Array.isArray(parsed.flags) ? (parsed.flags as PersonaCritique["flags"]).slice(0, 8) : [],
        strengths: Array.isArray(parsed.strengths) ? (parsed.strengths as string[]).slice(0, 5) : [],
        sharpening_suggestions: Array.isArray(parsed.sharpening_suggestions) ? (parsed.sharpening_suggestions as PersonaCritique["sharpening_suggestions"]).slice(0, 5) : [],
        one_line_verdict: typeof parsed.one_line_verdict === "string" ? parsed.one_line_verdict
          : (parsed._partial ? "Partial parse — provider truncated the response. Try Sharpen for a smaller model or upgrade the smart-tier key." : ""),
      } as PersonaCritique;
    } catch (e: any) {
      personaErrors.push(`${p.display_name}: ${e?.message ?? String(e)}`);
      return null;
    }
  });
  const results = await Promise.all(promises);
  for (const r of results) if (r) personaResults.push(r);

  if (personaResults.length === 0) {
    throw new Error(`All persona critiques failed. Issues:\n${personaErrors.join("\n")}`);
  }

  // Aggregate
  const avg = (key: keyof PersonaCritique): number => {
    const vals = personaResults.map((p) => p[key] as number).filter((v) => Number.isFinite(v));
    if (vals.length === 0) return 50;
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  };
  const overall_credibility = avg("credibility");
  const overall_differentiation = avg("differentiation");
  const overall_executive_relevance = avg("executive_relevance");
  const overall_strategic_sharpness = avg("strategic_sharpness");
  // Composite weighting reflects partner priorities: differentiation + sharpness matter most
  const overall_score = Math.round(
    overall_credibility         * 0.25 +
    overall_differentiation     * 0.30 +
    overall_executive_relevance * 0.20 +
    overall_strategic_sharpness * 0.25
  );

  // Top warnings — collect HIGH severity, then MEDIUM, dedupe by text
  const warnings: Array<{ persona: string; severity: string; text: string }> = [];
  const seen = new Set<string>();
  for (const sev of ["high", "medium"] as const) {
    for (const p of personaResults) {
      for (const f of p.flags) {
        if (f.severity !== sev) continue;
        const k = f.text.toLowerCase().slice(0, 80);
        if (seen.has(k)) continue;
        seen.add(k);
        warnings.push({ persona: p.display_name, severity: f.severity, text: f.text });
        if (warnings.length >= 8) break;
      }
      if (warnings.length >= 8) break;
    }
    if (warnings.length >= 8) break;
  }

  // Top strengths — pick one per persona
  const strengths: Array<{ persona: string; text: string }> = [];
  for (const p of personaResults) {
    if (p.strengths.length > 0) strengths.push({ persona: p.display_name, text: p.strengths[0] });
  }

  return {
    personas: personaResults,
    overall_credibility, overall_differentiation, overall_executive_relevance, overall_strategic_sharpness,
    overall_score,
    top_warnings: warnings,
    top_strengths: strengths,
    cost_usd: Math.round(totalCost * 10000) / 10000,
    provider: lastProvider,
    model: lastModel,
  };
}

// ============================================================================
// SHARPENED VERSION (separate call so it's only triggered on demand)
// ============================================================================

export async function sharpenProposal(
  routeCfg: RouteConfig,
  proposal: { content: string; client_name: string; buyer?: string; target?: string; sector?: string },
  critique: CritiqueResult
): Promise<{ sharpened: string; cost_usd: number }> {
  // Collect all sharpening suggestions across personas
  const allSharpenings = critique.personas.flatMap((p) =>
    p.sharpening_suggestions.map((s) => `- (${p.display_name}) ${s.weakness} → ${s.suggested_revision}`)
  ).slice(0, 12);

  const system = `You are a senior MBB partner rewriting a pitch to address rigorous critique. You must:
1. Tighten every assumption — replace vague claims with specific, defensible ones
2. Remove consulting jargon ("transformational", "strategic value", "robust", "leverage", "synergies")
3. Add commercial specificity — name benchmarks, name timelines, name risks with mitigations
4. Differentiate vs McKinsey/BCG/Bain explicitly where the pitch is generic
5. Lead with the strategic thesis — not the methodology

Output: the rewritten pitch in clean markdown. No commentary, no preamble.`;

  const user = `ORIGINAL PITCH
==============
Client: ${proposal.client_name}
${proposal.buyer ? `Buyer: ${proposal.buyer}\n` : ""}${proposal.target ? `Target: ${proposal.target}\n` : ""}${proposal.sector ? `Sector: ${proposal.sector}\n` : ""}
${proposal.content.slice(0, 10000)}

CRITIQUE TO ADDRESS
===================
Overall scores — Credibility ${critique.overall_credibility}/100 · Differentiation ${critique.overall_differentiation}/100 · Executive Relevance ${critique.overall_executive_relevance}/100 · Strategic Sharpness ${critique.overall_strategic_sharpness}/100

Top weaknesses identified:
${critique.top_warnings.map((w) => `- (${w.persona}) ${w.text}`).join("\n")}

Specific sharpening suggestions:
${allSharpenings.join("\n")}

Now rewrite the pitch addressing every weakness. Markdown only.`;

  const res = await routedCall(routeCfg, [
    { role: "system", content: system },
    { role: "user", content: user },
  ], 3000);

  const cost = ((res.inputTokens / 1000) * 0.0015) + ((res.outputTokens / 1000) * 0.006);
  return { sharpened: res.text, cost_usd: Math.round(cost * 10000) / 10000 };
}
