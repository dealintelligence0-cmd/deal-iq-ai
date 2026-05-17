"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, AlertTriangle, Loader2, ExternalLink } from "lucide-react";

type Batch = {
  id: string;
  source_file: string;
  total_rows: number;
  canonical_rows: number;
  digest_rows: number;
  resolution_rows: number;
  created_at: string;
  status: string;
};

type ResolutionSummary = { total: number };

/**
 * Data Quality strip — sits at the top of the Executive Dashboard.
 *
 * Shows the partner that the data they're looking at came from the
 * v2 ingestion pipeline, with three numbers:
 *
 *   • Canonical (clean, ready for proposals)
 *   • Digest (multi-deal articles, separately searchable)
 *   • Needs Review (rows the system flagged for human checkpoint)
 *
 * When "Needs Review" > 0, a clear call-to-action appears: "Review N rows".
 * That's the loop that keeps the pipeline trustworthy.
 *
 * Renders nothing when there are zero batches yet (no v2 imports done).
 */
export default function DataQualityStrip() {
  const [latest, setLatest] = useState<Batch | null>(null);
  const [openTasks, setOpenTasks] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [bRes, tRes] = await Promise.all([
          fetch("/api/ingestion/batches?limit=1").then((r) => r.ok ? r.json() : { batches: [] }),
          fetch("/api/ingestion/resolution-tasks?status=open&limit=1").then((r) => r.ok ? r.json() : { total: 0 }),
        ]);
        if (cancelled) return;
        const b = (bRes.batches ?? [])[0] ?? null;
        setLatest(b);
        setOpenTasks((tRes as ResolutionSummary).total ?? 0);
      } catch {
        /* ignore — strip just won't render */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) return null;
  if (!latest) return null;     // no batches yet — don't clutter the dashboard

  const canonical = latest.canonical_rows ?? 0;
  const digest = latest.digest_rows ?? 0;
  const review = openTasks;       // open tasks across all batches, not just latest
  const total = latest.total_rows ?? 0;
  const cleanPct = total > 0 ? Math.round((canonical * 100) / total) : 0;

  return (
    <div className="mb-4 flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 dark:border-emerald-900 dark:bg-emerald-950/40">
      <ShieldCheck className="h-4 w-4 flex-shrink-0 text-emerald-700 dark:text-emerald-300" />
      <div className="flex-1 text-[12px]">
        <span className="font-semibold text-emerald-900 dark:text-emerald-200">
          Data Quality:
        </span>{" "}
        <span className="text-emerald-800 dark:text-emerald-300">
          <b>{canonical}</b> canonical deals ({cleanPct}% clean) ·{" "}
          <b>{digest}</b> digest articles archived ·{" "}
          <b className={review > 0 ? "text-amber-700 dark:text-amber-300" : ""}>{review}</b> need review
        </span>
        <span className="ml-2 text-[10px] text-emerald-700 dark:text-emerald-400">
          (latest batch: <code className="font-mono">{latest.source_file}</code>)
        </span>
      </div>
      {review > 0 && (
        <a
          href="/dashboard/resolution-tasks"
          className="inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-200 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200 dark:hover:bg-amber-900"
        >
          <AlertTriangle className="h-3 w-3" />
          Review {review} rows
          <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}
