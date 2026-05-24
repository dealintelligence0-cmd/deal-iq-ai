"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Activity, Loader2, RefreshCw, ArrowRight, Clock, Sparkles, AlertTriangle, TrendingUp, Users, Shield, Briefcase } from "lucide-react";

type Signal = {
  id: string;
  watchlist_id: string;
  signal_type: string;
  category: string | null;
  severity: "critical" | "high" | "medium" | "low";
  confidence: number;
  headline: string;
  evidence_quote: string | null;
  context: string | null;
  pitch_angle: string | null;
  advisory_angle: string | null;
  target_focus: string | null;
  signal_ref: string | null;
  status: string;
  created_at: string;
  watchlist_companies: { id: string; company_name: string; ticker: string | null; sector: string | null; country: string | null };
};

const TABS = [
  { key: "all",        label: "All",        icon: Activity },
  { key: "leadership", label: "Leadership", icon: Users },
  { key: "financial",  label: "Financial",  icon: TrendingUp },
  { key: "sponsor",    label: "Sponsor",    icon: Briefcase },
  { key: "ip",         label: "IP",         icon: Shield },
];

const SEVERITY_STYLES: Record<string, { badge: string; label: string }> = {
  critical: { badge: "bg-rose-500/20 text-rose-300 border-rose-500/40",     label: "CRITICAL SIGNAL" },
  high:     { badge: "bg-amber-500/20 text-amber-300 border-amber-500/40",  label: "HIGH SIGNAL" },
  medium:   { badge: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40", label: "MEDIUM SIGNAL" },
  low:      { badge: "bg-slate-500/20 text-slate-300 border-slate-500/40",  label: "LOW SIGNAL" },
};

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const hr = diff / 3600000; const day = hr / 24;
  if (hr < 1)  return "<1 hour ago";
  if (hr < 24) return `${Math.round(hr)} hours ago`;
  if (day < 7) return `${Math.round(day)} days ago`;
  return new Date(iso).toLocaleDateString();
}

export default function SignalIntelHub() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [activeTab, setActiveTab] = useState("all");
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedToWs, setLoadedToWs] = useState<Set<string>>(new Set());

  const load = useCallback(async (cat?: string) => {
    setLoading(true);
    try {
      const url = cat && cat !== "all" ? `/api/signals?category=${cat}&limit=40` : "/api/signals?limit=40";
      const r = await fetch(url).then((x) => x.json());
      if (r.error) throw new Error(r.error);
      setSignals(r.signals ?? r.data ?? []);
    } catch (e: any) { setError(e?.message ?? "Load failed"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(activeTab); }, [activeTab, load]);

  async function scan() {
    setScanning(true); setError(null);
    try {
      const r = await fetch("/api/signals/scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Scan failed");
      await load(activeTab);
    } catch (e: any) { setError(e?.message ?? "Scan failed"); }
    finally { setScanning(false); }
  }

  async function loadToWorkspace(s: Signal) {
    setLoadedToWs((prev) => new Set(prev).add(s.id));
    try {
      const accountName = s.watchlist_companies.company_name;
      const r = await fetch("/api/narratives", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_name: accountName }),
      });
      if (!r.ok) {
        const j = await r.json();
        setError(j.error ?? "Failed to seed narrative");
      }
    } catch (e: any) {
      setError(e?.message ?? "Load to workspace failed");
    }
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: signals.length };
    for (const s of signals) {
      if (s.category) c[s.category] = (c[s.category] ?? 0) + 1;
    }
    return c;
  }, [signals]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900 dark:text-white">
            <Activity className="h-6 w-6 text-rose-500" />
            Signal Intel Hub
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Proprietary signals stream: live distressed opportunities, leadership shifts, and debt events.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-400">
            <Sparkles className="mr-1 inline h-3 w-3" /> MBB/BIG4 Intel
          </span>
          <button onClick={scan} disabled={scanning}
                  className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300 disabled:opacity-50">
            {scanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {scanning ? "Scanning…" : "Refresh scan"}
          </button>
        </div>
      </div>

      {error && <div className="rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">{error}</div>}

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-700">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = activeTab === t.key;
          const ct = counts[t.key] ?? 0;
          return (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
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

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
      ) : signals.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-8 text-center dark:border-slate-700 dark:bg-slate-900/50">
          <Activity className="mx-auto mb-3 h-8 w-8 text-slate-400" />
          <p className="text-sm text-slate-600 dark:text-slate-400">
            No signals in this category yet. Click <b>Refresh scan</b> to fetch the latest filings, board changes, and debt events from your watchlist companies.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {signals.map((s, idx) => {
            const sev = SEVERITY_STYLES[s.severity] ?? SEVERITY_STYLES.medium;
            const ref = s.signal_ref ?? `SIG_${idx + 1}`;
            const loaded = loadedToWs.has(s.id);
            return (
              <article key={s.id} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="text-[9.5px] font-bold uppercase tracking-wider text-slate-500">
                    Target Focus: <span className="text-slate-800 dark:text-slate-200">{s.target_focus ?? s.watchlist_companies.company_name}</span>
                  </div>
                  <span className={`rounded border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${sev.badge}`}>{sev.label}</span>
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

                {(s.advisory_angle || s.pitch_angle) && (
                  <div className="mt-3 rounded border border-rose-200 bg-rose-50/40 p-2 dark:border-rose-900 dark:bg-rose-950/20">
                    <div className="text-[9.5px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400">Advisory Angle:</div>
                    <p className="mt-1 font-mono text-[11px] italic text-slate-700 dark:text-slate-300">
                      {s.advisory_angle ?? s.pitch_angle}
                    </p>
                  </div>
                )}

                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 dark:border-slate-800">
                  <span className="text-[9.5px] text-slate-500">Signal reference: {ref}</span>
                  <button onClick={() => loadToWorkspace(s)} disabled={loaded}
                          className="flex items-center gap-1 rounded border border-rose-200 bg-white px-2 py-1 text-[10.5px] font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900 dark:bg-slate-900 dark:text-rose-400 dark:hover:bg-rose-950/30">
                    {loaded ? "Loaded ✓" : <>Load Signal To Workspace <ArrowRight className="h-3 w-3" /></>}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
