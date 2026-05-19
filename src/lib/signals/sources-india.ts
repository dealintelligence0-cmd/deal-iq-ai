/**
 * India BSE / NSE data-source adapter.
 *
 * Both exchanges publish corporate announcements (filings, board meetings,
 * results, M&A) as public RSS / JSON feeds. No API key required.
 *
 * BSE: https://api.bseindia.com/BseIndiaAPI/api/AnnGetData/w?scripcode=500325&...
 *      (informal endpoint used by their website; rate-limited but free)
 * NSE: https://www.nseindia.com/api/corporate-announcements
 *      (requires browser-like User-Agent; may need cookies in some regions)
 *
 * For Phase 4b we go via BSE for now (more stable for server-side fetches).
 */

import type { FilingMeta } from "./sources";

/**
 * List recent BSE announcements for a scrip code.
 * Returns filings ordered most-recent first.
 */
export async function listBseAnnouncements(
  scripCode: string,
  maxItems = 10
): Promise<FilingMeta[]> {
  if (!scripCode) return [];
  // BSE API expects 6-digit scrip codes
  const code = scripCode.replace(/\D/g, "").padStart(6, "0");

  try {
    // BSE's public announcement endpoint
    const url = `https://api.bseindia.com/BseIndiaAPI/api/AnnGetData/w?strCat=-1&strPrevDate=&strScrip=${code}&strSearch=P&strToDate=&strType=C&subcategory=-1`;
    const r = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Deal-IQ-AI/1.0)",
        Accept: "application/json",
        Referer: "https://www.bseindia.com/",
      },
    });
    if (!r.ok) return [];
    const j = await r.json();
    const items = (j?.Table ?? []) as Array<Record<string, any>>;

    return items.slice(0, maxItems).map((it) => ({
      source: "india_bse" as const,
      source_id: String(it.NEWSID ?? `${code}-${it.News_submission_dt ?? Date.now()}`),
      filing_type: it.CATEGORYNAME ?? "BSE-announcement",
      title: it.HEADLINE ?? it.NEWSSUB ?? "BSE filing",
      url: it.ATTACHMENTNAME
        ? `https://www.bseindia.com/xml-data/corpfiling/AttachLive/${it.ATTACHMENTNAME}`
        : `https://www.bseindia.com/corporates/anndet_new.aspx?newsid=${it.NEWSID}`,
      filed_date: it.News_submission_dt
        ? String(it.News_submission_dt).split("T")[0]
        : null,
      fiscal_period: it.CATEGORYNAME ?? null,
    }));
  } catch {
    return [];
  }
}

/**
 * Fetch the body of a BSE announcement.
 * Most BSE filings are PDF attachments — we return the headline + subcategory
 * info from the metadata, which is structured enough for signal extraction.
 */
export async function fetchBseAnnouncementText(
  scripCode: string,
  newsId: string,
  maxChars = 50_000
): Promise<string | null> {
  if (!scripCode || !newsId) return null;
  try {
    // Fetch the structured details page
    const url = `https://api.bseindia.com/BseIndiaAPI/api/AnnSubCategoryGetData/w?strCat=-1&strType=C&strNewsID=${newsId}`;
    const r = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Deal-IQ-AI/1.0)",
        Accept: "application/json",
        Referer: "https://www.bseindia.com/",
      },
    });
    if (!r.ok) return null;
    const j = await r.json();
    const items = (j?.Table ?? []) as Array<Record<string, any>>;
    const item = items[0];
    if (!item) return null;
    const parts = [
      item.HEADLINE ?? "",
      item.MORE ?? "",
      item.SLONGNAME ?? "",
      item.NEWSSUB ?? "",
    ].filter(Boolean);
    return parts.join("\n\n").slice(0, maxChars) || null;
  } catch {
    return null;
  }
}

/**
 * Best-effort NSE announcement listing.
 * NSE's API is stricter (requires session cookies); falls back to empty when blocked.
 */
export async function listNseAnnouncements(
  nseSymbol: string,
  maxItems = 10
): Promise<FilingMeta[]> {
  if (!nseSymbol) return [];
  try {
    const url = `https://www.nseindia.com/api/corporate-announcements?index=equities&symbol=${encodeURIComponent(nseSymbol)}`;
    const r = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0 Safari/537.36",
        Accept: "application/json",
        Referer: `https://www.nseindia.com/get-quotes/equity?symbol=${nseSymbol}`,
      },
    });
    if (!r.ok) return [];
    const items = (await r.json()) as Array<Record<string, any>>;
    if (!Array.isArray(items)) return [];

    return items.slice(0, maxItems).map((it) => ({
      source: "india_nse" as const,
      source_id: it.NewsID ?? `${nseSymbol}-${it.dt ?? Date.now()}`,
      filing_type: it.smIndustry ?? "NSE-announcement",
      title: it.desc ?? it.attchmntText ?? "NSE filing",
      url: it.attchmntFile
        ? `https://nsearchives.nseindia.com/corporate/${it.attchmntFile}`
        : `https://www.nseindia.com/get-quotes/equity?symbol=${nseSymbol}`,
      filed_date: it.an_dt ? String(it.an_dt).split(" ")[0] : null,
      fiscal_period: null,
    }));
  } catch {
    return [];
  }
}
