



/**
 * Lightweight, dependency-free display normaliser.
 *
 * Used to repair legacy data in the database that was written before the
 * cleansing engine learned to handle bare legal-suffix fragments. Joins
 * "Suntera; LTD" → "Suntera LTD", "ABP FOOD; LTD" → "ABP FOOD LTD".
 *
 * Multi-buyer strings like "Tata Ltd; Hindustan Ltd" are left untouched
 * because each fragment is itself a multi-token company name.
 */
const LEGAL_SUFFIXES_LC = new Set([
  "inc", "incorporated", "corp", "corporation", "co", "company",
  "ltd", "limited", "llc", "llp", "lp", "plc",
  "pvt", "private", "pte", "gmbh", "ag", "sa", "bv", "nv",
  "holdings", "holding", "group", "the",
]);

function isBareSuffixToken(s: string): boolean {
  return LEGAL_SUFFIXES_LC.has(s.trim().toLowerCase().replace(/\./g, ""));
}

/** Repair legacy stored values like "Suntera; LTD" → "Suntera LTD". */
export function displayCompanyName(raw: string | null | undefined): string {
  if (!raw) return "";
  const text = String(raw).trim();
  if (!text) return "";
  if (!text.includes(";")) return text;

  const parts = text.split(/\s*;\s*/).filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    if (isBareSuffixToken(p) && out.length > 0) {
      out[out.length - 1] = out[out.length - 1] + " " + p;
    } else {
      out.push(p);
    }
  }
  return out.join("; ");
}
