/**
 * Scan orchestrator for Phase 4 Executive Signal Intelligence.
 *
 * For each watchlist company:
 *   1. Look up CIK if missing (from ticker via SEC's tickers JSON)
 *   2. List recent SEC filings (10-K, 10-Q, 8-K, DEF 14A) — last 6 months
 *   3. For each NEW filing not already in company_filings:
 *        - Fetch raw text
 *        - Call AI extractor
 *        - Save signals + filing record
 *   4. Update watchlist.last_scanned_at
 *
 * Designed for nightly cron (max ~50 companies in 5 min Vercel limit).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { RouteConfig } from "@/lib/ai/router";
import {
  lookupCikFromTicker, listSecFilings, fetchSecFilingText,
  type FilingMeta,
} from "./sources";
import { extractSignals } from "./extractor";

export type ScanResult = {
  companies_scanned: number;
  filings_found: number;
  filings_processed: number;
  signals_extracted: number;
  cost_usd: number;
  errors: string[];
};

export type ScanOptions = {
  userId: string;
  routeConfig: RouteConfig;
  /** Only scan a specific watchlist row (for manual single-company scans) */
  watchlistId?: string;
  /** Cap filings per company to control runtime / cost */
  maxFilingsPerCompany?: number;
  /** Lookback window in days */
  lookbackDays?: number;
};

export async function scanSignals(
  sb: SupabaseClient,
  opts: ScanOptions
): Promise<ScanResult> {
  const result: ScanResult = {
    companies_scanned: 0, filings_found: 0, filings_processed: 0,
    signals_extracted: 0, cost_usd: 0, errors: [],
  };

  // Audit-trail row
  const { data: runRow } = await sb.from("signal_scan_runs").insert({
    created_by: opts.userId,
    triggered_by: opts.watchlistId ? "manual" : "cron",
    status: "running",
  }).select("id").single();
  const runId = (runRow as { id: string } | null)?.id;

  try {
    // Load watchlist (filter to specific row if requested)
    let q = sb.from("watchlist_companies")
      .select("id, company_name, ticker, cik, country, sector")
      .eq("is_active", true);
    if (opts.watchlistId) q = q.eq("id", opts.watchlistId);
    const { data: companies, error: qErr } = await q;
    if (qErr) throw new Error(`Watchlist query failed: ${qErr.message}`);
    if (!companies || companies.length === 0) {
      await finalizeRun(sb, runId, "completed", result, null);
      return result;
    }

    const maxFilings = opts.maxFilingsPerCompany ?? 3;
    const lookbackMs = (opts.lookbackDays ?? 180) * 24 * 60 * 60 * 1000;
    const cutoff = new Date(Date.now() - lookbackMs);

    for (const co of companies) {
      result.companies_scanned++;
      try {
        // Resolve CIK
        let cik = co.cik as string | null;
        if (!cik && co.ticker) {
          cik = await lookupCikFromTicker(co.ticker as string);
          if (cik) await sb.from("watchlist_companies").update({ cik }).eq("id", co.id as string);
        }
        if (!cik) {
          // Skip non-US-listed companies for now (Phase 4 v1 is SEC-only)
          await sb.from("watchlist_companies").update({ last_scanned_at: new Date().toISOString() }).eq("id", co.id as string);
          continue;
        }

        // List filings
        const filings = await listSecFilings(cik, ["10-K","10-Q","8-K","DEF 14A"], maxFilings * 2);
        result.filings_found += filings.length;

        // Filter to new + recent
        const fresh: FilingMeta[] = [];
        for (const f of filings) {
          if (fresh.length >= maxFilings) break;
          if (!f.filed_date) continue;
          if (new Date(f.filed_date) < cutoff) continue;
          // Dedupe via unique constraint check
          const { data: existing } = await sb.from("company_filings")
            .select("id").eq("watchlist_id", co.id as string)
            .eq("source", "sec_edgar").eq("source_id", f.source_id).maybeSingle();
          if (!existing) fresh.push(f);
        }

        // Process each new filing
        for (const f of fresh) {
          const rawText = await fetchSecFilingText(f.url, 100_000);
          if (!rawText || rawText.length < 500) {
            // Save the filing record but mark skipped
            await sb.from("company_filings").insert({
              watchlist_id: co.id as string,
              created_by: opts.userId,
              source: f.source, source_id: f.source_id,
              filing_type: f.filing_type, title: f.title, url: f.url,
              filed_date: f.filed_date, fiscal_period: f.fiscal_period,
              raw_text_chars: rawText?.length ?? 0,
              scan_status: "skipped",
              scan_error: "Filing too short or unreadable",
            });
            continue;
          }

          // Extract signals
          const ex = await extractSignals(opts.routeConfig, co.company_name as string, f.filing_type, f.fiscal_period, rawText);
          result.cost_usd += ex.cost_usd;

          // Save filing
          const { data: filingRow, error: filingErr } = await sb.from("company_filings").insert({
            watchlist_id: co.id as string,
            created_by: opts.userId,
            source: f.source, source_id: f.source_id,
            filing_type: f.filing_type, title: f.title, url: f.url,
            filed_date: f.filed_date, fiscal_period: f.fiscal_period,
            raw_text: rawText.slice(0, 500_000),
            raw_text_chars: rawText.length,
            scan_status: ex.error ? "failed" : "scanned",
            scan_error: ex.error,
            scanned_at: new Date().toISOString(),
          }).select("id").single();

          if (filingErr) {
            result.errors.push(`Filing insert failed (${co.company_name} ${f.filing_type}): ${filingErr.message}`);
            continue;
          }
          result.filings_processed++;
          const filingId = (filingRow as { id: string } | null)?.id;

          // Save signals
          if (ex.signals.length > 0 && filingId) {
            const payload = ex.signals.map((s) => ({
              watchlist_id: co.id as string,
              filing_id: filingId,
              created_by: opts.userId,
              signal_type: s.signal_type,
              severity: s.severity,
              confidence: s.confidence,
              headline: s.headline,
              evidence_quote: s.evidence_quote,
              evidence_page: `${f.filing_type}${f.fiscal_period ? ` ${f.fiscal_period}` : ""}`,
              context: s.context,
              pitch_angle: s.pitch_angle,
            }));
            const { error: sigErr } = await sb.from("executive_signals").insert(payload);
            if (sigErr) result.errors.push(`Signal insert failed: ${sigErr.message}`);
            else result.signals_extracted += ex.signals.length;
          }
        }

        await sb.from("watchlist_companies").update({ last_scanned_at: new Date().toISOString() }).eq("id", co.id as string);
      } catch (e: any) {
        result.errors.push(`${co.company_name}: ${e?.message ?? String(e)}`);
      }
    }

    await finalizeRun(sb, runId, "completed", result, result.errors[0] ?? null);
    return result;
  } catch (e: any) {
    const errMsg = e?.message ?? String(e);
    result.errors.push(errMsg);
    await finalizeRun(sb, runId, "failed", result, errMsg);
    throw e;
  }
}

async function finalizeRun(
  sb: SupabaseClient,
  runId: string | undefined,
  status: string,
  result: ScanResult,
  error: string | null
): Promise<void> {
  if (!runId) return;
  await sb.from("signal_scan_runs").update({
    status,
    companies_scanned: result.companies_scanned,
    filings_found: result.filings_found,
    filings_processed: result.filings_processed,
    signals_extracted: result.signals_extracted,
    cost_usd: Math.round(result.cost_usd * 10000) / 10000,
    error,
    completed_at: new Date().toISOString(),
  }).eq("id", runId);
}
