/**
 * Data-source adapters for Phase 4 Executive Signal Intelligence.
 *
 * Free sources only:
 *   - SEC EDGAR — US public company filings (10-K, 10-Q, 8-K, DEF 14A)
 *     https://www.sec.gov/cgi-bin/browse-edgar
 *     Rate limit: 10 req/sec, must send User-Agent identifying us
 *   - AnnualReports.com — full-text annual reports (many international)
 *
 * Both have public web endpoints. No API keys required. We respect rate limits
 * and identify ourselves via User-Agent per SEC's published policy.
 */

export type FilingMeta = {
  source: "sec_edgar" | "annual_reports" | "manual";
  source_id: string;
  filing_type: string;
  title: string;
  url: string;
  filed_date: string | null;  // ISO YYYY-MM-DD
  fiscal_period: string | null;
};

// Identifies us to SEC per their rate-limit policy.
// Format: "App Name email@example.com"
const SEC_USER_AGENT = "Deal IQ AI compliance@deal-iq-ai.app";

// =================================================================
// SEC EDGAR
// =================================================================

/** Look up CIK from ticker symbol. CIKs are 10-digit zero-padded. */
export async function lookupCikFromTicker(ticker: string): Promise<string | null> {
  if (!ticker) return null;
  try {
    const r = await fetch("https://www.sec.gov/files/company_tickers.json", {
      headers: { "User-Agent": SEC_USER_AGENT, Accept: "application/json" },
    });
    if (!r.ok) return null;
    const j = await r.json() as Record<string, { cik_str: number; ticker: string; title: string }>;
    const want = ticker.toUpperCase();
    for (const entry of Object.values(j)) {
      if (entry.ticker.toUpperCase() === want) {
        return entry.cik_str.toString().padStart(10, "0");
      }
    }
    return null;
  } catch { return null; }
}

/** List recent filings for a CIK. Returns most recent first. */
export async function listSecFilings(cik: string, types: string[] = ["10-K","10-Q","8-K","DEF 14A"], maxItems = 10): Promise<FilingMeta[]> {
  if (!cik) return [];
  const padCik = cik.replace(/\D/g, "").padStart(10, "0");
  try {
    const r = await fetch(`https://data.sec.gov/submissions/CIK${padCik}.json`, {
      headers: { "User-Agent": SEC_USER_AGENT, Accept: "application/json" },
    });
    if (!r.ok) return [];
    const j = await r.json();
    const recent = j?.filings?.recent;
    if (!recent || !recent.accessionNumber) return [];

    const out: FilingMeta[] = [];
    const n = recent.accessionNumber.length;
    for (let i = 0; i < n && out.length < maxItems; i++) {
      const formType = recent.form[i] as string;
      if (!types.includes(formType)) continue;
      const accession = (recent.accessionNumber[i] as string).replace(/-/g, "");
      const primaryDoc = recent.primaryDocument[i] as string;
      const filedDate = recent.filingDate[i] as string;
      const period = recent.reportDate?.[i] as string | undefined;
      out.push({
        source: "sec_edgar",
        source_id: recent.accessionNumber[i] as string,
        filing_type: formType,
        title: `${formType} — ${primaryDoc}`,
        url: `https://www.sec.gov/Archives/edgar/data/${parseInt(padCik, 10)}/${accession}/${primaryDoc}`,
        filed_date: filedDate,
        fiscal_period: period ? deriveFiscalPeriod(period) : null,
      });
    }
    return out;
  } catch { return []; }
}

/** Fetch the raw text content of an SEC filing. Caps at ~400KB to avoid token bombs. */
export async function fetchSecFilingText(url: string, maxChars = 400_000): Promise<string | null> {
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": SEC_USER_AGENT, Accept: "text/html,application/xhtml+xml" },
    });
    if (!r.ok) return null;
    const html = await r.text();
    return stripHtmlToText(html).slice(0, maxChars);
  } catch { return null; }
}

function deriveFiscalPeriod(reportDate: string): string {
  // reportDate is YYYY-MM-DD; turn into something like "FY25" or "Q3 FY26"
  // simplistic — many companies don't end FY in December
  const m = reportDate.match(/^(\d{4})-(\d{2})/);
  if (!m) return reportDate;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  if (month === 12 || month === 1) return `FY${(year + (month === 12 ? 1 : 0)) % 100}`;
  // Otherwise guess quarter
  const q = Math.ceil(month / 3);
  return `Q${q} FY${(year + 1) % 100}`;
}

// =================================================================
// AnnualReports.com — best-effort URL guess + text fetch
// =================================================================

/** Try to find an annual report URL via AnnualReports.com search. */
export async function findAnnualReportUrl(companyName: string): Promise<string | null> {
  if (!companyName) return null;
  try {
    const slug = companyName.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/^-+|-+$/g, "");
    const url = `https://www.annualreports.com/Company/${slug}`;
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Deal-IQ-AI/1.0)" },
    });
    if (!r.ok) return null;
    const html = await r.text();
    // Pull the most recent PDF link
    const match = html.match(/href="([^"]+\.pdf)"/i);
    if (!match) return null;
    const pdfUrl = match[1];
    return pdfUrl.startsWith("http") ? pdfUrl : `https://www.annualreports.com${pdfUrl}`;
  } catch { return null; }
}

// =================================================================
// HTML → plain text helper
// =================================================================

function stripHtmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}
