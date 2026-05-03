

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Briefcase, Loader2, Download, Trash2,
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
  ExternalLink,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fetchDeals, type Deal } from "@/lib/analytics";
import { downloadCsv } from "@/lib/csv";
import FilterBar, { EMPTY_FILTERS, type Filters } from "@/components/pipeline/FilterBar";
import { deriveExpandedBrief } from "@/lib/intelligence/brief-engine";

// ── Types ─────────────────────────────────────────────────────────────────────
type SortKey =
  | "deal_date" | "buyer" | "target" | "sector" | "country"
  | "priority_score" | "advisory_score" | "risk_score";
type SortDir = "asc" | "desc";

// ── Helpers ───────────────────────────────────────────────────────────────────
const statusStyle: Record<string, string> = {
  announced: "bg-blue-50 text-blue-700 border-blue-100",
  live: "bg-emerald-50 text-emerald-700 border-emerald-100",
  closed: "bg-slate-100 text-slate-600 border-slate-200",
  rumor: "bg-amber-50 text-amber-700 border-amber-100",
  dropped: "bg-red-50 text-red-600 border-red-100",
};

const flowStyle: Record<string, string> = {
  domestic: "bg-violet-50 text-violet-700",
  inbound: "bg-sky-50 text-sky-700",
  outbound: "bg-teal-50 text-teal-700",
  other: "bg-slate-100 text-slate-600",
};

const stakeStyle: Record<string, string> = {
  control: "bg-indigo-100 text-indigo-800",
  majority: "bg-indigo-50 text-indigo-700",
  minority: "bg-slate-100 text-slate-600",
  unknown: "bg-slate-50 text-slate-400",
};

const targetingStyle: Record<string, string> = {
  HIGH: "bg-emerald-100 text-emerald-800 font-semibold",
  MEDIUM: "bg-amber-100 text-amber-800 font-semibold",
  LOW: "bg-slate-100 text-slate-600",
};

const confidenceStyle: Record<string, string> = {
  high: "bg-emerald-50 text-emerald-700",
  medium: "bg-amber-50 text-amber-700",
  low: "bg-red-50 text-red-600",
};

function priorityBadge(score: number | null | undefined) {
  const n = score ?? 0;
  const color = n >= 75 ? "bg-indigo-100 text-indigo-800" : n >= 50 ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-500";
  return { color, label: score != null ? String(score) : "—" };
}
function advisoryBadge(score: number | null | undefined) {
  const n = score ?? 0;
  const color = n >= 75 ? "bg-emerald-100 text-emerald-800" : n >= 50 ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-500";
  return { color, label: score != null ? String(score) : "—" };
}
function riskBadge(score: number | null | undefined) {
  const n = score ?? 0;
  const color = n >= 65 ? "bg-red-100 text-red-700" : n >= 40 ? "bg-amber-100 text-amber-800" : "bg-emerald-50 text-emerald-700";
  return { color, label: score != null ? String(score) : "—" };
}

function parseUsdM(s: string | null | undefined): number | null {
  const m = (s ?? "").match(/\$(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

function targetingFor(d: Deal): "HIGH" | "MEDIUM" | "LOW" {
  if (d.targeting_recommendation) return d.targeting_recommendation;
  const p = d.priority_score ?? 0;
  return p >= 75 ? "HIGH" : p >= 50 ? "MEDIUM" : "LOW";
}

// ── Main Page ─────────────────────────────────────────────────────────────────
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
    fetchDeals(true).then((rows) => { setAll(rows); setLoading(false); });
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
      if (filters.indiaFlow && d.india_flow !== filters.indiaFlow) return false;
      if (filters.stakeStatus && d.stake_status !== filters.stakeStatus) return false;
      if (filters.targeting && targetingFor(d) !== filters.targeting) return false;
      if (filters.dateFrom && (!d.deal_date || d.deal_date < filters.dateFrom)) return false;
      if (filters.dateTo && (!d.deal_date || d.deal_date > filters.dateTo)) return false;
      if (filters.minValueM || filters.maxValueM) {
        const usd = parseUsdM(d.deal_value_usd_range);
        if (filters.minValueM && (usd ?? 0) < Number(filters.minValueM)) return false;
        if (filters.maxValueM && (usd ?? 0) > Number(filters.maxValueM)) return false;
      }
      if (filters.minPriority && (d.priority_score ?? 0) < Number(filters.minPriority)) return false;
      if (filters.maxPriority && (d.priority_score ?? 0) > Number(filters.maxPriority)) return false;
      if (filters.minAdvisory && (d.advisory_score ?? 0) < Number(filters.minAdvisory)) return false;
      if (filters.maxAdvisory && (d.advisory_score ?? 0) > Number(filters.maxAdvisory)) return false;
      if (filters.minRisk && (d.risk_score ?? 0) < Number(filters.minRisk)) return false;
      if (filters.maxRisk && (d.risk_score ?? 0) > Number(filters.maxRisk)) return false;
      return true;
    });
  }, [all, filters]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return sortDir === "asc" ? av - bv : bv - av;
      return sortDir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageRows = sorted.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => { if (page > totalPages) setPage(1); }, [totalPages, page]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("desc"); }
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === pageRows.length) setSelected(new Set());
    else setSelected(new Set(pageRows.map((d) => d.id)));
  };

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

  if (loading) return (
    <div className="flex h-96 items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
            <Briefcase className="h-6 w-6 text-indigo-600" />
            Deal Pipeline
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {all.length.toLocaleString()} total · {filtered.length.toLocaleString()} matching
            {filters.targeting && <span className={`ml-2 rounded px-1.5 py-0.5 text-xs font-medium ${targetingStyle[filters.targeting]}`}>{filters.targeting}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <button onClick={bulkDelete} disabled={deleting} className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50">
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete {selected.size}
            </button>
          )}
          <button onClick={() => downloadCsv(sorted, `deals-${new Date().toISOString().slice(0, 10)}.csv`)} disabled={sorted.length === 0} className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
           <Download className="h-4 w-4" />
              Export CSV
            </button>

            <button
              onClick={async () => {
                const r = await fetch("/api/deals/derive", { method: "POST" });
                const j = await r.json();
                alert(j.ok ? `Updated ${j.updated} of ${j.total} deals.` : `Error: ${j.error}`);
                window.location.reload();
              }}
              className="ml-2 inline-flex items-center gap-2 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100">
              ✨ Derive Fields
            </button>
        </div>
      </div>

      {/* Filters */}
      <FilterBar filters={filters} onChange={(f) => { setFilters(f); setPage(1); }} options={options} />

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              <tr>
                <th className="w-8 px-3 py-3">
                  <input type="checkbox" checked={selected.size === pageRows.length && pageRows.length > 0} onChange={toggleSelectAll} className="rounded border-slate-300" />
                </th>
                <th className="w-6 px-1 py-3" />
                <SortTh label="Date" k="deal_date" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortTh label="Buyer" k="buyer" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortTh label="Target" k="target" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortTh label="Sector" k="sector" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortTh label="Country" k="country" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <th className="px-3 py-3 whitespace-nowrap">Geographies</th>
                <th className="px-3 py-3 whitespace-nowrap">INR Range</th>
                <th className="px-3 py-3 whitespace-nowrap">USD Range</th>
                <th className="px-3 py-3 whitespace-nowrap">Type</th>
                <th className="px-3 py-3 min-w-[180px]">Summary</th>
                <th className="px-3 py-3 whitespace-nowrap">India Flow</th>
                <th className="px-3 py-3 whitespace-nowrap">Stake</th>
                <SortTh label="P" k="priority_score" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="Priority Score" />
                <SortTh label="A" k="advisory_score" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="Advisory Score" />
                <SortTh label="R" k="risk_score" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="Risk Score" />
                <th className="px-3 py-3 whitespace-nowrap">Targeting</th>
                <th className="px-3 py-3 whitespace-nowrap">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pageRows.length === 0 && (
                <tr><td colSpan={19} className="px-4 py-12 text-center text-sm text-slate-400">No deals match the current filters.</td></tr>
              )}
              {pageRows.map((d) => {
                const isExpanded = expanded.has(d.id);
                const isSelected = selected.has(d.id);
                const p = priorityBadge(d.priority_score);
                const a = advisoryBadge(d.advisory_score);
                const r = riskBadge(d.risk_score);
                const tgt = targetingFor(d);
                const summary = d.deal_summary ?? "";
                const truncSummary = summary.length > 60 ? summary.slice(0, 58) + "…" : summary;

                return (
                  <>
                    <tr
                      key={d.id}
                      className={`transition-colors ${isExpanded ? "bg-indigo-50/40" : isSelected ? "bg-slate-50" : "hover:bg-slate-50/60"}`}
                    >
                      <td className="px-3 py-2.5">
                        <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(d.id)} className="rounded border-slate-300" />
                      </td>
                      <td className="px-1 py-2.5">
                        <button
                          onClick={() => toggleExpand(d.id)}
                          className="flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors"
                          title="Expand deal brief"
                        >
                          <ChevronRight className={`h-3.5 w-3.5 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                        </button>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-slate-500">{d.deal_date ?? "—"}</td>
                      <td className="px-3 py-2.5 max-w-[140px]">
                        <Link href={`/dashboard/deals/${d.id}`} className="font-medium text-slate-900 hover:text-indigo-600 truncate block" title={d.buyer ?? ""}>
                          {d.buyer ?? "—"}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 max-w-[130px] truncate text-slate-700" title={d.target ?? ""}>{d.target ?? "—"}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-slate-600">{d.sector ?? "—"}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-slate-600">{d.country ?? "—"}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-slate-500">{d.geographies_involved ?? "—"}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap font-mono text-slate-600">{d.deal_value_inr_range ?? "—"}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap font-mono text-slate-700 font-medium">{d.deal_value_usd_range ?? "—"}</td>
                      <td className="px-3 py-2.5">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-700">{d.deal_type ?? "—"}</span>
                      </td>
                      <td className="px-3 py-2.5 max-w-[200px]">
                        <span title={summary} className="text-slate-600 cursor-default">{truncSummary || "—"}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        {d.india_flow ? (
                          <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${flowStyle[d.india_flow] ?? "bg-slate-100 text-slate-600"}`}>
                            {d.india_flow}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        {d.stake_status ? (
                          <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${stakeStyle[d.stake_status] ?? "bg-slate-100 text-slate-600"}`}>
                            {d.stake_status}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`inline-flex min-w-[28px] items-center justify-center rounded px-1.5 py-0.5 text-[11px] font-semibold ${p.color}`}>{p.label}</span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`inline-flex min-w-[28px] items-center justify-center rounded px-1.5 py-0.5 text-[11px] font-semibold ${a.color}`}>{a.label}</span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`inline-flex min-w-[28px] items-center justify-center rounded px-1.5 py-0.5 text-[11px] font-semibold ${r.color}`}>{r.label}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`rounded px-1.5 py-0.5 text-[11px] ${targetingStyle[tgt]}`}>{tgt}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`rounded border px-1.5 py-0.5 text-[11px] font-medium ${statusStyle[d.status ?? ""] ?? "bg-slate-100 text-slate-600 border-slate-200"}`}>
                          {d.status ?? "—"}
                        </span>
                      </td>
                    </tr>

                    {isExpanded && <ExpandedBriefRow key={`${d.id}-brief`} deal={d} colSpan={19} />}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>Rows:</span>
            {[25, 50, 100].map((n) => (
              <button key={n} onClick={() => { setPageSize(n); setPage(1); }} className={`rounded px-2 py-1 ${pageSize === n ? "bg-indigo-600 text-white" : "hover:bg-slate-100"}`}>{n}</button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-slate-500 mr-2">
              {Math.min((page - 1) * pageSize + 1, sorted.length)}–{Math.min(page * pageSize, sorted.length)} of {sorted.length}
            </span>
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="rounded p-1 hover:bg-slate-100 disabled:opacity-30">
              <ChevronLeft className="h-4 w-4 text-slate-600" />
            </button>
            <span className="min-w-[60px] text-center text-xs text-slate-600">p.{page}/{totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="rounded p-1 hover:bg-slate-100 disabled:opacity-30">
              <ChevronRight className="h-4 w-4 text-slate-600" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Expanded Brief Row ────────────────────────────────────────────────────────
function ExpandedBriefRow({ deal, colSpan }: { deal: Deal; colSpan: number }) {
  const brief = useMemo(() => deriveExpandedBrief(deal), [deal]);
  const tgt = targetingFor(deal);
  const confidence = deal.confidence_level ?? "medium";

  return (
    <tr className="bg-indigo-50/30 border-t border-indigo-100">
      <td colSpan={colSpan} className="px-4 py-4">
        <div className="max-w-6xl space-y-4">
          {/* Header strip */}
          <div className="flex items-center justify-between gap-3 pb-2 border-b border-indigo-100/60">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-slate-800">{deal.buyer ?? "—"} → {deal.target ?? "—"}</span>
              <span className="text-xs text-slate-400">{deal.deal_date ?? ""}</span>
              <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[11px] font-medium text-slate-700">{deal.deal_type}</span>
              {deal.deal_value_usd_range && <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[11px] font-semibold text-indigo-800">{deal.deal_value_usd_range}</span>}
            </div>
            <div className="flex items-center gap-2">
              <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${targetingStyle[tgt]}`}>{tgt} TARGETING</span>
              <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${confidenceStyle[confidence]}`}>{confidence.toUpperCase()} CONFIDENCE</span>
              <Link href={`/dashboard/deals/${deal.id}`} className="flex items-center gap-1 rounded bg-indigo-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-indigo-700">
                <ExternalLink className="h-3 w-3" /> Full Brief
              </Link>
            </div>
          </div>

          {/* 6-section grid */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <BriefSection num="1" title="Investment Thesis" color="indigo" items={brief.investmentThesis} />
            <BriefSection num="2" title="Why Now" color="sky" items={[brief.whyNow]} />
            <BriefSection num="3" title="Value Drivers" color="emerald" items={brief.valueDrivers} />
            <BriefSection num="4" title="Key Risks" color="red" items={brief.keyRisks} />
            <BriefSection num="5" title="Deal Tension" color="amber" items={brief.dealTension} />
            <BriefSection num="6" title="Advisory Angle" color="violet" items={[brief.advisoryAngle]} />
          </div>

          {/* Deal Takeaway – full width */}
          <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-500 mb-1">7 · Deal Takeaway (So What)</p>
            <p className="text-sm text-indigo-900 font-medium leading-snug">{brief.dealTakeaway}</p>
          </div>
        </div>
      </td>
    </tr>
  );
}

// ── Section Component ─────────────────────────────────────────────────────────
const sectionTheme: Record<string, { bg: string; border: string; label: string; dot: string }> = {
  indigo: { bg: "bg-indigo-50/60", border: "border-indigo-100", label: "text-indigo-600", dot: "bg-indigo-400" },
  sky: { bg: "bg-sky-50/60", border: "border-sky-100", label: "text-sky-600", dot: "bg-sky-400" },
  emerald: { bg: "bg-emerald-50/60", border: "border-emerald-100", label: "text-emerald-600", dot: "bg-emerald-400" },
  red: { bg: "bg-red-50/60", border: "border-red-100", label: "text-red-600", dot: "bg-red-400" },
  amber: { bg: "bg-amber-50/60", border: "border-amber-100", label: "text-amber-600", dot: "bg-amber-400" },
  violet: { bg: "bg-violet-50/60", border: "border-violet-100", label: "text-violet-600", dot: "bg-violet-400" },
};

function BriefSection({ num, title, color, items }: { num: string; title: string; color: string; items: string[] }) {
  const t = sectionTheme[color] ?? sectionTheme.indigo;
  return (
    <div className={`rounded-lg border p-3 ${t.bg} ${t.border}`}>
      <p className={`text-[10px] font-semibold uppercase tracking-wide mb-2 ${t.label}`}>{num} · {title}</p>
      <ul className="space-y-1">
        {items.filter(Boolean).map((item, i) => (
          <li key={i} className="flex items-start gap-1.5">
            <span className={`mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full ${t.dot}`} />
            <span className="text-xs text-slate-700 leading-snug">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Sort Header ───────────────────────────────────────────────────────────────
function SortTh({ label, k, sortKey, sortDir, onSort, title }: { label: string; k: SortKey; sortKey: SortKey; sortDir: SortDir; onSort: (k: SortKey) => void; title?: string }) {
  const active = sortKey === k;
  return (
    <th className="px-3 py-3">
      <button
        onClick={() => onSort(k)}
        title={title}
        className={`inline-flex items-center gap-0.5 whitespace-nowrap transition-colors ${active ? "text-slate-800" : "text-slate-400 hover:text-slate-600"}`}
      >
        {label}
        {active
          ? (sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)
          : <ChevronDown className="h-3 w-3 opacity-30" />}
      </button>
    </th>
  );
}
