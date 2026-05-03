

"use client";

import { useState } from "react";
import { Sparkles, Loader2, Building2, Target as TargetIcon } from "lucide-react";

type Enrichment = {
  buyer_context?: string[];
  target_context?: string[];
  comparable_pattern?: string;
  advisory_attractiveness_why?: string;
  advisory_attractiveness_so_what?: string;
};

export default function AIResearchClient({
  dealId, buyer, target, sector, country, dealType, stakePercent, cached,
}: {
  dealId: string; buyer: string | null; target: string | null;
  sector: string | null; country: string | null;
  dealType: string | null; stakePercent: number | null;
  cached: Record<string, unknown> | null;
}) {
  const [data, setData] = useState<Enrichment | null>((cached as Enrichment | null));
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function runResearch() {
    setLoading(true); setErr(null);
    try {
      const r = await fetch("/api/deals/research-context", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deal_id: dealId, buyer, target, sector, country, deal_type: dealType, stake_percent: stakePercent }),
      });
      const j = await r.json();
      if (!r.ok || j.error) { setErr(j.error || "Research failed"); }
      else setData(j);
    } catch (e) { setErr(String(e)); }
    setLoading(false);
  }

  if (!data) {
    return (
      <div className="mb-6 rounded-xl border-2 border-dashed border-purple-300 bg-purple-50/40 p-6 text-center dark:border-purple-900/40 dark:bg-purple-950/10">
        <Sparkles className="mx-auto h-6 w-6 text-purple-600" />
        <p className="mt-2 text-sm font-semibold text-purple-900 dark:text-purple-200">AI-Researched Deal Context</p>
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
          Generate deep buyer/target intelligence using web research + AI. ~2K tokens.
        </p>
        <button onClick={runResearch} disabled={loading}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-purple-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-purple-700 disabled:opacity-50">
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
          {loading ? "Researching…" : "Generate AI Research"}
        </button>
        {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
      </div>
    );
  }

  return (
    <div className="mb-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-purple-700 dark:text-purple-400">
          <Sparkles className="h-4 w-4" /> AI-Researched Deal Context
        </h2>
        <button onClick={runResearch} disabled={loading}
          className="text-[10px] font-medium text-purple-600 hover:underline disabled:opacity-50">
          {loading ? "Refreshing…" : "Refresh research"}
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-indigo-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#15151f]">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-400">
            <Building2 className="h-3 w-3" /> Buyer Context · {buyer}
          </p>
          <ul className="mt-2 space-y-1.5">
            {(data.buyer_context ?? []).map((b, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300">
                <span className="mt-1 h-1 w-1 flex-shrink-0 rounded-full bg-indigo-500" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-purple-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#15151f]">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-purple-700 dark:text-purple-400">
            <TargetIcon className="h-3 w-3" /> Target Context · {target}
          </p>
          <ul className="mt-2 space-y-1.5">
            {(data.target_context ?? []).map((b, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300">
                <span className="mt-1 h-1 w-1 flex-shrink-0 rounded-full bg-purple-500" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {(data.advisory_attractiveness_why || data.advisory_attractiveness_so_what) && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 dark:border-emerald-900/30 dark:bg-emerald-950/10">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Advisory Attractiveness</p>
          {data.advisory_attractiveness_why && (
            <p className="mt-2 text-xs text-slate-700 dark:text-slate-300"><strong className="text-emerald-700">WHY: </strong>{data.advisory_attractiveness_why}</p>
          )}
          {data.advisory_attractiveness_so_what && (
            <p className="mt-1 text-xs text-slate-700 dark:text-slate-300"><strong className="text-emerald-700">SO WHAT: </strong>{data.advisory_attractiveness_so_what}</p>
          )}
        </div>
      )}
    </div>
  );
}
