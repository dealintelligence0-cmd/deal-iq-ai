/**
 * Deal IQ AI — Ingestion v2 — orchestrator (entry point).
 *
 * End-to-end flow:
 *   1. Create import_batch row.
 *   2. For each raw row: insert verbatim into raw_feed_records.
 *   3. Run deterministic extractor.
 *   4. If row_confidence is borderline AND AI key is provided, run AI fallback.
 *   5. Route to canonical_deals OR digest_records OR resolution_tasks.
 *   6. Update batch counters; finalize batch.
 *
 * All DB writes are scoped to the calling user via RLS.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { type RawRow, type ExtractionResult, CONFIDENCE } from "./types";
import { readMergermarket } from "./columns";
import { extractRow } from "./extractor";
import { routeRow } from "./router";
import { runAIFallback, type AIFallbackOptions } from "./ai-fallback";

export type IngestOptions = {
  userId: string;
  sourceFile: string;
  ai?: AIFallbackOptions | null;       // null/undefined = no AI fallback
  /**
   * Confidence band that triggers AI fallback. Defaults to 0.40..0.70:
   * everything in that band gets a second look from the AI before routing.
   */
  aiBand?: { lo: number; hi: number };
};

export type IngestSummary = {
  batch_id: string;
  total_rows: number;
  canonical_rows: number;
  digest_rows: number;
  resolution_rows: number;
  blank_rows: number;
  errors: string[];
};

const DEFAULT_AI_BAND = { lo: 0.40, hi: 0.70 };

export async function ingestBatch(
  sb: SupabaseClient,
  rows: RawRow[],
  opts: IngestOptions
): Promise<IngestSummary> {
  // 1. Create batch
  const { data: batchRow, error: batchErr } = await sb
    .from("import_batches")
    .insert({
      created_by: opts.userId,
      source_file: opts.sourceFile,
      total_rows: rows.length,
      status: "processing",
    })
    .select("id")
    .single();
  if (batchErr || !batchRow) throw new Error(`Could not create import_batch: ${batchErr?.message}`);
  const batchId = batchRow.id as string;

  const summary: IngestSummary = {
    batch_id: batchId,
    total_rows: rows.length,
    canonical_rows: 0,
    digest_rows: 0,
    resolution_rows: 0,
    blank_rows: 0,
    errors: [],
  };

  const aiBand = opts.aiBand ?? DEFAULT_AI_BAND;

  // 2. Process rows. We persist raw_feed_records in chunks for throughput,
  //    then process each chunk's downstream writes.
  const CHUNK = 50;
  for (let off = 0; off < rows.length; off += CHUNK) {
    const slice = rows.slice(off, off + CHUNK);

    // 2a. Preserve raw rows verbatim
    const rawPayload = slice.map((r, i) => {
      const m = readMergermarket(r);
      return {
        batch_id: batchId,
        created_by: opts.userId,
        source_file: opts.sourceFile,
        source_row_number: off + i + 1,
        raw_json: r as unknown as object,
        raw_heading: m.heading,
        raw_opportunity: m.opportunity,
        raw_bidders: m.bidders,
        raw_targets: m.targets,
        raw_vendors: m.vendors,
        raw_issuers: m.issuers,
        raw_intel_type: m.intel_type,
        raw_intel_size: m.intel_size,
        raw_intel_grade: m.intel_grade,
        raw_stake_value: m.stake,
        raw_sector: m.sector,
        raw_geography: m.geography,
      };
    });
    const { data: insertedRaw, error: rawErr } = await sb
      .from("raw_feed_records")
      .insert(rawPayload)
      .select("id");
    if (rawErr || !insertedRaw) {
      summary.errors.push(`Raw insert failed at offset ${off}: ${rawErr?.message ?? "no data"}`);
      continue;
    }

    // 2b. Extract + route + persist each row's canonical / digest / resolution
    for (let i = 0; i < slice.length; i++) {
      const row = slice[i];
      const rawId = (insertedRaw[i] as { id: string }).id;
      try {
        const result = await processRow(sb, row, rawId, batchId, opts, aiBand);
        switch (result.lane) {
          case "blank":      summary.blank_rows++;      break;
          case "digest":     summary.digest_rows++;     break;
          case "canonical":  summary.canonical_rows++;  break;
          case "resolution": summary.resolution_rows++; break;
        }
      } catch (e: any) {
        summary.errors.push(`Row ${off + i + 1}: ${e?.message ?? "unknown"}`);
      }
    }
  }

  // 3. Finalize batch
  await sb
    .from("import_batches")
    .update({
      status: summary.errors.length > 0 ? "completed" : "completed",
      canonical_rows: summary.canonical_rows,
      digest_rows: summary.digest_rows,
      resolution_rows: summary.resolution_rows,
      blank_rows: summary.blank_rows,
      error: summary.errors.length > 0 ? summary.errors.slice(0, 10).join("\n") : null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", batchId);

  return summary;
}

// ---------------------------------------------------------------------------
// Per-row processing
// ---------------------------------------------------------------------------

type Lane = "blank" | "digest" | "canonical" | "resolution";

async function processRow(
  sb: SupabaseClient,
  row: RawRow,
  rawId: string,
  batchId: string,
  opts: IngestOptions,
  aiBand: { lo: number; hi: number }
): Promise<{ lane: Lane }> {
  // Blank-row guard
  const m = readMergermarket(row);
  if (!m.heading && !m.opportunity && !m.bidders && !m.targets) {
    return { lane: "blank" };
  }

  // 1. Deterministic extract
  let result: ExtractionResult = extractRow(row);

  // 2. AI fallback for borderline rows
  if (
    !result.is_digest &&
    opts.ai &&
    result.row_confidence >= aiBand.lo &&
    result.row_confidence < aiBand.hi
  ) {
    try {
      const aiOut = await runAIFallback(sb, row, result, opts.ai);
      result = aiOut.result;
    } catch {
      // ignore — keep deterministic result
    }
  }

  // 3. Route
  const decision = routeRow(result);

  // 4. Persist by lane
  if (decision.kind === "digest") {
    await persistDigest(sb, rawId, batchId, opts.userId, decision.result, m);
    return { lane: "digest" };
  }

  if (decision.kind === "canonical") {
    await persistCanonical(sb, rawId, batchId, opts.userId, decision.result, false);
    return { lane: "canonical" };
  }

  // resolution → persist canonical (with needs_review=true so it WON'T flow downstream)
  // + create resolution_task
  const canonicalId = await persistCanonical(sb, rawId, batchId, opts.userId, decision.result, true);
  await persistResolutionTask(sb, rawId, batchId, canonicalId, opts.userId, decision.result, m);
  return { lane: "resolution" };
}

async function persistDigest(
  sb: SupabaseClient,
  rawId: string,
  batchId: string,
  userId: string,
  r: ExtractionResult,
  raw: ReturnType<typeof readMergermarket>
): Promise<void> {
  await sb.from("digest_records").insert({
    source_row_id: rawId,
    batch_id: batchId,
    created_by: userId,
    heading: r.heading,
    opportunity: raw.opportunity,
    topics: raw.topics,
    intelligence_type: raw.intel_type,
    sector: r.dominant_sector.value,
    geography: r.dominant_geography.value,
    digest_reason: r.digest_reason,
  });
}

async function persistCanonical(
  sb: SupabaseClient,
  rawId: string,
  batchId: string,
  userId: string,
  r: ExtractionResult,
  needsReview: boolean
): Promise<string> {
  const { data, error } = await sb
    .from("canonical_deals")
    .insert({
      source_row_id: rawId,
      batch_id: batchId,
      created_by: userId,
      heading: r.heading,
      buyer: r.buyer.value,
      target: r.target.value,
      vendor: r.vendor.value,
      dominant_sector: r.dominant_sector.value,
      dominant_geography: r.dominant_geography.value,
      intelligence_size: r.intelligence_size.value,
      intelligence_grade: r.intelligence_grade.value,
      stake_value: r.stake_value.value,
      deal_type: r.deal_type.value,
      deal_status: r.deal_status.value,
      parse_confidence: r.row_confidence,
      parse_path: r.parse_path,
      needs_review: needsReview,
      is_digest: r.is_digest,
      evidence_json: r.evidence_json,
      deal_date: r.deal_date,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Canonical insert failed: ${error?.message}`);
  return (data as { id: string }).id;
}

async function persistResolutionTask(
  sb: SupabaseClient,
  rawId: string,
  batchId: string,
  canonicalId: string,
  userId: string,
  r: ExtractionResult,
  raw: ReturnType<typeof readMergermarket>
): Promise<void> {
  const field_confidence = {
    buyer: r.buyer.confidence,
    target: r.target.confidence,
    dominant_sector: r.dominant_sector.confidence,
    dominant_geography: r.dominant_geography.confidence,
    intelligence_size: r.intelligence_size.confidence,
    intelligence_grade: r.intelligence_grade.confidence,
    stake_value: r.stake_value.confidence,
    deal_type: r.deal_type.confidence,
    deal_status: r.deal_status.confidence,
  };

  const ai_suggestions = {
    buyer: r.buyer.value,
    target: r.target.value,
    vendor: r.vendor.value,
    dominant_sector: r.dominant_sector.value,
    dominant_geography: r.dominant_geography.value,
    intelligence_size: r.intelligence_size.value,
    intelligence_grade: r.intelligence_grade.value,
    stake_value: r.stake_value.value,
    deal_type: r.deal_type.value,
    deal_status: r.deal_status.value,
    parse_path: r.parse_path,
    row_confidence: r.row_confidence,
  };

  await sb.from("resolution_tasks").insert({
    source_row_id: rawId,
    batch_id: batchId,
    canonical_deal_id: canonicalId,
    created_by: userId,
    heading: r.heading,
    opportunity: raw.opportunity,
    raw_bidders: raw.bidders,
    raw_targets: raw.targets,
    raw_vendors: raw.vendors,
    raw_intel_type: raw.intel_type,
    raw_intel_size: raw.intel_size,
    raw_intel_grade: raw.intel_grade,
    ai_suggestions,
    field_confidence,
    uncertainty_reasons: r.uncertainty_reasons,
    status: "open",
  });
}
