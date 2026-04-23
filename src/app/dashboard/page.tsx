"use client";

import { useEffect, useState } from "react";
import {
  BarChart3, DollarSign, Target, TrendingUp, Loader2,
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

export default function DashboardPage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const d = await fetchDeals();
      setDeals(d);
      setKpis(computeKpis(d));
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
      </div>
    );
  }

  const trend = monthlyTrend(deals);
  const sectors = topBuckets(deals, "sector");
  const countries = topBuckets(deals, "country");
  const buyers = topBuckets(deals, "buyer", 8);
  const types = topBuckets(deals, "deal_type");

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Executive Dashboard
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Real-time pipeline intelligence powered by your imported deal data.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Total Deals"
          value={(kpis?.totalDeals ?? 0).toLocaleString()}
          sublabel="All-time ingested"
          icon={Target}
          iconBg="bg-indigo-50"
          iconColor="text-indigo-600"
        />
        <KpiCard
          label="Total Value"
          value={formatUsdShort(kpis?.totalValueUsd ?? 0)}
          sublabel="Normalized to USD"
          icon={DollarSign}
          iconBg="bg-emerald-50"
          iconColor="text-emerald-600"
        />
        <KpiCard
          label="Active / Live Deals"
          value={(kpis?.liveDeals ?? 0).toLocaleString()}
          sublabel="Announced or in-progress"
          icon={TrendingUp}
          iconBg="bg-purple-50"
          iconColor="text-purple-600"
        />
        <KpiCard
          label="Advisory Wallet"
          value={formatUsdShort(kpis?.advisoryWalletUsd ?? 0)}
          sublabel="≈ 1% of deal value"
          icon={BarChart3}
          iconBg="bg-amber-50"
          iconColor="text-amber-600"
        />
      </div>

      {/* Charts row 1 */}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <MonthlyTrend data={trend} />
        </div>
        <DealTypePie data={types} />
      </div>

      {/* Charts row 2 */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <HorizontalBars
          title="Top Sectors"
          sub="Total deal value by sector ($M)"
          data={sectors}
        />
        <HorizontalBars
          title="Top Countries"
          sub="Geographic concentration ($M)"
          data={countries}
        />
      </div>

      {/* Buyer rankings */}
      <div className="mt-6">
        <HorizontalBars
          title="Top Buyers"
          sub="Most active acquirers by value ($M)"
          data={buyers}
        />
      </div>

      {/* Recent deals */}
      <div className="mt-6">
        <RecentDealsTable deals={deals} />
      </div>
    </div>
  );
}
