"use client";

import { useEffect, useState, useMemo } from "react";
import {
  BarChart3, DollarSign, Target, TrendingUp, Loader2, Printer, X, Filter,
} from "lucide-react";
import KpiCard from "@/components/dashboard/KpiCard";
import RecentDealsTable from "@/components/dashboard/RecentDealsTable";
import {
  MonthlyTrend, HorizontalBars, DealTypePie,
} from "@/components/dashboard/Charts";
import {
  fetchDeals, computeKpis, monthlyTrend, topBuckets, formatUsdShort,
  type Deal, type Kpis,
} from "@/lib/analytics";

type Filters = { sector?: string; country?: string; deal_type?: string; buyer?: string };

export default function DashboardPage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({});

  useEffect(() => {
    (async () => {
      try {
        const d = await fetchDeals();
        setDeals(d);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load dashboard");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Apply filters across the entire dataset (charts, KPIs, table all use this)
  const filteredDeals = useMemo(() => {
    return deals.filter((d) => {
      if (filters.sector && d.sector !== filters.sector) return false;
      if (filters.country && d.country !== filters.country) return false;
      if (filters.deal_type && d.deal_type !== filters.deal_type) return false;
      if (filters.buyer && d.buyer !== filters.buyer) return false;
      return true;
    });
  }, [deals, filters]);

  const kpis: Kpis | null = useMemo(() => filteredDeals.length ? computeKpis(filteredDeals) : null, [filteredDeals]);

  function setFilter(key: keyof Filters, value: string) {
    setFilters((f) => ({ ...f, [key]: f[key] === value ? undefined : value }));
  }

  function clearAll() {
    setFilters({});
  }

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 dark:border-red-900 dark:bg-red-950/30">
        <h2 className="font-semibold text-red-800 dark:text-red-300">Dashboard error</h2>
        <p className="mt-1 text-sm text-red-700 dark:text-red-400">{error}</p>
        <button onClick={() => window.location.reload()}
          className="mt-3 rounded bg-red-600 px-3 py-1.5 text-xs text-white hover:bg-red-700">
          Reload
        </button>
      </div>
    );
  }

  const trend = monthlyTrend(filteredDeals);
  const sectors = topBuckets(filteredDeals, "sector");
  const countries = topBuckets(filteredDeals, "country");
  const buyers = topBuckets(filteredDeals, "buyer", 8);
  const types = topBuckets(filteredDeals, "deal_type");

  // Build dropdown options from full dataset (so user can always reach any filter)
  const allSectors = Array.from(new Set(deals.map((d) => d.sector).filter(Boolean))).sort();
  const allCountries = Array.from(new Set(deals.map((d) => d.country).filter(Boolean))).sort();
  const allTypes = Array.from(new Set(deals.map((d) => d.deal_type).filter(Boolean))).sort();
  const allBuyers = Array.from(new Set(deals.map((d) => d.buyer).filter(Boolean))).sort();

  const activeChips = Object.entries(filters).filter(([, v]) => v) as [keyof Filters, string][];
  const hasFilters = activeChips.length > 0;
return (
    <div className="dashboard-print">
      {/* Print-only executive header */}
      <div className="hidden print:block mb-4 border-b-2 border-indigo-600 pb-2">
        <div className="flex items-baseline justify-between">
          <h1 className="text-lg font-bold text-slate-900">Executive Pipeline Dashboard</h1>
          <p className="text-[10px] text-slate-500">Generated {new Date().toLocaleString()}</p>
        </div>
        <p className="text-[10px] text-slate-600">
          {hasFilters ? `Filtered: ${activeChips.map(([k, v]) => `${k}=${v}`).join(" · ")}` : "All deals · No filters"}
          {" · "}{filteredDeals.length} deals · {formatUsdShort(kpis?.totalValueUsd ?? 0)} total value
        </p>
      </div>

      <div className="page-header no-print">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-white">Executive Dashboard</h1>
            <p className="mt-1 text-sm text-white/60">Real-time pipeline intelligence powered by your imported deal data.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => window.print()}
              className="flex items-center gap-1.5 rounded-md border border-white/20 bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/20">
              <Printer className="h-3.5 w-3.5" /> Export PDF
            </button>
            <p className="text-xs text-white/50">{new Date().toLocaleDateString()}</p>
          </div>
        </div>
      </div>

      {/* FILTER BAR */}
      <div className="mb-6 mt-4 rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-[#15151f] no-print">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
            <Filter className="h-3.5 w-3.5" /> Filters
          </span>
          <select value={filters.sector ?? ""} onChange={(e) => setFilter("sector", e.target.value)}
            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white">
            <option value="">All Sectors</option>
            {allSectors.map((s) => <option key={s} value={s as string}>{s}</option>)}
          </select>
          <select value={filters.country ?? ""} onChange={(e) => setFilter("country", e.target.value)}
            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white">
            <option value="">All Countries</option>
            {allCountries.map((c) => <option key={c} value={c as string}>{c}</option>)}
          </select>
          <select value={filters.deal_type ?? ""} onChange={(e) => setFilter("deal_type", e.target.value)}
            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white">
            <option value="">All Deal Types</option>
            {allTypes.map((t) => <option key={t} value={t as string}>{t}</option>)}
          </select>
          <select value={filters.buyer ?? ""} onChange={(e) => setFilter("buyer", e.target.value)}
            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white">
            <option value="">All Buyers</option>
            {allBuyers.map((b) => <option key={b} value={b as string}>{b}</option>)}
          </select>

          {hasFilters && (
            <button onClick={clearAll}
              className="ml-auto rounded-md bg-red-50 px-2 py-1 text-[11px] font-medium text-red-700 hover:bg-red-100 dark:bg-red-950/30 dark:text-red-400">
              Reset all
            </button>
          )}
        </div>

        {hasFilters && (
          <div className="mt-2 flex flex-wrap gap-1.5 border-t border-slate-100 pt-2 dark:border-white/5">
            <span className="text-[10px] text-slate-500">Active:</span>
            {activeChips.map(([k, v]) => (
              <span key={k} className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-medium text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                {k}: {v}
                <button onClick={() => setFilter(k, v)} className="hover:text-indigo-900">
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}
          </div>
        )}

        <p className="mt-2 text-[10px] text-slate-500">
          Showing {filteredDeals.length.toLocaleString()} of {deals.length.toLocaleString()} deals
        </p>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total Deals" value={(kpis?.totalDeals ?? 0).toLocaleString()} sublabel={hasFilters ? "Filtered" : "All-time ingested"} icon={Target} iconBg="bg-indigo-50" iconColor="text-indigo-600" />
        <KpiCard label="Total Value" value={formatUsdShort(kpis?.totalValueUsd ?? 0)} sublabel={hasFilters ? "Filtered USD" : "Normalized to USD"} icon={DollarSign} iconBg="bg-emerald-50" iconColor="text-emerald-600" />
        <KpiCard label="Active / Live Deals" value={(kpis?.liveDeals ?? 0).toLocaleString()} sublabel="Announced or in-progress" icon={TrendingUp} iconBg="bg-purple-50" iconColor="text-purple-600" />
        <KpiCard label="Advisory Wallet" value={formatUsdShort(kpis?.advisoryWalletUsd ?? 0)} sublabel="≈ 1% of deal value" icon={BarChart3} iconBg="bg-amber-50" iconColor="text-amber-600" />
      </div>

      {/* Charts row 1 */}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2"><MonthlyTrend data={trend} /></div>
        <DealTypePie data={types} />
      </div>

      {/* Charts row 2 */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <HorizontalBars title="Top Sectors" sub="Total deal value by sector ($M)" data={sectors} />
        <HorizontalBars title="Top Countries" sub="Geographic concentration ($M)" data={countries} />
      </div>

      {/* Buyer rankings */}
      <div className="mt-6">
        <HorizontalBars title="Top Buyers" sub="Most active acquirers by value ($M)" data={buyers} />
      </div>

      {/* Recent deals — receives FILTERED list */}
      <div className="mt-6">
        <RecentDealsTable deals={filteredDeals} />
      </div>

      {/* Pipeline deep-dive — REPLACED duplicate DealTypePie with monthly volume chart */}
      <div className="mt-6">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
          <span className="inline-block h-1 w-4 rounded-full bg-indigo-500" />
          Pipeline deep-dive
        </h2>
        <div className="grid gap-6 lg:grid-cols-2">
          <HorizontalBars title="Country exposure" sub="By deal value ($M)" data={topBuckets(filteredDeals, "country", 10)} />
          <HorizontalBars title="Buyers — long tail" sub="All buyers with activity ($M)" data={topBuckets(filteredDeals, "buyer", 12)} />
        </div>
      </div>
    </div>
  );
}
