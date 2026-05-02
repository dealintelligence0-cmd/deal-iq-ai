

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Briefcase, Loader2, Download, Trash2, ChevronUp, ChevronDown,
  ChevronLeft, ChevronRight,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fetchDeals, type Deal } from "@/lib/analytics";
import { downloadCsv } from "@/lib/csv";
import FilterBar, {
  EMPTY_FILTERS, type Filters,
} from "@/components/pipeline/FilterBar";

type SortKey =
  | "deal_date" | "buyer" | "target" | "sector" | "country"
  | "priority_score" | "advisory_score" | "risk_score";
type SortDir = "asc" | "desc";

const statusStyle: Record<string, string> = {
  announced: "bg-blue-50 text-blue-700",
  live: "bg-emerald-50 text-emerald-700",
  closed: "bg-slate-100 text-slate-700",
  rumor: "bg-amber-50 text-amber-700",
  dropped: "bg-red-50 text-red-700",
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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      const rows = await fetchDeals(true);
      setAll(rows);
      console.log("[deals/page] sample API deal row:", rows[0]);
      setLoading(false);
    })();
  }, []);

  const options = useMemo(() => {
    const uniq = (f: keyof Deal) =>
      Array.from(new Set(all.map((d) => d[f] as string).filter(Boolean))).sort();
    return {
      sectors: uniq("sector"),
      countries: uniq("country"),
      dealTypes: uniq("deal_type"),
      statuses: ["rumor", "announced", "live", "closed", "dropped"],
    };
  }, [all]);

  const filtered = useMemo(() => {
    const q = filters.q.toLowerCase().trim();
    return all.filter((d) => {
      if (q) {
        const hay = [d.buyer, d.target, d.deal_summary].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filters.sector && d.sector !== filters.sector) return false;
      if (filters.country && d.country !== filters.country) return false;
      if (filters.dealType && d.deal_type !== filters.dealType) return false;
      if (filters.status && d.status !== filters.status) return false;
      if (filters.dateFrom && (!d.deal_date || d.deal_date < filters.dateFrom)) return false;
      if (filters.dateTo && (!d.deal_date || d.deal_date > filters.dateTo)) return false;
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

  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [totalPages, page]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("desc");
    }
  };

  const toggleExpand = (id: string) => {
    const n = new Set(expanded);
    if (n.has(id)) n.delete(id); else n.add(id);
    setExpanded(n);
  };

  async function bulkDelete() {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} deal(s)? This cannot be undone.`)) return;
    setDeleting(true);
    const ids = Array.from(selected);
    const { error } = await supabase.from("deals").delete().in("id", ids);
    if (!error) {
      setAll((p) => p.filter((d) => !selected.has(d.id)));
      setSelected(new Set());
    } else alert(error.message);
    setDeleting(false);
  }

  function exportCsv() {
    downloadCsv(sorted, `deals-export-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  if (loading) return <div className="flex h-96 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-indigo-600" /></div>;

  return <div>
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900"><Briefcase className="h-6 w-6 text-indigo-600" />Pipeline Manager</h1>
        <p className="mt-1 text-sm text-slate-500">{all.length.toLocaleString()} total · {filtered.length.toLocaleString()} matching filters</p>
      </div>
      <div className="flex items-center gap-2">
        {selected.size > 0 && <button onClick={bulkDelete} disabled={deleting} className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50">{deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}Delete {selected.size}</button>}
        <button onClick={exportCsv} disabled={sorted.length === 0} className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"><Download className="h-4 w-4" />Export CSV</button>
      </div>
    </div>
    <div className="mb-4"><FilterBar filters={filters} onChange={setFilters} options={options} /></div>
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500"><tr>
      <th className="w-10 px-4 py-3" />
      <SortHeader label="Date" k="deal_date" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
      <SortHeader label="Buyer" k="buyer" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
      <SortHeader label="Target" k="target" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
      <SortHeader label="Sector" k="sector" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
      <SortHeader label="Country" k="country" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
      <th className="px-4 py-3">Geographies</th><th className="px-4 py-3">INR Range</th><th className="px-4 py-3">USD Range</th><th className="px-4 py-3">Deal Type</th><th className="px-4 py-3">Summary</th><th className="px-4 py-3">India Flow</th><th className="px-4 py-3">Stake Value</th><th className="px-4 py-3">Stake Status</th>
      <SortHeader label="Priority" k="priority_score" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
      <SortHeader label="Advisory" k="advisory_score" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
      <SortHeader label="Risk" k="risk_score" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
      <th className="px-4 py-3">Status</th></tr></thead><tbody>
      {pageRows.map((d) => <>
        <tr key={d.id} className="border-t border-slate-100 hover:bg-slate-50"><td className="px-4 py-3"><button onClick={() => toggleExpand(d.id)}>{expanded.has(d.id) ? "−" : "+"}</button></td>
          <td className="px-4 py-3">{d.deal_date ?? "—"}</td><td className="px-4 py-3"><Link href={`/dashboard/deals/${d.id}`} className="font-medium text-slate-900 hover:text-indigo-600">{d.buyer ?? "—"}</Link></td><td className="px-4 py-3">{d.target ?? "—"}</td><td className="px-4 py-3">{d.sector ?? "—"}</td><td className="px-4 py-3">{d.country ?? "—"}</td><td className="px-4 py-3">{d.geographies_involved ?? "—"}</td><td className="px-4 py-3">{d.deal_value_inr_range ?? "—"}</td><td className="px-4 py-3">{d.deal_value_usd_range ?? "—"}</td><td className="px-4 py-3">{d.deal_type ?? "—"}</td><td className="px-4 py-3 max-w-[240px]">{d.deal_summary ?? "—"}</td><td className="px-4 py-3">{d.india_flow ?? "—"}</td><td className="px-4 py-3">{d.stake_value ?? "—"}</td><td className="px-4 py-3">{d.stake_status ?? "—"}</td><td className="px-4 py-3">{d.priority_score ?? "—"}</td><td className="px-4 py-3">{d.advisory_score ?? "—"}</td><td className="px-4 py-3">{d.risk_score ?? "—"}</td>
          <td className="px-4 py-3"><span className={`rounded-md px-2 py-0.5 text-xs font-medium ${statusStyle[d.status ?? ""] ?? "bg-slate-100 text-slate-700"}`}>{d.status ?? "—"}</span></td>
        </tr>
        {expanded.has(d.id) && <tr className="border-t border-slate-100 bg-slate-50"><td /><td colSpan={17} className="px-4 py-3 text-xs text-slate-700"><div><strong>Priority reason:</strong> {d.priority_reason ?? d.score_breakdown ?? "—"}</div><div><strong>Advisory reason:</strong> {d.advisory_reason ?? d.targeting_reason ?? "—"}</div><div><strong>Risk reason:</strong> {d.risk_reason ?? "—"}</div><div><strong>Deal takeaway:</strong> {d.deal_takeaway ?? "—"}</div></td></tr>}
      </>)}
    </tbody></table></div></div>
  </div>;
}

function SortHeader({ label, k, sortKey, sortDir, onSort }: { label: string; k: SortKey; sortKey: SortKey; sortDir: SortDir; onSort: (k: SortKey) => void }) {
  const active = sortKey === k;
  return <th className="px-4 py-3"><button onClick={() => onSort(k)} className={`inline-flex items-center gap-1 ${active ? "text-slate-900" : "hover:text-slate-700"}`}>{label}{active ? (sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : <ChevronDown className="h-3 w-3 opacity-30" />}</button></th>;
}
