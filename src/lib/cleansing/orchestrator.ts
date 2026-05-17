

/**
 * Deal IQ AI — Import orchestrator (v3).
 *
 * Single entry point that takes raw uploaded rows and produces ready-to-insert
 * deal rows. Routes by file shape:
 *
 *   - If it's a Mergermarket intelligence feed (Heading + Opportunity + Topics
 *     or Intelligence Type columns), use the v2 feed parser which respects
 *     the structured Bidders/Targets columns and drops digest articles.
 *
 *   - Otherwise, use the legacy column-mapping path (Buyer/Target etc.).
 *
 * The output of this orchestrator is a plain object whose keys are the
 * Supabase `deals` table columns — no more downstream re-processing that
 * could overwrite or contaminate the cleaned values.
 */

import { parseFeedRow, isIntelligenceFeed, type FeedParseResult } from "./feed-parser-v2";
import { cleanCompany, cleanCompanyList } from "./companies";
import { cleanSector } from "./sectors";
import { normalizeDate } from "./dates";

export type ImportedDeal = {
  // CORE FIELDS — should match the Supabase `deals` table column names
  deal_date: string | null;
  heading: string | null;
  buyer: string | null;
  target: string | null;
  sector: string | null;
  country: string | null;
  deal_type: string | null;
  value_raw: string | null;
  stake_percent: number | null;
  status: string;
  notes: string | null;
  source_file: string;

  // INTELLIGENCE-FEED EXTRAS (added by v2 parser; nullable for non-feed sources)
  parse_confidence: number | null;
  parse_path: string | null;
  is_digest: boolean;
  needs_review: boolean;
  deal_value_usd_m: number | null;
  size_bucket: string | null;
  vendor: string | null;
  intelligence_type: string | null;

  // For dedup
  dedup_key: string;
};

function companyKey(name: string | null): string {
  if (!name) return "";
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Main import function. Takes raw rows from upload, produces structured deal
 * rows ready to insert into Supabase.
 *
 * Returns:
 *   - kept: rows that became real deals
 *   - dropped: rows that were skipped (digests) with reasons for audit
 *   - feed_mode: whether the orchestrator routed through the v2 feed parser
 */
export function ingestRows(
  rows: Record<string, unknown>[],
  sourceFile: string,
): {
  kept: ImportedDeal[];
  dropped: Array<{ heading: string; reason: string }>;
  feed_mode: boolean;
} {
  if (rows.length === 0) return { kept: [], dropped: [], feed_mode: false };

  const isFeed = isIntelligenceFeed(rows[0]);

  if (!isFeed) {
    // Legacy column-mapping mode for non-feed CSVs
    return ingestLegacy(rows, sourceFile);
  }

  // Intelligence-feed mode
  const kept: ImportedDeal[] = [];
  const dropped: Array<{ heading: string; reason: string }> = [];

  for (const r of rows) {
    const parsed = parseFeedRow(r);
    if (parsed.drop_row) {
      dropped.push({ heading: parsed.heading, reason: parsed.notes.join("; ") || "Skipped" });
      continue;
    }
    kept.push(feedResultToDeal(parsed, r, sourceFile));
  }

  // Dedupe within this batch
  const seen = new Set<string>();
  const deduped: ImportedDeal[] = [];
  for (const d of kept) {
    if (seen.has(d.dedup_key)) continue;
    seen.add(d.dedup_key);
    deduped.push(d);
  }

  return { kept: deduped, dropped, feed_mode: true };
}

function feedResultToDeal(
  p: FeedParseResult,
  rawRow: Record<string, unknown>,
  sourceFile: string,
): ImportedDeal {
  // Pull the deal date from any common column
  let dealDate: string | null = null;
  for (const k of Object.keys(rawRow)) {
    if (/^date$/i.test(k.trim()) || /announce.*date/i.test(k) || /close.*date/i.test(k)) {
      const v = rawRow[k];
      if (v) {
        const iso = normalizeDate(String(v));
        if (iso) { dealDate = iso; break; }
      }
    }
  }

  const sector = p.sector ? (cleanSector(p.sector) ?? p.sector) : null;

  return {
    deal_date: dealDate,
    heading: p.heading || null,
    buyer: p.buyer,
    target: p.target,
    sector,
    country: p.country,
    deal_type: p.deal_type,
    value_raw: p.deal_value_raw,
    stake_percent: p.stake_percent,
    status: p.status,
    notes: p.opportunity,
    source_file: sourceFile,

    parse_confidence: p.confidence,
    parse_path: p.parse_path,
    is_digest: p.is_digest,
    needs_review: p.needs_review,
    deal_value_usd_m: p.deal_value_usd_m,
    size_bucket: p.size_bucket,
    vendor: p.vendor,
    intelligence_type: p.intelligence_type,

    dedup_key: `${companyKey(p.buyer)}|${companyKey(p.target)}|${dealDate ?? ""}|${p.heading.slice(0, 50)}`,
  };
}

/**
 * Legacy column-mapping ingest for non-feed CSVs. This is the older flow
 * preserved for backward compatibility with CSVs that have explicit
 * Buyer/Target columns.
 */
function ingestLegacy(
  rows: Record<string, unknown>[],
  sourceFile: string,
): { kept: ImportedDeal[]; dropped: Array<{ heading: string; reason: string }>; feed_mode: boolean } {
  const kept: ImportedDeal[] = [];
  const dropped: Array<{ heading: string; reason: string }> = [];

  // Heuristic: look for common buyer/target column names
  const headerLookup = new Map<string, string>();
  for (const k of Object.keys(rows[0])) headerLookup.set(k.toLowerCase().trim(), k);

  const find = (...names: string[]): string | null => {
    for (const n of names) {
      const key = headerLookup.get(n.toLowerCase());
      if (key) return key;
    }
    return null;
  };

  const colBuyer = find("buyer", "bidders", "acquirer");
  const colTarget = find("target", "targets", "company", "acquired");
  const colDate = find("date", "deal date", "announcement date");
  const colSector = find("sector", "industry", "dominant sector");
  const colCountry = find("country", "geography", "dominant geography", "region");
  const colType = find("deal type", "type", "intelligence type");
  const colValue = find("value", "deal value", "intelligence size");
  const colStake = find("stake", "stake %", "stake value");
  const colStatus = find("status", "stage", "intelligence grade");
  const colNotes = find("notes", "description", "opportunity");
  const colHeading = find("heading", "headline", "title");

  for (const r of rows) {
    const getStr = (col: string | null): string | null => {
      if (!col) return null;
      const v = r[col];
      if (v === null || v === undefined) return null;
      const s = String(v).trim();
      return s || null;
    };

    const heading = getStr(colHeading);
    const buyer = cleanCompanyList(getStr(colBuyer));
    const target = cleanCompany(getStr(colTarget));

    if (!buyer && !target) {
      dropped.push({ heading: heading ?? "(no heading)", reason: "Missing buyer and target" });
      continue;
    }

    const dealDate = normalizeDate(getStr(colDate) ?? "") ?? null;
    const stakeRaw = getStr(colStake);
    const stake = stakeRaw ? parseFloat(stakeRaw.replace(/[^\d.]/g, "")) : null;
    const sector = getStr(colSector);

    kept.push({
      deal_date: dealDate,
      heading,
      buyer,
      target,
      sector: sector ? (cleanSector(sector) ?? sector) : null,
      country: getStr(colCountry),
      deal_type: getStr(colType),
      value_raw: getStr(colValue),
      stake_percent: stake !== null && isFinite(stake) ? stake : null,
      status: (getStr(colStatus) ?? "announced").toLowerCase(),
      notes: getStr(colNotes),
      source_file: sourceFile,
      parse_confidence: 0.9,    // legacy CSVs with explicit columns are trusted
      parse_path: "legacy_column_map",
      is_digest: false,
      needs_review: false,
      deal_value_usd_m: null,
      size_bucket: null,
      vendor: null,
      intelligence_type: getStr(colType),
      dedup_key: `${companyKey(buyer)}|${companyKey(target)}|${dealDate ?? ""}|${(heading ?? "").slice(0, 50)}`,
    });
  }

  // Dedupe
  const seen = new Set<string>();
  const deduped: ImportedDeal[] = [];
  for (const d of kept) {
    if (seen.has(d.dedup_key)) continue;
    seen.add(d.dedup_key);
    deduped.push(d);
  }

  return { kept: deduped, dropped, feed_mode: false };
}
