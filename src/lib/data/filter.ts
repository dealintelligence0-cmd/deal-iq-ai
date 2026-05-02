

export type DealFilter = {
  dealTypes?: string[];
  countries?: string[];
  indiaFlows?: string[];
  sectors?: string[];
  stakeStatuses?: string[];
  minUsdM?: number;
  maxUsdM?: number;
  minInrBn?: number;
  maxInrBn?: number;
  fromDate?: string;
  toDate?: string;
};

const parseUsdM = (s?: string | null) => {
  const m = (s ?? "").match(/\$(\d+(?:\.\d+)?)\s*-/);
  return m ? Number(m[1]) : null;
};
const parseInrBn = (s?: string | null) => {
  const m = (s ?? "").match(/INR\s*(\d+(?:\.\d+)?)\s*-/i);
  return m ? Number(m[1]) : null;
};

export function applyDealFilters<T extends { deal_type?: string | null; country?: string | null; india_flow?: string | null; sector?: string | null; stake_status?: string | null; deal_value_usd_range?: string | null; deal_value_inr_range?: string | null; date?: string | null }>(rows: T[], f: DealFilter) {
  return rows.filter((r) => {
    if (f.dealTypes?.length && !f.dealTypes.includes(String(r.deal_type ?? ""))) return false;
    if (f.countries?.length && !f.countries.includes(String(r.country ?? ""))) return false;
    if (f.indiaFlows?.length && !f.indiaFlows.includes(String(r.india_flow ?? ""))) return false;
    if (f.sectors?.length && !f.sectors.includes(String(r.sector ?? ""))) return false;
    if (f.stakeStatuses?.length && !f.stakeStatuses.includes(String(r.stake_status ?? ""))) return false;
    const usd = parseUsdM(r.deal_value_usd_range);
    const inr = parseInrBn(r.deal_value_inr_range);
    if (f.minUsdM !== undefined && (usd ?? 0) < f.minUsdM) return false;
    if (f.maxUsdM !== undefined && (usd ?? 0) > f.maxUsdM) return false;
    if (f.minInrBn !== undefined && (inr ?? 0) < f.minInrBn) return false;
    if (f.maxInrBn !== undefined && (inr ?? 0) > f.maxInrBn) return false;
    if (f.fromDate && String(r.date ?? "") < f.fromDate) return false;
    if (f.toDate && String(r.date ?? "") > f.toDate) return false;
    return true;
  });
}
