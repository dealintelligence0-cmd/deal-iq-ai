/**
 * Deal IQ AI — Ingestion v2 — reprocessing + correction storage.
 *
 * When a user resolves a resolution_task with corrected field values:
 *   1. Save the correction to correction_examples (for few-shot learning).
 *   2. Supersede the previous canonical_deals row.
 *   3. Insert a NEW canonical_deals row with the corrected values.
 *   4. Mark the resolution_task as resolved.
 *
 * Reprocessing a single raw row (without correction) re-runs the extractor.
 * Reprocessing a whole batch is the same loop applied to every raw_feed_record.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExtractionResult } from "./types";
import { extractRow } from "./extractor";
import { routeRow } from "./router";

// ---------------------------------------------------------------------------
// User-supplied correction → save + supersede + reinsert
// ---------------------------------------------------------------------------

export type CorrectionPayload = {
  buyer?: string | null;
  target?: string | null;
  vendor?: string | null;
  dominant_sector?: string | null;
  dominant_geography?: string | null;
  intelligence_size?: string | null;
  intelligence_grade?: string | null;
  stake_value?: string | null;
  deal_type?: string | null;
  deal_status?: string | null;
  // free-form note from the human
  note?: string;
};

export async function resolveTask(
  sb: SupabaseClient,
  taskId: string,
  userId: string,
  correction: CorrectionPayload
): Promise<{ canonical_id: string }> {
  // 1. Load task
  const { data: task, error: terr } = await sb
    .from("resolution_tasks")
    .select("*")
    .eq("id", taskId)
    .single();
  if (terr || !task) throw new Error(`Task not found: ${terr?.message}`);
  if (task.status !== "open") throw new Error(`Task is ${task.status}`);

  const sourceRowId = task.source_row_id as string;
  const batchId = task.batch_id as string;
  const oldCanonicalId = task.canonical_deal_id as string | null;
  const aiSuggestions = task.ai_suggestions as Record<string, unknown>;

  // 2. Save correction example (for few-shot learning)
  const goodExtraction = {
    buyer:               correction.buyer               ?? aiSuggestions.buyer ?? null,
    target:              correction.target              ?? aiSuggestions.target ?? null,
    vendor:              correction.vendor              ?? aiSuggestions.vendor ?? null,
    dominant_sector:     correction.dominant_sector     ?? aiSuggestions.dominant_sector ?? null,
    dominant_geography:  correction.dominant_geography  ?? aiSuggestions.dominant_geography ?? null,
    intelligence_size:   correction.intelligence_size   ?? aiSuggestions.intelligence_size ?? null,
    intelligence_grade:  correction.intelligence_grade  ?? aiSuggestions.intelligence_grade ?? null,
    stake_value:         correction.stake_value         ?? aiSuggestions.stake_value ?? null,
    deal_type:           correction.deal_type           ?? aiSuggestions.deal_type ?? null,
    deal_status:         correction.deal_status         ?? aiSuggestions.deal_status ?? null,
  };

  // Pull tags from the canonical row we're correcting
  const { data: canonRow } = oldCanonicalId
    ? await sb.from("canonical_deals").select("evidence_json").eq("id", oldCanonicalId).single()
    : { data: null };
  const evidence = (canonRow?.evidence_json as Record<string, unknown> | undefined) ?? {};
  const intentTags = (evidence._intent_tags as string[] | undefined) ?? [];

  const structuredFields = {
    bidders: task.raw_bidders,
    targets: task.raw_targets,
    vendors: task.raw_vendors,
    intel_type: task.raw_intel_type,
    intel_size: task.raw_intel_size,
    intel_grade: task.raw_intel_grade,
  };

  await sb.from("correction_examples").insert({
    source_row_id: sourceRowId,
    resolution_task_id: taskId,
    created_by: userId,
    heading: task.heading,
    opportunity: task.opportunity,
    structured_fields: structuredFields,
    bad_extraction: aiSuggestions,
    good_extraction: goodExtraction,
    intent_tags: intentTags,
  });

  // 3. Supersede old canonical row
  if (oldCanonicalId) {
    // We'll set superseded_by AFTER inserting the new row so we can point to it
  }

  // 4. Insert NEW canonical_deals row from corrected values
  const newRow = {
    source_row_id: sourceRowId,
    batch_id: batchId,
    created_by: userId,
    heading: task.heading,
    buyer: goodExtraction.buyer,
    target: goodExtraction.target,
    vendor: goodExtraction.vendor,
    dominant_sector: goodExtraction.dominant_sector,
    dominant_geography: goodExtraction.dominant_geography,
    intelligence_size: goodExtraction.intelligence_size,
    intelligence_grade: goodExtraction.intelligence_grade,
    stake_value: goodExtraction.stake_value,
    deal_type: goodExtraction.deal_type,
    deal_status: goodExtraction.deal_status,
    parse_confidence: 1.0,
    parse_path: "human_correction",
    needs_review: false,
    is_digest: false,
    evidence_json: {
      ...evidence,
      corrected_from: oldCanonicalId,
      correction_note: correction.note ?? null,
      corrected_by: userId,
      corrected_at: new Date().toISOString(),
    },
  };

  const { data: ins, error: insErr } = await sb
    .from("canonical_deals")
    .insert(newRow)
    .select("id")
    .single();
  if (insErr || !ins) throw new Error(`Canonical reinsert failed: ${insErr?.message}`);
  const newCanonicalId = (ins as { id: string }).id;

  // 5. Point old row to new, mark superseded
  if (oldCanonicalId) {
    await sb
      .from("canonical_deals")
      .update({
        superseded_by: newCanonicalId,
        superseded_at: new Date().toISOString(),
      })
      .eq("id", oldCanonicalId);
  }

  // 6. Resolve task
  await sb.from("resolution_tasks").update({
    status: "resolved",
    resolved_by: userId,
    resolved_at: new Date().toISOString(),
    resolution_payload: correction as unknown as object,
    canonical_deal_id: newCanonicalId,
  }).eq("id", taskId);

  return { canonical_id: newCanonicalId };
}

// ---------------------------------------------------------------------------
// Reprocess a single raw row (after schema change, parser improvement, etc.)
// ---------------------------------------------------------------------------

export async function reprocessRawRow(
  sb: SupabaseClient,
  rawId: string,
  userId: string
): Promise<{ canonical_id: string | null; lane: string }> {
  const { data: raw, error } = await sb
    .from("raw_feed_records")
    .select("*")
    .eq("id", rawId)
    .single();
  if (error || !raw) throw new Error(`Raw row not found: ${error?.message}`);

  const result = extractRow(raw.raw_json as Record<string, unknown>);
  const decision = routeRow(result);

  // Supersede any existing canonical row for this raw row
  const { data: existingCanon } = await sb
    .from("canonical_deals")
    .select("id")
    .eq("source_row_id", rawId)
    .is("superseded_by", null)
    .maybeSingle();

  if (decision.kind === "digest") {
    // Make sure it's recorded as a digest; supersede any canonical
    if (existingCanon) {
      await sb.from("canonical_deals")
        .update({ superseded_by: existingCanon.id /* self-pointer = mark consumed */ })
        .eq("id", (existingCanon as { id: string }).id);
    }
    const { data: dig } = await sb.from("digest_records")
      .insert({
        source_row_id: rawId,
        batch_id: raw.batch_id,
        created_by: userId,
        heading: result.heading,
        opportunity: raw.raw_opportunity,
        topics: (raw.raw_json as Record<string, unknown>).Topics ?? null,
        intelligence_type: raw.raw_intel_type,
        sector: result.dominant_sector.value,
        geography: result.dominant_geography.value,
        digest_reason: result.digest_reason,
      })
      .select("id")
      .single();
    return { canonical_id: null, lane: "digest" };
  }

  const needsReview = decision.kind === "resolution";
  const insertPayload = {
    source_row_id: rawId,
    batch_id: raw.batch_id,
    created_by: userId,
    heading: result.heading,
    buyer: result.buyer.value,
    target: result.target.value,
    vendor: result.vendor.value,
    dominant_sector: result.dominant_sector.value,
    dominant_geography: result.dominant_geography.value,
    intelligence_size: result.intelligence_size.value,
    intelligence_grade: result.intelligence_grade.value,
    stake_value: result.stake_value.value,
    deal_type: result.deal_type.value,
    deal_status: result.deal_status.value,
    parse_confidence: result.row_confidence,
    parse_path: result.parse_path + "+reprocess",
    needs_review: needsReview,
    is_digest: false,
    evidence_json: result.evidence_json,
    deal_date: result.deal_date,
  };

  const { data: newCanon, error: insErr } = await sb
    .from("canonical_deals")
    .insert(insertPayload)
    .select("id")
    .single();
  if (insErr || !newCanon) throw new Error(`Reprocess insert failed: ${insErr?.message}`);
  const newId = (newCanon as { id: string }).id;

  if (existingCanon) {
    await sb.from("canonical_deals").update({
      superseded_by: newId,
      superseded_at: new Date().toISOString(),
    }).eq("id", (existingCanon as { id: string }).id);
  }

  return { canonical_id: newId, lane: decision.kind };
}

export async function reprocessBatch(
  sb: SupabaseClient,
  batchId: string,
  userId: string
): Promise<{ rows_reprocessed: number; errors: string[] }> {
  const errors: string[] = [];
  let processed = 0;

  // Paginate raw rows for the batch
  let offset = 0;
  const PAGE = 100;
  while (true) {
    const { data: rows, error } = await sb
      .from("raw_feed_records")
      .select("id")
      .eq("batch_id", batchId)
      .order("source_row_number", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!rows || rows.length === 0) break;
    for (const r of rows) {
      try {
        await reprocessRawRow(sb, (r as { id: string }).id, userId);
        processed++;
      } catch (e: any) {
        errors.push(`Row ${r.id}: ${e?.message ?? "unknown"}`);
      }
    }
    if (rows.length < PAGE) break;
    offset += PAGE;
  }

  return { rows_reprocessed: processed, errors };
}
