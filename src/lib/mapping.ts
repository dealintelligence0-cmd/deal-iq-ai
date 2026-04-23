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
  | "notes";

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
      "buyer", "acquirer", "acquiror", "purchaser", "bidder", "investor",
      "acquiring company", "buyer name", "acquirer name", "parent",
    ],
  },
  {
    key: "target",
    label: "Target / Seller",
    required: true,
    aliases: [
      "target", "seller", "seller target", "company", "target company",
      "target name", "acquired", "acquired company", "asset", "deal target",
    ],
  },
  {
    key: "sector",
    label: "Sector / Industry",
    required: false,
    aliases: [
      "sector", "industry", "vertical", "gics sector", "industry group",
      "sub sector", "segment", "business",
    ],
  },
  {
    key: "country",
    label: "Country / Geography",
    required: false,
    aliases: [
      "country", "geography", "region", "nation", "location",
      "target country", "country of target", "hq", "headquarters",
    ],
  },
  {
    key: "deal_type",
    label: "Deal Type",
    required: false,
    aliases: [
      "deal type", "transaction type", "type", "structure", "deal structure",
      "category", "deal category",
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
    ],
  },
  {
    key: "stake_percent",
    label: "Stake %",
    required: false,
    aliases: [
      "stake", "stake %", "stake percent", "% stake", "acquired stake",
      "ownership", "ownership %", "% acquired", "holding",
    ],
  },
  {
    key: "status",
    label: "Status",
    required: false,
    aliases: [
      "status", "deal status", "stage", "completion status",
      "transaction status", "state",
    ],
  },
  {
    key: "notes",
    label: "Notes / Description",
    required: false,
    aliases: [
      "notes", "description", "summary", "comments", "remarks",
      "deal rationale", "rationale", "headline",
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
    deal_type: null, value_raw: null, stake_percent: null, status: null, notes: null,
  };

  for (const def of FIELD_DEFS) {
    let best: { header: string; score: number } | null = null;
    for (const h of normalized) {
      if (!h.norm) continue;
      let score = 0;
      for (const alias of def.aliases) {
        const a = norm(alias);
        if (h.norm === a) { score = Math.max(score, 100); }
        else if (h.norm.includes(a) || a.includes(h.norm)) {
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
export function applyMapping(
  rows: Record<string, unknown>[],
  mapping: FieldMapping,
  sourceFile: string
): Record<string, unknown>[] {
  return rows.map((r) => {
    const out: Record<string, unknown> = { source_file: sourceFile };
    for (const def of FIELD_DEFS) {
      const col = mapping[def.key];
      out[def.key] = col ? (r[col] ?? null) : null;
    }
    return out;
  });
}

/** Fields missing required mappings (for validation). */
export function missingRequired(mapping: FieldMapping): StandardField[] {
  return FIELD_DEFS.filter((d) => d.required && !mapping[d.key]).map((d) => d.key);
}
