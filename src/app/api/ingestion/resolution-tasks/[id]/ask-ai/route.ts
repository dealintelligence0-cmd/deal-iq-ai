/**
 * POST /api/ingestion/resolution-tasks/:id/ask-ai
 *
 * Runs the AI fallback against this task's raw row using the user's saved
 * Economic-tier key. Returns updated AI suggestions (which the UI uses to
 * pre-fill the draft form). Does NOT auto-resolve the task — the partner
 * still reviews and saves.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runAIFallback, type AIFallbackOptions } from "@/lib/ingestion/ai-fallback";
import { extractRow } from "@/lib/ingestion/extractor";
import { resolveKey } from "@/lib/ai/key-resolver";

export const runtime = "nodejs";
export const maxDuration = 60;

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // 1. Load the task + its raw row
  const { data: task, error: te } = await sb
    .from("resolution_tasks")
    .select("source_row_id, ai_suggestions, field_confidence")
    .eq("id", id)
    .single();
  if (te || !task) return NextResponse.json({ error: te?.message ?? "Task not found" }, { status: 404 });

  const { data: raw, error: re } = await sb
    .from("raw_feed_records")
    .select("raw_json")
    .eq("id", task.source_row_id)
    .single();
  if (re || !raw) return NextResponse.json({ error: re?.message ?? "Raw row not found" }, { status: 404 });

  // 2. Resolve user's preferred economic-tier key for this call
  // The user can ask their economic tier OR pass ?key_id=<uuid> to override
  const url = new URL(req.url);
  const overrideKeyId = url.searchParams.get("key_id");
  const tier = (url.searchParams.get("tier") ?? "economic") as "smart" | "economic" | "fast";

  const resolved = await resolveKey(createAdminClient(), user.id, tier, overrideKeyId ?? undefined);
  if (!resolved?.apiKey || !resolved.provider || !resolved.model) {
    return NextResponse.json({
      error: `No ${tier}-tier AI key configured. Add one in Settings → API Key Library.`,
    }, { status: 400 });
  }

  const aiOpts: AIFallbackOptions = {
    provider: resolved.provider as AIFallbackOptions["provider"],
    apiKey: resolved.apiKey,
    model: resolved.model,
  };

  // 3. Re-extract deterministically then layer AI on top
  const baseResult = extractRow(raw.raw_json as Record<string, unknown>);
  let merged = baseResult;
  let ai_payload: unknown = null;
  try {
    const out = await runAIFallback(sb, raw.raw_json as Record<string, unknown>, baseResult, aiOpts);
    merged = out.result;
    ai_payload = out.ai_payload;
  } catch (e: any) {
    return NextResponse.json({ error: `AI call failed: ${e?.message ?? "unknown"}` }, { status: 502 });
  }

  // 4. Build the new ai_suggestions block (same shape as orchestrator writes)
  const ai_suggestions = {
    buyer: merged.buyer.value,
    target: merged.target.value,
    vendor: merged.vendor.value,
    dominant_sector: merged.dominant_sector.value,
    dominant_geography: merged.dominant_geography.value,
    intelligence_size: merged.intelligence_size.value,
    intelligence_grade: merged.intelligence_grade.value,
    stake_value: merged.stake_value.value,
    deal_type: merged.deal_type.value,
    deal_status: merged.deal_status.value,
    parse_path: merged.parse_path,
    row_confidence: merged.row_confidence,
  };
  const field_confidence = {
    buyer: merged.buyer.confidence,
    target: merged.target.confidence,
    dominant_sector: merged.dominant_sector.confidence,
    dominant_geography: merged.dominant_geography.confidence,
    intelligence_size: merged.intelligence_size.confidence,
    intelligence_grade: merged.intelligence_grade.confidence,
    stake_value: merged.stake_value.confidence,
    deal_type: merged.deal_type.confidence,
    deal_status: merged.deal_status.confidence,
  };

  // 5. Persist back to the task so reloads show the AI's work
  await sb.from("resolution_tasks").update({
    ai_suggestions, field_confidence,
  }).eq("id", id);

  return NextResponse.json({
    ok: true,
    ai_suggestions,
    field_confidence,
    provider: resolved.provider,
    model: resolved.model,
    ai_payload,
  });
}
