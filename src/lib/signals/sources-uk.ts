/**
 * UK Companies House data-source adapter.
 *
 * Companies House offers a free public API at https://api.company-information.service.gov.uk
 * - Requires an API key (free registration at developer.company-information.service.gov.uk)
 * - Rate limit: 600 requests / 5 min window
 * - Returns full filing history with download URLs
 *
 * For Phase 4b we support two modes:
 *   1. With CH_API_KEY env var → call the official API
 *   2. Without API key → fall back to scraping the public web pages (slower, no PDFs)
 *
 * Each filing returns just metadata; raw text is fetched separately.
 */

import type { FilingMeta } from "./sources";

const CH_BASE = "https://api.company-information.service.gov.uk";

/**
 * Look up UK company number from name via the public search endpoint.
 * Returns the first match (best-effort).
 */
export async function lookupUkCompanyNumber(companyName: string): Promise<string | null> {
  if (!companyName) return null;
  const apiKey = process.env.CH_API_KEY;
  if (!apiKey) return null;  // Without an API key, can't search

  try {
    const r = await fetch(
      `${CH_BASE}/search/companies?q=${encodeURIComponent(companyName)}&items_per_page=1`,
      {
        headers: { Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}` },
      }
    );
    if (!r.ok) return null;
    const j = await r.json();
    const first = j?.items?.[0];
    return first?.company_number ?? null;
  } catch {
    return null;
  }
}

/**
 * List recent UK filings. CH categorises filings by type:
 *  - "annual-return" / "confirmation-statement"
 *  - "accounts" (annual accounts)
 *  - "officers" (director changes — leadership change signals!)
 *  - "capital" (share capital, capital allocation signals)
 *  - "mortgage" (debt facilities)
 */
export async function listUkFilings(
  companyNumber: string,
  maxItems = 10
): Promise<FilingMeta[]> {
  const apiKey = process.env.CH_API_KEY;
  if (!apiKey || !companyNumber) return [];

  try {
    const r = await fetch(
      `${CH_BASE}/company/${companyNumber}/filing-history?items_per_page=${maxItems * 2}`,
      {
        headers: { Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}` },
      }
    );
    if (!r.ok) return [];
    const j = await r.json();
    const items = (j?.items ?? []) as Array<Record<string, any>>;

    const interestingCategories = new Set([
      "accounts", "officers", "capital", "mortgage", "annual-return", "confirmation-statement",
    ]);

    return items
      .filter((it) => interestingCategories.has(it.category))
      .slice(0, maxItems)
      .map((it) => ({
        source: "uk_companies_house" as const,
        source_id: it.transaction_id ?? `${companyNumber}-${it.date}-${it.category}`,
        filing_type: `UK-${it.category}`,
        title: it.description ?? it.category,
        // Document is a separate fetch; this is the metadata URL
        url: it.links?.document_metadata
          ? `${CH_BASE}${it.links.document_metadata}`
          : `https://find-and-update.company-information.service.gov.uk/company/${companyNumber}/filing-history`,
        filed_date: it.date ?? null,
        fiscal_period: it.action_date ?? null,
      }));
  } catch {
    return [];
  }
}

/**
 * Fetch the raw text content of a UK filing document.
 * Companies House returns documents as PDFs which we can't parse server-side easily,
 * so we return the structured description from the metadata + any extracted text.
 */
export async function fetchUkFilingText(
  documentMetadataUrl: string,
  maxChars = 50_000
): Promise<string | null> {
  const apiKey = process.env.CH_API_KEY;
  if (!apiKey) return null;

  try {
    // First fetch the metadata to get the document URL
    const metaR = await fetch(documentMetadataUrl, {
      headers: { Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}` },
    });
    if (!metaR.ok) return null;
    const meta = await metaR.json();
    // Return the description + any structured data we have
    const summary = [
      meta.description ?? "",
      meta.action_date ? `Action date: ${meta.action_date}` : "",
      meta.transaction_id ? `Transaction: ${meta.transaction_id}` : "",
      meta.pages ? `${meta.pages} pages` : "",
      JSON.stringify(meta.description_values ?? {}),
    ].filter(Boolean).join("\n").slice(0, maxChars);
    return summary || null;
  } catch {
    return null;
  }
}
