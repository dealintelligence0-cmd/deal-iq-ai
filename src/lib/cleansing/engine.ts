
import { normalizeDate } from "./dates";
import { cleanCompany, companyKey } from "./companies";
import { cleanSector } from "./sectors";
import { parseValue } from "./value";

export type RawDeal = {
  id?: string;
  deal_date?: string | null;
  buyer?: string | null;
  target?: string | null;
  sector?: string | null;
  country?: string | null;
  deal_type?: string | null;
  value_raw?: string | null;
  stake_percent?: number | null;
  status?: string | null;
  notes?: string | null;
  source_file?: string | null;
};

export type Exception = {
  field: string;
  severity: "info" | "warn" | "error";
  message: string;
  rawValue?: string | null;
  suggestedValue?: string | null;
};

export type CleansedDeal = {
  cleaned: RawDeal & {
    normalized_value_usd: number | null;
    confidence_score: number;
    data_quality_score: number;
  };
  exceptions: Exception[];
  dedupKey: string;
};

export function cleanseRow(row: RawDeal): CleansedDeal {
  const exc: Exception[] = [];
  const cleaned: CleansedDeal["cleaned"] = {
    ...row,
    normalized_value_usd: null,
    confidence_score: 0,
    data_quality_score: 0,
  };

  // Date
  if (row.deal_date) {
    const iso = normalizeDate(row.deal_date);
    if (iso) cleaned.deal_date = iso;
    else {
      exc.push({ field: "deal_date", severity: "warn", message: "Could not parse date", rawValue: String(row.deal_date) });
      cleaned.deal_date = null;
    }
  } else {
    exc.push({ field: "deal_date", severity: "error", message: "Missing deal date" });
  }

  // Buyer
  const buyer = cleanCompany(row.buyer);
  if (!buyer) {
    exc.push({ field: "buyer", severity: "error", message: "Missing buyer" });
  } else if (buyer !== row.buyer) {
    exc.push({ field: "buyer", severity: "info", message: "Buyer name normalized", rawValue: String(row.buyer), suggestedValue: buyer });
  }
  cleaned.buyer = buyer;

  // Target
  const target = cleanCompany(row.target);
  if (!target) {
    exc.push({ field: "target", severity: "error", message: "Missing target" });
  } else if (target !== row.target) {
    exc.push({ field: "target", severity: "info", message: "Target name normalized", rawValue: String(row.target), suggestedValue: target });
  }
  cleaned.target = target;

  if (buyer && target && companyKey(buyer) === companyKey(target)) {
    exc.push({ field: "target", severity: "warn", message: "Buyer and target appear identical" });
  }

  // Sector
  if (row.sector) {
    const sector = cleanSector(row.sector);
    if (sector && sector !== row.sector) {
      exc.push({ field: "sector", severity: "info", message: "Sector standardized", rawValue: String(row.sector), suggestedValue: sector });
    }
    cleaned.sector = sector;
  }

  // Country
  if (row.country) {
    cleaned.country = String(row.country).trim().replace(/\s+/g, " ") || null;
  }

  // Value
  if (row.value_raw) {
    const v = parseValue(row.value_raw);
    cleaned.normalized_value_usd = v.normalizedUsd;
    cleaned.confidence_score = v.confidence;
    if (v.normalizedUsd === null) {
      exc.push({ field: "value_raw", severity: "warn", message: "Could not parse deal value", rawValue: String(row.value_raw) });
    } else if (v.normalizedUsd > 5e11) {
      exc.push({ field: "value_raw", severity: "warn", message: "Suspiciously large value (>$500B)", rawValue: String(row.value_raw) });
    } else if (v.normalizedUsd < 1e4 && v.normalizedUsd > 0) {
      exc.push({ field: "value_raw", severity: "warn", message: "Suspiciously small value (<$10K)", rawValue: String(row.value_raw) });
    }
  }

  // Stake
  if (row.stake_percent !== null && row.stake_percent !== undefined) {
    let stake = Number(row.stake_percent);
    if (stake > 0 && stake <= 1) stake = stake * 100;
    if (stake < 0 || stake > 100) {
      exc.push({ field: "stake_percent", severity: "warn", message: "Stake outside 0–100", rawValue: String(row.stake_percent) });
      cleaned.stake_percent = null;
    } else {
      cleaned.stake_percent = Math.round(stake * 100) / 100;
    }
  }

  // Status — force into allowed set
  cleaned.status = normalizeStatus(row.status);

  // Data quality score
  const requiredFilled = [cleaned.deal_date, cleaned.buyer, cleaned.target].filter(Boolean).length;
  const optionalFilled = [
    cleaned.sector, cleaned.country, cleaned.deal_type,
    cleaned.normalized_value_usd, cleaned.stake_percent, cleaned.notes,
  ].filter((v) => v !== null && v !== undefined && v !== "").length;
  const errorCount = exc.filter((e) => e.severity === "error").length;
  const dq = (requiredFilled / 3) * 0.6 + (optionalFilled / 6) * 0.4 - errorCount * 0.1;
  cleaned.data_quality_score = Math.max(0, Math.min(1, dq));

  return {
    cleaned,
    exceptions: exc,
    dedupKey: `${companyKey(cleaned.buyer)}|${companyKey(cleaned.target)}|${cleaned.deal_date ?? ""}`,
  };
}

export function cleanseBatch(rows: RawDeal[]): {
  results: CleansedDeal[];
  duplicatesRemoved: number;
  blanksRemoved: number;
} {
  const seen = new Set<string>();
  const results: CleansedDeal[] = [];
  let duplicatesRemoved = 0;
  let blanksRemoved = 0;

  for (const r of rows) {
    const allEmpty = Object.values(r).every(
      (v) => v === null || v === undefined || String(v).trim() === ""
    );
    if (allEmpty) {
      blanksRemoved++;
      continue;
    }
    const res = cleanseRow(r);
    if (res.dedupKey !== "||" && seen.has(res.dedupKey)) {
      duplicatesRemoved++;
      continue;
    }
    seen.add(res.dedupKey);
    results.push(res);
  }

  return { results, duplicatesRemoved, blanksRemoved };
}

function normalizeStatus(raw: unknown): "rumor" | "announced" | "live" | "closed" | "dropped" {
  if (!raw) return "announced";
  const s = String(raw).toLowerCase().trim();
  if (!s) return "announced";
  if (s.includes("close") || s.includes("complet") || s.includes("done")) return "closed";
  if (s.includes("drop") || s.includes("cancel") || s.includes("terminat") || s.includes("fail")) return "dropped";
  if (s.includes("rumor") || s.includes("rumour") || s.includes("specul")) return "rumor";
  if (s.includes("live") || s.includes("progress") || s.includes("pending") || s.includes("ongoing") || s.includes("active")) return "live";
  return "announced";
}
