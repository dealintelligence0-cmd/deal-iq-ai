/** Canonicalize company names: strip legal suffixes, normalize whitespace, title-case. */
const SUFFIXES = [
  "inc", "incorporated", "corp", "corporation", "co", "company",
  "ltd", "limited", "llc", "llp", "lp", "plc",
  "pvt", "private", "pte", "gmbh", "ag", "sa", "bv", "nv",
  "holdings", "holding", "group", "the",
];

export function cleanCompany(raw: unknown): string | null {
  if (!raw) return null;
  let s = String(raw).trim();
  if (!s) return null;

  // Remove things in parens: "Acme Corp (subsidiary of X)"
  s = s.replace(/\([^)]*\)/g, " ");
  // Collapse whitespace and punctuation
  s = s.replace(/[,.]/g, " ").replace(/\s+/g, " ").trim();

  const tokens = s.split(" ").filter(Boolean);
  while (tokens.length > 1) {
    const last = tokens[tokens.length - 1].toLowerCase().replace(/\./g, "");
    if (SUFFIXES.includes(last)) tokens.pop();
    else break;
  }

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

/** Simple fuzzy equality for dedup: normalized lowercase, suffixes stripped. */
export function companyKey(name: string | null | undefined): string {
  return (cleanCompany(name) ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
