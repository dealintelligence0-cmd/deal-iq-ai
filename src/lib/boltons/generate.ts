/**
 * Phase 5 — Bolt-on shortlist generator.
 *
 * Inputs: buyer profile + optional partner directive ("focus on India tech mid-caps")
 * Output: 5-10 ranked bolt-on target recommendations with full strategic case.
 *
 * The AI prompt grounds recommendations in the buyer's actual acquisition pattern
 * AND any thematic adjacencies from the user's themes corpus. It includes:
 *   - Target name, sector, geography, estimated size
 *   - Fit score (0-100) with explicit rationale
 *   - Synergy thesis (cost / revenue / capability)
 *   - Whitespace angle — gap in buyer's portfolio this fills
 *   - Outreach angle — how an advisor positions the conversation
 *   - Risk flags (regulatory, integration, valuation)
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { routedCall, type RouteConfig } from "@/lib/ai/router";
import type { BuyerProfile } from "./profile";

export type BoltOnTarget = {
  target_name: string;
  target_sector: string | null;
  target_geography: string | null;
  estimated_size_band: string | null;
  fit_score: number;
  strategic_rationale: string;
  synergy_thesis: string | null;
  whitespace_angle: string | null;
  outreach_angle: string | null;
  risk_flags: string[];
};

export type GenerateOpts = {
  userId: string;
  routeConfig: RouteConfig;
  buyer: BuyerProfile;
  requestBrief?: string;
  targetTier: "mid" | "large" | "mega" | "any";
  /** Pull related themes for context (improves grounding) */
  themeContext?: Array<{ display_name: string; sectors: string[]; geographies: string[] }>;
};

const SYSTEM_PROMPT = `You are an MBB partner generating a buyer bolt-on shortlist.

You will receive:
1. A buyer profile (their actual M&A pattern from your pipeline data)
2. An optional partner directive
3. Optional thematic context from emerging deal themes

Generate 6-10 acquisition target recommendations that fit the buyer's pattern,
fill their portfolio whitespace, and could be realistically pitched.

OUTPUT — strict JSON only:
{
  "targets": [
    {
      "target_name": "Specific company name (real or representative)",
      "target_sector": "Sector",
      "target_geography": "Country/region",
      "estimated_size_band": "Mid" | "Large" | "Mega" | "Unknown",
      "fit_score": 0-100,
      "strategic_rationale": "≤250 chars — why this target, this buyer, now",
      "synergy_thesis": "≤200 chars — cost/revenue/capability synergies",
      "whitespace_angle": "≤200 chars — gap in buyer's portfolio this fills",
      "outreach_angle": "≤200 chars — how an advisor opens the conversation with the buyer",
      "risk_flags": ["≤4 specific risks, each ≤80 chars"]
    }
  ]
}

RULES:
- Targets MUST plausibly exist or be representative of a real company class
- Fit score: 80+ = obvious bolt-on; 60-79 = strong fit; 40-59 = adjacent; <40 = stretch
- Rank by fit_score descending in your output
- Sectors/geographies should align with the buyer's pattern (extending, not contradicting)
- NEVER use: "transformational", "robust", "leverage", "synergies as one-liner", "strategic value"
- Be specific. Generic targets ("a healthcare company in Europe") are unacceptable.
- Output MUST be valid JSON. No trailing commas. No comments. No markdown.`;

function safeParseJson(s: string): Record<string, unknown> | null {
  if (!s) return null;
  const clean = s.replace(/```(?:json)?/gi, "").trim();
  const a = clean.indexOf("{");
  if (a < 0) return null;
  const lastBrace = clean.lastIndexOf("}");
  if (lastBrace > a) {
    try { return JSON.parse(clean.slice(a, lastBrace + 1)); } catch { /* fall through to repair */ }
  }
  // Truncation repair — close open strings, balance braces
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

function clampScore(n: unknown): number {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return 50;
  return Math.max(0, Math.min(100, Math.round(x)));
}

function buildUserPrompt(opts: GenerateOpts): string {
  const b = opts.buyer;
  const themeBlock = (opts.themeContext ?? []).slice(0, 4).map((t, i) =>
    `${i + 1}. ${t.display_name} — sectors: ${(t.sectors ?? []).slice(0, 3).join(", ")}; geos: ${(t.geographies ?? []).slice(0, 3).join(", ")}`
  ).join("\n");

  return `BUYER PROFILE
=============
Name: ${b.buyer_name}
Total deals in pipeline: ${b.total_deals} (${b.deals_last_24m} in last 24 months)
Primary sectors: ${b.primary_sectors.join(", ") || "—"}
Primary geographies: ${b.primary_geographies.join(", ") || "—"}
Typical deal-size band: ${b.typical_deal_band ?? "—"}
${b.acquisition_thesis ? `\nAcquisition thesis: ${b.acquisition_thesis}` : ""}

REQUESTED TIER: ${opts.targetTier}
${opts.requestBrief ? `\nPARTNER DIRECTIVE:\n${opts.requestBrief.slice(0, 800)}\n` : ""}
${themeBlock ? `\nEMERGING THEMES FROM PIPELINE (for adjacency):\n${themeBlock}\n` : ""}

Generate 6-10 bolt-on target recommendations as JSON.`;
}

export async function generateBoltOnShortlist(
  sb: SupabaseClient,
  opts: GenerateOpts
): Promise<{
  shortlistId: string | null;
  targets: BoltOnTarget[];
  cost_usd: number;
  provider: string | null;
  model: string | null;
  error: string | null;
}> {
  // Insert shortlist header (draft)
  const { data: header, error: hErr } = await sb.from("bolt_on_shortlists").insert({
    created_by: opts.userId,
    buyer_profile_id: opts.buyer.id,
    buyer_name: opts.buyer.buyer_name,
    request_brief: opts.requestBrief ?? null,
    target_tier: opts.targetTier,
    status: "draft",
  }).select("id").single();
  if (hErr || !header) {
    return { shortlistId: null, targets: [], cost_usd: 0, provider: null, model: null,
             error: `Shortlist header insert failed: ${hErr?.message ?? "unknown"}` };
  }
  const shortlistId = (header as { id: string }).id;

  // AI call
  let cost = 0;
  let provider: string | null = null;
  let model: string | null = null;
  let aiError: string | null = null;
  let targets: BoltOnTarget[] = [];

  try {
    const res = await routedCall(opts.routeConfig, [
      { role: "system", content: SYSTEM_PROMPT, stable: true },
      { role: "user", content: buildUserPrompt(opts) },
    ], 3000);
    cost = ((res.inputTokens / 1000) * 0.0015) + ((res.outputTokens / 1000) * 0.006);
    provider = res.provider;
    model = res.model;

    // Detect rule-based fallback (router returns "[rule-based] ..." when all real
    // providers fail). This is never valid JSON for bolt-ons.
    if (res.model === "rules-v1" || res.text.startsWith("[rule-based]")) {
      aiError = `AI fell through to rules-v1 stub — your smart-tier provider (${provider}) failed. ` +
                `Check Settings → API Key Library. ` +
                ((res as any).lastError ? `Last error: ${(res as any).lastError}` : "");
      // Skip parsing — go straight to error return
      // Update shortlist header with what we know
      await sb.from("bolt_on_shortlists").update({
        ai_provider: provider, ai_model: model, status: "draft",
      }).eq("id", shortlistId);
      return { shortlistId, targets: [], cost_usd: cost, provider, model, error: aiError };
    }

    const parsed = safeParseJson(res.text);
    const arr = Array.isArray(parsed?.targets) ? parsed!.targets as Array<Record<string, unknown>> : [];
    targets = arr.slice(0, 10).map((t) => {
      const name = String(t.target_name ?? "").trim();
      if (!name) return null;
      return {
        target_name: name.slice(0, 200),
        target_sector: t.target_sector ? String(t.target_sector).slice(0, 100) : null,
        target_geography: t.target_geography ? String(t.target_geography).slice(0, 100) : null,
        estimated_size_band: t.estimated_size_band ? String(t.estimated_size_band).slice(0, 50) : null,
        fit_score: clampScore(t.fit_score),
        strategic_rationale: String(t.strategic_rationale ?? "").slice(0, 500),
        synergy_thesis: t.synergy_thesis ? String(t.synergy_thesis).slice(0, 400) : null,
        whitespace_angle: t.whitespace_angle ? String(t.whitespace_angle).slice(0, 400) : null,
        outreach_angle: t.outreach_angle ? String(t.outreach_angle).slice(0, 400) : null,
        risk_flags: Array.isArray(t.risk_flags)
          ? (t.risk_flags as unknown[]).slice(0, 6).map((r) => String(r).slice(0, 120))
          : [],
      } as BoltOnTarget;
    }).filter((t): t is BoltOnTarget => t !== null);
    if (targets.length === 0) {
      aiError = `AI returned no parseable targets. Preview: "${res.text.slice(0, 200)}…"`;
    }
  } catch (e: any) {
    aiError = e?.message ?? String(e);
  }

  // Insert target rows (ranked by fit_score desc)
  targets.sort((a, b) => b.fit_score - a.fit_score);
  if (targets.length > 0) {
    const payload = targets.map((t, i) => ({
      shortlist_id: shortlistId,
      created_by: opts.userId,
      ...t,
      rank_position: i + 1,
    }));
    const { error: tErr } = await sb.from("bolt_on_targets").insert(payload);
    if (tErr) {
      return { shortlistId, targets, cost_usd: cost, provider, model,
               error: `Target insert failed: ${tErr.message}` };
    }
  }

  // Finalize shortlist header
  await sb.from("bolt_on_shortlists").update({
    total_targets: targets.length,
    ai_provider: provider,
    ai_model: model,
    cost_usd: Math.round(cost * 10000) / 10000,
    status: targets.length > 0 ? "active" : "draft",
    refreshed_at: new Date().toISOString(),
  }).eq("id", shortlistId);

  return { shortlistId, targets, cost_usd: cost, provider, model, error: aiError };
}
