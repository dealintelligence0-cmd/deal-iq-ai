

"use client";

import { useState, useEffect, useCallback } from "react";
import { Sparkles, Loader2, ChevronDown, ChevronUp, CircleAlert } from "lucide-react";

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
  buyer?: string | null;
  target?: string | null;
  /** Optional prefix filter, e.g. "synergy" to show only synergy.* keys */
  keyPrefix?: string;
  /** Max revisions to display */
  limit?: number;
};

export default function CognitionIndicators({ dealId, workspaceId, buyer, target, keyPrefix, limit = 3 }: Props) {
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

  const insights = revisions.slice(0, 3).map(toStrategicInsight);
  const highestSeverity = insights.some((i) => i.severity === "high") ? "high" : insights.some((i) => i.severity === "medium") ? "medium" : "low";
  const contextLabel = buyer && target
    ? `Updated strategic insights for ${buyer} ↔ ${target}`
    : "AI identified new deal implications for this transaction";

  return (
    <div className="mb-4 rounded-lg border border-slate-200 bg-white/90 p-3 dark:border-slate-700 dark:bg-slate-900/80">
      <button onClick={() => setExpanded(!expanded)}
              className="flex w-full items-center justify-between text-left">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
          <span className="text-[12.5px] font-semibold text-slate-800 dark:text-slate-200">
            Strategic Changes Since Last Analysis
          </span>
          <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            {revisions.length}
          </span>
          <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${highestSeverity === "high" ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300" : highestSeverity === "medium" ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"}`}>
            <CircleAlert className="h-2.5 w-2.5" /> {highestSeverity} priority
          </span>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
      </button>

      {!expanded && (
        <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-400">
          {contextLabel} · AI run {latestRunLabel(revisions[0]?.triggered_by)}
        </p>
      )}

      {expanded && (
        <div className="mt-2 space-y-1.5">
          {insights.map((ins, i) => {
            const r = revisions[i];
            const expl = explanations[r.id];
            return (
              <div key={r.id} className="rounded border border-slate-200 bg-slate-50/60 p-2 text-[11px] dark:border-slate-700 dark:bg-slate-900">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-slate-800 dark:text-slate-200">
                      {ins.title}
                    </div>
                    <div className="mt-0.5 text-[10.5px] text-slate-600 dark:text-slate-300">{ins.summary}</div>
                    <div className="mt-1 grid gap-0.5 text-[10px] text-slate-500">
                      <div><b>Impact:</b> {ins.impact}</div>
                      <div><b>Confidence:</b> {ins.confidence}</div>
                      <div><b>Recommended action:</b> {ins.action}</div>
                    </div>
                    <div className="text-[9.5px] text-slate-400 mt-1">
                      {formatRelative(r.revised_at)} · AI run {latestRunLabel(r.triggered_by)}
                    </div>
                  </div>
                  <button onClick={() => explain(r.id)} disabled={expl?.loading}
                          className="flex-shrink-0 rounded border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800">
                    {expl?.loading ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : "View rationale"}
                  </button>
                </div>
                {expl && !expl.loading && (
                  <div className="mt-1.5 rounded border-l-2 border-slate-400 bg-white p-1.5 text-[11px] text-slate-700 dark:bg-slate-800 dark:text-slate-300">
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

function latestRunLabel(triggeredBy?: string): string {
  if (!triggeredBy) return "unknown";
  return triggeredBy.replace(/_/g, " ");
}

function toStrategicInsight(r: Revision): { title: string; summary: string; impact: string; confidence: string; action: string; severity: "low"|"medium"|"high" } {
  const key = r.key.toLowerCase();
  const delta = numericDelta(r.before_value, r.after_value);
  if (key.includes("procurement") || key.includes("cost")) {
    return {
      title: "Cost synergy outlook updated",
      summary: delta < 0 ? "AI detected weaker overlap than previously expected, reducing achievable annual cost synergies." : "AI detected stronger overlap in addressable cost pools, improving achievable annual cost synergies.",
      impact: delta < 0 ? "Moderate valuation impact; execution complexity largely unchanged." : "Moderate upside to valuation if execution remains on plan.",
      confidence: confidenceLabel(r.after_confidence),
      action: "Validate procurement and shared-services consolidation assumptions during diligence.",
      severity: Math.abs(delta) > 10 ? "high" : "medium",
    };
  }
  if (key.includes("revenue") || key.includes("cross_sell") || key.includes("bundling")) {
    return {
      title: "Commercial synergy case refined",
      summary: "AI revised the pace and scale of commercial uplift based on new evidence in customer and go-to-market overlap.",
      impact: "Potential impact on growth-led valuation bridge and integration sequencing.",
      confidence: confidenceLabel(r.after_confidence),
      action: "Pressure-test cross-sell readiness with frontline commercial leaders.",
      severity: "medium",
    };
  }
  return {
    title: "Material deal implication identified",
    summary: "AI identified a change that may alter synergy timing, capture confidence, or execution risk for this transaction.",
    impact: "Review for potential impact on value-capture plan and integration priorities.",
    confidence: confidenceLabel(r.after_confidence),
    action: "Confirm this change in the next deal review and assign an owner.",
    severity: "low",
  };
}

function numericDelta(beforeValue: any, afterValue: any): number {
  const before = typeof beforeValue === "number" ? beforeValue : Number(beforeValue);
  const after = typeof afterValue === "number" ? afterValue : Number(afterValue);
  if (Number.isFinite(before) && Number.isFinite(after)) return after - before;
  return 0;
}

function confidenceLabel(value: number | null): string {
  if (value === null || value === undefined) return "Moderate";
  if (value >= 0.75) return "High";
  if (value >= 0.5) return "Moderate";
  return "Developing";
}

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = diffMs / 60000;
  if (min < 1) return "just now";
  if (min < 60) return `${Math.round(min)} min ago`;
  if (min < 1440) return `${Math.round(min / 60)} hr ago`;
  return new Date(iso).toLocaleDateString();
}
