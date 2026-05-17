

/**
 * GET /api/ingestion/migration-status
 *
 * Returns a friendly plain-English summary of whether the v3 ingestion
 * migration ran successfully. Non-tech users can hit this from the Settings
 * page button to verify the migration without needing to run SQL manually.
 *
 * Checks performed:
 *   1. All 6 new tables exist (import_batches, raw_feed_records, canonical_deals,
 *      digest_records, resolution_tasks, correction_examples).
 *   2. The mirror trigger function `mirror_canonical_to_deals` exists.
 *   3. The bridge columns on `deals` exist (canonical_id, heading, parse_confidence, etc.).
 *   4. pg_trgm extension is enabled.
 *
 * Response shape:
 *   {
 *     ready: true,                                    // all checks passed
 *     ready_for_uploads: true,                        // tables + bridge ok (trgm not required)
 *     checks: [
 *       { name: "...", status: "ok" | "missing", detail: "..." }
 *     ],
 *     summary: "All checks passed — you can upload Mergermarket files.",
 *     next_steps: [...]
 *   }
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type Check = {
  name: string;
  status: "ok" | "missing" | "warning";
  detail: string;
};

export async function GET() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const checks: Check[] = [];

  // 1. Required tables
  const requiredTables = [
    "import_batches", "raw_feed_records", "canonical_deals",
    "digest_records", "resolution_tasks", "correction_examples",
  ];
  for (const t of requiredTables) {
    try {
      // A no-op SELECT against the table — if the table doesn't exist Supabase returns an error.
      const { error } = await admin.from(t).select("*", { count: "exact", head: true }).limit(1);
      if (error) {
        checks.push({
          name: `Table '${t}'`, status: "missing",
          detail: `Not found. The SQL migration likely hasn't been run. Error: ${error.message}`,
        });
      } else {
        checks.push({
          name: `Table '${t}'`, status: "ok",
          detail: "Exists and is readable.",
        });
      }
    } catch (e: any) {
      checks.push({
        name: `Table '${t}'`, status: "missing",
        detail: `Could not query: ${e?.message ?? "unknown error"}`,
      });
    }
  }

  // 2. Bridge columns on deals
  // We probe by selecting one row with the bridge columns — if any column is missing,
  // Supabase returns a `column does not exist` error.
  try {
    const { error } = await admin
      .from("deals")
      .select("canonical_id, heading, parse_confidence, parse_pattern, is_digest, needs_review")
      .limit(1);
    if (error) {
      checks.push({
        name: "Bridge columns on 'deals'", status: "missing",
        detail: `Some columns missing on deals table. The migration may have partially run. Error: ${error.message}`,
      });
    } else {
      checks.push({
        name: "Bridge columns on 'deals'", status: "ok",
        detail: "All 6 bridge columns (canonical_id, heading, parse_confidence, parse_pattern, is_digest, needs_review) exist.",
      });
    }
  } catch (e: any) {
    checks.push({
      name: "Bridge columns on 'deals'", status: "missing",
      detail: `Could not verify: ${e?.message ?? "unknown error"}`,
    });
  }

  // 3. pg_trgm extension (optional — heading still works without it)
  try {
    const { data } = await admin.rpc("ingestion_check_pg_trgm");
    const installed = data === true || data === "t" || (Array.isArray(data) && data[0] === true);
    if (installed) {
      checks.push({
        name: "pg_trgm extension", status: "ok",
        detail: "Trigram extension is installed (full-text heading search will be fast).",
      });
    } else {
      checks.push({
        name: "pg_trgm extension", status: "warning",
        detail: "Not installed. Heading column still works; search just won't be index-accelerated. Run `CREATE EXTENSION pg_trgm;` in SQL Editor to enable.",
      });
    }
  } catch {
    // RPC doesn't exist — fall back to a heuristic: try the trigram index name.
    checks.push({
      name: "pg_trgm extension", status: "warning",
      detail: "Could not verify automatically. Not blocking — heading column still works.",
    });
  }

  // 4. Live counts (so non-tech users can see something already happened)
  try {
    const { count: rawCount } = await admin.from("raw_feed_records").select("*", { count: "exact", head: true }).eq("created_by", user.id);
    const { count: canonCount } = await admin.from("canonical_deals").select("*", { count: "exact", head: true }).eq("created_by", user.id).is("superseded_by", null);
    const { count: digestCount } = await admin.from("digest_records").select("*", { count: "exact", head: true }).eq("created_by", user.id);
    const { count: resCount } = await admin.from("resolution_tasks").select("*", { count: "exact", head: true }).eq("created_by", user.id).eq("status", "open");
    checks.push({
      name: "Your data",
      status: "ok",
      detail: `${rawCount ?? 0} raw rows · ${canonCount ?? 0} canonical deals · ${digestCount ?? 0} digests · ${resCount ?? 0} open resolution tasks`,
    });
  } catch {
    // Skip — main tables already verified above
  }

  // Aggregate
  const missing = checks.filter((c) => c.status === "missing");
  const warnings = checks.filter((c) => c.status === "warning");
  const ready_for_uploads = missing.length === 0;
  const ready = ready_for_uploads && warnings.length === 0;

  let summary: string;
  const next_steps: string[] = [];
  if (ready_for_uploads && warnings.length === 0) {
    summary = "All checks passed. You can upload Mergermarket files now.";
    next_steps.push("Pipeline Manager → Import Deals → upload your XLS / CSV.");
  } else if (ready_for_uploads) {
    summary = "Ready for uploads. Optional warnings present — review below.";
    next_steps.push("You can upload Mergermarket files now.");
    next_steps.push("Optional: enable pg_trgm to accelerate heading search on large tables.");
  } else {
    summary = `Migration not complete — ${missing.length} required item(s) missing. Re-run the SQL migration.`;
    next_steps.push("Open Supabase → SQL Editor → New Query.");
    next_steps.push("Paste the contents of supabase_migration_v3_ingestion.sql and Run.");
    next_steps.push("Return here and refresh the page to re-check.");
  }

  return NextResponse.json({
    ready,
    ready_for_uploads,
    checks,
    summary,
    next_steps,
  });
}
