"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Sparkles, Loader2, CheckCircle2, XCircle, AlertTriangle,
  RefreshCw, ChevronDown, ChevronUp, Info,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type DealRow = {
  id: string;
  buyer: string | null;
  target: string | null;
  sector: string | null;
  country: string | null;
  deal_type: string | null;
  status: string | null;
  ai_enriched_at: string | null;
  ai_summary: string | null;
  priority_score: number | null;
  advisory_score: number | null;
  risk_flag: string | null;
};

type JobResult = {
  id: string;
  ok: boolean;
  summary?: string;
  error?: string;
  viaFallback?: boolean;
};

const BATCH_SIZE = 10;

const riskBadge: Record<string, string> = {
  low: "bg-emerald-50 text-emerald-700 border-emerald-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  high: "bg-red-50 text-red-700 border-red-200",
};

const scorePill = (n: number | null) => {
  if (n === null) return "—";
  const color =
    n >= 8 ? "bg-emerald-100 text-emerald-700"
    : n >= 5 ? "bg-amber-100 text-amber-700"
    : "bg-red-100 text-red-700";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}>
      {n}/10
    </span>
  );
};

export default function EnrichPage() {
  const sb = createClient();

  const [deals, setDeals] = useState<DealRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<"all" | "pending" | "enriched">("all");

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [jobResults, setJobResults] = useState<JobResult[]>([]);
  const [showLog, setShowLog] = useState(false);

  const loadDeals = useCallback(async () => {
    setLoading(true);
    const { data } = await sb
      .from("deals")
      .select("id,buyer,target,sector,country,deal_type,status,ai_enriched_at,ai_summary,priority_score,advisory_score,risk_flag")
      .order("created_at", { ascending: false })
      .limit(500);
    setDeals((data ?? []) as DealRow[]);
    setLoading(false);
  }, [sb]);

  useEffect(() => { loadDeals(); }, [loadDeals]);

  const displayed = deals.filter((d) => {
    if (filter === "pending")  return !d.ai_enriched_at;
    if (filter === "enriched") return !!d.ai_enriched_at;
    return true;
  });

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected(
      selected.size === displayed.length
        ? new Set()
        : new Set(displayed.map((d) => d.id))
    );

  const selectPending = () =>
    setSelected(new Set(deals.filter((d) => !d.ai_enriched_at).map((d) => d.id)));

  async function runEnrichment() {
    const ids = Array.from(selected);
    if (!ids.length) return;

    setRunning(true);
    setProgress(0);
    setTotal(ids.length);
    setJobResults([]);
    setShowLog(true);

    const batches: string[][] = [];
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      batches.push(ids.slice(i, i + BATCH_SIZE));
    }

    let done = 0;
    const allResults: JobResult[] = [];

    for (const batch of batches) {
      try {
        const res = await fetch("/api/ai/enrich", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deal_ids: batch }),
        });
        const json = await res.json();
        if (json.results) {
          allResults.push(...(json.results as JobResult[]));
          setJobResults([...allResults]);
        }
      } catch (e) {
        batch.forEach((id) =>
          allResults.push({ id, ok: false, error: String(e) })
        );
        setJobResults([...allResults]);
      }
      done += batch.length;
      setProgress(done);
    }

    setRunning(false);
    setSelected(new Set());
    await loadDeals();
  }

  const enrichedCount = deals.filter((d) => d.ai_enriched_at).length;
  const pendingCount  = deals.length - enrichedCount;
  const pct = deals.length > 0 ? Math.round((enrichedCount / deals.length) * 100) : 0;
  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-900">
            <Sparkles className="h-5 w-5 text-indigo-500" />
            AI Bulk Enrichment
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Enrich deals with AI — clean names, classify types, score priority & advisory attractiveness.
          </p>
        </div>
        <button
          onClick={loadDeals}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Total Deals", value: deals.length, color: "text-slate-700" },
          { label: "Enriched", value: enrichedCount, color: "text-emerald-700" },
          { label: "Pending", value: pendingCount, color: "text-amber-700" },
          { label: "Coverage", value: `${pct}%`, color: "text-indigo-700" },
        ].map((c) => (
          <div key={c.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-500">{c.label}</p>
            <p className={`mt-1 text-2xl font-bold ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between text-sm text-slate-600">
          <span className="font-medium">Enrichment Progress</span>
          <span>{enrichedCount} / {deals.length}</span>
        </div>
        <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1">
          {(["all","pending","enriched"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition ${
                filter === f ? "bg-indigo-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        <button
          onClick={selectPending}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          Select All Pending
        </button>

        <div className="ml-auto flex items-center gap-2">
          {selected.size > 0 && <span className="text-xs text-slate-500">{selected.size} selected</span>}
          <button
            onClick={runEnrichment}
            disabled={running || selected.size === 0}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {running
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Enriching {progress}/{total}…</>
              : <><Sparkles className="h-4 w-4" /> Enrich Selected ({selected.size})</>
            }
          </button>
        </div>
      </div>

      {running && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-slate-500">
            <span>Processing batch…</span>
            <span>{Math.round((progress / total) * 100)}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-indigo-500 transition-all duration-300"
              style={{ width: `${(progress / total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {jobResults.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <button
            onClick={() => setShowLog(!showLog)}
            className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-slate-700"
          >
            <span>
              Enrichment Log ({jobResults.filter((r) => r.ok).length} succeeded,{" "}
              {jobResults.filter((r) => !r.ok).length} failed)
            </span>
            {showLog ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {showLog && (
            <div className="max-h-64 overflow-y-auto border-t border-slate-100 divide-y divide-slate-50">
              {jobResults.map((r) => (
                <div key={r.id} className="flex items-start gap-3 px-4 py-2.5">
                  {r.ok
                    ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                    : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                  }
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs text-slate-500">{r.id}</p>
                    {r.ok && r.summary && <p className="mt-0.5 text-xs text-slate-700">{r.summary}</p>}
                    {!r.ok && r.error && <p className="mt-0.5 text-xs text-red-600">{r.error}</p>}
                  </div>
                  {r.viaFallback && (
                    <span className="ml-auto shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                      fallback
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50 p-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
        <p className="text-xs text-blue-700">
          Enrichment uses your <strong>Fast Tier</strong> provider from Settings. If no key is saved,
          the free rule-based engine runs instead. Results are saved directly to your Deals table.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={displayed.length > 0 && selected.size === displayed.length}
                      onChange={toggleAll}
                      className="rounded border-slate-300"
                    />
                  </th>
                  {["Buyer", "Target", "Sector", "Status", "Priority", "Advisory", "Risk", "AI Status"].map((h) => (
                    <th key={h} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {displayed.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-400">No deals to display.</td>
                  </tr>
                )}
                {displayed.map((d) => (
                  <tr key={d.id} className={`transition hover:bg-slate-50 ${selected.has(d.id) ? "bg-indigo-50/60" : ""}`}>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(d.id)}
                        onChange={() => toggle(d.id)}
                        className="rounded border-slate-300"
                      />
                    </td>
                    <td className="max-w-[160px] truncate px-4 py-3 font-medium text-slate-800">
                      {d.buyer ?? <span className="italic text-slate-400">Unknown</span>}
                    </td>
                    <td className="max-w-[160px] truncate px-4 py-3 text-slate-600">
                      {d.target ?? <span className="italic text-slate-400">Unknown</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{d.sector ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs capitalize text-slate-600">
                        {d.status ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">{scorePill(d.priority_score)}</td>
                    <td className="px-4 py-3">{scorePill(d.advisory_score)}</td>
                    <td className="px-4 py-3">
                      {d.risk_flag ? (
                        <span className={`rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${riskBadge[d.risk_flag] ?? ""}`}>
                          {d.risk_flag}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {d.ai_enriched_at ? (
                        <span className="flex items-center gap-1 text-xs text-emerald-600">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Done
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-slate-400">
                          <AlertTriangle className="h-3.5 w-3.5" /> Pending
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
