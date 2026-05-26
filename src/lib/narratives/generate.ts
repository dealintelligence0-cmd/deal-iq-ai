

/**
 * Phase 7 — Narrative engine.
 *
 * For a given account name, pulls all related intelligence from:
 *   - canonical_deals (where buyer = X or target = X)
 *   - executive_signals (where watchlist company = X)
 *   - themes (where X is in active_buyers or sectors+geos overlap)
 *   - bolt_on_shortlists (where buyer_name = X)
 *   - deal_advisors (where buyer/target = X)
 *
 * Then asks the AI to synthesize a partner-ready 1-pager with 8 sections.
 * Idempotent — re-running on the same account overwrites the prior narrative.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { routedCall, type RouteConfig } from "@/lib/ai/router";

export type NarrativeInputs = {
  account_name: string;
  deals: Array<{ buyer: string | null; target: string | null; sector: string | null; geo: string | null; size: string | null; heading: string; date: string | null }>;
  signals: Array<{ type: string; severity: string; headline: string; quote: string | null; context: string | null }>;
  themes: Array<{ name: string; summary: string | null; sectors: string[] }>;
  boltons: Array<{ target: string; sector: string | null; fit: number; rationale: string }>;
  advisors: Array<{ advisor: string; tier: string | null; role: string; side: string | null }>;
};

export type NarrativeResult = {
  exec_summary: string;
  strategic_situation: string;
  signal_summary: string;
  theme_relevance: string;
  bolt_on_summary: string;
  advisor_landscape: string;
  pitch_angle: string;
  recommended_next_steps: string;
  cost_usd: number;
  provider: string | null;
  model: string | null;
  error: string | null;
};

const SYSTEM_PROMPT = `You are a senior M&A advisor writing a 1-page strategic brief on a target account.

You will receive structured intelligence: prior deals, executive signals, thematic context, bolt-on shortlist, and incumbent advisors. Synthesize an 8-section brief.

OUTPUT — strict JSON only:
{
  "exec_summary": "≤300 chars. One-paragraph overview: who they are, recent posture, top opportunity.",
  "strategic_situation": "≤350 chars. The big strategic question facing this company.",
  "signal_summary": "≤350 chars. What recent filings/signals reveal. Cite severity if useful.",
  "theme_relevance": "≤300 chars. Which emerging themes this company sits inside or against.",
  "bolt_on_summary": "≤300 chars. Acquisition opportunities — name top 1-2 targets.",
  "advisor_landscape": "≤300 chars. Who advises them now; positioning angle to displace or partner.",
  "pitch_angle": "≤350 chars. The specific consulting angle to lead with.",
  "recommended_next_steps": "≤300 chars. 3 concrete next moves (research, outreach, intro path)."
}

RULES:
- Be specific. Name companies, sectors, sizes. Reference actual evidence.
- NEVER use: "transformational", "leverage", "synergies", "robust", "strategic value"
- Output MUST be valid JSON. No markdown. No trailing commas.`;

function safeParseJson(s: string): Record<string, unknown> | null {
  if (!s) return null;
  const clean = s.replace(/```(?:json)?/gi, "").trim();
  const a = clean.indexOf("{");
  if (a < 0) return null;
  const lastBrace = clean.lastIndexOf("}");
  if (lastBrace > a) {
    try { return JSON.parse(clean.slice(a, lastBrace + 1)); } catch { /* fall through */ }
  }
  // Brace-balance repair
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

function buildUserPrompt(input: NarrativeInputs): string {
  const dealsBlock = input.deals.slice(0, 8).map((d, i) =>
    `${i + 1}. ${d.buyer ?? "?"} → ${d.target ?? "?"} (${d.sector ?? "?"}, ${d.geo ?? "?"}, ${d.size ?? "?"}, ${d.date ?? "?"}): ${d.heading.slice(0, 120)}`
  ).join("\n") || "(none in pipeline)";

  const sigBlock = input.signals.slice(0, 8).map((s, i) =>
    `${i + 1}. [${s.severity.toUpperCase()}] ${s.type}: ${s.headline}${s.quote ? `\n   Quote: "${s.quote}"` : ""}${s.context ? `\n   ${s.context}` : ""}`
  ).join("\n") || "(no signals extracted)";

  const themeBlock = input.themes.slice(0, 4).map((t, i) =>
    `${i + 1}. ${t.name} — ${t.summary ?? ""}`
  ).join("\n") || "(no thematic match)";

  const boltBlock = input.boltons.slice(0, 6).map((b, i) =>
    `${i + 1}. ${b.target} (${b.sector ?? "?"}, fit ${b.fit}/100): ${b.rationale}`
  ).join("\n") || "(no bolt-on shortlist)";

  const advisorBlock = input.advisors.slice(0, 8).map((a, i) =>
    `${i + 1}. ${a.advisor} (${a.tier ?? "?"}) as ${a.role}${a.side ? `, ${a.side}-side` : ""}`
  ).join("\n") || "(no incumbent identified)";

  return `ACCOUNT: ${input.account_name}

PRIOR DEALS IN PIPELINE
=======================
${dealsBlock}

EXECUTIVE SIGNALS
=================
${sigBlock}

EMERGING THEMES (relevant)
==========================
${themeBlock}

BOLT-ON SHORTLIST (Phase 5 engine)
==================================
${boltBlock}

INCUMBENT ADVISORS
==================
${advisorBlock}

Synthesize a 1-page strategic brief as JSON.`;
}

export async function generateNarrative(
  routeCfg: RouteConfig,
  input: NarrativeInputs
): Promise<NarrativeResult> {
  const empty = {
    exec_summary: "", strategic_situation: "", signal_summary: "", theme_relevance: "",
    bolt_on_summary: "", advisor_landscape: "", pitch_angle: "", recommended_next_steps: "",
  };
  try {
    const res = await routedCall(routeCfg, [
      { role: "system", content: SYSTEM_PROMPT, stable: true },
      { role: "user", content: buildUserPrompt(input) },
    ], 2500);
    const cost = ((res.inputTokens / 1000) * 0.0015) + ((res.outputTokens / 1000) * 0.006);

    if (res.model === "rules-v1" || res.text.startsWith("[rule-based]")) {
      return { ...empty, cost_usd: cost, provider: res.provider, model: res.model,
        error: `AI fell through to rules-v1 stub (provider ${res.provider} failed). Check Settings → API Key Library.` };
    }

    const parsed = safeParseJson(res.text);
    if (!parsed) {
      return { ...empty, cost_usd: cost, provider: res.provider, model: res.model,
        error: `Could not parse AI response. Preview: "${res.text.slice(0, 200)}…"` };
    }
    return {
      exec_summary:           String(parsed.exec_summary ?? "").slice(0, 600),
      strategic_situation:    String(parsed.strategic_situation ?? "").slice(0, 700),
      signal_summary:         String(parsed.signal_summary ?? "").slice(0, 700),
      theme_relevance:        String(parsed.theme_relevance ?? "").slice(0, 600),
      bolt_on_summary:        String(parsed.bolt_on_summary ?? "").slice(0, 600),
      advisor_landscape:      String(parsed.advisor_landscape ?? "").slice(0, 600),
      pitch_angle:            String(parsed.pitch_angle ?? "").slice(0, 700),
      recommended_next_steps: String(parsed.recommended_next_steps ?? "").slice(0, 600),
      cost_usd: cost, provider: res.provider, model: res.model, error: null,
    };
  } catch (e: any) {
    return { ...empty, cost_usd: 0, provider: null, model: null, error: e?.message ?? String(e) };
  }
}
