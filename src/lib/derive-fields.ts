

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
  geographies_involved: string;
  india_flow: string;
  deal_value_inr_range: string;
  deal_value_usd_range: string;
  deal_summary: string;
  stake_status: string;
  priority_score: number;
  advisory_score: number;
  risk_score: number;
  priority_reason: string;
  advisory_reason: string;
  risk_reason: string;
};

function parseCountries(s: string | null): string[] {
  if (!s) return [];
  return s.split(/[,;|/&]/).map((x) => x.trim()).filter(Boolean);
}

function maxNumberFromString(s: string | null): number {
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

function summarize(notes: string | null, buyer: string | null, target: string | null, dealType: string | null): string {
  if (notes && notes.trim()) {
    const words = notes.split(/\s+/).slice(0, 20);
    return words.join(" ") + (notes.split(/\s+/).length > 20 ? "…" : "");
  }
  if (buyer && target) return `${buyer} ${dealType ? dealType.toLowerCase() : "acquires"} ${target}`;
  return "—";
}

function stakeStatus(pct: number | null): string {
  if (pct == null) return "—";
  if (pct >= 90) return "control";
  if (pct >= 50) return "majority";
  return "minority";
}

export function deriveFields(raw: Record<string, unknown>): DerivedFields {
  const country = (raw.country as string | null) ?? null;
  const buyer = (raw.buyer as string | null) ?? null;
  const target = (raw.target as string | null) ?? null;
  const sector = (raw.sector as string | null) ?? null;
  const dealType = (raw.deal_type as string | null) ?? null;
  const stakePct = (raw.stake_percent as number | null) ?? null;
  const usdNorm = (raw.normalized_value_usd as number | null) ?? null;
  const valueRaw = (raw.value_raw as string | null) ?? null;
  const notes = (raw.notes as string | null) ?? null;

  // Countries — extract from country field (could be "India" or "India, USA")
  const allCountries = parseCountries(country);
  const regions = Array.from(new Set(allCountries.map((c) => REGION_MAP[c] || "Other")));
  const geographies_involved = regions.join(", ") || (country ?? "—");

  // India flow logic
  let india_flow = "other";
  const hasIndia = allCountries.some((c) => /india/i.test(c));
  if (hasIndia && allCountries.length === 1) india_flow = "domestic";
  else if (hasIndia && country && /india/i.test(country.split(",")[0])) india_flow = "outbound";
  else if (hasIndia) india_flow = "inbound";

  // Deal value: prefer normalized USD, fallback to parse value_raw
  let usdM = (usdNorm ?? 0) / 1_000_000;
  if (usdM === 0 && valueRaw) {
    const num = maxNumberFromString(valueRaw);
    // value_raw might be "$2.5B" or "$500M" or "₹4500cr" — heuristic
    if (/B|bn|billion/i.test(valueRaw)) usdM = num * 1000;
    else if (/M|mn|million/i.test(valueRaw)) usdM = num;
    else if (/cr|crore/i.test(valueRaw)) usdM = (num * 10) / FX_INR_USD;
    else if (/inr|₹|rs/i.test(valueRaw)) usdM = num / FX_INR_USD;
    else usdM = num;
  }
  const inrM = usdM * FX_INR_USD;

  // Scoring
  const crossBorder = allCountries.length >= 2;

  let prio = 0;
  if (usdM >= 5000) prio += 40; else if (usdM >= 1000) prio += 30; else if (usdM >= 250) prio += 20; else if (usdM >= 50) prio += 10;
  if (crossBorder) prio += 25;
  if (sector && /tech|saas|life|pharma|financial|energy|healthcare/i.test(sector)) prio += 20;
  if (stakePct != null && stakePct >= 50) prio += 15;
  prio = Math.min(100, prio);

  let adv = 0;
  if (usdM >= 1000) adv += 30; else if (usdM >= 250) adv += 20; else adv += 10;
  if (crossBorder) adv += 25;
  if (dealType && /merger|jv|joint/i.test(dealType)) adv += 25;
  if (dealType && /ipo/i.test(dealType)) adv += 20;
  if (stakePct != null && stakePct > 0 && stakePct < 100) adv += 15;
  adv = Math.min(100, adv);

  let risk = 0;
  if (usdM >= 5000) risk += 30; else if (usdM >= 1000) risk += 20; else risk += 10;
  if (crossBorder) risk += 25;
  if (sector && /pharma|life|financial|energy|defence|telecom/i.test(sector)) risk += 25;
  if (dealType && /merger|jv/i.test(dealType)) risk += 20;
  if (stakePct != null && stakePct >= 50 && stakePct < 90) risk += 10;
  risk = Math.min(100, risk);

  return {
    geographies_involved,
    india_flow,
    deal_value_inr_range: inrRange(inrM),
    deal_value_usd_range: usdRange(usdM),
    deal_summary: summarize(notes, buyer, target, dealType),
    stake_status: stakeStatus(stakePct),
    priority_score: prio,
    advisory_score: adv,
    risk_score: risk,
    priority_reason: `Size:${usdM>=1000?"large":usdM>=250?"mid":"small"} · ${crossBorder?"cross-border":"domestic"} · ${sector ?? "no sector"}`,
    advisory_reason: `${dealType ?? "acquisition"} · ${crossBorder?"multi-juris":"single-juris"} · stake ${stakePct ?? "n/a"}%`,
    risk_reason: `${crossBorder?"cross-border":"single-juris"} · ${sector ?? "general"} · ${dealType ?? "deal"}-execution`,
  };
}
