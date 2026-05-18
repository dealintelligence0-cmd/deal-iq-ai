/**
 * AI labeling for thematic clusters.
 *
 * Takes a cluster's representative deals (top 5 by similarity to centroid)
 * and asks the AI for: theme name, why it matters, drivers, likely next
 * targets, pitch hypothesis, consulting angle.
 *
 * Output is strict JSON. One call per cluster.
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

const SYSTEM_PROMPT = `You are an MBB partner synthesizing emerging M&A themes from a cluster of similar deals.

Given a list of related deals, identify the strategic theme connecting them and produce:
- a concise theme name (3-6 words, research-note style)
- why it matters NOW (1-2 sentences, partner-grade reasoning)
- 3-5 drivers behind the consolidation
- 3-5 likely next acquisition targets (company types or actual company names mentioned in the data)
- a pitch hypothesis MBB partners could pursue
- the consulting angle (where the advisory wallet lives)
- heat classification: "hot" (clear acceleration), "warm" (steady), "cool" (early/slow)

OUTPUT — STRICT JSON, no markdown:
{
  "slug": "kebab-case-version-of-name",
  "display_name": "Theme Name",
  "emoji": "📈",
  "strategic_summary": "1-2 sentence executive summary",
  "why_it_matters": "1-2 sentence partner-grade reasoning for urgency",
  "drivers": ["driver 1", "driver 2", "driver 3"],
  "likely_next_targets": ["target 1", "target 2", "target 3"],
  "pitch_hypothesis": "1-2 sentence specific advisory pitch",
  "consulting_angle": "Where MBB can win — 1-2 sentences",
  "heat": "hot|warm|cool"
}

RULES:
- NEVER use words: "transformational", "strategic value", "robust", "leverage", "synergies" (too generic)
- Be specific, evidence-backed, named entities preferred
- Pick the emoji that visually represents the theme (📈 consolidation, ⚡ energy, 🏦 finance, 💻 tech, 🏥 healthcare, 🛒 consumer, 🚚 logistics, 🏗️ industrial, 🌍 cross-border, etc.)
`;

export async function labelCluster(
  routeCfg: RouteConfig,
  deals: Array<{ heading: string; buyer: string | null; target: string | null; sector: string | null; country: string | null; deal_type: string | null }>
): Promise<ThemeLabel | null> {
  const sample = deals.slice(0, 10).map((d, i) => {
    const parts = [d.buyer ?? "?", "→", d.target ?? "?"];
    const meta = [d.sector, d.country, d.deal_type].filter(Boolean).join(" · ");
    return `${i + 1}. ${parts.join(" ")} (${meta || "metadata missing"}) — ${d.heading.slice(0, 200)}`;
  }).join("\n");

  const user = `DEALS IN THIS CLUSTER
======================
${sample}

What is the unifying strategic theme? Return JSON only.`;

  try {
    const res = await routedCall(routeCfg, [
      { role: "system", content: SYSTEM_PROMPT, stable: true },
      { role: "user", content: user },
    ], 800);

    let s = res.text.trim().replace(/^```(?:json)?\s*/, "").replace(/```\s*$/, "");
    const a = s.indexOf("{"); const b = s.lastIndexOf("}");
    if (a < 0 || b < 0) return null;
    const parsed = JSON.parse(s.slice(a, b + 1));

    // Defensive normalization
    return {
      slug: String(parsed.slug ?? `theme-${Date.now()}`).toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 60),
      display_name: String(parsed.display_name ?? "Untitled Theme"),
      emoji: String(parsed.emoji ?? "📈").slice(0, 4),
      strategic_summary: String(parsed.strategic_summary ?? ""),
      why_it_matters: String(parsed.why_it_matters ?? ""),
      drivers: Array.isArray(parsed.drivers) ? parsed.drivers.map(String).slice(0, 6) : [],
      likely_next_targets: Array.isArray(parsed.likely_next_targets) ? parsed.likely_next_targets.map(String).slice(0, 6) : [],
      pitch_hypothesis: String(parsed.pitch_hypothesis ?? ""),
      consulting_angle: String(parsed.consulting_angle ?? ""),
      heat: (parsed.heat === "hot" || parsed.heat === "cool" ? parsed.heat : "warm") as ThemeLabel["heat"],
    };
  } catch (e) {
    console.error("labelCluster failed:", e);
    return null;
  }
}
