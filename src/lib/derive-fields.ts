

const FX_INR_USD = 83;

const REGION_MAP: Record<string, string> = {
  India: "APAC", USA: "North America", "United States": "North America",
  Germany: "EU", UK: "EU", "United Kingdom": "EU", France: "EU",
  Italy: "EU", Spain: "EU", Netherlands: "EU",
  UAE: "MEA", "Saudi Arabia": "MEA", Egypt: "MEA",
  China: "APAC", Japan: "APAC", Singapore: "APAC", Australia: "APAC", Indonesia: "APAC",
  Brazil: "LatAm", Mexico: "LatAm", Canada: "North America",
};

export type DerivedFields = {
  buyer: string | null; target: string | null; sector: string | null; country: string | null;
  geographies_involved: string; india_flow: string;
  deal_value_inr_range: string; deal_value_usd_range: string;
  deal_type: string; deal_summary: string;
  stake_percent: number | null; stake_status: string;
  priority_score: number; advisory_score: number; risk_score: number;
  priority_reason: string; advisory_reason: string; risk_reason: string;
};

function pick(...vals: (string | null | undefined)[]): string | null {
  for (const v of vals) if (v && String(v).trim()) return String(v).trim();
  return null;
}

function parseCountries(geography: string | null): string[] {
  if (!geography) return [];
  return geography.split(/[,;|/]/).map((s) => s.trim()).filter(Boolean);
}

function maxNumber(s: string | null): number {
  if (!s) return 0;
  const matches = String(s).match(/[\d,]+\.?\d*/g);
  if (!matches) return 0;
  return Math.max(...matches.map((m) => parseFloat(m.replace(/,/g, ""))).filter((n) => !isNaN(n)));
}

function inrRange(inrM: number): string {
  if (inrM <= 0) return "—";
  if (inrM < 1000) return "<₹1bn";
  if (inrM < 5000) return "₹1-5bn";
  if (inrM < 10000) return "₹5-10bn";
  if (inrM < 50000) return "₹10-50bn";
  if (inrM < 100000) return "₹50-100bn";
  return ">₹100bn";
}

function usdRange(usdM: number): string {
  if (usdM <= 0) return "—";
  if (usdM < 50) return "<$50M";
  if (usdM < 250) return "$50-250M";
  if (usdM < 500) return "$250-500M";
  if (usdM < 1000) return "$500M-1B";
  if (usdM < 5000) return "$1-5B";
  if (usdM < 10000) return "$5-10B";
  return ">$10B";
}

function dealTypeFrom(intelType: string | null, heading: string | null): string {
  const blob = `${intelType ?? ""} ${heading ?? ""}`.toLowerCase();
  if (/\bipo\b|listing/.test(blob)) return "IPO";
  if (/joint venture|\bjv\b/.test(blob)) return "JV";
  if (/merger|merge/.test(blob)) return "Merger";
  if (/strategic|partner/.test(blob)) return "Strategic";
  if (/minority|stake.*[1-4]\d%/.test(blob)) return "Minority";
  if (/acquir|takeover|buyout/.test(blob)) return "Acquisition";
  return "Acquisition";
}

function summarize(heading: string | null, opportunity: string | null): string {
  const text = [heading, opportunity].filter(Boolean).join(" — ");
  if (!text) return "—";
  const words = text.split(/\s+/).slice(0, 20);
  return words.join(" ") + (text.split(/\s+/).length > 20 ? "…" : "");
}

function stakeStatus(pct: number | null): string {
  if (pct == null) return "—";
  if (pct >= 90) return "control";
  if (pct >= 50) return "majority";
  return "minority";
}

function score(usdM: number, countries: string[], sector: string | null, dealType: string, stake: number | null) {
  const crossBorder = countries.length >= 2;
  let prio = 0;
  if (usdM >= 5000) prio += 40; else if (usdM >= 1000) prio += 30; else if (usdM >= 250) prio += 20; else if (usdM >= 50) prio += 10;
  if (crossBorder) prio += 25;
  if (sector && /tech|saas|life|pharma|financial|energy/i.test(sector)) prio += 20;
  if (stake != null && stake >= 50) prio += 15;
  prio = Math.min(100, prio);

  let adv = 0;
  if (usdM >= 1000) adv += 30; else if (usdM >= 250) adv += 20; else adv += 10;
  if (crossBorder) adv += 25;
  if (dealType === "Merger" || dealType === "JV") adv += 25;
  if (dealType === "IPO") adv += 20;
  if (stake != null && stake > 0 && stake < 100) adv += 15;
  adv = Math.min(100, adv);

  let risk = 0;
  if (usdM >= 5000) risk += 30; else if (usdM >= 1000) risk += 20; else risk += 10;
  if (crossBorder) risk += 25;
  if (sector && /pharma|life|financial|energy|defence|telecom/i.test(sector)) risk += 25;
  if (dealType === "Merger" || dealType === "JV") risk += 20;
  if (stake != null && stake >= 50 && stake < 90) risk += 10;
  risk = Math.min(100, risk);

  return {
    priority_score: prio, advisory_score: adv, risk_score: risk,
    priority_reason: `Size:${usdM>=1000?"large":usdM>=250?"mid":"small"} · ${crossBorder?"cross-border":"domestic"} · ${sector?"hot sector":"general"}`,
    advisory_reason: `${dealType} · ${crossBorder?"multi-juris":"single-juris"} · stake-${stake ?? "n/a"}%`,
    risk_reason: `${crossBorder?"cross-border":"single-juris"} · ${sector?"regulated":"general"} · ${dealType}-execution`,
  };
}

export function deriveFields(raw: Record<string, unknown>): DerivedFields {
  const buyer = pick(raw.bidders as string, raw.issuers as string, raw.buyer as string);
  const target = pick(raw.targets as string, raw.vendors as string, raw.target as string);
  const sector = pick(raw.dominant_sector as string, raw.sectors as string, raw.sector as string);

  const geography = pick(raw.geography as string, raw.dominant_geography as string, raw.country as string);
  const allCountries = parseCountries(geography);
  const country = (raw.dominant_geography as string) || allCountries[0] || null;

  const regions = Array.from(new Set(allCountries.map((c) => REGION_MAP[c] || "Other")));
  const geographies_involved = regions.join(", ") || "—";

  let india_flow = "other";
  const hasIndia = allCountries.some((c) => /india/i.test(c));
  if (hasIndia && allCountries.length === 1) india_flow = "domestic";
  else if (hasIndia && country && /india/i.test(country)) india_flow = "outbound";
  else if (hasIndia) india_flow = "inbound";

  const inrM = Math.max(maxNumber(raw.intelligence_size as string), maxNumber(raw.value_inr_m as string));
  const usdM = inrM / FX_INR_USD;

  const deal_type = dealTypeFrom(raw.intelligence_type as string, raw.heading as string);
  const deal_summary = summarize(raw.heading as string, raw.opportunity as string);

  const stakeRaw = raw.stake_value || raw.stake_percent;
  const stake_percent = stakeRaw ? maxNumber(String(stakeRaw)) : null;

  const scores = score(usdM, allCountries, sector, deal_type, stake_percent);

  return {
    buyer, target, sector, country,
    geographies_involved, india_flow,
    deal_value_inr_range: inrRange(inrM),
    deal_value_usd_range: usdRange(usdM),
    deal_type, deal_summary,
    stake_percent, stake_status: stakeStatus(stake_percent),
    ...scores,
  };
}
