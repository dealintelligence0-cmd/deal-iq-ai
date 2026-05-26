

/**
 * Phase 5 — Buyer profile synthesizer.
 *
 * For a given buyer name, looks at canonical_deals to derive:
 *   - Total + 24m deal count
 *   - Primary sectors / geographies
 *   - Typical deal-size band
 *   - AI-synthesized acquisition thesis (2-3 sentences)
 *
 * Output upserts into buyer_profiles. Called by bolt-on shortlist generator
 * before producing the shortlist itself, so the AI grounds its recommendations
 * in the buyer's actual M&A pattern rather than its training-data guesses.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { routedCall, type RouteConfig } from "@/lib/ai/router";

export type BuyerProfile = {
  id: string;
  buyer_name: string;
  total_deals: number;
  deals_last_24m: number;
  primary_sectors: string[];
  primary_geographies: string[];
  typical_deal_band: string | null;
  acquisition_thesis: string | null;
};

const SYSTEM_PROMPT = `You are a senior M&A advisor profiling an acquirer's M&A pattern.

Given the buyer's recent deal history (target names + sectors + geographies + sizes),
synthesize a 2-3 sentence ACQUISITION THESIS that captures WHY this buyer keeps acquiring
— the underlying strategic logic, not just "they bought these things".

OUTPUT — strict JSON only:
{"acquisition_thesis": "..."}

RULES:
- Be specific. Reference actual targets/sectors where possible.
- NEVER use: "transformational", "synergies", "strategic value", "leverage", "robust"
- ≤350 chars
- Output MUST be valid JSON. No markdown.`;

function safeParseJson(s: string): Record<string, unknown> | null {
  if (!s) return null;
  const clean = s.replace(/```(?:json)?/gi, "").trim();
  const a = clean.indexOf("{"); const b = clean.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(clean.slice(a, b + 1)); } catch { return null; }
}

export async function buildBuyerProfile(
  sb: SupabaseClient,
  userId: string,
  buyerName: string,
  routeCfg: RouteConfig
): Promise<{ profile: BuyerProfile | null; cost_usd: number; error: string | null }> {
  // Pull this buyer's deal history from canonical_deals
  const { data: deals, error } = await sb
    .from("canonical_deals")
    .select("target, dominant_sector, dominant_geography, intelligence_size, deal_type, deal_date, heading")
    .eq("created_by", userId)
    .ilike("buyer", buyerName)
    .is("superseded_by", null)
    .eq("is_digest", false)
    .eq("needs_review", false)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) return { profile: null, cost_usd: 0, error: `Buyer deal query failed: ${error.message}` };
  if (!deals || deals.length === 0) {
    return { profile: null, cost_usd: 0, error: `No deals found for buyer "${buyerName}"` };
  }

  // Aggregate
  const sectorCounts = new Map<string, number>();
  const geoCounts = new Map<string, number>();
  const sizeCounts = new Map<string, number>();
  const now = Date.now();
  let count24m = 0;
  for (const d of deals) {
    if (d.dominant_sector) sectorCounts.set(d.dominant_sector as string, (sectorCounts.get(d.dominant_sector as string) ?? 0) + 1);
    if (d.dominant_geography) geoCounts.set(d.dominant_geography as string, (geoCounts.get(d.dominant_geography as string) ?? 0) + 1);
    if (d.intelligence_size) sizeCounts.set(d.intelligence_size as string, (sizeCounts.get(d.intelligence_size as string) ?? 0) + 1);
    if (d.deal_date && new Date(d.deal_date as string).getTime() > now - 1000 * 60 * 60 * 24 * 730) count24m++;
  }
  const top = (m: Map<string, number>, n = 3) =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
  const topSize = [...sizeCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  // AI thesis — use just the top 10 most recent for the prompt
  const sample = deals.slice(0, 10).map((d, i) => {
    return `${i + 1}. ${d.target ?? "?"} (${d.dominant_sector ?? "?"} · ${d.dominant_geography ?? "?"} · ${d.intelligence_size ?? "?"} · ${d.deal_type ?? "?"})`;
  }).join("\n");

  let thesis = "";
  let cost = 0;
  let aiError: string | null = null;
  try {
    const res = await routedCall(routeCfg, [
      { role: "system", content: SYSTEM_PROMPT, stable: true },
      { role: "user", content: `BUYER: ${buyerName}\n\nRECENT DEALS:\n${sample}\n\nReturn JSON with acquisition_thesis.` },
    ], 600);
    cost = ((res.inputTokens / 1000) * 0.0015) + ((res.outputTokens / 1000) * 0.006);
    const parsed = safeParseJson(res.text);
    thesis = String(parsed?.acquisition_thesis ?? "").slice(0, 400);
    if (!thesis) aiError = "AI returned no thesis (parse failed).";
  } catch (e: any) {
    aiError = e?.message ?? String(e);
  }

  // Upsert
  const { data: profile, error: upErr } = await sb
    .from("buyer_profiles")
    .upsert({
      created_by: userId,
      buyer_name: buyerName,
      total_deals: deals.length,
      deals_last_24m: count24m,
      primary_sectors: top(sectorCounts),
      primary_geographies: top(geoCounts),
      typical_deal_band: topSize,
      acquisition_thesis: thesis || null,
      last_refreshed_at: new Date().toISOString(),
    }, { onConflict: "created_by,buyer_name" })
    .select("id, buyer_name, total_deals, deals_last_24m, primary_sectors, primary_geographies, typical_deal_band, acquisition_thesis")
    .single();

  if (upErr) return { profile: null, cost_usd: cost, error: `Profile upsert failed: ${upErr.message}` };
  return { profile: profile as BuyerProfile, cost_usd: cost, error: aiError };
}
