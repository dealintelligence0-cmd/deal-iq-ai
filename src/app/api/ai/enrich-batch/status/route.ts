

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/ai/enrich-batch/status?job_ids=id1,id2,id3
 *
 * Returns the current status of one or more enrichment jobs. The UI polls
 * this every few seconds while a background batch is running to update
 * its progress bar.
 *
 * Returns: {
 *   jobs: Array<{
 *     id, status: queued|processing|done|error,
 *     chunk_size, succeeded, failed, error_message,
 *     started_at, finished_at
 *   }>,
 *   summary: { total_chunks, queued, processing, done, error, total_succeeded, total_failed }
 * }
 */
export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const ids = (url.searchParams.get("job_ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (ids.length === 0) {
    return NextResponse.json({ error: "job_ids query parameter is required" }, { status: 400 });
  }

  const { data: jobs, error } = await supabase
    .from("enrichment_jobs")
    .select("id, status, chunk_size, succeeded, failed, error_message, started_at, finished_at, created_at")
    .eq("user_id", user.id)
    .in("id", ids);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = jobs ?? [];
  const summary = {
    total_chunks: rows.length,
    queued: rows.filter((r) => r.status === "queued").length,
    processing: rows.filter((r) => r.status === "processing").length,
    done: rows.filter((r) => r.status === "done").length,
    error: rows.filter((r) => r.status === "error").length,
    total_succeeded: rows.reduce((s, r) => s + (r.succeeded ?? 0), 0),
    total_failed: rows.reduce((s, r) => s + (r.failed ?? 0), 0),
  };

  return NextResponse.json({ jobs: rows, summary });
}
