

/**
 * Deal IQ AI — Ingestion v2 — case-insensitive Mergermarket column lookup
 * + raw-row normalisation that strips silly whitespace without modifying
 * the underlying values (the raw row is also persisted verbatim).
 */

import { type RawRow, FEED_COLUMNS } from "./types";

/**
 * Build a lowercase-key lookup map ONCE per row so callers can do
 * O(1) header lookups without recomputing toLowerCase().
 */
function indexRow(row: RawRow): Map<string, string> {
  const m = new Map<string, string>();
  for (const k of Object.keys(row)) m.set(k.toLowerCase().trim(), k);
  return m;
}

/**
 * Read the first non-empty value from any candidate column name.
 * Returns trimmed string or null.
 */
export function readCol(row: RawRow, candidates: readonly string[]): string | null {
  const idx = indexRow(row);
  for (const c of candidates) {
    const k = idx.get(c.toLowerCase().trim());
    if (!k) continue;
    const v = row[k];
    if (v === null || v === undefined) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return null;
}

/** Convenience accessors keyed by the canonical FEED_COLUMNS groups. */
export function readMergermarket(row: RawRow) {
  return {
    heading:     readCol(row, FEED_COLUMNS.HEADING),
    opportunity: readCol(row, FEED_COLUMNS.OPPORTUNITY),
    bidders:     readCol(row, FEED_COLUMNS.BIDDERS),
    targets:     readCol(row, FEED_COLUMNS.TARGETS),
    vendors:     readCol(row, FEED_COLUMNS.VENDORS),
    issuers:     readCol(row, FEED_COLUMNS.ISSUERS),
    intel_type:  readCol(row, FEED_COLUMNS.INTEL_TYPE),
    intel_size:  readCol(row, FEED_COLUMNS.INTEL_SIZE),
    intel_grade: readCol(row, FEED_COLUMNS.INTEL_GRADE),
    stake:       readCol(row, FEED_COLUMNS.STAKE_VALUE),
    sector:      readCol(row, FEED_COLUMNS.SECTOR),
    geography:   readCol(row, FEED_COLUMNS.GEOGRAPHY),
    topics:      readCol(row, FEED_COLUMNS.TOPICS),
    date:        readCol(row, FEED_COLUMNS.DATE),
    value_inr:   readCol(row, FEED_COLUMNS.VALUE_INR),
    value_desc:  readCol(row, FEED_COLUMNS.VALUE_DESC),
  };
}

/** Is this row from a Mergermarket-style intelligence feed? */
export function isMergermarketFeed(row: RawRow): boolean {
  const idx = indexRow(row);
  const hasHeading = idx.has("heading") || idx.has("headline");
  const hasOpp     = idx.has("opportunity");
  const hasIntel   = idx.has("intelligence type") || idx.has("intelligence grade") || idx.has("topics");
  return hasHeading && (hasOpp || hasIntel);
}
