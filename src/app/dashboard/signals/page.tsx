



"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Activity, AlertTriangle, RefreshCw, Loader2, Plus, X, Shield, Building2, TrendingUp, Sparkles, Clock, ArrowRight, Users, Briefcase } from "lucide-react";
import PageHeader, { headerActionBtn, headerPrimaryBtn } from "@/components/dashboard/PageHeader";

type SignalType = "margin_pressure" | "transformation_pressure" | "activist_activity" | "acquisition_intent" | "leadership_change";

type Signal = {
  id: string;
  watchlist_id: string;
  signal_type: SignalType;
  severity: "low" | "medium" | "high" | "critical";
  confidence: number;
  headline: string;
  evidence_quote: string;
  evidence_page: string;
  context: string;
  pitch_angle: string;
  status: string;
  created_at: string;
  watchlist_companies: {
    id: string; company_name: string; ticker: string | null;
    sector: string | null; country: string | null;
  };
};

type Company = {
  id: string;
  company_name: string;
  ticker: string | null;
  cik: string | null;
  uk_company_number: string | null;
  bse_scrip_code: string | null;
  nse_symbol: string | null;
  eu_lei: string | null;
  sector: string | null;
  country: string | null;
  is_active: boolean;
  notes: string | null;
  last_scanned_at: string | null;
  added_via: string;
  signal_count: number;
  high_severity_count: number;
  critical_severity_count: number;
};

type Trend = {
  watchlist_id: string;
  company_name: string;
  signal_type: SignalType;
  signals_30d: number;
  signals_90d: number;
  signals_180d: number;
  signals_total: number;
  most_recent_at: string;
  max_severity: string;
  label: string;
  accelerating: boolean;
  sustained: boolean;
  pattern: "accelerating" | "sustained" | "single";
};

type LastRun = {
  status: string;
  started_at: string;
  completed_at: string | null;
  signals_extracted: number | null;
  companies_scanned: number | null;
  error: string | null;
} | null;

const SIGNAL_LABELS: Record<SignalType, string> = {
  margin_pressure: "Margin Pressure",
  transformation_pressure: "Transformation Pressure",
  activist_activity: "Activist Activity",
  acquisition_intent: "Acquisition Intent",
  leadership_change: "Leadership Change",
};

const SIGNAL_COLORS: Record<SignalType, string> = {
  margin_pressure: "rose",
  transformation_pressure: "indigo",
  activist_activity: "amber",
  acquisition_intent: "emerald",
  leadership_change: "purple",
};

// v29 reskin: severity → outlined badge style
const SEVERITY_BADGE: Record<string, { cls: string; label: string }> = {
  critical: { cls: "bg-rose-500/20 text-rose-700 border-rose-500/40 dark:text-rose-300",     label: "CRITICAL SIGNAL" },
  high:     { cls: "bg-amber-500/20 text-amber-700 border-amber-500/40 dark:text-amber-300", label: "HIGH SIGNAL" },
  medium:   { cls: "bg-yellow-500/20 text-yellow-700 border-yellow-500/40 dark:text-yellow-300", label: "MEDIUM SIGNAL" },
  low:      { cls: "bg-slate-500/20 text-slate-700 border-slate-500/40 dark:text-slate-300", label: "LOW SIGNAL" },
};

// v29 reskin: legacy table style for "Active Signals" feed below
const SEVERITY_STYLE: Record<string, string> = {
  critical: "bg-rose-200 text-rose-900 border-rose-300",
  high: "bg-amber-200 text-amber-900 border-amber-300",
  medium: "bg-slate-200 text-slate-800 border-slate-300",
  low: "bg-slate-100 text-slate-600 border-slate-200",
};

// Hub tabs map to signal_type categories
const HUB_TABS: Array<{ key: string; label: string; icon: any; types: SignalType[] | null }> = [
  { key: "all",        label: "All",        icon: Activity, types: null },
  { key: "leadership", label: "Leadership", icon: Users,        types: ["leadership_change"] },
  { key: "financial",  label: "Financial",  icon: TrendingUp,   types: ["margin_pressure", "transformation_pressure"] },
  { key: "sponsor",    label: "Sponsor",    icon: Briefcase,    types: ["activist_activity", "acquisition_intent"] },
  { key: "ip",         label: "IP",         icon: Shield,       types: [] }, // reserved; no current signal_type maps here
];

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const hr = diff / 3600000; const day = hr / 24;
  if (hr < 1)  return "<1 hour ago";
  if (hr < 24) return `${Math.round(hr)} hours ago`;
  if (day < 7) return `${Math.round(day)} days ago`;
  return new Date(iso).toLocaleDateString();
}

export default function SignalsPage() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [trends, setTrends] = useState<Trend[]>([]);
  const [lastRun, setLastRun] = useState<LastRun>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newCompany, setNewCompany] = useState({
    company_name: "", ticker: "", sector: "", country: "",
    uk_company_number: "", bse_scrip_code: "", nse_symbol: "", eu_lei: "",
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [filterType, setFilterType] = useState<SignalType | "">("");
  const [filterSeverity, setFilterSeverity] = useState<string>("");
  const [hubTab, setHubTab] = useState<string>("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sigR, cosR, trendR] = await Promise.all([
        fetch("/api/signals").then((r) => r.json()),
        fetch("/api/signals/watchlist").then((r) => r.json()),
        fetch("/api/signals/trends").then((r) => r.ok ? r.json() : { trends: [] }),
      ]);
      setSignals(sigR.signals ?? []);
      setLastRun(sigR.lastRun ?? null);
      setCompanies(cosR.companies ?? []);
      setTrends(trendR.trends ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function scan(watchlist_id?: string) {
    setScanning(true); setError(null);
    try {
      const r = await fetch("/api/signals/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ watchlist_id }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Scan failed");
      await load();
    } catch (e: any) { setError(e?.message ?? "Scan failed"); }
    finally { setScanning(false); }
  }

  async function addCompany() {
    if (!newCompany.company_name.trim()) return;
    setError(null);
    try {
      const r = await fetch("/api/signals/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newCompany),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Add failed");
      setAddOpen(false);
      setNewCompany({ company_name: "", ticker: "", sector: "", country: "",
        uk_company_number: "", bse_scrip_code: "", nse_symbol: "", eu_lei: "" });
      setShowAdvanced(false);
      await load();
    } catch (e: any) { setError(e?.message ?? "Add failed"); }
  }

  async function removeCompany(id: string) {
    if (!confirm("Remove this company from your watchlist? Signals already extracted will remain.")) return;
    await fetch(`/api/signals/watchlist/${id}`, { method: "DELETE" });
    await load();
  }

  async function dismissSignal(id: string) {
    await fetch(`/api/signals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "dismissed" }),
    });
    setSignals(signals.filter((s) => s.id !== id));
  }

  // Hub view: filter by tab category
  const hubSignals = useMemo(() => {
    const tab = HUB_TABS.find((t) => t.key === hubTab);
    if (!tab || tab.types === null) return signals;
    if (tab.types.length === 0) return [];
    return signals.filter((s) => tab.types!.includes(s.signal_type));
  }, [signals, hubTab]);

  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of HUB_TABS) {
      if (t.types === null) counts[t.key] = signals.length;
      else if (t.types.length === 0) counts[t.key] = 0;
      else counts[t.key] = signals.filter((s) => t.types!.includes(s.signal_type)).length;
    }
    return counts;
  }, [signals]);

  // Original "Active Signals" filtered feed (below the hub)
  const filteredSignals = signals.filter((s) => {
    if (filterType && s.signal_type !== filterType) return false;
    if (filterSeverity && s.severity !== filterSeverity) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Activity}
        title="Signal Intel Hub"
        subtitle="Proprietary signals stream: live distressed opportunities, leadership shifts, and debt events. Five signal types feed your proposal generator."
        actions={
          <>
            <span className="flex items-center gap-1 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-white/90">
              <Sparkles className="h-3 w-3" /> Strategy / Big-4 Intel
            </span>
            <button onClick={() => setAddOpen(true)} className={headerActionBtn}>
              <Plus className="h-3.5 w-3.5" /> Add company
            </button>
            <button onClick={() => scan()} disabled={scanning || companies.length === 0} className={headerPrimaryBtn}>
              {scanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {scanning ? "Scanning…" : "Scan all"}
            </button>
          </>
        }
      />

      {lastRun && (
        <div className="flex items-center gap-3 text-[11px] text-slate-500">
          {lastRun.completed_at && <span>Last scan: {new Date(lastRun.completed_at).toLocaleString()}</span>}
          {lastRun.companies_scanned != null && <span>· {lastRun.companies_scanned} companies</span>}
          {lastRun.signals_extracted != null && <span>· {lastRun.signals_extracted} signals extracted</span>}
        </div>
      )}

      {error && (
        <div className="rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">{error}</div>
      )}
      {!error && lastRun?.error && (
        <div className="rounded border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <b>Last scan note:</b> {lastRun.error}
        </div>
      )}

      {/* ============================================================ */}
      {/* v29 VISUAL LAYER: Signal Intel Hub with category tabs        */}
      {/* ============================================================ */}
      {signals.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-3 flex items-center gap-1 border-b border-slate-200 dark:border-slate-700">
            {HUB_TABS.map((t) => {
              const Icon = t.icon;
              const active = hubTab === t.key;
              const ct = tabCounts[t.key] ?? 0;
              return (
                <button key={t.key} onClick={() => setHubTab(t.key)}
                        className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-[11px] font-bold uppercase tracking-wider transition ${active
                          ? "border-rose-500 text-rose-600 dark:text-rose-400"
                          : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"}`}>
                  <Icon className="h-3.5 w-3.5" />
                  {t.label}
                  {ct > 0 && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] dark:bg-slate-800">{ct}</span>}
                </button>
              );
            })}
          </div>

          {hubSignals.length === 0 ? (
            <p className="py-6 text-center text-[12px] italic text-slate-500">
              No signals in this category yet. Click <b>Scan all</b> to refresh.
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {hubSignals.slice(0, 8).map((s, idx) => {
                const sev = SEVERITY_BADGE[s.severity] ?? SEVERITY_BADGE.medium;
                const ref = `SIG_${idx + 1}`;
                return (
                  <article key={s.id} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div className="text-[9.5px] font-bold uppercase tracking-wider text-slate-500">
                        Target Focus: <span className="text-slate-800 dark:text-slate-200">{s.watchlist_companies.company_name}</span>
                      </div>
                      <span className={`rounded border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${sev.cls}`}>{sev.label}</span>
                    </div>

                    <h3 className="text-[14px] font-bold text-slate-900 dark:text-white">{s.headline}</h3>
                    <div className="mt-1 flex items-center gap-1 text-[10px] text-slate-500">
                      <Clock className="h-3 w-3" /> Trigger timestamp: {formatRelativeTime(s.created_at)}
                    </div>

                    {s.context && (
                      <p className="mt-2 text-[12px] text-slate-700 dark:text-slate-300">{s.context}</p>
                    )}
                    {s.evidence_quote && !s.context && (
                      <p className="mt-2 text-[12px] italic text-slate-700 dark:text-slate-300">&ldquo;{s.evidence_quote}&rdquo;</p>
                    )}

                    {s.pitch_angle && (
                      <div className="mt-3 rounded border border-rose-200 bg-rose-50/40 p-2 dark:border-rose-900 dark:bg-rose-950/20">
                        <div className="text-[9.5px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400">Advisory Angle:</div>
                        <p className="mt-1 font-mono text-[11px] italic text-slate-700 dark:text-slate-300">
                          {s.pitch_angle}
                        </p>
                      </div>
                    )}

                    <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 dark:border-slate-800">
                      <span className="text-[9.5px] text-slate-500">Signal reference: {ref}</span>
                      <span className="text-[10px] text-slate-400">Confidence {Math.round(s.confidence * 100)}%</span>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Add modal */}
      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setAddOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl dark:bg-slate-900">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-bold">Add company to watchlist</h2>
              <button onClick={() => setAddOpen(false)}><X className="h-4 w-4 text-slate-400" /></button>
            </div>
            <div className="space-y-3 text-sm">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-600">Company name (required)</label>
                <input value={newCompany.company_name} onChange={(e) => setNewCompany({ ...newCompany, company_name: e.target.value })}
                       placeholder="e.g. Reliance Industries"
                       className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-600">SEC ticker (optional — required for US-listed)</label>
                <input value={newCompany.ticker} onChange={(e) => setNewCompany({ ...newCompany, ticker: e.target.value })}
                       placeholder="e.g. AAPL"
                       className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm font-mono dark:border-slate-700 dark:bg-slate-800" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-600">Sector</label>
                  <input value={newCompany.sector} onChange={(e) => setNewCompany({ ...newCompany, sector: e.target.value })}
                         placeholder="e.g. Technology"
                         className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800" />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-600">Country</label>
                  <input value={newCompany.country} onChange={(e) => setNewCompany({ ...newCompany, country: e.target.value })}
                         placeholder="e.g. USA"
                         className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800" />
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="text-[11px] font-medium text-indigo-600 hover:underline"
              >
                {showAdvanced ? "▼ Hide" : "▶ Show"} non-US source identifiers
              </button>
              {showAdvanced && (
                <div className="grid grid-cols-2 gap-2 rounded-md border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-800/50">
                  <div>
                    <label className="mb-1 block text-[10.5px] font-medium text-slate-600">UK Companies House #</label>
                    <input value={newCompany.uk_company_number}
                           onChange={(e) => setNewCompany({ ...newCompany, uk_company_number: e.target.value })}
                           placeholder="e.g. 00012345"
                           className="w-full rounded border border-slate-300 px-2 py-1 text-xs font-mono dark:border-slate-700 dark:bg-slate-800" />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10.5px] font-medium text-slate-600">BSE Scrip Code</label>
                    <input value={newCompany.bse_scrip_code}
                           onChange={(e) => setNewCompany({ ...newCompany, bse_scrip_code: e.target.value })}
                           placeholder="e.g. 500325 (RIL)"
                           className="w-full rounded border border-slate-300 px-2 py-1 text-xs font-mono dark:border-slate-700 dark:bg-slate-800" />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10.5px] font-medium text-slate-600">NSE Symbol</label>
                    <input value={newCompany.nse_symbol}
                           onChange={(e) => setNewCompany({ ...newCompany, nse_symbol: e.target.value })}
                           placeholder="e.g. RELIANCE"
                           className="w-full rounded border border-slate-300 px-2 py-1 text-xs font-mono dark:border-slate-700 dark:bg-slate-800" />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10.5px] font-medium text-slate-600">EU LEI (20 chars)</label>
                    <input value={newCompany.eu_lei}
                           onChange={(e) => setNewCompany({ ...newCompany, eu_lei: e.target.value })}
                           placeholder="529900T8BM..."
                           className="w-full rounded border border-slate-300 px-2 py-1 text-xs font-mono dark:border-slate-700 dark:bg-slate-800" />
                  </div>
                </div>
              )}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setAddOpen(false)} className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">Cancel</button>
              <button onClick={addCompany} disabled={!newCompany.company_name.trim()}
                      className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50">
                Add to watchlist
              </button>
            </div>
            <p className="mt-3 text-[10px] italic text-slate-500">
              Coverage: SEC EDGAR (US ticker), UK Companies House (number), BSE/NSE (India). EU LEI is recognized but full filing ingestion for non-UK EU companies is Phase 6+.
            </p>
          </div>
        </div>
      )}

      {/* Watchlist */}
      <section>
        <h2 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
          <Building2 className="h-3.5 w-3.5" /> Watchlist ({companies.length})
        </h2>
        {companies.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-8 text-center dark:border-slate-700 dark:bg-slate-900/50">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              No companies on your watchlist yet. Click <b>Add company</b> above to start tracking executive signals.
            </p>
          </div>
        ) : (
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            {companies.map((co) => (
              <div key={co.id} className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <div className="truncate text-sm font-bold text-slate-900 dark:text-white">{co.company_name}</div>
                      {co.added_via === "deal_import" && (
                        <span title="Auto-added from a PURSUE-band deal" className="rounded bg-indigo-100 px-1 py-0.5 text-[9px] font-bold uppercase text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">auto</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-2 text-[10.5px] text-slate-500">
                      {co.ticker && <span className="font-mono">{co.ticker}</span>}
                      {co.sector && <span>{co.sector}</span>}
                      {co.country && <span>{co.country}</span>}
                    </div>
                    {/* Source identifier badges */}
                    {(co.cik || co.uk_company_number || co.bse_scrip_code || co.nse_symbol || co.eu_lei) && (
                      <div className="mt-1 flex flex-wrap gap-1 text-[9px]">
                        {co.cik && <span className="rounded bg-slate-100 px-1 py-0.5 font-mono text-slate-600 dark:bg-slate-800 dark:text-slate-400">SEC</span>}
                        {co.uk_company_number && <span className="rounded bg-slate-100 px-1 py-0.5 font-mono text-slate-600 dark:bg-slate-800 dark:text-slate-400">CH</span>}
                        {co.bse_scrip_code && <span className="rounded bg-slate-100 px-1 py-0.5 font-mono text-slate-600 dark:bg-slate-800 dark:text-slate-400">BSE</span>}
                        {co.nse_symbol && <span className="rounded bg-slate-100 px-1 py-0.5 font-mono text-slate-600 dark:bg-slate-800 dark:text-slate-400">NSE</span>}
                        {co.eu_lei && <span className="rounded bg-slate-100 px-1 py-0.5 font-mono text-slate-600 dark:bg-slate-800 dark:text-slate-400">LEI</span>}
                      </div>
                    )}
                  </div>
                  <button onClick={() => removeCompany(co.id)}
                          className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1 text-[10px]">
                    {co.critical_severity_count > 0 && (
                      <span className="rounded bg-rose-200 px-1.5 py-0.5 font-bold text-rose-900">{co.critical_severity_count} critical</span>
                    )}
                    {co.high_severity_count > 0 && (
                      <span className="rounded bg-amber-200 px-1.5 py-0.5 font-bold text-amber-900">{co.high_severity_count} high</span>
                    )}
                    {co.signal_count === 0 && co.last_scanned_at && (
                      <span className="text-slate-400 italic">no signals</span>
                    )}
                    {!co.last_scanned_at && (
                      <span className="text-slate-400 italic">never scanned</span>
                    )}
                  </div>
                  <button onClick={() => scan(co.id)} disabled={scanning}
                          className="text-[10.5px] font-medium text-indigo-600 hover:underline disabled:opacity-50">
                    Scan now
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Filters */}
      {signals.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="font-medium text-slate-500 uppercase tracking-wider">Filter:</span>
          <select value={filterType} onChange={(e) => setFilterType(e.target.value as SignalType | "")}
                  className="rounded border border-slate-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-800">
            <option value="">All types</option>
            {Object.entries(SIGNAL_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={filterSeverity} onChange={(e) => setFilterSeverity(e.target.value)}
                  className="rounded border border-slate-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-800">
            <option value="">All severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
      )}

      {/* Trending patterns — show accelerating / sustained */}
      {trends.filter((t) => t.signals_180d >= 2).length > 0 && (
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
            <TrendingUp className="h-3.5 w-3.5" /> Pattern Detection — companies showing repeated signals
          </h2>
          <div className="grid gap-2 md:grid-cols-2">
            {trends.filter((t) => t.signals_180d >= 2).slice(0, 8).map((t) => {
              const accentColor = t.accelerating ? "rose" : t.sustained ? "amber" : "slate";
              return (
                <div key={`${t.watchlist_id}-${t.signal_type}`}
                     className={`rounded-lg border-l-4 border-${accentColor}-400 bg-white p-2.5 dark:bg-slate-900`}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[12px] font-bold text-slate-900 dark:text-white">{t.company_name}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                      t.accelerating ? "bg-rose-200 text-rose-900" :
                      t.sustained ? "bg-amber-200 text-amber-900" :
                      "bg-slate-200 text-slate-700"
                    }`}>
                      {t.pattern === "accelerating" ? "↑ Accelerating" : t.pattern === "sustained" ? "→ Sustained" : "1× signal"}
                    </span>
                  </div>
                  <p className="text-[11.5px] text-slate-700 dark:text-slate-300">
                    <span className="font-medium">{t.label}</span>:{" "}
                    <span className="font-mono">{t.signals_30d}</span> in 30d ·{" "}
                    <span className="font-mono">{t.signals_90d}</span> in 90d ·{" "}
                    <span className="font-mono">{t.signals_180d}</span> in 180d
                  </p>
                  <p className="mt-1 text-[10px] italic text-slate-500">
                    {t.accelerating ? "Most signals are recent — pursue this quarter" :
                     t.sustained ? "Consistent pattern across timeframes — confirmed advisory window" :
                     "Single recent signal — monitor"}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Signals */}
      <section>
        <h2 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
          <AlertTriangle className="h-3.5 w-3.5" /> Active Signals ({filteredSignals.length})
        </h2>
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
        ) : filteredSignals.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-8 text-center dark:border-slate-700 dark:bg-slate-900/50">
            <Shield className="mx-auto mb-3 h-8 w-8 text-slate-400" />
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {companies.length === 0
                ? "Add companies to your watchlist, then click Scan all to extract executive signals from their SEC filings."
                : "No active signals. Click Scan all to refresh from the latest filings."}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredSignals.map((s) => {
              const color = SIGNAL_COLORS[s.signal_type];
              return (
                <article key={s.id} className={`rounded-lg border-l-4 border-${color}-400 bg-white p-3 shadow-sm dark:bg-slate-900`}>
                  <div className="mb-1.5 flex flex-wrap items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase border ${SEVERITY_STYLE[s.severity]}`}>{s.severity}</span>
                      <span className="text-[10.5px] font-medium text-slate-600">{SIGNAL_LABELS[s.signal_type]}</span>
                      <span className="text-[10.5px] text-slate-400">·</span>
                      <span className="text-[11px] font-semibold text-slate-900 dark:text-white">{s.watchlist_companies.company_name}</span>
                      {s.watchlist_companies.ticker && (
                        <span className="font-mono text-[10px] text-slate-400">{s.watchlist_companies.ticker}</span>
                      )}
                      <span className="text-[10px] text-slate-400">· {s.evidence_page}</span>
                    </div>
                    <button onClick={() => dismissSignal(s.id)} className="text-[10px] text-slate-400 hover:text-rose-600">
                      Dismiss
                    </button>
                  </div>
                  <p className="mb-1.5 text-[13px] font-semibold text-slate-900 dark:text-white">{s.headline}</p>
                  {s.evidence_quote && (
                    <blockquote className="mb-1.5 border-l-2 border-slate-300 pl-2 text-[11px] italic text-slate-600 dark:text-slate-400">
                      &ldquo;{s.evidence_quote}&rdquo;
                    </blockquote>
                  )}
                  {s.context && <p className="mb-1.5 text-[11.5px] text-slate-700 dark:text-slate-300">{s.context}</p>}
                  {s.pitch_angle && (
                    <div className={`rounded bg-${color}-50 dark:bg-${color}-950/30 px-2 py-1.5 text-[11px]`}>
                      <span className={`font-bold text-${color}-700 dark:text-${color}-300`}>Pitch angle:</span>{" "}
                      <span className={`text-${color}-900 dark:text-${color}-200`}>{s.pitch_angle}</span>
                    </div>
                  )}
                  <div className="mt-1.5 text-[10px] text-slate-400">
                    Confidence {Math.round(s.confidence * 100)}% · {new Date(s.created_at).toLocaleDateString()}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
