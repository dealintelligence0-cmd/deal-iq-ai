/**
 * Theme refresh orchestrator.
 *
 * Pipeline:
 *   1. Find deals that have no embedding yet (or stale).
 *   2. Embed them (lightweight provider call).
 *   3. Run greedy clustering across ALL live canonical_deals for the user.
 *   4. For each cluster: AI-label it, compute metrics, upsert into `themes`.
 *   5. Refresh theme_deals membership table.
 *
 * Idempotent — safe to re-run nightly.
 * Designed for ≤2000 deals per user; scales to ~5k with ANN later.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { embedTexts, toPgVector, type EmbedConfig } from "./embeddings";
import { clusterDeals } from "./cluster";
import { labelCluster } from "./labeler";
import type { RouteConfig } from "@/lib/ai/router";

export type RefreshResult = {
  embeddings_added: int;
  clusters_created: int;
  clusters_updated: int;
  total_themes: int;
  cost_usd: number;
};
type int = number;

export type RefreshOptions = {
  userId: string;
  embedConfig: EmbedConfig;
  labelRouteConfig: RouteConfig;
  maxDealsToEmbed?: number;   // per-run cap to keep nightly job under 60s
};

export async function refreshThemes(
  sb: SupabaseClient,
  opts: RefreshOptions
): Promise<RefreshResult> {
  const startedAt = new Date().toISOString();
  const { data: runRow } = await sb.from("theme_refresh_runs").insert({
    created_by: opts.userId,
    triggered_by: "manual",
    status: "running",
    started_at: startedAt,
  }).select("id").single();
  const runId = (runRow as { id: string } | null)?.id;

  let embeddings_added = 0;
  let cost_usd = 0;

  // ---- 1. Find deals needing an embedding ----
  const cap = opts.maxDealsToEmbed ?? 300;
  const { data: pending } = await sb
    .from("canonical_deals")
    .select("id, heading, buyer, target, dominant_sector, dominant_geography, deal_type")
    .eq("created_by", opts.userId)
    .is("superseded_by", null)
    .eq("is_digest", false)
    .eq("needs_review", false)
    .is("embedding", null)
    .limit(cap);

  const embed_errors: string[] = [];
  if (pending && pending.length > 0) {
    const texts = pending.map((d) => buildEmbeddingText(d));
    const vectors = await embedTexts(texts, opts.embedConfig);
    cost_usd += pending.length * 0.00002;

    let nullCount = 0;
    for (let i = 0; i < pending.length; i++) {
      const v = vectors[i];
      if (!v) { nullCount++; continue; }
      await sb.from("canonical_deals")
        .update({ embedding: toPgVector(v), embedding_updated_at: new Date().toISOString() })
        .eq("id", pending[i].id);
      embeddings_added++;
    }
    if (nullCount === pending.length && pending.length > 0) {
      embed_errors.push(`All ${pending.length} embedding calls returned null. Check the ${opts.embedConfig.provider} API key and that the provider supports the model.`);
    } else if (nullCount > 0) {
      embed_errors.push(`${nullCount}/${pending.length} embedding calls failed.`);
    }
  }

  // ---- 2. Fetch ALL deals with embeddings ----
  const { data: all } = await sb
    .from("canonical_deals")
    .select("id, heading, buyer, target, dominant_sector, dominant_geography, deal_type, embedding")
    .eq("created_by", opts.userId)
    .is("superseded_by", null)
    .eq("is_digest", false)
    .eq("needs_review", false)
    .not("embedding", "is", null)
    .limit(2000);

  if (!all || all.length < 6) {
    const errMsg = embed_errors.length > 0
      ? `Insufficient embedded deals (${all?.length ?? 0}). Errors: ${embed_errors.join(" | ")}`
      : `Only ${all?.length ?? 0} embedded deals; need 6+ for clustering.`;
    await sb.from("theme_refresh_runs").update({
      status: "completed", embeddings_added, clusters_created: 0,
      clusters_updated: 0, cost_usd, error: embed_errors.length > 0 ? errMsg : null,
      completed_at: new Date().toISOString(),
    }).eq("id", runId!);
    if (embed_errors.length > 0) throw new Error(errMsg);
    return { embeddings_added, clusters_created: 0, clusters_updated: 0, total_themes: 0, cost_usd };
  }

  // Parse pgvector strings back to number[]
  const dealsForClustering = all
    .map((d) => {
      let vec: number[];
      if (typeof d.embedding === "string") {
        vec = JSON.parse(d.embedding);
      } else if (Array.isArray(d.embedding)) {
        vec = d.embedding as number[];
      } else { return null; }
      return {
        id: d.id as string,
        text: buildEmbeddingText(d),
        embedding: vec,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  // ---- 3. Cluster ----
  const clusters = clusterDeals(dealsForClustering);

  // ---- 4. Archive existing themes (we re-create fresh each refresh) ----
  //         Conservative: only archive if we're producing new clusters this run.
  if (clusters.length > 0) {
    await sb.from("themes").update({ status: "archived" })
      .eq("created_by", opts.userId).eq("status", "active");
  }

  // Build a lookup for deal metadata
  const dealMeta = new Map<string, typeof all[0]>();
  for (const d of all) dealMeta.set(d.id as string, d);

  let clusters_created = 0;
  let clusters_updated = 0;

  // ---- 5. For each cluster: label + persist ----
  for (const cluster of clusters) {
    // Pick top-5 members by similarity for AI labeling
    const ranked = cluster.memberIds.map((id, i) => ({ id, sim: cluster.memberSimilarities[i] }))
                                     .sort((a, b) => b.sim - a.sim);
    const topMembersMeta = ranked.slice(0, 10).map((r) => dealMeta.get(r.id)).filter(Boolean) as Array<typeof all[0]>;

    const label = await labelCluster(opts.labelRouteConfig, topMembersMeta.map((d) => ({
      heading: d.heading as string,
      buyer: d.buyer as string | null,
      target: d.target as string | null,
      sector: d.dominant_sector as string | null,
      country: d.dominant_geography as string | null,
      deal_type: d.deal_type as string | null,
    })));
    cost_usd += 0.003;  // approx per labelling call

    if (!label) continue;

    // Compute aggregate metrics
    const allMemberMeta = cluster.memberIds.map((id) => dealMeta.get(id)).filter(Boolean) as Array<typeof all[0]>;
    const buyers = new Set<string>();
    const sectors = new Set<string>();
    const geos = new Set<string>();
    for (const m of allMemberMeta) {
      if (m.buyer) buyers.add(m.buyer as string);
      if (m.dominant_sector) sectors.add(m.dominant_sector as string);
      if (m.dominant_geography) geos.add(m.dominant_geography as string);
    }

    // Upsert theme
    const { data: insertedTheme } = await sb.from("themes").upsert({
      created_by: opts.userId,
      slug: label.slug,
      display_name: label.display_name,
      emoji: label.emoji,
      strategic_summary: label.strategic_summary,
      why_it_matters: label.why_it_matters,
      drivers: label.drivers,
      likely_next_targets: label.likely_next_targets,
      pitch_hypothesis: label.pitch_hypothesis,
      consulting_angle: label.consulting_angle,
      deal_count: cluster.memberIds.length,
      active_buyers: Array.from(buyers).slice(0, 10),
      geographies: Array.from(geos),
      sectors: Array.from(sectors),
      centroid_embedding: toPgVector(cluster.centroid),
      heat: label.heat,
      status: "active",
      last_refreshed_at: new Date().toISOString(),
    }, { onConflict: "created_by,slug" }).select("id").single();

    const themeId = (insertedTheme as { id: string } | null)?.id;
    if (!themeId) continue;
    clusters_created++;

    // Replace membership atomically
    await sb.from("theme_deals").delete().eq("theme_id", themeId);
    const membershipPayload = cluster.memberIds.map((id, i) => ({
      theme_id: themeId,
      canonical_id: id,
      similarity: cluster.memberSimilarities[i],
    }));
    if (membershipPayload.length > 0) {
      await sb.from("theme_deals").insert(membershipPayload);
    }
  }

  await sb.from("theme_refresh_runs").update({
    status: "completed",
    embeddings_added, clusters_created, clusters_updated,
    cost_usd: Math.round(cost_usd * 10000) / 10000,
    completed_at: new Date().toISOString(),
  }).eq("id", runId!);

  return { embeddings_added, clusters_created, clusters_updated, total_themes: clusters_created, cost_usd };
}

function buildEmbeddingText(d: { heading: string | null; buyer: string | null; target: string | null; dominant_sector: string | null; dominant_geography: string | null; deal_type: string | null }): string {
  const parts: string[] = [];
  if (d.buyer && d.target) parts.push(`${d.buyer} acquires ${d.target}`);
  else if (d.buyer) parts.push(d.buyer);
  else if (d.target) parts.push(d.target);
  if (d.dominant_sector) parts.push(`in ${d.dominant_sector}`);
  if (d.dominant_geography) parts.push(`(${d.dominant_geography})`);
  if (d.deal_type) parts.push(`type: ${d.deal_type}`);
  if (d.heading) parts.push(d.heading);
  return parts.join(". ");
}
