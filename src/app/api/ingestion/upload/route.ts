

/**
 * POST /api/ingestion/upload
 *
 * Body: multipart form with a single "file" field (XLS/XLSX/CSV).
 *
 * Query params (all optional — defaults to no AI fallback):
 *   ?ai=1                  Enable AI fallback (uses the user's "economic" key by default).
 *   ?tier=smart|economic|fast    Which key tier to use. Default: "economic".
 *   ?key_id=<uuid>         Specific provider_keys.id to use, overrides the tier default.
 *
 * The provider, model and API key are resolved server-side via the standard
 * `resolveKey()` helper — same one the rest of the platform uses. No provider
 * is hardcoded; whichever key the user has marked as default for the chosen
 * tier (or explicitly selected via key_id) is used.
 */

import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ingestBatch } from "@/lib/ingestion/orchestrator";
import { type AIFallbackOptions } from "@/lib/ingestion/ai-fallback";
import { resolveKey } from "@/lib/ai/key-resolver";
import type { ProviderId } from "@/lib/ai/providers";

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

  // Parse rows from the uploaded file
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

  // Resolve AI key via the platform's standard resolver.
  // - default behavior: no AI fallback at all (deterministic extraction only)
  // - ?ai=1                      → use the user's default "economic" key
  // - ?ai=1&tier=smart           → use the user's default "smart" key
  // - ?ai=1&key_id=<uuid>        → use a specific saved key by ID
  const url = new URL(req.url);
  const aiEnabled = url.searchParams.get("ai") === "1" || url.searchParams.get("ai") === "true";
  const tierParam = url.searchParams.get("tier") as "smart" | "economic" | "fast" | null;
  const tier = tierParam ?? "economic";
  const overrideKeyId = url.searchParams.get("key_id") ?? undefined;

  let aiOpts: AIFallbackOptions | null = null;
  let aiResolvedNote: string | null = null;
  if (aiEnabled) {
    const admin = createAdminClient();
    const resolved = await resolveKey(admin, user.id, tier, overrideKeyId);
    if (resolved.apiKey && resolved.provider !== "free" && resolved.model) {
      aiOpts = {
        provider: resolved.provider as ProviderId,
        model: resolved.model,
        apiKey: resolved.apiKey,
      };
      aiResolvedNote = `using ${resolved.provider} / ${resolved.model} (${resolved.source})`;
    } else {
      aiResolvedNote = `No usable AI key found for tier '${tier}' — falling back to deterministic-only extraction.`;
    }
  }

  // Run ingestion
  try {
    const summary = await ingestBatch(sb, rows, {
      userId: user.id,
      sourceFile: file.name,
      ai: aiOpts,
    });
    return NextResponse.json({
      ok: true,
      ...summary,
      ai_resolution: aiResolvedNote,
    });
  } catch (e: any) {
    return NextResponse.json({ error: `Ingest failed: ${e?.message}` }, { status: 500 });
  }
}
