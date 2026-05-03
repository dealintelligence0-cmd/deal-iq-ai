

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Briefcase, Loader2, Download, Trash2, ChevronUp, ChevronDown,
  ChevronLeft, ChevronRight, Sparkles,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fetchDeals, formatUsdShort, type Deal } from "@/lib/analytics";
import { downloadCsv } from "@/lib/csv";
import FilterBar, { EMPTY_FILTERS, type Filters } from "@/components/pipeline/FilterBar";

type SortKey = "deal_date" | "buyer" | "target" | "sector" | "country" | "normalized_value_usd" | "status";
type SortDir = "asc" | "desc";

const statusStyle: Record<string, string> = {
  announced: "bg-blue-50 text-blue-700",
  live: "bg-emerald-50 text-emerald-700",
  closed: "bg-slate-100 text-slate-700",
  rumor: "bg-amber-50 text-amber-700",
  dropped: "bg-red-50 text-red-700",
};

const flowStyle: Record<string, string> = {
  domestic: "bg-blue-50 text-blue-700",
  outbound: "bg-emerald-50 text-emerald-700",
  inbound: "bg-purple-50 text-purple-700",
  other: "bg-slate-100 text-slate-600",
};

export default function PipelinePage() {
  const supabase = createClient();
  const [all, setAll] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sortKey, setSortKey] = useState<SortKey>("deal_date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [deriving, setDeriving] = useState(false);

  useEffect(() => {
    (async () => {
      setAll(await fetchDeals());
      setLoading(false);
    })();
  }, []);

  const options = useMemo(() => {
    const uniq = (f: keyof Deal) => Array.from(new Set(all.map((d) => d[f] as string).filter(Boolean))).sort();
    return {
      sectors: uniq("sector"),
      countries: uniq("country"),
      dealTypes: uniq("deal_type"),
      statuses: ["rumor", "announced", "live", "closed", "dropped"],
    };
  }, [all]);

  const filtered = useMemo(() => {
    const q = filters.q.toLowerCase().trim();
    const minV = filters.minValueM ? parseFloat(filters.minValueM) * 1e6 : null;
    const maxV = filters.maxValueM ? parseFloat(filters.maxValueM) * 1e6 : null;
    return all.filter((d) => {
      if (q) {
        const hay = [d.buyer, d.target].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filters.sector && d.sector !== filters.sector) return false;
      if (filters.country && d.country !== filters.country) return false;
      if (filters.dealType && d.deal_type !== filters.dealType) return false;
      if (filters.status && d.status !== filters.status) return false;
      if (filters.dateFrom && (!d.deal_date || d.deal_date < filters.dateFrom)) return false;
      if (filters.dateTo && (!d.deal_date || d.deal_date > filters.dateTo)) return false;
      if (minV !== null && (d.normalized_value_usd ?? 0) < minV) return false;
      if (maxV !== null && (d.normalized_value_usd ?? 0) > maxV) return false;
      return true;
    });
  }, [all, filters]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      if (typeof av === "number" && typeof bv === "number") return sortDir === "asc" ? av - bv : bv - av;
      return sortDir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageRows = sorted.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => { if (page > totalPages) setPage(1); }, [totalPages, page]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("desc"); }
  }

  function togglePageAll() {
    const ids = new Set(selected);
    const allOnPage = pageRows.every((r) => ids.has(r.id));
    pageRows.forEach((r) => (allOnPage ? ids.delete(r.id) : ids.add(r.id)));
    setSelected(ids);
  }

  async function bulkDelete() {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} deal(s)? This cannot be undone.`)) return;
    setDeleting(true);
    const ids = Array.from(selected);
    const { error } = await supabase.from("deals").delete().in("id", ids);
    if (!error) { setAll((p) => p.filter((d) => !selected.has(d.id))); setSelected(new Set()); }
    else alert(error.message);
    setDeleting(false);
  }

  async function deriveAll() {
    setDeriving(true);
    const r = await fetch("/api/deals/derive", { method: "POST" });
    const j = await r.json();
    setDeriving(false);
    alert(j.ok ? `Updated ${j.updated} of ${j.total} deals.` : `Error: ${j.error}`);
    setAll(await fetchDeals(true));
  }

  function exportCsv() {
    const rows = sorted.map((d) => ({
      deal_date: d.deal_date ?? "",
      buyer: d.buyer ?? "",
      target: d.target ?? "",
      sector: d.sector ?? "",
      country: d.country ?? "",
      india_flow: d.india_flow ?? "",
      deal_type: d.deal_type ?? "",
      stake_percent: d.stake_percent ?? "",
      stake_status: d.stake_status ?? "",
      deal_value_inr_range: d.deal_value_inr_range ?? "",
      deal_value_usd_range: d.deal_value_usd_range ?? "",
      priority_score: d.priority_score ?? "",
      advisory_score: d.advisory_score ?? "",
      risk_score: d.risk_score ?? "",
      normalized_value_usd: d.normalized_value_usd ?? "",
      status: d.status ?? "",
    }));
    downloadCsv(rows, `deals-export-${new Date().toISOString().slice(0, 10)}.csv`,
      ["deal_date","buyer","target","sector","country","india_flow","deal_type","stake_percent","stake_status","deal_value_inr_range","deal_value_usd_range","priority_score","advisory_score","risk_score","normalized_value_usd","status"]);
  }

  if (loading) {
    return <div className="flex h-96 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-indigo-600" /></div>;
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900 dark:text-white">
            <Briefcase className="h-6 w-6 text-indigo-600" />
            Pipeline Manager
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {all.length.toLocaleString()} total · {filtered.length.toLocaleString()} matching filters
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <button onClick={bulkDelete} disabled={deleting}
              className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50">
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete {selected.size}
            </button>
          )}
          <button onClick={deriveAll} disabled={deriving}
            className="flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50">
            {deriving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {deriving ? "Deriving…" : "Derive Fields"}
          </button>
          <button onClick={exportCsv} disabled={sorted.length === 0}
            className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        </div>
      </div>

      <div className="mb-4">
        <FilterBar filters={filters} onChange={setFilters} options={options} />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#15151f]">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500 dark:bg-white/5 dark:text-slate-400">
              <tr>
                <th className="w-10 px-4 py-3">
                  <input type="checkbox"
                    checked={pageRows.length > 0 && pageRows.every((r) => selected.has(r.id))}
                    onChange={togglePageAll}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600" />
                </th>
                <SortHeader label="Date" k="deal_date" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortHeader label="Buyer" k="buyer" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortHeader label="Target" k="target" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortHeader label="Sector" k="sector" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortHeader label="Country" k="country" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <th className="px-3 py-3">Flow</th>
                <th className="px-3 py-3">USD Range</th>
                <th className="px-3 py-3">INR Range</th>
                <th className="px-3 py-3 text-center">Priority</th>
                <th className="px-3 py-3 text-center">Advisory</th>
                <th className="px-3 py-3 text-center">Risk</th>
                <SortHeader label="Status" k="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr><td colSpan={13} className="px-4 py-16 text-center text-sm text-slate-400">No deals match your filters.</td></tr>
              ) : pageRows.map((d) => (
                <tr key={d.id} className={`border-t border-slate-100 hover:bg-slate-50 dark:border-white/5 dark:hover:bg-white/5 ${selected.has(d.id) ? "bg-indigo-50/40 dark:bg-indigo-950/20" : ""}`}>
                  <td className="px-4 py-3">
                    <input type="checkbox"
                      checked={selected.has(d.id)}
                      onChange={() => {
                        const n = new Set(selected);
                        if (n.has(d.id)) n.delete(d.id); else n.add(d.id);
                        setSelected(n);
                      }}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600" />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-400">{d.deal_date ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/deals/${d.id}`} className="font-medium text-slate-900 hover:text-indigo-600 dark:text-white">
                      {d.buyer ?? "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{d.target ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{d.sector ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{d.country ?? "—"}</td>
                  <td className="px-3 py-3">
                    {d.india_flow ? (
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${flowStyle[d.india_flow] ?? "bg-slate-100 text-slate-600"}`}>
                        {d.india_flow}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-3 py-3 text-[11px] font-mono text-slate-700 dark:text-slate-300">{d.deal_value_usd_range ?? "—"}</td>
                  <td className="px-3 py-3 text-[11px] font-mono text-slate-700 dark:text-slate-300">{d.deal_value_inr_range ?? "—"}</td>
                  <td className="px-3 py-3 text-center text-xs font-mono" title={d.priority_reason ?? ""}>
                    {d.priority_score != null ? <ScoreBadge score={d.priority_score} /> : "—"}
                  </td>
                  <td className="px-3 py-3 text-center text-xs font-mono" title={d.advisory_reason ?? ""}>
                    {d.advisory_score != null ? <ScoreBadge score={d.advisory_score} /> : "—"}
                  </td>
                  <td className="px-3 py-3 text-center text-xs font-mono" title={d.risk_reason ?? ""}>
                    {d.risk_score != null ? <ScoreBadge score={d.risk_score} /> : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${statusStyle[d.status ?? ""] ?? "bg-slate-100 text-slate-700"}`}>
                      {d.status ?? "—"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {sorted.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-sm dark:border-white/5">
            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
              <span>Rows:</span>
              <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white">
                {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              <span className="ml-3 text-slate-500">
                {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, sorted.length)} of {sorted.length.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="px-3 text-xs font-medium text-slate-700 dark:text-slate-300">Page {page} of {totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 70 ? "bg-emerald-100 text-emerald-800"
              : score >= 40 ? "bg-amber-100 text-amber-800"
              : "bg-slate-100 text-slate-600";
  return <span className={`inline-block rounded-full px-2 py-0.5 ${color}`}>{score}</span>;
}

function SortHeader({ label, k, sortKey, sortDir, onSort, align = "left" }: {
  label: string; k: SortKey; sortKey: SortKey; sortDir: SortDir;
  onSort: (k: SortKey) => void; align?: "left" | "right";
}) {
  const active = sortKey === k;
  return (
    <th className={`px-4 py-3 ${align === "right" ? "text-right" : ""}`}>
      <button onClick={() => onSort(k)} className={`inline-flex items-center gap-1 ${active ? "text-slate-900 dark:text-white" : "hover:text-slate-700"}`}>
        {label}
        {active ? (sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)
                : <ChevronDown className="h-3 w-3 opacity-30" />}
      </button>
    </th>
  );
}
