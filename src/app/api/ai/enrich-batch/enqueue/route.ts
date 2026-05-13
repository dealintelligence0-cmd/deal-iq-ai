

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { publish, qstashConfigured } from "@/lib/queue/qstash-client";

/**
 * POST /api/ai/enrich-batch/enqueue
 *
 * Replaces the synchronous /api/ai/enrich-batch for large batches.
 * Splits deal_ids into chunks of 25, persists one row per chunk in
 * `enrichment_jobs`, then publishes one QStash message per chunk. Returns
 * immediately with the list of job_ids so the UI can poll for status.
 *
 * Body: { deal_ids: string[], chunk_size?: number }
 * Returns: { job_ids: string[], queue_mode: "qstash"|"synchronous", chunk_size }
 *
 * Requires (one-time per environment): the enrichment_jobs table. See
 * comments at the bottom of this file for the SQL.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { deal_ids?: string[]; chunk_size?: number };
  const ids = Array.isArray(body.deal_ids) ? body.deal_ids : [];
  if (ids.length === 0) return NextResponse.json({ error: "deal_ids required" }, { status: 400 });

  // Smaller chunks than the synchronous route because QStash gives us
  // unlimited parallelism — sequential 25-deal chunks fit comfortably in
  // Vercel's 60-second function budget.
  const chunkSize = Math.max(10, Math.min(30, body.chunk_size ?? 25));

  const admin = createAdminClient();
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    chunks.push(ids.slice(i, i + chunkSize));
  }

  // Persist one job row per chunk so the UI can track progress.
  const jobRows = chunks.map((chunk) => ({
    user_id: user.id,
    deal_ids: chunk,
    chunk_size: chunk.length,
    status: "queued" as const,
  }));

  const { data: insertedJobs, error: insertErr } = await admin
    .from("enrichment_jobs")
    .insert(jobRows)
    .select("id, deal_ids, chunk_size, status");

  if (insertErr || !insertedJobs) {
    return NextResponse.json(
      {
        error: `Failed to create enrichment_jobs rows. Did you create the enrichment_jobs table? ${insertErr?.message ?? ""}`,
      },
      { status: 500 },
    );
  }

  // Publish each job to QStash (or fall back to fire-and-forget fetch in dev).
  // Spread deliveries over ~30s so we don't slam the LLM provider in the same instant.
  const publishResults: Array<{ job_id: string; messageId: string; mode: string }> = [];
  for (let i = 0; i < insertedJobs.length; i++) {
    const job = insertedJobs[i];
    try {
      const result = await publish(
        "/api/queue/process-deal",
        {
          job_id: job.id,
          user_id: user.id,
          deal_ids: job.deal_ids,
        },
        { delaySeconds: i * 2 },  // 2s stagger per chunk
      );
      publishResults.push({ job_id: job.id, messageId: result.messageId, mode: result.mode });
    } catch (e) {
      await admin
        .from("enrichment_jobs")
        .update({
          status: "error",
          error_message: e instanceof Error ? e.message : String(e),
        })
        .eq("id", job.id);
    }
  }

  return NextResponse.json({
    job_ids: insertedJobs.map((j) => j.id),
    queue_mode: qstashConfigured() ? "qstash" : "synchronous",
    chunk_size: chunkSize,
    chunks_published: publishResults.filter((r) => r.mode === "qstash").length,
    chunks_synchronous: publishResults.filter((r) => r.mode === "synchronous").length,
    total_deals: ids.length,
  });
}

/* SQL — apply once per environment in Supabase SQL editor:

create table if not exists enrichment_jobs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  deal_ids     text[] not null,
  chunk_size   int not null,
  status       text not null default 'queued' check (status in ('queued','processing','done','error')),
  started_at   timestamptz,
  finished_at  timestamptz,
  succeeded    int default 0,
  failed       int default 0,
  error_message text,
  created_at   timestamptz default now()
);

create index if not exists enrichment_jobs_user_idx on enrichment_jobs(user_id, created_at desc);

alter table enrichment_jobs enable row level security;

create policy "users see own jobs" on enrichment_jobs
  for select using (auth.uid() = user_id);
*/
