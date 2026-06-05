

"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Lightbulb, Sparkles, Loader2, CheckCircle2, XCircle, AlertTriangle,
  RefreshCw, ChevronDown, ChevronUp, Info, Flame, ShieldAlert, Target,
} from "lucide-react";
import PageHeader, { headerActionBtn } from "@/components/dashboard/PageHeader";
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
  const color = n >= 8 ? "bg-emerald-100 text-emerald-700"
    : n >= 5 ? "bg-amber-100 text-amber-700"
    : "bg-red-100 text-red-700";
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}>{n}/10</span>;
};

function opportunityLabel(score: number | null) {
  if (score === null) return null;
  if (score >= 8) return { text: "Strong advisory mandate potential", color: "text-emerald-700 dark:text-emerald-400", icon: "★" };
  if (score >= 5) return { text: "Monitor — may develop into mandate", color: "text-amber-700 dark:text-amber-400", icon: "○" };
  return { text: "Low advisory potential at current stage", color: "text-slate-500 dark:text-slate-400", icon: "·" };
}

export default function InsightsPage() {
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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Background-queue mode (QStash). For >100 deals, this dispatches one
  // background job per 25-deal chunk and polls /api/ai/enrich-batch/status
  // instead of running everything in a single foreground request that would
  // hit Vercel's 60-second function timeout.
  const [useBackgroundMode, setUseBackgroundMode] = useState(false);
  const [bgJobIds, setBgJobIds] = useState<string[]>([]);
  const [bgSummary, setBgSummary] = useState<{
    total_chunks: number;
    done: number;
    error: number;
    processing: number;
    queued: number;
    total_succeeded: number;
    total_failed: number;
  } | null>(null);

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

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const toggleExpand = (id: string) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const toggleAll = () => setSelected(selected.size === displayed.length ? new Set() : new Set(displayed.map((d) => d.id)));
  const selectPending = () => setSelected(new Set(deals.filter((d) => !d.ai_enriched_at).map((d) => d.id)));

  async function runEnrichment() {
    const ids: string[] = Array.from(selected);
    if (!ids.length) return;

    // Auto-promote to background mode for >100 deals so we don't hit Vercel's
    // function timeout. Partners can also opt in manually for smaller batches.
    const goBackground = useBackgroundMode || ids.length > 100;

    setRunning(true); setProgress(0); setTotal(ids.length); setJobResults([]); setShowLog(true);

    if (goBackground) {
      try {
        const res = await fetch("/api/ai/enrich-batch/enqueue", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deal_ids: ids, chunk_size: 25 }),
        });
        const json = await res.json();
        if (!res.ok || json.error) {
          setJobResults([{ id: "batch", ok: false, error: json.error ?? "enqueue failed" }]);
          setRunning(false);
          return;
        }
        const jobIds: string[] = json.job_ids ?? [];
        setBgJobIds(jobIds);

        // Poll status every 4 seconds until all chunks are done or errored.
        const startedAt = Date.now();
        const TIMEOUT_MS = 30 * 60 * 1000;  // 30 min hard cap
        let pollerDone = false;
        while (!pollerDone) {
          if (Date.now() - startedAt > TIMEOUT_MS) {
            setJobResults((prev) => [...prev, { id: "timeout", ok: false, error: "Polling timed out after 30 min" }]);
            break;
          }
          await new Promise((r) => setTimeout(r, 4000));
          try {
            const sres = await fetch(`/api/ai/enrich-batch/status?job_ids=${jobIds.join(",")}`);
            const sjson = await sres.json();
            if (sjson.summary) {
              setBgSummary(sjson.summary);
              const completedDeals =
                (sjson.summary.total_succeeded ?? 0) + (sjson.summary.total_failed ?? 0);
              setProgress(completedDeals);
              if (sjson.summary.queued + sjson.summary.processing === 0) {
                pollerDone = true;
              }
            }
          } catch { /* keep polling on transient errors */ }
        }
      } finally {
        setRunning(false);
        setSelected(new Set());
        await loadDeals();
      }
      return;
    }

    // Synchronous fallback (smaller batches that fit in one function invocation)
    const batches: string[][] = [];
    for (let i = 0; i < ids.length; i += BATCH_SIZE) batches.push(ids.slice(i, i + BATCH_SIZE));
    let done = 0;
    const allResults: JobResult[] = [];
    for (const batch of batches) {
      try {
        const res = await fetch("/api/ai/enrich", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deal_ids: batch }),
        });
        const json = await res.json();
        if (json.results) {
          allResults.push(...(json.results as JobResult[]));
          setJobResults([...allResults]);
        }
      } catch (e) {
        batch.forEach((id) => allResults.push({ id, ok: false, error: String(e) }));
        setJobResults([...allResults]);
      }
      done += batch.length;
      setProgress(done);
    }
    setRunning(false); setSelected(new Set());
    await loadDeals();
  }

  const enrichedCount = deals.filter((d) => d.ai_enriched_at).length;
  const pendingCount  = deals.length - enrichedCount;
  const pct = deals.length > 0 ? Math.round((enrichedCount / deals.length) * 100) : 0;
  const highPriority = deals.filter((d) => (d.priority_score ?? 0) >= 8).length;
  const highRisk = deals.filter((d) => d.risk_flag === "high").length;
  return (
    <div className="space-y-6">
      <PageHeader
        icon={Lightbulb}
        title="AI Insights"
        subtitle="Automated deal scoring, risk flags, and strategic opportunities across your pipeline"
        actions={
          <button onClick={loadDeals} disabled={loading} className={headerActionBtn}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="card p-4 border-l-4 border-l-amber-500">
          <div className="flex items-center gap-2">
            <Flame className="h-4 w-4 text-amber-500" />
            <p className="text-xs text-slate-500 dark:text-slate-400">High-priority deals</p>
          </div>
          <p className="mt-1 text-2xl font-bold text-amber-700 dark:text-amber-400">{highPriority}</p>
          <p className="mt-0.5 text-[10px] text-slate-500">priority_score ≥ 8</p>
        </div>
        <div className="card p-4 border-l-4 border-l-red-500">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-red-500" />
            <p className="text-xs text-slate-500 dark:text-slate-400">High-risk deals</p>
          </div>
          <p className="mt-1 text-2xl font-bold text-red-700 dark:text-red-400">{highRisk}</p>
          <p className="mt-0.5 text-[10px] text-slate-500">risk_flag = high</p>
        </div>
        <div className="card p-4 border-l-4 border-l-emerald-500">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-emerald-500" />
            <p className="text-xs text-slate-500 dark:text-slate-400">AI-enriched deals</p>
          </div>
          <p className="mt-1 text-2xl font-bold text-emerald-700 dark:text-emerald-400">{enrichedCount}</p>
          <p className="mt-0.5 text-[10px] text-slate-500">{pct}% pipeline coverage</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Total Deals", value: deals.length, color: "text-slate-700 dark:text-slate-200" },
          { label: "Enriched", value: enrichedCount, color: "text-emerald-700 dark:text-emerald-400" },
          { label: "Pending", value: pendingCount, color: "text-amber-700 dark:text-amber-400" },
          { label: "Coverage", value: `${pct}%`, color: "text-indigo-700 dark:text-indigo-400" },
        ].map((c) => (
          <div key={c.label} className="card p-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">{c.label}</p>
            <p className={`mt-1 text-2xl font-bold ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="card p-4">
        <div className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-300">
          <span className="font-medium">Enrichment Progress</span>
          <span>{enrichedCount} / {deals.length}</span>
        </div>
        <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/5">
          <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1 dark:border-white/10 dark:bg-[#15151f]">
          {(["all", "pending", "enriched"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition ${filter === f ? "bg-indigo-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
              {f}
            </button>
          ))}
        </div>
        <button onClick={selectPending}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-[#15151f] dark:text-slate-300">
          Select All Pending
        </button>
        <div className="ml-auto flex items-center gap-2">
          {selected.size > 0 && <span className="text-xs text-slate-500">{selected.size} selected</span>}
          <label
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-[#15151f] dark:text-slate-300"
            title="Run enrichment in the background via QStash. Auto-enabled for >100 deals."
          >
            <input
              type="checkbox"
              checked={useBackgroundMode}
              onChange={(e) => setUseBackgroundMode(e.target.checked)}
              disabled={running}
              className="accent-indigo-600"
            />
            Background queue
            {selected.size > 100 && !useBackgroundMode && (
              <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">auto-on at &gt;100</span>
            )}
          </label>
          <button onClick={runEnrichment} disabled={running || selected.size === 0}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">
            {running ? <><Loader2 className="h-4 w-4 animate-spin" /> Enriching {progress}/{total}…</> : <><Sparkles className="h-4 w-4" /> Enrich Selected ({selected.size})</>}
          </button>
        </div>
      </div>

      {/* Background-mode live status — shown while polling QStash jobs */}
      {running && bgSummary && bgJobIds.length > 0 && (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 p-3 dark:border-indigo-500/30 dark:bg-indigo-950/20">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-indigo-700 dark:text-indigo-300">
              Background queue: {bgJobIds.length} chunks · {bgSummary.done} done · {bgSummary.processing} processing · {bgSummary.queued} queued
              {bgSummary.error > 0 && <span className="ml-1 text-red-600">· {bgSummary.error} errored</span>}
            </span>
            <span className="font-mono text-[10px] text-indigo-600 dark:text-indigo-400">
              {bgSummary.total_succeeded} succeeded · {bgSummary.total_failed} failed
            </span>
          </div>
          <div className="mt-2 flex h-2 w-full overflow-hidden rounded-full bg-white dark:bg-white/10">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(bgSummary.done / Math.max(1, bgSummary.total_chunks)) * 100}%` }} />
            <div className="h-full bg-indigo-400 transition-all" style={{ width: `${(bgSummary.processing / Math.max(1, bgSummary.total_chunks)) * 100}%` }} />
            <div className="h-full bg-red-500 transition-all" style={{ width: `${(bgSummary.error / Math.max(1, bgSummary.total_chunks)) * 100}%` }} />
          </div>
          <p className="mt-1.5 text-[10px] text-indigo-600/70 dark:text-indigo-300/70">
            You can leave this page — jobs continue in the background. Refresh AI Insights when done to see updated scores.
          </p>
        </div>
      )}

      {running && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-slate-500">
            <span>Processing batch…</span>
            <span>{Math.round((progress / total) * 100)}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/5">
            <div className="h-full rounded-full bg-indigo-500 transition-all duration-300" style={{ width: `${(progress / total) * 100}%` }} />
          </div>
        </div>
      )}

      {jobResults.length > 0 && (
        <div className="card">
          <button onClick={() => setShowLog(!showLog)} className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-300">
            <span>Enrichment Log ({jobResults.filter((r) => r.ok).length} succeeded, {jobResults.filter((r) => !r.ok).length} failed)</span>
            {showLog ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {showLog && (
            <div className="max-h-64 overflow-y-auto border-t border-slate-100 divide-y divide-slate-50 dark:border-white/5 dark:divide-white/5">
              {jobResults.map((r) => (
                <div key={r.id} className="flex items-start gap-3 px-4 py-2.5">
                  {r.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />}
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs text-slate-500">{r.id}</p>
                    {r.ok && r.summary && <p className="mt-0.5 text-xs text-slate-700 dark:text-slate-300">{r.summary}</p>}
                    {!r.ok && r.error && <p className="mt-0.5 text-xs text-red-600">{r.error}</p>}
                  </div>
                  {r.viaFallback && <span className="ml-auto shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">fallback</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-[1100px] w-full text-sm">
            <thead className="bg-slate-50/70 text-slate-600 dark:bg-white/5 dark:text-slate-300">
              <tr>
                <th className="px-3 py-2 text-left">
                  <input type="checkbox" checked={displayed.length > 0 && selected.size === displayed.length} onChange={toggleAll} />
                </th>
                <th className="px-3 py-2 text-left">Deal</th>
                <th className="px-3 py-2 text-left">Type</th>
                <th className="px-3 py-2 text-left">Priority</th>
                <th className="px-3 py-2 text-left">Advisory</th>
                <th className="px-3 py-2 text-left">Risk</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">AI Summary</th>
                <th className="px-3 py-2 text-left">Enriched</th>
                <th className="px-3 py-2 text-left">Expand</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} className="px-4 py-6 text-center text-slate-500"><Loader2 className="mx-auto h-4 w-4 animate-spin" /></td></tr>
              ) : displayed.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-6 text-center text-slate-500">No deals found</td></tr>
              ) : (
                displayed.map((d) => {
                  const opp = opportunityLabel(d.advisory_score);
                  return (
                    <>
                      <tr key={d.id} className="border-t border-slate-100 dark:border-white/10 hover:bg-slate-50/50 dark:hover:bg-white/[0.03]">
                        <td className="px-3 py-2">
                          <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggle(d.id)} />
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-medium text-slate-900 dark:text-slate-100">{d.buyer ?? "—"} → {d.target ?? "—"}</div>
                          <div className="text-xs text-slate-500">{d.sector ?? "—"} · {d.country ?? "—"}</div>
                        </td>
                        <td className="px-3 py-2">{d.deal_type ?? "—"}</td>
                        <td className="px-3 py-2">{scorePill(d.priority_score)}</td>
                        <td className="px-3 py-2">
                          <div className="flex flex-col gap-0.5">
                            {scorePill(d.advisory_score)}
                            {opp && <span className={`text-[10px] ${opp.color}`}>{opp.icon} {opp.text}</span>}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          {d.risk_flag ? (
                            <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs capitalize ${riskBadge[d.risk_flag] || "bg-slate-100 text-slate-700 border-slate-200"}`}>
                              {d.risk_flag}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-3 py-2">{d.status ?? "—"}</td>
                        <td className="px-3 py-2 max-w-[320px]">
                          {d.ai_summary ? <span className="line-clamp-2 text-slate-700 dark:text-slate-300">{d.ai_summary}</span> : <span className="text-slate-400">Not enriched</span>}
                        </td>
                        <td className="px-3 py-2">
                          {d.ai_enriched_at ? (
                            <span className="inline-flex items-center gap-1 text-emerald-600">
                              <CheckCircle2 className="h-4 w-4" /> Yes
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-amber-600">
                              <AlertTriangle className="h-4 w-4" /> No
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <button onClick={() => toggleExpand(d.id)} className="text-xs text-indigo-600 hover:underline">
                            {expanded.has(d.id) ? "Hide" : "Show"}
                          </button>
                        </td>
                      </tr>
                      {expanded.has(d.id) && (
                        <tr key={`${d.id}-expanded`} className="bg-slate-50/40 dark:bg-white/[0.02]">
                          <td colSpan={10} className="px-4 py-3">
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                              <div className="rounded border border-slate-200/70 bg-white p-3 dark:border-white/10 dark:bg-[#15151f]">
                                <p className="text-xs font-semibold text-slate-500">Deal ID</p>
                                <p className="mt-1 font-mono text-xs">{d.id}</p>
                              </div>
                              <div className="rounded border border-slate-200/70 bg-white p-3 dark:border-white/10 dark:bg-[#15151f]">
                                <p className="text-xs font-semibold text-slate-500">Opportunity</p>
                                <p className="mt-1 text-xs">{opportunityLabel(d.advisory_score)?.text ?? "—"}</p>
                              </div>
                              <div className="rounded border border-slate-200/70 bg-white p-3 dark:border-white/10 dark:bg-[#15151f]">
                                <p className="text-xs font-semibold text-slate-500">Last Enriched</p>
                                <p className="mt-1 text-xs">{d.ai_enriched_at ? new Date(d.ai_enriched_at).toLocaleString() : "Never"}</p>
                              </div>
                              <div className="rounded border border-slate-200/70 bg-white p-3 sm:col-span-2 lg:col-span-3 dark:border-white/10 dark:bg-[#15151f]">
                                <div className="flex items-center gap-1 text-slate-500"><Info className="h-3.5 w-3.5" /><p className="text-xs font-semibold">AI Summary</p></div>
                                <p className="mt-1.5 text-xs leading-5 text-slate-700 dark:text-slate-300">{d.ai_summary ?? "No AI summary available yet."}</p>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
