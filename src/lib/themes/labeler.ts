/**
 * AI labeling for thematic clusters.
 *
 * For each cluster of similar deals, asks the AI to produce a theme name,
 * strategic summary, drivers, pitch hypothesis, and consulting angle.
 *
 * Hardening (Round 20):
 *  - bumped max_tokens 800 → 1500 to prevent truncation
 *  - JSON repair logic (closes open strings, balances braces) recovers from
 *    truncated responses
 *  - if the AI fully fails, falls back to a deterministic theme synthesised
 *    from the deal metadata so the cluster still appears in the UI
 *  - returns an error string so the orchestrator can aggregate diagnostics
 */

import { routedCall, type RouteConfig } from "@/lib/ai/router";

export type ThemeLabel = {
  slug: string;
  display_name: string;
  emoji: string;
  strategic_summary: string;
  why_it_matters: string;
  drivers: string[];
  likely_next_targets: string[];
  pitch_hypothesis: string;
  consulting_angle: string;
  heat: "hot" | "warm" | "cool";
};

export type LabelDeal = {
  heading: string; buyer: string | null; target: string | null;
  sector: string | null; country: string | null; deal_type: string | null;
};

export type LabelResult = {
  label: ThemeLabel | null;
  error: string | null;
  via: "ai" | "fallback" | "failed";
};

const SYSTEM_PROMPT = `You are an MBB partner synthesizing emerging M&A themes from a cluster of similar deals.

Given a list of related deals, identify the strategic theme connecting them.

OUTPUT — STRICT JSON, no markdown, no commentary:
{
  "slug": "kebab-case",
  "display_name": "Theme Name (3-6 words)",
  "emoji": "single emoji",
  "strategic_summary": "1 sentence executive summary, ≤200 chars",
  "why_it_matters": "1 sentence on urgency, ≤200 chars",
  "drivers": ["3-5 drivers, each ≤80 chars"],
  "likely_next_targets": ["3-5 likely next targets, each ≤80 chars"],
  "pitch_hypothesis": "1 sentence specific advisory pitch, ≤220 chars",
  "consulting_angle": "1 sentence on where MBB wins, ≤180 chars",
  "heat": "hot" | "warm" | "cool"
}

RULES:
- Output MUST be valid JSON. No trailing commas. No comments. No code fences.
- Be specific. Reference named entities from the data when possible.
- NEVER use: "transformational", "strategic value", "robust", "leverage", "synergies"
- Emoji should match the theme (📈 consolidation, ⚡ energy, 🏦 finance, 💻 tech, 🏥 healthcare, 🛒 consumer, 🚚 logistics, 🏗️ industrial, 🌍 cross-border)`;

/** Robust JSON parse with repair, mirroring critique's safeJsonParse. */
function safeJsonParse(text: string): Record<string, unknown> | null {
  if (!text) return null;
  let s = text.replace(/```(?:json)?/gi, "").trim();
  const a = s.indexOf("{");
  if (a < 0) return null;
  const lastBrace = s.lastIndexOf("}");
  if (lastBrace > a) {
    try { return JSON.parse(s.slice(a, lastBrace + 1)); } catch { /* fall through */ }
  }
  const body = s.slice(a);
  const repaired = tryRepairTruncatedJson(body);
  if (repaired) {
    try { return JSON.parse(repaired); } catch { /* fall through */ }
  }
  return null;
}

function tryRepairTruncatedJson(s: string): string | null {
  let inString = false; let escape = false; const stack: string[] = [];
  let lastCompleteValueEnd = -1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (escape) { escape = false; continue; }
    if (c === "\\") { escape = true; continue; }
    if (inString) { if (c === '"') inString = false; continue; }
    if (c === '"') { inString = true; continue; }
    if (c === "{" || c === "[") stack.push(c);
    else if (c === "}" || c === "]") { stack.pop(); if (stack.length === 0) lastCompleteValueEnd = i; }
    else if (c === "," && stack.length === 1) lastCompleteValueEnd = i - 1;
  }
  let repaired = s;
  if (inString) repaired += '"';
  if (lastCompleteValueEnd > 0 && (stack.length > 0 || inString)) {
    repaired = s.slice(0, lastCompleteValueEnd + 1);
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
  return repaired;
}

/** Deterministic theme synthesised from the deal metadata when AI fails. */
function buildFallbackLabel(deals: LabelDeal[]): ThemeLabel {
  // Pick the most-common sector and geography
  const tally = (key: keyof LabelDeal): string => {
    const counts = new Map<string, number>();
    for (const d of deals) {
      const v = d[key];
      if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    let best = ""; let bestN = 0;
    for (const [k, n] of counts) if (n > bestN) { best = k; bestN = n; }
    return best;
  };
  const sector = tally("sector") || "Mixed-sector";
  const geo = tally("country") || "global";
  const dealType = tally("deal_type") || "M&A activity";

  // Pick a relevant emoji
  const sectorLower = sector.toLowerCase();
  let emoji = "📈";
  if (sectorLower.includes("tech") || sectorLower.includes("software")) emoji = "💻";
  else if (sectorLower.includes("health") || sectorLower.includes("medical")) emoji = "🏥";
  else if (sectorLower.includes("financial") || sectorLower.includes("bank")) emoji = "🏦";
  else if (sectorLower.includes("energy") || sectorLower.includes("oil")) emoji = "⚡";
  else if (sectorLower.includes("consumer") || sectorLower.includes("retail")) emoji = "🛒";
  else if (sectorLower.includes("industrial") || sectorLower.includes("manufactur")) emoji = "🏗️";
  else if (sectorLower.includes("transport") || sectorLower.includes("logistics")) emoji = "🚚";
  else if (sectorLower.includes("media")) emoji = "🎬";
  else if (sectorLower.includes("real estate") || sectorLower.includes("property")) emoji = "🏢";

  const slugBase = `${sector}-${geo}-${dealType}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50);
  const displayName = `${sector} consolidation${geo && geo !== "global" ? ` (${geo})` : ""}`;

  const buyersList = [...new Set(deals.map((d) => d.buyer).filter(Boolean) as string[])].slice(0, 3);
  const targetsList = [...new Set(deals.map((d) => d.target).filter(Boolean) as string[])].slice(0, 3);

  return {
    slug: slugBase || `theme-${Date.now()}`,
    display_name: displayName,
    emoji,
    strategic_summary: `${deals.length} similar deals clustered around ${sector}${geo && geo !== "global" ? ` in ${geo}` : ""}.`,
    why_it_matters: `Cluster of ${deals.length} comparable transactions suggests ongoing consolidation in ${sector}.`,
    drivers: [`${dealType} activity in ${sector}`, `${geo} market dynamics`, "Sector consolidation pressure"],
    likely_next_targets: targetsList.length > 0 ? targetsList : ["Sector mid-caps", "Adjacent verticals"],
    pitch_hypothesis: `Help acquirers in ${sector} evaluate roll-up opportunities; advise targets on positioning.`,
    consulting_angle: `Sell-side and buy-side commercial diligence in ${sector}.`,
    heat: deals.length >= 8 ? "hot" : deals.length >= 5 ? "warm" : "cool",
  };
}

export async function labelCluster(
  routeCfg: RouteConfig,
  deals: LabelDeal[]
): Promise<LabelResult> {
  const sample = deals.slice(0, 10).map((d, i) => {
    const parts = [d.buyer ?? "?", "→", d.target ?? "?"];
    const meta = [d.sector, d.country, d.deal_type].filter(Boolean).join(" · ");
    return `${i + 1}. ${parts.join(" ")} (${meta || "metadata missing"}) — ${d.heading.slice(0, 200)}`;
  }).join("\n");

  const user = `DEALS IN THIS CLUSTER
======================
${sample}

What is the unifying strategic theme? Return JSON only.`;

  let aiError: string | null = null;
  let rawText = "";
  try {
    const res = await routedCall(routeCfg, [
      { role: "system", content: SYSTEM_PROMPT, stable: true },
      { role: "user", content: user },
    ], 1500);
    rawText = res.text;

    const parsed = safeJsonParse(rawText);
    if (!parsed) {
      aiError = `Could not parse AI response (got ${rawText.length} chars). Preview: "${rawText.slice(0, 200).replace(/\n/g, " ")}…"`;
    } else {
      // Defensive normalisation
      const label: ThemeLabel = {
        slug: String(parsed.slug ?? `theme-${Date.now()}`).toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 60),
        display_name: String(parsed.display_name ?? "Untitled Theme"),
        emoji: String(parsed.emoji ?? "📈").slice(0, 4),
        strategic_summary: String(parsed.strategic_summary ?? "").slice(0, 600),
        why_it_matters: String(parsed.why_it_matters ?? "").slice(0, 600),
        drivers: Array.isArray(parsed.drivers) ? parsed.drivers.map(String).slice(0, 6) : [],
        likely_next_targets: Array.isArray(parsed.likely_next_targets) ? parsed.likely_next_targets.map(String).slice(0, 6) : [],
        pitch_hypothesis: String(parsed.pitch_hypothesis ?? "").slice(0, 600),
        consulting_angle: String(parsed.consulting_angle ?? "").slice(0, 600),
        heat: (parsed.heat === "hot" || parsed.heat === "cool" ? parsed.heat : "warm") as ThemeLabel["heat"],
      };
      // Sanity check: AI sometimes returns "Untitled Theme" with no content
      if (label.display_name && label.display_name !== "Untitled Theme" && label.strategic_summary) {
        return { label, error: null, via: "ai" };
      }
      aiError = "AI returned empty or placeholder content.";
    }
  } catch (e: any) {
    aiError = e?.message ?? String(e);
  }

  // AI failed — synthesize from deal metadata so we still get the cluster
  return {
    label: buildFallbackLabel(deals),
    error: aiError,
    via: "fallback",
  };
}
