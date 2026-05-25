

"use client";

import { useState, useEffect, useCallback } from "react";
import { Sparkles, AlertCircle, Loader2, ChevronDown, ChevronUp, Eye } from "lucide-react";
import { synthesizeImplications, type Implication } from "@/lib/cognition/synthesize-implications";

type Revision = {
  id: string;
  key: string;
  before_value: any;
  after_value: any;
  before_confidence: number | null;
  after_confidence: number | null;
  triggered_by: string;
  trigger_meta: any;
  reason: string | null;
  revised_at: string;
};

type Props = {
  dealId?: string | null;
  workspaceId?: string | null;
  buyer?: string | null;
  target?: string | null;
  /** Optional comma-separated prefixes to filter revisions. Empty/undefined = all. */
  keyPrefix?: string;
  /** Max revisions to fetch (overfetched for synthesis); implications shown is independent. */
  limit?: number;
};

export default function CognitionIndicators({
  dealId,
  workspaceId,
  buyer,
  target,
  keyPrefix,
  limit = 30,
}: Props) {
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [implications, setImplications] = useState<Implication[]>([]);
  const [loading, setLoading] = useState(true);
  const [showImplications, setShowImplications] = useState(true);
  const [showRaw, setShowRaw] = useState(false);
  const [explanations, setExplanations] = useState<Record<string, { text: string; fromCache: boolean; loading: boolean }>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dealId !== undefined) params.set("deal_id", dealId ?? "");
      if (workspaceId !== undefined) params.set("workspace_id", workspaceId ?? "");
      params.set("limit", String(limit));
      const r = await fetch(`/api/cognition/revisions?${params}`);
      if (!r.ok) { setRevisions([]); setImplications([]); return; }
      const j = await r.json();
      let revs: Revision[] = j.revisions ?? [];

      // Optional prefix filtering — but we ALWAYS pass through flag.* rows
      // so cross-module flags (e.g. PMI -> synergy) still surface here.
      if (keyPrefix) {
        const prefixes = keyPrefix.split(",").map((p) => p.trim()).filter(Boolean);
        revs = revs.filter((rv) => rv.key.startsWith("flag.") || prefixes.some((p) => rv.key.startsWith(p + ".")));
      }

      setRevisions(revs);
      setImplications(synthesizeImplications(revs));
    } catch {
      setRevisions([]); setImplications([]);
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
      setExplanations((prev) => ({
        ...prev,
        [revisionId]: {
          text: j.explanation ?? j.error ?? "Explanation unavailable.",
          fromCache: !!j.fromCache,
          loading: false,
        },
      }));
    } catch {
      setExplanations((prev) => ({ ...prev, [revisionId]: { text: "Network error.", fromCache: false, loading: false } }));
    }
  }

  if (loading || (implications.length === 0 && revisions.length === 0)) return null;

  // Categorise implications by severity for header pill counts
  const actionCount = implications.filter((i) => i.severity === "action").length;
  const watchCount = implications.filter((i) => i.severity === "watch").length;

  return (
    <div className="mb-4 rounded-lg border border-indigo-200 bg-gradient-to-r from-indigo-50/60 to-white p-3 dark:border-indigo-900/50 dark:from-indigo-950/30 dark:to-slate-900">
      <button onClick={() => setShowImplications(!showImplications)}
              className="flex w-full items-center justify-between text-left">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
          <span className="text-[12.5px] font-semibold text-slate-800 dark:text-slate-200">
            Strategic implications
          </span>
          {actionCount > 0 && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
              <AlertCircle className="h-2.5 w-2.5" /> {actionCount} need attention
            </span>
          )}
          {watchCount > 0 && (
            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
              {watchCount} to watch
            </span>
          )}
          {implications.length === 0 && revisions.length > 0 && (
            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              minor updates only
            </span>
          )}
        </div>
        {showImplications ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
      </button>

      {!showImplications && (
        <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-400">
          {implications.length > 0
            ? `${implications.length} business-relevant change${implications.length === 1 ? "" : "s"} since last review · click to expand`
            : `${revisions.length} background update${revisions.length === 1 ? "" : "s"} · click to view`}
        </p>
      )}

      {showImplications && (
        <div className="mt-3 space-y-2">
          {/* Business implications */}
          {implications.map((imp) => {
            const sevBg =
              imp.severity === "action" ? "border-rose-200 bg-rose-50/60 dark:border-rose-900 dark:bg-rose-950/20"
              : imp.severity === "watch" ? "border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/20"
              : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900";
            const sevTag =
              imp.severity === "action" ? "bg-rose-200 text-rose-900 dark:bg-rose-900/50 dark:text-rose-200"
              : imp.severity === "watch" ? "bg-amber-200 text-amber-900 dark:bg-amber-900/50 dark:text-amber-200"
              : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
            return (
              <div key={imp.id} className={`rounded border p-2.5 ${sevBg}`}>
                <div className="flex items-start gap-2">
                  <span className={`flex-shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${sevTag}`}>
                    {imp.severity === "action" ? "Action" : imp.severity === "watch" ? "Watch" : "Note"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] font-semibold text-slate-900 dark:text-white">{imp.headline}</div>
                    <p className="mt-0.5 text-[11.5px] leading-snug text-slate-700 dark:text-slate-300">{imp.detail}</p>
                    {imp.evidenceRevisionIds.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {imp.evidenceRevisionIds.map((rid) => {
                          const expl = explanations[rid];
                          return (
                            <button key={rid} onClick={() => explain(rid)} disabled={expl?.loading}
                                    className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700">
                              {expl?.loading ? <Loader2 className="inline h-2.5 w-2.5 animate-spin" /> : expl ? "↻ Refresh narrative" : "Explain the change"}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {imp.evidenceRevisionIds.map((rid) => {
                      const expl = explanations[rid];
                      if (!expl || expl.loading) return null;
                      return (
                        <div key={`expl-${rid}`} className="mt-1.5 rounded border-l-2 border-indigo-400 bg-white/70 p-1.5 text-[11px] italic text-slate-700 dark:bg-slate-900/70 dark:text-slate-300">
                          {expl.text}
                          {expl.fromCache && <span className="ml-1 text-[9px] text-slate-400">(cached)</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}

          {implications.length === 0 && (
            <p className="text-[11.5px] italic text-slate-500">No business-relevant implications yet — only minor background updates.</p>
          )}

          {/* Raw revisions disclosure */}
          {revisions.length > 0 && (
            <div className="border-t border-slate-200 pt-2 dark:border-slate-700">
              <button onClick={() => setShowRaw(!showRaw)}
                      className="flex items-center gap-1 text-[10.5px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
                <Eye className="h-3 w-3" />
                {showRaw ? "Hide" : "View"} underlying value changes ({revisions.length})
              </button>
              {showRaw && (
                <div className="mt-1.5 space-y-1">
                  {revisions.filter((r) => !r.key.startsWith("flag.")).slice(0, 10).map((r) => (
                    <div key={r.id} className="rounded border border-slate-100 bg-white p-1.5 text-[10.5px] dark:border-slate-800 dark:bg-slate-900">
                      <span className="font-medium text-slate-700 dark:text-slate-300">{r.key.replace(/^[a-z]+\./, "").replace(/_/g, " ")}</span>
                      <span className="ml-1 text-slate-500">
                        {formatValue(r.before_value)} → <b>{formatValue(r.after_value)}</b>
                      </span>
                      <span className="ml-2 text-[9px] text-slate-400">{formatRelative(r.revised_at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatValue(v: any): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") return v.toString();
  if (typeof v === "string") return v.length > 50 ? v.slice(0, 50) + "…" : v;
  return JSON.stringify(v).slice(0, 50);
}

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = diffMs / 60000;
  if (min < 1) return "just now";
  if (min < 60) return `${Math.round(min)} min ago`;
  if (min < 1440) return `${Math.round(min / 60)} hr ago`;
  return new Date(iso).toLocaleDateString();
}
