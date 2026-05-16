/**
 * POST /api/ingestion/reprocess
 * Body: { batch_id?: string, raw_row_id?: string }
 *
 * Re-runs the deterministic extractor against existing raw_feed_records
 * and supersedes their canonical rows with the new output. Useful after
 * parser improvements ship and you want to re-derive old batches without
 * re-uploading.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { reprocessRawRow, reprocessBatch } from "@/lib/ingestion/reprocess";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { batch_id?: string; raw_row_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    if (body.raw_row_id) {
      const out = await reprocessRawRow(sb, body.raw_row_id, user.id);
      return NextResponse.json({ ok: true, ...out });
    }
    if (body.batch_id) {
      const out = await reprocessBatch(sb, body.batch_id, user.id);
      return NextResponse.json({ ok: true, ...out });
    }
    return NextResponse.json({ error: "Provide batch_id or raw_row_id" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Reprocess failed" }, { status: 500 });
  }
}
