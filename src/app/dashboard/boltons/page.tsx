"use client";

import { useState, useEffect, useCallback } from "react";
import { Target, RefreshCw, Loader2, Sparkles, TrendingUp, X, ChevronRight, AlertTriangle, ExternalLink } from "lucide-react";

type Buyer = {
  buyer_name: string;
  deal_count: number;
  deals_24m: number;
  sectors: string[] | null;
  geographies: string[] | null;
  typical_size_band: string | null;
  profile: { id: string; acquisition_thesis: string | null; last_refreshed_at: string | null } | null;
  latest_shortlist: { id: string; total_targets: number; refreshed_at: string } | null;
};

type Target = {
  id: string;
  target_name: string;
  target_sector: string | null;
  target_geography: string | null;
  estimated_size_band: string | null;
  fit_score: number;
  strategic_rationale: string;
  synergy_thesis: string | null;
  whitespace_angle: string | null;
  outreach_angle: string | null;
  risk_flags: string[];
  status: string;
  partner_notes: string | null;
  rank_position: number;
};

type Shortlist = {
  id: string;
  buyer_name: string;
  request_brief: string | null;
  target_tier: string;
  total_targets: number;
  cost_usd: number;
  refreshed_at: string;
  ai_provider: string | null;
  ai_model: string | null;
  buyer_profiles: {
    total_deals: number;
    deals_last_24m: number;
    primary_sectors: string[];
    primary_geographies: string[];
    typical_deal_band: string | null;
    acquisition_thesis: string | null;
  } | null;
};

const TIER_OPTIONS = [
  { value: "any",   label: "Any size" },
  { value: "mid",   label: "Mid (INR 2-21bn)" },
  { value: "large", label: "Large (INR 21bn-100bn)" },
  { value: "mega",  label: "Mega (> INR 100bn)" },
];

export default function BoltOnsPage() {
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  // Form
  const [selectedBuyer, setSelectedBuyer] = useState<string>("");
  const [tier, setTier] = useState<"any"|"mid"|"large"|"mega">("any");
  const [brief, setBrief] = useState<string>("");

  // Active shortlist
  const [activeShortlistId, setActiveShortlistId] = useState<string | null>(null);
  const [activeShortlist, setActiveShortlist] = useState<Shortlist | null>(null);
  const [activeTargets, setActiveTargets] = useState<Target[]>([]);

  const loadBuyers = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/boltons/buyers").then((x) => x.json());
      setBuyers(r.buyers ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadBuyers(); }, [loadBuyers]);

  async function loadShortlist(id: string) {
    setActiveShortlistId(id);
    try {
      const r = await fetch(`/api/boltons/shortlists?id=${id}`).then((x) => x.json());
      setActiveShortlist(r.shortlist);
      setActiveTargets(r.targets ?? []);
    } catch (e: any) { setError(e?.message ?? "Load failed"); }
  }

  async function generate() {
    if (!selectedBuyer) { setError("Pick a buyer first."); return; }
    setGenerating(true); setError(null); setWarning(null);
    try {
      const r = await fetch("/api/boltons/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyer_name: selectedBuyer,
          request_brief: brief.trim() || undefined,
          target_tier: tier,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Generation failed");

      if (j.generation_note) setWarning(`AI note: ${j.generation_note}`);
      if (j.shortlist_id) await loadShortlist(j.shortlist_id);
      await loadBuyers();  // refresh latest_shortlist references
    } catch (e: any) { setError(e?.message ?? "Generation failed"); }
    finally { setGenerating(false); }
  }

  async function updateTargetStatus(targetId: string, status: "pursued" | "dismissed" | "shortlisted") {
    try {
      await fetch(`/api/boltons/targets/${targetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      setActiveTargets((prev) => prev.map((t) => t.id === targetId ? { ...t, status } : t));
    } catch (e: any) { setError(e?.message ?? "Update failed"); }
  }

  const fitScoreColor = (s: number): string => {
    if (s >= 80) return "rose";       // obvious bolt-on
    if (s >= 60) return "amber";      // strong fit
    if (s >= 40) return "indigo";     // adjacent
    return "slate";                   // stretch
  };
  const fitScoreLabel = (s: number): string => {
    if (s >= 80) return "Obvious";
    if (s >= 60) return "Strong";
    if (s >= 40) return "Adjacent";
    return "Stretch";
  };

  // Buyers with prior shortlists, for the side rail
  const buyersWithShortlists = buyers.filter((b) => b.latest_shortlist !== null);

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900 dark:text-white">
            <Target className="h-6 w-6 text-emerald-600" />
            Buyer Acquisition Bolt-on Engine
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            For any acquirer in your pipeline, generate a 6-10 target bolt-on shortlist with strategic rationale, fit score, synergy thesis, and outreach angle.
          </p>
        </div>
      </div>

      {error && <div className="rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">{error}</div>}
      {!error && warning && (
        <div className="rounded border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <b>Note:</b> {warning}
        </div>
      )}

      {/* Generator form */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <h2 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
          <Sparkles className="h-3.5 w-3.5" /> Generate a new shortlist
        </h2>
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-400">
              Buyer ({buyers.length} in pipeline)
            </label>
            <select
              value={selectedBuyer}
              onChange={(e) => setSelectedBuyer(e.target.value)}
              className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-[12px] dark:border-slate-700 dark:bg-slate-800"
            >
              <option value="">-- pick a buyer --</option>
              {buyers.map((b) => (
                <option key={b.buyer_name} value={b.buyer_name}>
                  {b.buyer_name} ({b.deal_count} deal{b.deal_count !== 1 ? "s" : ""}{b.deals_24m > 0 ? `, ${b.deals_24m} in 24m` : ""})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-400">Target tier</label>
            <select
              value={tier}
              onChange={(e) => setTier(e.target.value as typeof tier)}
              className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-[12px] dark:border-slate-700 dark:bg-slate-800"
            >
              {TIER_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={generate}
              disabled={generating || !selectedBuyer}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {generating ? "Generating…" : "Generate shortlist"}
            </button>
          </div>
        </div>
        <div className="mt-3">
          <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-400">
            Partner directive (optional)
          </label>
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder='e.g. "Focus on India consumer brands &lt; INR 5bn. Prefer family-owned. Avoid regulatory-heavy categories."'
            rows={2}
            className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-[12px] dark:border-slate-700 dark:bg-slate-800"
          />
          <p className="mt-1 text-[10px] italic text-slate-500">Tip: A specific directive sharpens the shortlist. Without it, the AI just extends the buyer&apos;s existing pattern.</p>
        </div>
      </section>

      {/* Buyer profile preview when selected */}
      {selectedBuyer && (() => {
        const b = buyers.find((x) => x.buyer_name === selectedBuyer);
        if (!b) return null;
        return (
          <section className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/50">
            <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">Buyer pattern</h3>
            <div className="grid gap-2 text-[12px] md:grid-cols-4">
              <div><span className="text-slate-500">Deals:</span> <b>{b.deal_count}</b> total · <b>{b.deals_24m}</b> in 24m</div>
              <div><span className="text-slate-500">Sectors:</span> {(b.sectors ?? []).slice(0, 3).join(", ") || "—"}</div>
              <div><span className="text-slate-500">Geos:</span> {(b.geographies ?? []).slice(0, 3).join(", ") || "—"}</div>
              <div><span className="text-slate-500">Typical size:</span> {b.typical_size_band ?? "—"}</div>
            </div>
            {b.profile?.acquisition_thesis && (
              <p className="mt-2 italic text-[12px] text-slate-700 dark:text-slate-300">&ldquo;{b.profile.acquisition_thesis}&rdquo;</p>
            )}
          </section>
        );
      })()}

      {/* Active shortlist results */}
      {activeShortlist && (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
              <TrendingUp className="h-3.5 w-3.5" /> Shortlist — {activeShortlist.buyer_name} ({activeTargets.length} targets)
            </h2>
            <span className="text-[10px] text-slate-400">
              {activeShortlist.ai_provider}/{activeShortlist.ai_model} · ${activeShortlist.cost_usd?.toFixed(4) ?? "—"} · {new Date(activeShortlist.refreshed_at).toLocaleString()}
            </span>
          </div>
          {activeShortlist.request_brief && (
            <div className="mb-2 rounded border border-indigo-200 bg-indigo-50 p-2 text-[11px] text-indigo-900 dark:border-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-200">
              <b>Directive:</b> {activeShortlist.request_brief}
            </div>
          )}
          {activeTargets.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-8 text-center dark:border-slate-700 dark:bg-slate-900/50">
              <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-amber-400" />
              <p className="text-sm text-slate-600 dark:text-slate-400">
                No targets returned. The AI may have struggled to ground the request — try a more specific partner directive, or pick a tier closer to the buyer&apos;s typical pattern.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {activeTargets.map((t) => {
                const color = fitScoreColor(t.fit_score);
                const label = fitScoreLabel(t.fit_score);
                return (
                  <article key={t.id}
                           className={`rounded-lg border-l-4 border-${color}-400 bg-white p-3 shadow-sm dark:bg-slate-900 ${t.status === 'dismissed' ? 'opacity-50' : ''}`}>
                    <div className="mb-1.5 flex flex-wrap items-start justify-between gap-2">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="text-[10px] font-bold text-slate-400">#{t.rank_position}</span>
                        <span className="text-sm font-bold text-slate-900 dark:text-white">{t.target_name}</span>
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase bg-${color}-200 text-${color}-900`}>
                          {t.fit_score}/100 · {label}
                        </span>
                        {t.target_sector && <span className="text-[10.5px] text-slate-500">{t.target_sector}</span>}
                        {t.target_geography && <span className="text-[10.5px] text-slate-500">· {t.target_geography}</span>}
                        {t.estimated_size_band && <span className="text-[10.5px] text-slate-500">· {t.estimated_size_band}</span>}
                      </div>
                      <div className="flex items-center gap-1">
                        {t.status === "pursued" && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-emerald-700">Pursuing</span>}
                        {t.status === "dismissed" && <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-700">Dismissed</span>}
                        {t.status === "shortlisted" && (
                          <>
                            <button onClick={() => updateTargetStatus(t.id, "pursued")} className="text-[10.5px] font-medium text-emerald-600 hover:underline">Pursue</button>
                            <span className="text-slate-300">·</span>
                            <button onClick={() => updateTargetStatus(t.id, "dismissed")} className="text-[10.5px] font-medium text-rose-600 hover:underline">Dismiss</button>
                          </>
                        )}
                        {t.status !== "shortlisted" && (
                          <button onClick={() => updateTargetStatus(t.id, "shortlisted")} className="text-[10.5px] font-medium text-indigo-600 hover:underline">Reset</button>
                        )}
                      </div>
                    </div>
                    <p className="mb-1.5 text-[12px] font-medium text-slate-800 dark:text-slate-200">{t.strategic_rationale}</p>
                    <div className="grid gap-1.5 md:grid-cols-3">
                      {t.synergy_thesis && (
                        <div className="rounded bg-emerald-50 px-2 py-1 text-[11px] dark:bg-emerald-950/30">
                          <span className="font-bold text-emerald-700 dark:text-emerald-300">Synergy:</span>{" "}
                          <span className="text-emerald-900 dark:text-emerald-200">{t.synergy_thesis}</span>
                        </div>
                      )}
                      {t.whitespace_angle && (
                        <div className="rounded bg-indigo-50 px-2 py-1 text-[11px] dark:bg-indigo-950/30">
                          <span className="font-bold text-indigo-700 dark:text-indigo-300">Whitespace:</span>{" "}
                          <span className="text-indigo-900 dark:text-indigo-200">{t.whitespace_angle}</span>
                        </div>
                      )}
                      {t.outreach_angle && (
                        <div className="rounded bg-amber-50 px-2 py-1 text-[11px] dark:bg-amber-950/30">
                          <span className="font-bold text-amber-700 dark:text-amber-300">Outreach:</span>{" "}
                          <span className="text-amber-900 dark:text-amber-200">{t.outreach_angle}</span>
                        </div>
                      )}
                    </div>
                    {t.risk_flags.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {t.risk_flags.map((r, i) => (
                          <span key={i} className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] text-rose-800 dark:bg-rose-950/40 dark:text-rose-300">⚠ {r}</span>
                        ))}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Existing shortlists side panel */}
      {buyersWithShortlists.length > 0 && !activeShortlistId && (
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
            <Target className="h-3.5 w-3.5" /> Recent shortlists
          </h2>
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            {buyersWithShortlists.slice(0, 12).map((b) => (
              <button
                key={b.buyer_name}
                onClick={() => loadShortlist(b.latest_shortlist!.id)}
                className="rounded-lg border border-slate-200 bg-white p-2.5 text-left hover:border-emerald-300 hover:shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:hover:border-emerald-700"
              >
                <div className="flex items-center justify-between">
                  <div className="truncate text-[12.5px] font-bold text-slate-900 dark:text-white">{b.buyer_name}</div>
                  <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                </div>
                <div className="text-[10.5px] text-slate-500">
                  {b.latest_shortlist!.total_targets} targets · {new Date(b.latest_shortlist!.refreshed_at).toLocaleDateString()}
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      )}
    </div>
  );
}
