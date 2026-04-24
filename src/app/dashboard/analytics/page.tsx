"use client";

import { useEffect, useState } from "react";
import { BarChart3, Loader2 } from "lucide-react";
import { MonthlyTrend, HorizontalBars, DealTypePie } from "@/components/dashboard/Charts";
import { fetchDeals, monthlyTrend, topBuckets, type Deal } from "@/lib/analytics";

export default function AnalyticsPage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setDeals(await fetchDeals());
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return <div className="flex h-96 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-indigo-500" /></div>;
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-900">
          <BarChart3 className="h-5 w-5 text-indigo-500" /> Deep Analytics
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">Full analytical view of your deal universe.</p>
      </div>

      <MonthlyTrend data={monthlyTrend(deals)} />

      <div className="grid gap-6 lg:grid-cols-2">
        <HorizontalBars title="Sectors" sub="By value ($M)" data={topBuckets(deals, "sector", 10)} />
        <HorizontalBars title="Countries" sub="By value ($M)" data={topBuckets(deals, "country", 10)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <HorizontalBars title="Top Buyers" sub="Most active acquirers" data={topBuckets(deals, "buyer", 12)} />
        <DealTypePie data={topBuckets(deals, "deal_type", 8)} />
      </div>
    </div>
  );
}
