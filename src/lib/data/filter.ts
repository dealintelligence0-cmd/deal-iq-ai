

export type DealFilter = {
  minUsd?: number;
  maxUsd?: number;
  minInr?: number;
  maxInr?: number;
  sectors?: string[];
  geographies?: string[];
  dealTypes?: string[];
  fromDate?: string;
  toDate?: string;
};

export function applyDealFilters<T extends { normalized_value_usd?: number | null; normalized_value_inr?: number | null; sector?: string | null; geography?: string | null; country?: string | null; deal_type?: string | null; deal_date?: string | null }>(rows: T[], f: DealFilter) {
  return rows.filter((r) => {
    if (f.minUsd !== undefined && (r.normalized_value_usd ?? 0) < f.minUsd) return false;
    if (f.maxUsd !== undefined && (r.normalized_value_usd ?? 0) > f.maxUsd) return false;
    if (f.minInr !== undefined && (r.normalized_value_inr ?? 0) < f.minInr) return false;
    if (f.maxInr !== undefined && (r.normalized_value_inr ?? 0) > f.maxInr) return false;
    if (f.sectors?.length && !f.sectors.includes(String(r.sector ?? ""))) return false;
    const geo = String(r.geography ?? r.country ?? "");
    if (f.geographies?.length && !f.geographies.includes(geo)) return false;
    if (f.dealTypes?.length && !f.dealTypes.includes(String(r.deal_type ?? ""))) return false;
    if (f.fromDate && String(r.deal_date ?? "") < f.fromDate) return false;
    if (f.toDate && String(r.deal_date ?? "") > f.toDate) return false;
    return true;
  });
}
