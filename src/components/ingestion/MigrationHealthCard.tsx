

"use client";

import { useEffect, useState, useCallback } from "react";
import { CheckCircle2, XCircle, AlertCircle, RefreshCw, Loader2, Database } from "lucide-react";

type Check = { name: string; status: "ok" | "missing" | "warning"; detail: string };
type StatusResponse = {
  ready: boolean;
  ready_for_uploads: boolean;
  checks: Check[];
  summary: string;
  next_steps: string[];
};

/**
 * Migration Health Card — drop this onto Settings to give non-tech users
 * a single "is everything OK?" widget. Hits GET /api/ingestion/migration-status
 * which verifies all tables, bridge columns, and indexes exist.
 *
 * Usage:
 *   <MigrationHealthCard />
 */
export default function MigrationHealthCard() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/ingestion/migration-status");
      if (!r.ok) throw new Error(`Server returned ${r.status}`);
      const j = (await r.json()) as StatusResponse;
      setStatus(j);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const banner = !status
    ? "bg-slate-50 border-slate-200 text-slate-700"
    : status.ready
      ? "bg-emerald-50 border-emerald-200 text-emerald-900"
      : status.ready_for_uploads
        ? "bg-amber-50 border-amber-200 text-amber-900"
        : "bg-red-50 border-red-200 text-red-900";

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            Ingestion v2 — Migration Health
          </h3>
        </div>
        <button
          type="button"
          onClick={fetchStatus}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Re-check
        </button>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error}
        </div>
      )}

      {status && (
        <>
          <div className={`mb-3 rounded-md border p-3 text-sm ${banner}`}>
            <div className="flex items-start gap-2">
              {status.ready ? (
                <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
              ) : status.ready_for_uploads ? (
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              ) : (
                <XCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              )}
              <div>
                <div className="font-medium">{status.summary}</div>
                {status.next_steps.length > 0 && (
                  <ul className="mt-2 text-xs space-y-0.5 opacity-90">
                    {status.next_steps.map((s, i) => (
                      <li key={i}>→ {s}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            {status.checks.map((c, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                {c.status === "ok" ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 mt-0.5 flex-shrink-0" />
                ) : c.status === "warning" ? (
                  <AlertCircle className="h-3.5 w-3.5 text-amber-600 mt-0.5 flex-shrink-0" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 text-red-600 mt-0.5 flex-shrink-0" />
                )}
                <div>
                  <span className="font-medium text-slate-800 dark:text-slate-200">{c.name}</span>
                  <span className="text-slate-600 dark:text-slate-400"> — {c.detail}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
