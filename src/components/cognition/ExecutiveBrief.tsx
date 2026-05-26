

"use client";

import { useCallback, useEffect, useState } from "react";
import { FileText, RefreshCw, Loader2, AlertCircle, ShieldAlert, TrendingUp } from "lucide-react";

type Implication = {
  id: string;
  severity: "info" | "watch" | "action";
  theme: string;
  headline: string;
  detail: string;
};

type ThesisDriver = {
  key: string;
  label: string;
  value: number | string | null;
  unit: string | null;
  currency: string | null;
  confidence: number;
  source: string;
};

type Brief = {
  id: string | null;
  ranAt: string;
  trigger: string;
  summaryMd: string;
  thesisState: ThesisDriver[];
  topRisks: Implication[];
  warnings: Implication[];
  revisionsSince: string | null;
};

type Props = {
  dealId?: string | null;
  workspaceId?: string | null;
  dealLabel?: string | null;
};

function formatDriver(d: ThesisDriver): string {
  if (d.value === null || d.value === undefined) return "—";
  if (typeof d.value === "number") {
    if (d.unit === "USD_m") return `$${d.value}M`;
    if (d.unit === "USD_k") return `$${d.value}K`;
    if (d.unit === "months") return `${d.value} mo`;
    if (d.unit === "weeks") return `${d.value} wk`;
    return String(d.value);
  }
  return String(d.value);
}

const SOURCE_LABEL: Record<string, string> = {
  ai: "AI-derived", user: "Partner-set", derived: "Computed", default: "Default", signal: "Signal",
};

export default function ExecutiveBrief({ dealId, workspaceId, dealLabel }: Props) {
  const [brief, setBrief] = useState<Brief | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scopeParams = useCallback(() => {
    const p = new URLSearchParams();
    p.set("deal_id", dealId ?? "");
    p.set("workspace_id", workspaceId ?? "");
    return p.toString();
  }, [dealId, workspaceId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/cognition/synthesis?${scopeParams()}`);
      const j = await r.json();
      setBrief(j.brief ?? null);
    } catch {
      setError("Could not load the brief.");
    } finally {
      setLoading(false);
    }
  }, [scopeParams]);

  useEffect(() => { load(); }, [load]);

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const r = await fetch("/api/cognition/synthesis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deal_id: dealId ?? null, workspace_id: workspaceId ?? null, trigger: "user_request" }),
      });
      const j = await r.json();
      if (!r.ok) { setError(j.error ?? "Generation failed."); return; }
      setBrief(j.brief ?? null);
    } catch {
      setError("Network error while generating the brief.");
    } finally {
      setGenerating(false);
    }
  }

  const hasContent = brief && (brief.thesisState.length > 0 || brief.topRisks.length > 0 || brief.warnings.length > 0);

  return (
    <div className="rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50/60 to-white p-5 dark:border-indigo-900/50 dark:from-indigo-950/30 dark:to-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600">
            <FileText className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">Executive Brief</h2>
            <p className="text-[11.5px] text-slate-500 dark:text-slate-400">
              {dealLabel ? `${dealLabel} · ` : ""}
              {brief?.ranAt ? `generated ${new Date(brief.ranAt).toLocaleString()}` : "on-demand synthesis"}
            </p>
          </div>
        </div>
        <button onClick={generate} disabled={generating}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
          {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {brief ? "Refresh brief" : "Generate brief"}
        </button>
      </div>

      {error && <p className="mt-3 text-[12px] text-rose-600 dark:text-rose-400">{error}</p>}

      {loading && !brief && (
        <div className="mt-6 flex items-center gap-2 text-[12.5px] text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading brief…
        </div>
      )}

      {!loading && !brief && (
        <div className="mt-6 rounded-lg border border-dashed border-slate-300 p-6 text-center dark:border-slate-700">
          <p className="text-[13px] text-slate-600 dark:text-slate-300">No brief yet for this deal.</p>
          <p className="mt-1 text-[11.5px] text-slate-500">Generate one once Synergy, PMI, or TSA have run — it pulls the latest model state together.</p>
        </div>
      )}

      {brief && (
        <div className="mt-5 space-y-5">
          {/* Thesis snapshot */}
          <section>
            <div className="mb-2 flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              <h3 className="text-[12.5px] font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-200">Deal thesis snapshot</h3>
            </div>
            {brief.thesisState.length > 0 ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {brief.thesisState.map((d) => (
                  <div key={d.key} className="rounded-lg border border-slate-200 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-900">
                    <div className="text-[10.5px] font-medium text-slate-500 dark:text-slate-400">{d.label}</div>
                    <div className="mt-0.5 text-[15px] font-semibold text-slate-900 dark:text-white">{formatDriver(d)}</div>
                    <div className="mt-1 flex items-center gap-1.5">
                      <div className="h-1 flex-1 rounded-full bg-slate-100 dark:bg-slate-800">
                        <div className="h-1 rounded-full bg-indigo-500" style={{ width: `${Math.round(d.confidence * 100)}%` }} />
                      </div>
                      <span className="text-[9px] text-slate-400">{SOURCE_LABEL[d.source] ?? d.source}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[12px] italic text-slate-500">Core value drivers not yet established for this deal.</p>
            )}
          </section>

          {/* What needs attention */}
          <section>
            <div className="mb-2 flex items-center gap-1.5">
              <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <h3 className="text-[12.5px] font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-200">What needs attention</h3>
            </div>
            {brief.topRisks.length > 0 ? (
              <div className="space-y-2">
                {brief.topRisks.map((r) => (
                  <div key={r.id} className={`rounded-lg border p-3 ${
                    r.severity === "action"
                      ? "border-rose-200 bg-rose-50/60 dark:border-rose-900 dark:bg-rose-950/20"
                      : "border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/20"
                  }`}>
                    <div className="flex items-start gap-2">
                      <span className={`flex-shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                        r.severity === "action"
                          ? "bg-rose-200 text-rose-900 dark:bg-rose-900/50 dark:text-rose-200"
                          : "bg-amber-200 text-amber-900 dark:bg-amber-900/50 dark:text-amber-200"
                      }`}>{r.severity === "action" ? "Action" : "Watch"}</span>
                      <div className="min-w-0">
                        <div className="text-[12.5px] font-semibold text-slate-900 dark:text-white">{r.headline}</div>
                        <p className="mt-0.5 text-[11.5px] leading-snug text-slate-700 dark:text-slate-300">{r.detail}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[12px] italic text-slate-500">No action or watch items — the model is internally consistent.</p>
            )}
          </section>

          {/* Cross-module warnings */}
          {brief.warnings.length > 0 && (
            <section>
              <div className="mb-2 flex items-center gap-1.5">
                <ShieldAlert className="h-4 w-4 text-slate-500" />
                <h3 className="text-[12.5px] font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-200">Cross-module flags</h3>
              </div>
              <div className="space-y-1.5">
                {brief.warnings.map((w) => (
                  <div key={w.id} className="rounded-lg border border-slate-200 bg-white p-2.5 text-[11.5px] dark:border-slate-700 dark:bg-slate-900">
                    <span className="font-medium text-slate-800 dark:text-slate-200">{w.headline}</span>
                    <span className="text-slate-600 dark:text-slate-400"> — {w.detail}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {!hasContent && (
            <p className="text-[12px] italic text-slate-500">Brief generated, but no deal model values were found for this scope yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
