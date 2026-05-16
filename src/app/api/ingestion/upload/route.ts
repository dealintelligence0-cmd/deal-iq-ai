/**
 * POST /api/ingestion/upload
 *
 * Body: multipart form with a single "file" field (XLS/XLSX/CSV).
 * Optional: query params ?ai=anthropic|openai&model=...
 *
 * The actual API key for AI fallback is read from the caller's ai_settings
 * (the same place the rest of the platform reads keys) — never from the
 * client. This route returns the import_batch summary.
 */

import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import { createClient } from "@/lib/supabase/server";
import { ingestBatch } from "@/lib/ingestion/orchestrator";
import { type AIFallbackOptions } from "@/lib/ingestion/ai-fallback";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch (e: any) {
    return NextResponse.json({ error: `Bad form data: ${e?.message}` }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded under 'file' field" }, { status: 400 });
  }

  // Parse rows
  const buf = Buffer.from(await file.arrayBuffer());
  let rows: Record<string, unknown>[] = [];
  const name = file.name.toLowerCase();

  try {
    if (name.endsWith(".csv") || name.endsWith(".tsv") || name.endsWith(".txt")) {
      const text = buf.toString("utf-8");
      const parsed = Papa.parse<Record<string, unknown>>(text, { header: true, skipEmptyLines: true });
      rows = parsed.data;
    } else {
      const wb = XLSX.read(buf, { type: "buffer" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });
    }
  } catch (e: any) {
    return NextResponse.json({ error: `Could not parse file: ${e?.message}` }, { status: 400 });
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: "File contains no rows" }, { status: 400 });
  }

  // AI fallback config: pull from ai_settings if requested
  const url = new URL(req.url);
  const aiProvider = url.searchParams.get("ai") as "openai" | "anthropic" | null;
  const aiModelOverride = url.searchParams.get("model");
  let aiOpts: AIFallbackOptions | null = null;
  if (aiProvider) {
    const { data: settings } = await sb
      .from("ai_settings")
      .select("premium_provider,premium_model,premium_key_encrypted,economic_provider,economic_model,economic_key_encrypted")
      .eq("user_id", user.id)
      .maybeSingle();
    if (settings) {
      const pkAvailable = settings.premium_provider === aiProvider && settings.premium_key_encrypted;
      const ekAvailable = settings.economic_provider === aiProvider && settings.economic_key_encrypted;
      const key = pkAvailable ? settings.premium_key_encrypted : (ekAvailable ? settings.economic_key_encrypted : null);
      const model = aiModelOverride
        ?? (pkAvailable ? settings.premium_model : settings.economic_model)
        ?? (aiProvider === "anthropic" ? "claude-haiku-4-5-20251001" : "gpt-4o-mini");
      if (key) {
        aiOpts = { provider: aiProvider, apiKey: key as string, model: model as string };
      }
    }
  }

  // Run ingestion
  try {
    const summary = await ingestBatch(sb, rows, {
      userId: user.id,
      sourceFile: file.name,
      ai: aiOpts,
    });
    return NextResponse.json({ ok: true, ...summary });
  } catch (e: any) {
    return NextResponse.json({ error: `Ingest failed: ${e?.message}` }, { status: 500 });
  }
}
