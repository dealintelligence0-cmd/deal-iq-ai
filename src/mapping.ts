

export type StandardField =
  | "deal_date"
  | "buyer"
  | "target"
  | "sector"
  | "country"
  | "deal_type"
  | "value_raw"
  | "stake_percent"
  | "status"
  | "notes"
  | "heading";

export type FieldMapping = Record<StandardField, string | null>;

export type FieldDef = {
  key: StandardField;
  label: string;
  required: boolean;
  aliases: string[];
};

export const FIELD_DEFS: FieldDef[] = [
  {
    key: "deal_date",
    label: "Deal Date",
    required: true,
    aliases: [
      "date", "deal date", "announcement date", "announced", "transaction date",
      "close date", "closing date", "effective date", "signing date", "dt",
    ],
  },
 {
    key: "buyer",
    label: "Buyer / Acquirer",
    required: true,
    aliases: [
      "buyer", "acquirer", "acquiror", "purchaser", "bidder", "bidders", "investor",
      "investors", "acquiring company", "buyer name", "acquirer name", "parent",
      "acquirers", "purchasers",
    ],
  },
  {
    key: "target",
    label: "Target / Seller",
    required: true,
    aliases: [
      "target", "targets", "seller", "sellers", "seller target", "company", "target company",
      "target name", "acquired", "acquired company", "asset", "assets", "deal target",
      "vendor", "vendors", "issuer", "issuers",
    ],
  },
  {
    key: "sector",
    label: "Sector / Industry",
    required: false,
    aliases: [
      "sector", "primary sector", "dominant sector", "industry", "vertical",
      "gics sector", "industry group", "sub sector", "sectors", "segment", "business",
    ],
  },
  {
    key: "country",
    label: "Country / Geography",
    required: false,
   aliases: [
      "country", "geography", "geographies", "dominant geography", "region",
      "regions", "nation", "location", "target country", "country of target",
      "hq", "headquarters",
    ],
  },
  {
    key: "deal_type",
    label: "Deal Type",
    required: false,
    aliases: [
      "deal type", "transaction type", "type", "structure", "deal structure",
      "category", "deal category", "intelligence type",
    ],
  },
  {
    key: "value_raw",
    label: "Deal Value",
    required: false,
    aliases: [
      "value", "deal value", "transaction value", "ev", "enterprise value",
      "consideration", "price", "amount", "deal size", "size",
      "value (usd m)", "value usd", "value_usd", "value inr",
      "value display", "value mid", "intelligence size",
    ],
  },
  {
    key: "stake_percent",
    label: "Stake %",
    required: false,
  aliases: [
      "stake", "stake %", "stake percent", "% stake", "acquired stake",
      "ownership", "ownership %", "% acquired", "holding",
      "stake numeric", "stake display", "stake value",
    ],
  },
  {
    key: "status",
    label: "Status",
    required: false,
    aliases: [
      "status", "deal status", "stage", "completion status",
      "transaction status", "state", "intelligence grade",
    ],
  },
  {
    key: "notes",
    label: "Notes / Description",
    required: false,
    aliases: [
      "notes", "description", "comments", "remarks",
      "opportunity", "deal opportunity", "deal context", "context",
      "intelligence", "background",
    ],
  },
  {
    key: "heading",
    label: "Heading",
    required: false,
    aliases: [
      "heading", "headline", "title", "deal heading", "opportunity heading",
    ],
  },
];

function norm(s: string): string {
  return s.toLowerCase().replace(/[_\-\s]+/g, " ").replace(/[^a-z0-9 %]/g, "").trim();
}

/** Auto-map source headers → standard fields. Returns best guess per field. */
export function autoMap(headers: string[]): FieldMapping {
  const normalized = headers.map((h) => ({ original: h, norm: norm(h) }));
  const out: FieldMapping = {
    deal_date: null, buyer: null, target: null, sector: null, country: null,
    deal_type: null, value_raw: null, stake_percent: null, status: null, notes: null, heading: null,
  };

  for (const def of FIELD_DEFS) {
    let best: { header: string; score: number } | null = null;
    for (const h of normalized) {
      if (!h.norm) continue;
      let score = 0;
      for (const alias of def.aliases) {
        const a = norm(alias);
        if (h.norm === a) { score = Math.max(score, 100); }
        else if (def.key !== "heading" && (h.norm.includes(a) || a.includes(h.norm))) {
          score = Math.max(score, 70 + Math.min(a.length, h.norm.length));
        }
      }
      if (score > 0 && (!best || score > best.score)) {
        best = { header: h.original, score };
      }
    }
    if (best) out[def.key] = best.header;
  }
  return out;
}

/** Apply a mapping to source rows, producing standardized deal rows. */
function getExactHeaderValue(row: Record<string, unknown>, wanted: string): unknown {
  const match = Object.keys(row).find((key) => norm(key) === norm(wanted));
  return match ? row[match] : null;
}

/** Apply a mapping to source rows, producing standardized deal rows. */
import { isIntelligenceFeedRow, parseIntelligenceRow } from "./cleansing/intelligence-feed";

export function applyMapping(
  rows: Record<string, unknown>[],
  mapping: FieldMapping,
  sourceFile: string
): Record<string, unknown>[] {
  // Detect Mergermarket-style intelligence-feed shape by inspecting the first
  // non-empty row's headers. If the source has Heading + Opportunity + Intelligence
  // Type / Source columns, we switch into intelligence-feed mode and extract
  // buyer / target / value from the Heading prose rather than from a structured
  // bidder/target column (which typically doesn't exist in these feeds).
  const intelMode = rows.length > 0 && isIntelligenceFeedRow(rows[0]);

  return rows.map((r) => {
    const out: Record<string, unknown> = { source_file: sourceFile };
    for (const def of FIELD_DEFS) {
      const col = mapping[def.key];
      out[def.key] = col ? (r[col] ?? null) : null;
    }

    // The deal-pipeline Heading column must be a direct pass-through from the
    // uploaded file's `Heading` column. Do not substitute Opportunity/notes or
    // generated summaries here, because partners use this as a source-data audit
    // field and expect it to match the input file exactly.
    const sourceHeading = getExactHeaderValue(r, "Heading");
    if (sourceHeading !== null && sourceHeading !== undefined && String(sourceHeading).trim()) {
      out.heading = sourceHeading;
    }

    // Also protect the common source schema used by the intelligence feed so a
    // stale saved mapping cannot accidentally shift Bidders/Targets into the
    // wrong standardized columns.
    if (!out.buyer) out.buyer = getExactHeaderValue(r, "Bidders") ?? getExactHeaderValue(r, "Issuers");
    if (!out.target) out.target = getExactHeaderValue(r, "Targets") ?? getExactHeaderValue(r, "Vendors");

    // Intelligence-feed mode: derive buyer/target/value/status/stake from the
    // Heading prose using a pattern library + Opportunity body text.
    // This is the only reliable way to get clean data from Mergermarket-style
    // feeds, which don't have structured Bidder/Target columns.
    if (intelMode) {
      const heading = String(out.heading ?? "").trim();
      if (heading) {
        const opportunity = String(getExactHeaderValue(r, "Opportunity") ?? "").trim() || null;
        const intelType = String(getExactHeaderValue(r, "Intelligence Type") ?? "").trim() || null;
        const parsed = parseIntelligenceRow({
          heading,
          opportunity,
          intelligence_type: intelType,
        });
        // Only OVERWRITE buyer/target if the existing values are empty AND
        // the parser had usable output. We never overwrite human-mapped data.
        if (!out.buyer && parsed.buyer) out.buyer = parsed.buyer;
        if (!out.target && parsed.target) out.target = parsed.target;
        if (!out.deal_type && parsed.deal_type) out.deal_type = parsed.deal_type;
        if (!out.status && parsed.status) out.status = parsed.status;
        if (!out.stake_percent && parsed.stake_percent !== null) out.stake_percent = parsed.stake_percent;
        // Surface parse metadata so the UI can flag low-confidence rows.
        out.parse_confidence = parsed.confidence;
        out.parse_pattern = parsed.parse_pattern;
        out.is_digest = parsed.is_digest;
        out.needs_review = parsed.needs_review;
        out.deal_value_usd_extracted = parsed.deal_value_usd;
        out.deal_value_raw_extracted = parsed.deal_value_raw;
        // If the structured Value INR(m) column is empty, use the parsed value as a fallback
        if (!out.value_raw && parsed.deal_value_raw) out.value_raw = parsed.deal_value_raw;
      }
    }

    return out;
  });
}

/** Fields missing required mappings (for validation). */
export function missingRequired(mapping: FieldMapping): StandardField[] {
  return FIELD_DEFS.filter((d) => d.required && !mapping[d.key]).map((d) => d.key);
}
