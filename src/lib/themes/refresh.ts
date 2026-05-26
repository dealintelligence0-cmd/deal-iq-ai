

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
import { portfolioMomentum } from "./momentum";
import { reviseAssumption } from "@/lib/cognition/orchestrator";
import { COGNITION_KEYS } from "@/lib/cognition/keys";
import type { RouteConfig } from "@/lib/ai/router";

export type RefreshResult = {
  embeddings_added: int;
  clusters_created: int;
  clusters_updated: int;
  total_themes: int;
  cost_usd: number;
  diagnostic?: string;
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
    const { vectors, lastError, modelUsed } = await embedTexts(texts, opts.embedConfig);
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
      const actualErr = lastError ? ` Provider said: "${lastError}"` : "";
      embed_errors.push(`All ${pending.length} embedding calls failed via ${opts.embedConfig.provider} (model: ${modelUsed}).${actualErr}`);
    } else if (nullCount > 0) {
      embed_errors.push(`${nullCount}/${pending.length} embedding calls failed via ${opts.embedConfig.provider}.${lastError ? ` Last error: ${lastError}` : ""}`);
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
  const { clusters, diagnostic } = clusterDeals(dealsForClustering);

  // Log the diagnostic into the refresh run for debugging
  const diagSummary = `Pairs: ${diagnostic.totalPairs} · sim range [${diagnostic.similarityMin.toFixed(3)} – ${diagnostic.similarityMax.toFixed(3)}] · p50 ${diagnostic.similarityP50.toFixed(3)} · p90 ${diagnostic.similarityP90.toFixed(3)} · threshold ${diagnostic.thresholdUsed.toFixed(3)} · pairs ≥ threshold ${diagnostic.pairsAboveThreshold} · clusters ${diagnostic.clustersFound}`;
  console.log("[ThemeRefresh] cluster diagnostic:", diagSummary);

  // ---- 4. Archive existing themes (we re-create fresh each refresh) ----
  if (clusters.length > 0) {
    await sb.from("themes").update({ status: "archived" })
      .eq("created_by", opts.userId).eq("status", "active");
  }

  // Build a lookup for deal metadata
  const dealMeta = new Map<string, typeof all[0]>();
  for (const d of all) dealMeta.set(d.id as string, d);

  let clusters_created = 0;
  let clusters_updated = 0;
  let fallbackUsed = 0;
  const labelErrors: string[] = [];
  const persistedThemes: Array<{ heat: string; dealCount: number }> = [];

  // ---- 5. For each cluster: label + persist ----
  for (const cluster of clusters) {
    // Pick top-5 members by similarity for AI labeling
    const ranked = cluster.memberIds.map((id, i) => ({ id, sim: cluster.memberSimilarities[i] }))
                                     .sort((a, b) => b.sim - a.sim);
    const topMembersMeta = ranked.slice(0, 10).map((r) => dealMeta.get(r.id)).filter(Boolean) as Array<typeof all[0]>;

    const labelResult = await labelCluster(opts.labelRouteConfig, topMembersMeta.map((d) => ({
      heading: d.heading as string,
      buyer: d.buyer as string | null,
      target: d.target as string | null,
      sector: d.dominant_sector as string | null,
      country: d.dominant_geography as string | null,
      deal_type: d.deal_type as string | null,
    })));
    cost_usd += 0.003;

    const label = labelResult.label;
    if (labelResult.error) labelErrors.push(labelResult.error);
    if (!label) continue;  // fallback also failed — extremely rare
    if (labelResult.via === "fallback") fallbackUsed++;

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

    // Upsert theme — append a small disambiguation suffix to the slug to avoid
    // collisions when multiple clusters in one run share the same fallback slug
    const uniqueSlug = `${label.slug}-${cluster.memberIds[0].slice(0, 6)}`.slice(0, 60);

    const { data: insertedTheme, error: upsertErr } = await sb.from("themes").upsert({
      created_by: opts.userId,
      slug: uniqueSlug,
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

    if (upsertErr) {
      labelErrors.push(`Upsert failed for "${label.display_name}": ${upsertErr.message}`);
      continue;
    }
    const themeId = (insertedTheme as { id: string } | null)?.id;
    if (!themeId) continue;
    clusters_created++;
    persistedThemes.push({ heat: label.heat, dealCount: cluster.memberIds.length });

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

  // Feed portfolio theme momentum into the cognition layer. A change here fires
  // the "theme momentum decline drops buyer prioritization" propagation rule.
  // Non-blocking: a failure must never break the refresh.
  const momentum = portfolioMomentum(persistedThemes);
  if (momentum !== null) {
    try {
      await reviseAssumption({
        workspaceId: null,
        dealId: null,
        key: COGNITION_KEYS.theme.momentumScore,
        valueNumeric: momentum,
        confidence: 0.7,
        source: "signal",
        triggeredBy: "signal_ingestion",
        triggerMeta: { module: "themes", themes_scored: persistedThemes.length },
        reason: "Portfolio theme momentum from latest pipeline clustering",
      });
      console.info("[cognition][themes][momentum]", { momentum, themes: persistedThemes.length });
    } catch (e) {
      console.error("[cognition] theme momentum write failed:", e);
    }
  }

  // Build a precise diagnostic based on what actually happened
  let finalError: string | null = null;
  if (clusters_created === 0 && diagnostic.clustersFound > 0) {
    // Clusters formed but none got persisted — all labelings failed
    const firstErr = labelErrors[0] ?? "Unknown labeling error.";
    finalError = `Clustering found ${diagnostic.clustersFound} candidate themes but the AI labeler failed for all of them. First error: ${firstErr}`;
  } else if (clusters_created === 0) {
    finalError = `Embedded ${embeddings_added} new deals but no clusters formed. ${diagSummary}. Your embeddings may be too diverse — try uploading more deals in the same sector.`;
  } else if (fallbackUsed > 0) {
    // Some clusters got labeled, some used the fallback — informational only
    finalError = `Used deterministic fallback labels for ${fallbackUsed} of ${clusters_created} themes (AI labeling failed for those). First error: ${labelErrors[0] ?? "see logs"}`;
  }

  await sb.from("theme_refresh_runs").update({
    status: "completed",
    embeddings_added, clusters_created, clusters_updated,
    cost_usd: Math.round(cost_usd * 10000) / 10000,
    error: finalError,
    completed_at: new Date().toISOString(),
  }).eq("id", runId!);

  return { embeddings_added, clusters_created, clusters_updated, total_themes: clusters_created, cost_usd, diagnostic: diagSummary };
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
