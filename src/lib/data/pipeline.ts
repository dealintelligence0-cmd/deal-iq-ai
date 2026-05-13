

import { cleanCompany, cleanCompanyList, companyKey } from "@/lib/cleansing/companies";
import { normalizeDate } from "@/lib/cleansing/dates";
import { cleanSector } from "@/lib/cleansing/sectors";

export type SourceRow = {
  "Opportunity ID"?: string;
  "Date"?: string;
  "Value INR(m)"?: string;
  "Value Description"?: string;
  "Heading"?: string;
  "Opportunity"?: string;
  "Source"?: string;
  "Intelligence Type"?: string;
  "Intelligence Grade"?: string;
  "Intelligence Size"?: string;
  "Stake Value"?: string;
  "Dominant Sector"?: string;
  "Sectors"?: string;
  "Dominant Geography"?: string;
  "Geography"?: string;
  "Targets"?: string;
  "Bidders"?: string;
  "Vendors"?: string;
  "Issuers"?: string;
};

export type NormalizedDealRecord = {
  date: string | null;
  buyer: string | null;
  target: string | null;
  sector: string | null;
  country: string;
  geographies_involved: string;
  deal_value_inr_range: string | null;
  deal_value_usd_range: string | null;
  deal_type: "IPO" | "Acquisition" | "Merger" | "JV" | "Minority" | "Strategic";
  deal_summary: string;
  india_flow: "domestic" | "outbound" | "inbound" | "other";
  stake_value: number | null;
  stake_status: "minority" | "majority" | "control" | "unknown";
  priority_score: number;
  advisory_score: number;
  risk_score: number;
  priority_reason: string;
  advisory_reason: string;
  risk_reason: string;
  score_breakdown: string;
  deal_takeaway: string;
  targeting_recommendation: "HIGH" | "MEDIUM" | "LOW";
  targeting_reason: string;
  confidence_level: "high" | "medium" | "low";
  dedup_key: string;
  heading: string | null;
};

const FX = 83;
const COUNTRY_REGION: Record<string, "APAC" | "EU" | "MEA" | "North America" | "LATAM"> = {
  India: "APAC", China: "APAC", Japan: "APAC", Singapore: "APAC", Australia: "APAC", UAE: "MEA", Saudi: "MEA", UK: "EU", Germany: "EU", France: "EU", Spain: "EU", Italy: "EU", US: "North America", USA: "North America", Canada: "North America", Mexico: "LATAM", Brazil: "LATAM",
};

const countryTokens = Object.keys(COUNTRY_REGION);

const first = (...v: Array<string | undefined>) => (v.find((x) => (x ?? "").trim()) ?? "").trim();
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

function parseStake(raw: string): number | null {
  const m = raw.match(/(\d+(?:\.\d+)?)\s*%?/);
  return m ? Number(m[1]) : null;
}

function parseInrRange(intelligenceSize: string, valueInrM: string): { minBn: number; maxBn: number } | null {
  const nums = (intelligenceSize.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
  if (nums.length >= 2) return { minBn: Math.min(nums[0], nums[1]), maxBn: Math.max(nums[0], nums[1]) };
  if (nums.length === 1) return { minBn: nums[0], maxBn: nums[0] };
  const v = Number((valueInrM || "").replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(v) || v <= 0) return null;
  const bn = v / 1000;
  return { minBn: bn, maxBn: bn };
}

function classifyDealType(type: string, heading: string, opp: string): NormalizedDealRecord["deal_type"] {
  const s = `${type} ${heading} ${opp}`.toLowerCase();
  if (/ipo|listing/.test(s)) return "IPO";
  if (/joint venture|\bjv\b/.test(s)) return "JV";
  if (/merger|combine/.test(s)) return "Merger";
  if (/minority|growth equity/.test(s)) return "Minority";
  if (/acqui|buyout|takeover/.test(s)) return "Acquisition";
  return "Strategic";
}

function extractCountries(text: string): string[] {
  const found: string[] = [];
  for (const c of countryTokens) if (new RegExp(`\\b${c}\\b`, "i").test(text)) found.push(c === "USA" ? "US" : c);
  return [...new Set(found)];
}

function dominantCountry(dominant: string, extracted: string[]): string {
  if (extracted.includes("India")) return "India";
  if (dominant && countryTokens.includes(dominant)) return dominant === "USA" ? "US" : dominant;
  return extracted[0] ?? "Unknown";
}

function indiaFlow(country: string, countries: string[]): NormalizedDealRecord["india_flow"] {
  const hasIndia = countries.includes("India") || country === "India";
  if (country === "India" && hasIndia && countries.length <= 1) return "domestic";
  if (country === "India" && countries.some((c) => c !== "India")) return "outbound";
  if (country !== "India" && hasIndia) return "inbound";
  return "other";
}

function oneLineSummary(buyer: string, target: string, sector: string, country: string, type: string): string {
  const s = `${buyer} ${type === "Merger" ? "merges with" : "targets"} ${target} in ${sector} to expand in ${country}`;
  return s.split(/\s+/).slice(0, 20).join(" ");
}

export function normalizeSourceRow(row: SourceRow): NormalizedDealRecord {
  const buyer = cleanCompanyList(first(row["Bidders"], row["Issuers"])) ?? "Unknown Buyer";
  const target = cleanCompany(first(row["Targets"], row["Vendors"])) ?? "Unknown Target";
  const sector = cleanSector(first(row["Dominant Sector"], row["Sectors"])) ?? "General";
  const date = normalizeDate(first(row["Date"])) ?? null;
  const stake = parseStake(first(row["Stake Value"]));
  const stake_status = stake == null ? "unknown" : stake < 50 ? "minority" : stake < 90 ? "majority" : "control";

  const range = parseInrRange(first(row["Intelligence Size"]), first(row["Value INR(m)"]));
  const inrRange = range ? `INR ${range.minBn.toFixed(range.minBn < 10 ? 1 : 0)}-${range.maxBn.toFixed(range.maxBn < 10 ? 1 : 0)}Bn` : null;
  const usdRange = range ? `$${Math.round((range.minBn * 1000) / FX)}-${Math.round((range.maxBn * 1000) / FX)}M` : null;

  const extracted = extractCountries(first(row["Geography"]));
  const country = dominantCountry(first(row["Dominant Geography"]), extracted);
  const regions = [...new Set(extracted.map((c) => COUNTRY_REGION[c]).filter(Boolean))] as string[];
  const geographies_involved = regions.join(", ") || (COUNTRY_REGION[country] ?? "");
  const flow = indiaFlow(country, extracted);

  const deal_type = classifyDealType(first(row["Intelligence Type"]), first(row["Heading"]), first(row["Opportunity"]));
  const deal_summary = oneLineSummary(buyer, target, sector, country, deal_type);

  const sizeScore = range ? clamp(range.maxBn * 4, 0, 35) : 10;
  const crossBorder = extracted.length > 1 ? 20 : 8;
  const classScore = deal_type === "Acquisition" || deal_type === "Merger" ? 20 : 12;
  const priority_score = Math.round(clamp(sizeScore + crossBorder + classScore + (flow !== "other" ? 15 : 8), 0, 100));
  const advisory_score = Math.round(clamp((deal_type === "JV" ? 65 : 55) + (flow !== "other" ? 15 : 5) + (stake_status === "control" ? 10 : 0), 0, 100));
  const risk_score = Math.round(clamp((flow !== "domestic" ? 30 : 15) + (deal_type === "Merger" ? 25 : 12) + (stake_status === "control" ? 10 : 20), 0, 100));
  const priority_reason = `Size ${range ? range.maxBn.toFixed(1)+"Bn INR" : "unknown"}, ${extracted.length > 1 ? "cross-border" : "single-country"}, ${deal_type} profile.`;
  const advisory_reason = `Flow ${flow}, stake ${stake_status}, ${deal_type} complexity informs advisory demand.`;
  const risk_reason = `Risk driven by ${flow !== "domestic" ? "cross-border exposure" : "domestic concentration"}, ${deal_type} execution, and ${stake_status} ownership.`;
  const score_breakdown = `priority(size=${Math.round(sizeScore)}, crossborder=${crossBorder}, type=${classScore}) advisory(flow=${flow}) risk(type=${deal_type}, stake=${stake_status})`;
  const deal_takeaway = `${deal_summary}. Target via ${deal_type} advisory angle with focus on ${flow} execution and regulatory planning.`;
  const targeting_recommendation = priority_score >= 75 ? "HIGH" : priority_score >= 55 ? "MEDIUM" : "LOW";
  const targeting_reason = targeting_recommendation === "HIGH" ? "High strategic relevance and advisory wallet." : targeting_recommendation === "MEDIUM" ? "Solid opportunity with selective pursuit." : "Low immediate payoff versus complexity.";
  const confidence_level = !date || buyer.includes("Unknown") || target.includes("Unknown") ? "low" : extracted.length === 0 ? "medium" : "high";

  const heading = first(row["Heading"]) || null;
  return { date, buyer, target, sector, country, geographies_involved, deal_value_inr_range: inrRange, deal_value_usd_range: usdRange, deal_type, deal_summary, india_flow: flow, stake_value: stake, stake_status, priority_score, advisory_score, risk_score, priority_reason, advisory_reason, risk_reason, score_breakdown, deal_takeaway, targeting_recommendation, targeting_reason, confidence_level, heading, dedup_key: `${companyKey(buyer)}|${companyKey(target)}|${date ?? ""}` };
  
}

export function dedupeAgainstRecent(rows: NormalizedDealRecord[], existing: Array<{ buyer: string | null; target: string | null; date: string | null }>): NormalizedDealRecord[] {
  const keys = new Set(existing.map((e) => `${companyKey(e.buyer)}|${companyKey(e.target)}|${e.date ?? ""}`));
  return rows.filter((r) => !keys.has(r.dedup_key));
}
