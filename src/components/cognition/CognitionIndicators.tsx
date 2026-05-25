

/**
 * CognitionIndicators — small executive-friendly strip showing recent
 * cognition revisions and propagation flags for the current deal/workspace.
 *
 * Drops into any module page with one line:
 *   <CognitionIndicators dealId={dealId} workspaceId={null} keyFilter="synergy" />
 *
 * - Polls the revisions endpoint on mount (no realtime subscription yet)
 * - Each revision has a one-click "Explain" button that calls the cached endpoint
 * - First click costs ~$0.002. Subsequent clicks for 7 days are free (cached).
 * - If no recent revisions, renders nothing — module pages look identical when empty.
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { Sparkles, AlertCircle, Loader2, ChevronDown, ChevronUp } from "lucide-react";

type Revision = {
  id: string;
  key: string;
  before_value: any;
  after_value: any;
  before_confidence: number | null;
  after_confidence: number | null;
  triggered_by: string;
  reason: string | null;
  revised_at: string;
};

type Props = {
  dealId?: string | null;
  workspaceId?: string | null;
  /** Optional prefix filter, e.g. "synergy" to show only synergy.* keys */
  keyPrefix?: string;
  /** Max revisions to display */
  limit?: number;
};

export default function CognitionIndicators({ dealId, workspaceId, keyPrefix, limit = 5 }: Props) {
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [explanations, setExplanations] = useState<Record<string, { text: string; fromCache: boolean; loading: boolean }>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
       if (dealId) params.set("deal_id", dealId);
      if (workspaceId) params.set("workspace_id", workspaceId);
      params.set("limit", String(limit * 3)); // overfetch, then filter client-side by keyPrefix

      const r = await fetch(`/api/cognition/revisions?${params}`);
      if (!r.ok) { setRevisions([]); return; }
      const j = await r.json();
      let revs: Revision[] = j.revisions ?? [];
      if (keyPrefix) revs = revs.filter((rv) => rv.key.startsWith(keyPrefix + "."));
      setRevisions(revs.slice(0, limit));
    } catch {
      setRevisions([]);
    } finally {
      setLoading(false);
    }
  }, [dealId, workspaceId, keyPrefix, limit]);

  useEffect(() => { load(); }, [load]);

  async function explain(revisionId: string) {
    setExplanations((prev) => ({ ...prev, [revisionId]: { text: "", fromCache: false, loading: true } }));
    try {
      const r = await fetch(`/api/cognition/explain/${revisionId}`);
      const j = await r.json();
      if (j.explanation) {
        setExplanations((prev) => ({ ...prev, [revisionId]: { text: j.explanation, fromCache: j.fromCache, loading: false } }));
      } else {
        setExplanations((prev) => ({ ...prev, [revisionId]: { text: j.error ?? "Explanation unavailable.", fromCache: false, loading: false } }));
      }
    } catch {
      setExplanations((prev) => ({ ...prev, [revisionId]: { text: "Network error.", fromCache: false, loading: false } }));
    }
  }

  if (loading || revisions.length === 0) return null;

  const flags = revisions.filter((r) => r.key.startsWith("flag."));
  const values = revisions.filter((r) => !r.key.startsWith("flag."));

  return (
    <div className="mb-4 rounded-lg border border-indigo-200 bg-gradient-to-r from-indigo-50/60 to-white p-3 dark:border-indigo-900/50 dark:from-indigo-950/30 dark:to-slate-900">
      <button onClick={() => setExpanded(!expanded)}
              className="flex w-full items-center justify-between text-left">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
          <span className="text-[12.5px] font-semibold text-slate-800 dark:text-slate-200">
            Recent intelligence updates
          </span>
          <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300">
            {revisions.length}
          </span>
          {flags.length > 0 && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
              <AlertCircle className="h-2.5 w-2.5" /> {flags.length} flag{flags.length === 1 ? "" : "s"}
            </span>
          )}
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
      </button>

      {!expanded && (
        <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-400">
          {values.length > 0 && `${values.length} value${values.length === 1 ? "" : "s"} revised`}
          {values.length > 0 && flags.length > 0 && " · "}
          {flags.length > 0 && `${flags.length} propagation flag${flags.length === 1 ? "" : "s"}`}
          {" · "}click to review
        </p>
      )}

      {expanded && (
        <div className="mt-2 space-y-1.5">
          {revisions.map((r) => {
            const expl = explanations[r.id];
            const isFlag = r.key.startsWith("flag.");
            const cleanKey = r.key.replace(/^[a-z]+\./, "").replace(/_/g, " ");
            return (
              <div key={r.id} className={`rounded border p-2 text-[11px] ${isFlag
                ? "border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20"
                : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-slate-800 dark:text-slate-200">
                      {isFlag ? "Flag: " : ""}{cleanKey}
                    </div>
                    {!isFlag && (
                      <div className="text-[10px] text-slate-500">
                        {formatValue(r.before_value)} → <b>{formatValue(r.after_value)}</b>
                      </div>
                    )}
                    {isFlag && r.after_value && typeof r.after_value === "string" && (
                      <div className="text-[10.5px] text-amber-800 dark:text-amber-300">{r.after_value}</div>
                    )}
                    <div className="text-[9.5px] text-slate-400">
                      {formatRelative(r.revised_at)} · {r.triggered_by.replace(/_/g, " ")}
                      {r.reason ? ` · ${r.reason}` : ""}
                    </div>
                  </div>
                  {!isFlag && (
                    <button onClick={() => explain(r.id)} disabled={expl?.loading}
                            className="flex-shrink-0 rounded border border-indigo-200 bg-white px-2 py-0.5 text-[10px] font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-50 dark:border-indigo-800 dark:bg-slate-900 dark:text-indigo-300 dark:hover:bg-slate-800">
                      {expl?.loading ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : expl ? "↻" : "Explain"}
                    </button>
                  )}
                </div>
                {expl && !expl.loading && (
                  <div className="mt-1.5 rounded border-l-2 border-indigo-400 bg-indigo-50/40 p-1.5 text-[11px] italic text-slate-700 dark:bg-indigo-950/30 dark:text-slate-300">
                    {expl.text}
                    {expl.fromCache && <span className="ml-1 text-[9px] text-slate-400">(cached)</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatValue(v: any): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") return v.toString();
  if (typeof v === "string") return v.length > 60 ? v.slice(0, 60) + "…" : v;
  return JSON.stringify(v).slice(0, 60);
}

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = diffMs / 60000;
  if (min < 1) return "just now";
  if (min < 60) return `${Math.round(min)} min ago`;
  if (min < 1440) return `${Math.round(min / 60)} hr ago`;
  return new Date(iso).toLocaleDateString();
}
