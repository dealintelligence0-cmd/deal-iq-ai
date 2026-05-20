/**
 * Phase 6 — Advisor extraction orchestrator.
 *
 * Pipeline:
 *   1. Find canonical deals without ANY advisor row (whitespace)
 *   2. Optionally cap to first N for cost control
 *   3. Batch-extract via AI
 *   4. Resolve each extracted name against advisor_registry
 *   5. Insert new registry rows for unknown advisors
 *   6. Insert deal_advisors links
 *   7. Audit row
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { RouteConfig } from "@/lib/ai/router";
import { extractAdvisorsBatch, type DealForExtraction } from "./extractor";
import { buildAdvisorResolver } from "./matcher";

export type ExtractOptions = {
  userId: string;
  routeConfig: RouteConfig;
  maxDeals?: number;       // cap per run; default 25 for cost control
  forceRefresh?: boolean;  // if true, also re-process deals that already have advisor rows
};

export type ExtractResult = {
  deals_scanned: number;
  advisors_found: number;
  new_advisors: number;
  cost_usd: number;
  provider: string | null;
  model: string | null;
  error: string | null;
};

export async function runAdvisorExtraction(
  sb: SupabaseClient,
  opts: ExtractOptions
): Promise<ExtractResult> {
  const result: ExtractResult = {
    deals_scanned: 0, advisors_found: 0, new_advisors: 0,
    cost_usd: 0, provider: null, model: null, error: null,
  };

  const { data: runRow } = await sb.from("advisor_extraction_runs").insert({
    created_by: opts.userId,
    triggered_by: "manual",
  }).select("id").single();
  const runId = (runRow as { id: string } | null)?.id;

  try {
    const maxDeals = opts.maxDeals ?? 25;

    // 1. Find target deals
    let deals: DealForExtraction[] = [];
    if (opts.forceRefresh) {
      const { data } = await sb.from("canonical_deals")
        .select("id, heading, buyer, target, dominant_sector, dominant_geography, intelligence_size")
        .eq("created_by", opts.userId)
        .is("superseded_by", null).eq("is_digest", false).eq("needs_review", false)
        .order("created_at", { ascending: false })
        .limit(maxDeals);
      deals = (data ?? []).map((d) => ({
        id: d.id as string, heading: d.heading as string,
        buyer: d.buyer as string | null, target: d.target as string | null,
        sector: d.dominant_sector as string | null,
        geography: d.dominant_geography as string | null,
        size_band: d.intelligence_size as string | null,
      }));
    } else {
      const { data } = await sb.from("advisor_whitespace_deals")
        .select("id, heading, buyer, target, dominant_sector, dominant_geography, intelligence_size")
        .eq("created_by", opts.userId)
        .limit(maxDeals);
      deals = (data ?? []).map((d) => ({
        id: d.id as string, heading: d.heading as string,
        buyer: d.buyer as string | null, target: d.target as string | null,
        sector: d.dominant_sector as string | null,
        geography: d.dominant_geography as string | null,
        size_band: d.intelligence_size as string | null,
      }));
    }
    result.deals_scanned = deals.length;
    if (deals.length === 0) {
      await finaliseRun(sb, runId, "completed", result);
      return result;
    }

    // 2. AI extraction
    const ext = await extractAdvisorsBatch(opts.routeConfig, deals);
    result.cost_usd += ext.cost_usd;
    result.provider = ext.provider;
    result.model = ext.model;
    if (ext.error) result.error = ext.error;

    // 3. Resolve names against registry
    const resolver = await buildAdvisorResolver(sb);
    const dealAdvisorRows: Array<Record<string, unknown>> = [];
    const newRegistryRows = new Map<string, { name: string; display_name: string }>();

    for (const [dealId, advisors] of ext.byDeal) {
      for (const a of advisors) {
        let advisorRow = resolver.resolve(a.advisor_name);
        if (!advisorRow) {
          // Stage a new registry row (insert later in one go)
          const key = a.advisor_name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80);
          if (!key) continue;
          newRegistryRows.set(key, { name: key, display_name: a.advisor_name });
          continue;  // handle below after bulk insert
        }
        dealAdvisorRows.push({
          canonical_id: dealId,
          advisor_id: advisorRow.id,
          created_by: opts.userId,
          role: a.role,
          side: a.side,
          confidence: a.confidence,
          source: "ai",
          source_quote: a.source_quote,
        });
      }
    }

    // 4. Insert new registry rows
    if (newRegistryRows.size > 0) {
      const newRows = Array.from(newRegistryRows.values()).map((r) => ({
        ...r, tier: "other", is_seeded: false,
      }));
      const { data: inserted, error: regErr } = await sb
        .from("advisor_registry").insert(newRows).select("id, name, aliases, display_name");
      if (regErr) {
        // Most likely a unique-constraint race — re-resolve via fresh lookup
        result.error = `New advisor insert partial: ${regErr.message}`;
      } else {
        result.new_advisors = inserted?.length ?? 0;
      }
    }

    // 5. Now re-resolve any names we couldn't match the first time
    if (newRegistryRows.size > 0) {
      const resolver2 = await buildAdvisorResolver(sb);
      for (const [dealId, advisors] of ext.byDeal) {
        for (const a of advisors) {
          // Skip if already inserted via primary resolver
          if (resolver.resolve(a.advisor_name)) continue;
          const advisorRow = resolver2.resolve(a.advisor_name);
          if (!advisorRow) continue;
          dealAdvisorRows.push({
            canonical_id: dealId,
            advisor_id: advisorRow.id,
            created_by: opts.userId,
            role: a.role,
            side: a.side,
            confidence: a.confidence,
            source: "ai",
            source_quote: a.source_quote,
          });
        }
      }
    }

    // 6. Bulk insert deal_advisor rows (upsert to skip dupes)
    if (dealAdvisorRows.length > 0) {
      const { error: daErr, count } = await sb
        .from("deal_advisors")
        .upsert(dealAdvisorRows, { onConflict: "canonical_id,advisor_id,role", count: "exact" });
      if (daErr) result.error = `Deal-advisor insert: ${daErr.message}`;
      result.advisors_found = count ?? dealAdvisorRows.length;
    }

    await finaliseRun(sb, runId, "completed", result);
    return result;
  } catch (e: any) {
    result.error = e?.message ?? String(e);
    await finaliseRun(sb, runId, "failed", result);
    throw e;
  }
}

async function finaliseRun(sb: SupabaseClient, runId: string | undefined, status: string, r: ExtractResult): Promise<void> {
  if (!runId) return;
  await sb.from("advisor_extraction_runs").update({
    status,
    deals_scanned: r.deals_scanned,
    advisors_found: r.advisors_found,
    new_advisors: r.new_advisors,
    cost_usd: Math.round(r.cost_usd * 10000) / 10000,
    ai_provider: r.provider, ai_model: r.model,
    error: r.error,
    completed_at: new Date().toISOString(),
  }).eq("id", runId);
}
