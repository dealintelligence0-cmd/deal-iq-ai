
import { createClient } from "@/lib/supabase/client";

export type Deal = {
  id: string;
  deal_date: string | null;
  buyer: string | null;
  target: string | null;
  sector: string | null;
  country: string | null;
  deal_type: string | null;
  status: string | null;
  normalized_value_usd: number | null;
  stake_percent: number | null;
  value_raw: string | null;
  created_at: string;
};

export type Kpis = {
  totalDeals: number;
  totalValueUsd: number;
  liveDeals: number;
  advisoryWalletUsd: number;
};

export type Bucket = { name: string; value: number; count: number };

export async function fetchDeals(): Promise<Deal[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("deals")
    .select(
      "id,deal_date,buyer,target,sector,country,deal_type,status,normalized_value_usd,stake_percent,value_raw,created_at"
    )
    .order("deal_date", { ascending: false, nullsFirst: false })
    .limit(5000);
  return (data ?? []) as Deal[];
}

export function computeKpis(deals: Deal[]): Kpis {
  const totalValueUsd = deals.reduce(
    (s, d) => s + (d.normalized_value_usd ?? 0),
    0
  );
  const liveDeals = deals.filter(
    (d) => d.status === "live" || d.status === "announced"
  ).length;
  // Advisory wallet = 1% of total deal value (industry-standard estimate)
  const advisoryWalletUsd = totalValueUsd * 0.01;
  return {
    totalDeals: deals.length,
    totalValueUsd,
    liveDeals,
    advisoryWalletUsd,
  };
}

export function monthlyTrend(deals: Deal[]): Array<{
  month: string;
  count: number;
  value: number;
}> {
  const buckets = new Map<string, { count: number; value: number }>();
  for (const d of deals) {
    if (!d.deal_date) continue;
    const key = d.deal_date.slice(0, 7); // YYYY-MM
    const b = buckets.get(key) ?? { count: 0, value: 0 };
    b.count += 1;
    b.value += d.normalized_value_usd ?? 0;
    buckets.set(key, b);
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([k, v]) => ({
      month: new Date(k + "-01").toLocaleDateString(undefined, {
        month: "short",
        year: "2-digit",
      }),
      count: v.count,
      value: Math.round(v.value / 1e6), // value in $M
    }));
}

export function topBuckets(
  deals: Deal[],
  field: "sector" | "country" | "buyer" | "deal_type",
  limit = 6
): Bucket[] {
  const map = new Map<string, { value: number; count: number }>();
  for (const d of deals) {
    const key = (d[field] as string | null) ?? "Unknown";
    const b = map.get(key) ?? { value: 0, count: 0 };
    b.value += d.normalized_value_usd ?? 0;
    b.count += 1;
    map.set(key, b);
  }
  return Array.from(map.entries())
    .sort((a, b) => b[1].value - a[1].value || b[1].count - a[1].count)
    .slice(0, limit)
    .map(([name, v]) => ({ name, value: Math.round(v.value / 1e6), count: v.count }));
}

export function formatUsdShort(v: number): string {
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}
