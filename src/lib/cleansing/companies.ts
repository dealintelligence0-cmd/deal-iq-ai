



/** Canonicalize company names: strip legal suffixes, normalize whitespace, title-case. */
const SUFFIXES = [
  "inc", "incorporated", "corp", "corporation", "co", "company",
  "ltd", "limited", "llc", "llp", "lp", "plc",
  "pvt", "private", "pte", "gmbh", "ag", "sa", "bv", "nv",
  "holdings", "holding", "group", "the",
];

/** True if the string is *only* a legal suffix token (e.g. "LTD", "Limited", "Inc."). */
function isBareLegalSuffix(s: string): boolean {
  if (!s) return false;
  const norm = s.toLowerCase().replace(/[.,\s]/g, "");
  return SUFFIXES.includes(norm);
}

export function cleanCompany(raw: unknown): string | null {
  if (!raw) return null;
  let s = String(raw).trim();
  if (!s) return null;

  // Reject bare legal-suffix tokens — these should never be treated as a company.
  if (isBareLegalSuffix(s)) return null;

  // Remove things in parens: "Acme Corp (subsidiary of X)"
  s = s.replace(/\([^)]*\)/g, " ");
  // Collapse whitespace and punctuation
  s = s.replace(/[,.]/g, " ").replace(/\s+/g, " ").trim();

  const tokens = s.split(" ").filter(Boolean);
  while (tokens.length > 1) { // ensure we don't pop the last token
    const last = tokens[tokens.length - 1].toLowerCase().replace(/\./g, "");
    if (SUFFIXES.includes(last)) tokens.pop();
    else break;
  }
  if (tokens.length === 0) return null;
  // Also reject if after suffix-stripping the only remaining token IS a suffix.
  if (tokens.length === 1 && isBareLegalSuffix(tokens[0])) return null;
  return titleCase(tokens.join(" "));
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(" ")
    .map((w) => {
      if (/^[A-Z0-9]{2,5}$/.test(w.toUpperCase()) && w.length <= 4) {
        return w.toUpperCase(); // preserve acronyms like IBM, HDFC
      }
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}

/**
 * Merge any "bare legal suffix" fragments back onto the preceding company name.
 * Catches both intentional separators ("Suntera; LTD") and legacy data that was
 * incorrectly split during a previous import.
 */
function mergeStrayLegalSuffix(parts: string[]): string[] {
  const out: string[] = [];
  for (const p of parts) {
    if (isBareLegalSuffix(p) && out.length > 0) {
      out[out.length - 1] = out[out.length - 1] + " " + p;
    } else {
      out.push(p);
    }
  }
  return out;
}

function splitCompanyList(raw: string): string[] {
  let s = raw.replace(/\r?\n/g, ";");

  // Normalise "and" to " & " (we'll only split intelligently below)
  s = s.replace(/\s+(?:and|&amp;)\s+/gi, " & ");

  // Intelligence feeds sometimes concatenate bidders as "A Ltd B Ltd C".
  // Insert a delimiter after common legal suffixes (case-insensitive, including ALL-CAPS
  // LTD/PLC/INC) when another capitalised/numeric word follows.
  s = s.replace(
    /\b(LTD|LIMITED|PVT|PRIVATE|INC|CORP|CORPORATION|LLC|LLP|LP|PLC|GMBH|HOLDINGS|HOLDING|GROUP)\b\.?\s+(?=[A-Z][A-Za-z0-9])/gi,
    "$1;"
  );

  // Only split on " & " when the LEFT side ends with a legal-suffix token —
  // this protects single-entity brands like "Procter & Gamble", "H & M",
  // "Wipro Consumer CARE & Lighting".
  s = s.replace(
    /\b(LTD|LIMITED|PVT|PRIVATE|INC|CORP|CORPORATION|LLC|LLP|LP|PLC|GMBH|HOLDINGS|HOLDING|GROUP)\b\.?\s+&\s+(?=\S+\s\S)/gi,
    "$1;"
  );

  const raw_parts = s
    .split(/\s*(?:;|\||\/)\s*/)
    .map((part) => part.trim())
    .filter(Boolean);

  // Critical defensive merge: if a "company" in the split is JUST a legal suffix
  // (LTD, LIMITED, INC, …) it can never be a real entity — merge it onto the
  // previous entry. This catches the "Suntera; LTD" / "ABP FOOD; LTD" bug
  // where a single company name was incorrectly split during a prior pass.
  return mergeStrayLegalSuffix(raw_parts);
}

export function cleanCompanyList(raw: unknown): string | null {
  if (!raw) return null;
  const text = String(raw).trim();
  if (!text) return null;
  const parts = splitCompanyList(text);
  if (parts.length <= 1) return cleanCompany(text);
  const cleaned = parts.map((part) => cleanCompany(part)).filter((part): part is string => Boolean(part));
  return cleaned.length ? Array.from(new Set(cleaned)).join("; ") : null;
}

/** Simple fuzzy equality for dedup: normalized lowercase, suffixes stripped. */
export function companyKey(name: string | null | undefined): string {
  return (cleanCompany(name) ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
