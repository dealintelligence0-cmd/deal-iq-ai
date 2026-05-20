"use client";

import { useState, useEffect, useCallback } from "react";
import { Network, Loader2, RefreshCw, Plus, X, TrendingUp, AlertTriangle, Trophy, MapPin } from "lucide-react";

type Leader = {
  advisor_id: string;
  name: string;
  display_name: string;
  tier: string | null;
  country: string | null;
  deal_count: number;
  buyer_advisor_count: number;
  target_advisor_count: number;
  manual_confirmed: number;
  sectors: string[] | null;
  geographies: string[] | null;
  avg_confidence: number;
  most_recent_deal_at: string;
};

type HeatRow = {
  advisor_id: string;
  display_name: string;
  sector: string;
  deals: number;
};

type Whitespace = {
  id: string;
  buyer: string | null;
  target: string | null;
  dominant_sector: string | null;
  dominant_geography: string | null;
  intelligence_size: string | null;
  heading: string;
  deal_date: string | null;
};

type LastRun = {
  status: string;
  started_at: string;
  completed_at: string | null;
  deals_scanned: number;
  advisors_found: number;
  new_advisors: number;
  cost_usd: number;
  error: string | null;
} | null;

const TIER_LABELS: Record<string, string> = {
  bulge_bracket: "Bulge Bracket",
  elite_boutique: "Elite Boutique",
  big4: "Big 4",
  mbb: "MBB",
  mid_market: "Mid-Market",
  regional: "Regional",
  other: "Other",
};

const TIER_COLORS: Record<string, string> = {
  bulge_bracket: "indigo",
  elite_boutique: "purple",
  big4: "emerald",
  mbb: "rose",
  mid_market: "amber",
  regional: "sky",
  other: "slate",
};

export default function AdvisorsPage() {
  const [leaderboard, setLeaderboard] = useState<Leader[]>([]);
  const [heatmap, setHeatmap] = useState<HeatRow[]>([]);
  const [whitespace, setWhitespace] = useState<Whitespace[]>([]);
  const [lastRun, setLastRun] = useState<LastRun>(null);
  const [loading, setLoading] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualModal, setManualModal] = useState<{ dealId: string; dealLabel: string } | null>(null);
  const [manualForm, setManualForm] = useState({ advisor_name: "", role: "buyer_advisor", side: "buy" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/advisors").then((x) => x.json());
      if (r.error) throw new Error(r.error);
      setLeaderboard(r.leaderboard ?? []);
      setHeatmap(r.heatmap ?? []);
      setWhitespace(r.whitespace ?? []);
      setLastRun(r.lastRun ?? null);
    } catch (e: any) { setError(e?.message ?? "Load failed"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function extract() {
    setExtracting(true); setError(null);
    try {
      const r = await fetch("/api/advisors/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ max_deals: 25 }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Extraction failed");
      await load();
    } catch (e: any) { setError(e?.message ?? "Extraction failed"); }
    finally { setExtracting(false); }
  }

  async function submitManual() {
    if (!manualModal || !manualForm.advisor_name.trim()) return;
    setError(null);
    try {
      const r = await fetch("/api/advisors/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          canonical_id: manualModal.dealId,
          advisor_name: manualForm.advisor_name.trim(),
          role: manualForm.role,
          side: manualForm.side,
        }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Add failed");
      setManualModal(null);
      setManualForm({ advisor_name: "", role: "buyer_advisor", side: "buy" });
      await load();
    } catch (e: any) { setError(e?.message ?? "Add failed"); }
  }

  // Build sector heatmap pivot
  const sectorsList = Array.from(new Set(heatmap.map((h) => h.sector))).sort();
  const heatmapMatrix = new Map<string, Map<string, number>>();
  for (const h of heatmap) {
    const row = heatmapMatrix.get(h.display_name) ?? new Map<string, number>();
    row.set(h.sector, h.deals);
    heatmapMatrix.set(h.display_name, row);
  }
  // Top 8 advisors for heatmap, by total deals
  const topAdvisorsForHeatmap = leaderboard.slice(0, 8).map((l) => l.display_name);

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900 dark:text-white">
            <Network className="h-6 w-6 text-sky-600" />
            Advisor Ecosystem Map
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Who advised whom in your pipeline. AI extracts named advisors from deal headings and infers likely advisors for the rest. Click any whitespace deal to log the incumbent yourself.
          </p>
        </div>
        <button onClick={extract} disabled={extracting}
                className="flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-medium text-sky-700 hover:bg-sky-100 disabled:opacity-50 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-300">
          {extracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {extracting ? "Extracting…" : "Run extraction"}
        </button>
      </div>

      {lastRun && (
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
          {lastRun.completed_at && <span>Last extraction: {new Date(lastRun.completed_at).toLocaleString()}</span>}
          <span>· {lastRun.deals_scanned} deals scanned</span>
          <span>· {lastRun.advisors_found} relationships found</span>
          {lastRun.new_advisors > 0 && <span>· {lastRun.new_advisors} new advisors added to registry</span>}
        </div>
      )}

      {error && <div className="rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">{error}</div>}
      {!error && lastRun?.error && (
        <div className="rounded border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <b>Last extraction note:</b> {lastRun.error}
        </div>
      )}

      {/* Manual add modal */}
      {manualModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setManualModal(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl dark:bg-slate-900">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-bold">Log advisor for deal</h2>
              <button onClick={() => setManualModal(null)}><X className="h-4 w-4 text-slate-400" /></button>
            </div>
            <p className="mb-3 text-[11.5px] text-slate-500">{manualModal.dealLabel}</p>
            <div className="space-y-3 text-sm">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-600">Advisor name</label>
                <input value={manualForm.advisor_name} onChange={(e) => setManualForm({ ...manualForm, advisor_name: e.target.value })}
                       placeholder="e.g. Goldman Sachs"
                       className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-600">Role</label>
                  <select value={manualForm.role} onChange={(e) => setManualForm({ ...manualForm, role: e.target.value })}
                          className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800">
                    <option value="buyer_advisor">Buyer advisor</option>
                    <option value="target_advisor">Target advisor</option>
                    <option value="lender">Lender</option>
                    <option value="legal">Legal counsel</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-600">Side</label>
                  <select value={manualForm.side} onChange={(e) => setManualForm({ ...manualForm, side: e.target.value })}
                          className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800">
                    <option value="buy">Buy-side</option>
                    <option value="sell">Sell-side</option>
                    <option value="both">Both</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setManualModal(null)} className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">Cancel</button>
              <button onClick={submitManual} disabled={!manualForm.advisor_name.trim()}
                      className="rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50">
                <Plus className="mr-1 inline h-3.5 w-3.5" /> Log advisor
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
      ) : leaderboard.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-8 text-center dark:border-slate-700 dark:bg-slate-900/50">
          <Network className="mx-auto mb-3 h-8 w-8 text-slate-400" />
          <p className="text-sm text-slate-600 dark:text-slate-400">
            No advisor data yet. Click <b>Run extraction</b> to start. The AI will scan up to 25 deals and identify advisors from headings + sector/size context.
          </p>
        </div>
      ) : (
        <>
          {/* Leaderboard */}
          <section>
            <h2 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
              <Trophy className="h-3.5 w-3.5" /> Advisor leaderboard ({leaderboard.length})
            </h2>
            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
              <table className="w-full text-[11.5px]">
                <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800">
                  <tr>
                    <th className="px-2 py-1.5 text-left">Advisor</th>
                    <th className="px-2 py-1.5 text-left">Tier</th>
                    <th className="px-2 py-1.5 text-right">Deals</th>
                    <th className="px-2 py-1.5 text-right">Buy-side</th>
                    <th className="px-2 py-1.5 text-right">Sell-side</th>
                    <th className="px-2 py-1.5 text-right">Manual</th>
                    <th className="px-2 py-1.5 text-left">Top sectors</th>
                    <th className="px-2 py-1.5 text-right">Conf.</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((l) => {
                    const color = TIER_COLORS[l.tier ?? "other"] ?? "slate";
                    return (
                      <tr key={l.advisor_id} className="border-t border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/30">
                        <td className="px-2 py-1.5 font-medium text-slate-900 dark:text-white">{l.display_name}</td>
                        <td className="px-2 py-1.5">
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase bg-${color}-100 text-${color}-800 dark:bg-${color}-950 dark:text-${color}-300`}>
                            {TIER_LABELS[l.tier ?? "other"] ?? "Other"}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono font-bold">{l.deal_count}</td>
                        <td className="px-2 py-1.5 text-right font-mono">{l.buyer_advisor_count || "—"}</td>
                        <td className="px-2 py-1.5 text-right font-mono">{l.target_advisor_count || "—"}</td>
                        <td className="px-2 py-1.5 text-right font-mono text-emerald-600">{l.manual_confirmed || "—"}</td>
                        <td className="px-2 py-1.5 text-[10.5px] text-slate-600">{(l.sectors ?? []).slice(0, 3).join(", ") || "—"}</td>
                        <td className="px-2 py-1.5 text-right font-mono">{(l.avg_confidence * 100).toFixed(0)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Sector heatmap */}
          {sectorsList.length > 0 && (
            <section>
              <h2 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                <TrendingUp className="h-3.5 w-3.5" /> Sector × Advisor heatmap (top {topAdvisorsForHeatmap.length})
              </h2>
              <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                <table className="w-full text-[11px]">
                  <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800">
                    <tr>
                      <th className="px-2 py-1.5 text-left">Sector</th>
                      {topAdvisorsForHeatmap.map((a) => (
                        <th key={a} className="border-l border-slate-200 px-1 py-1.5 text-center dark:border-slate-700">
                          <div className="whitespace-nowrap text-[10px]">{a}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sectorsList.map((sec) => (
                      <tr key={sec} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="px-2 py-1 font-medium text-slate-700 dark:text-slate-300">{sec}</td>
                        {topAdvisorsForHeatmap.map((a) => {
                          const count = heatmapMatrix.get(a)?.get(sec) ?? 0;
                          const intensity = Math.min(count / 5, 1); // saturate at 5+ deals
                          const bg = count === 0
                            ? "transparent"
                            : `rgba(14, 165, 233, ${0.15 + intensity * 0.7})`;
                          return (
                            <td key={a} className="border-l border-slate-200 px-1 py-1 text-center font-mono dark:border-slate-700"
                                style={{ backgroundColor: bg }}>
                              {count > 0 ? count : "·"}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}

      {/* Whitespace deals */}
      <section>
        <h2 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> Whitespace deals ({whitespace.length}) — open opportunities
        </h2>
        {whitespace.length === 0 ? (
          <p className="rounded border border-emerald-200 bg-emerald-50 p-3 text-[12px] text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
            All deals have at least one advisor identified. Click <b>Run extraction</b> if you&apos;ve recently imported new deals.
          </p>
        ) : (
          <div className="space-y-1.5">
            {whitespace.slice(0, 20).map((d) => (
              <article key={d.id}
                       className="rounded-lg border border-slate-200 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-900">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] font-medium text-slate-900 dark:text-white">
                      {d.buyer ?? "?"} → {d.target ?? "?"}
                    </div>
                    <div className="flex flex-wrap gap-x-2 text-[10.5px] text-slate-500">
                      {d.dominant_sector && <span>{d.dominant_sector}</span>}
                      {d.dominant_geography && <span>· {d.dominant_geography}</span>}
                      {d.intelligence_size && <span>· {d.intelligence_size}</span>}
                      {d.deal_date && <span>· {new Date(d.deal_date).toLocaleDateString()}</span>}
                    </div>
                    <p className="mt-1 truncate text-[11px] italic text-slate-600 dark:text-slate-400">{d.heading}</p>
                  </div>
                  <button onClick={() => setManualModal({ dealId: d.id, dealLabel: `${d.buyer ?? "?"} → ${d.target ?? "?"}` })}
                          className="rounded border border-sky-300 bg-sky-50 px-2 py-1 text-[10.5px] font-medium text-sky-700 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-300">
                    + Log advisor
                  </button>
                </div>
              </article>
            ))}
            {whitespace.length > 20 && (
              <p className="px-2 text-[10.5px] italic text-slate-500">Showing first 20 of {whitespace.length} whitespace deals.</p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
