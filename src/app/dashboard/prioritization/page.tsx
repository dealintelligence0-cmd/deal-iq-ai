



"use client";

/**
 * Strategic Deal Prioritization Dashboard
 *
 * Reads the deals table (already enriched with priority_score, advisory_score,
 * risk_score by the enrichment pipeline) and ranks them by a composite
 * "Pursue Score" that partners can re-weight live with sliders. Each row shows
 * the four sub-scores plus the AI rationale, and a one-click jump to start
 * a proposal pre-filled with the deal context.
 *
 * Composite score = w_priority * priority + w_advisory * advisory
 *                 + w_size * size_normalized
 *                 - w_risk * risk_score
 *
 * All weights default to sensible values and stay between 0 and 1.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Loader2, ArrowUpDown, Filter as FilterIcon, Sparkles,
  TrendingUp, ShieldAlert, DollarSign, Target, FileText,
} from "lucide-react";
import { fetchDeals, formatUsdShort, type Deal } from "@/lib/analytics";
import ScoringMethodologyCard from "@/components/dashboard/ScoringMethodologyCard";

type Weights = {
  priority: number;
  advisory: number;
  size: number;
  risk: number;
};

const DEFAULT_WEIGHTS: Weights = {
  priority: 0.35,
  advisory: 0.30,
  size: 0.20,
  risk: 0.15,
};

type SortKey = "pursue" | "priority" | "advisory" | "size" | "risk" | "recent";

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function computePursueScore(deal: Deal, weights: Weights, maxSize: number): number {
  // All three input scores are on a 0-100 scale (verified in production data).
  const priority = clamp01((deal.priority_score ?? 0) / 100);
  const advisory = clamp01((deal.advisory_score ?? 0) / 100);
  const size = maxSize > 0 ? clamp01((deal.normalized_value_usd ?? 0) / maxSize) : 0;
  const risk = clamp01((deal.risk_score ?? 0) / 100);

  const score =
    weights.priority * priority +
    weights.advisory * advisory +
    weights.size * size -
    weights.risk * risk;

  const positiveTotal = weights.priority + weights.advisory + weights.size;
  const normalized = positiveTotal > 0 ? (score / positiveTotal) * 100 : 0;
  return Math.max(0, Math.min(100, normalized));
}

function recommendationFor(score: number): { label: string; color: string } {
  // Tuned to the actual top-tier distribution: top ~5% of deals are PURSUE,
  // next ~25% are HOLD (watch-list), rest is REJECT.
  if (score >= 60) return { label: "PURSUE", color: "bg-emerald-100 text-emerald-700 border-emerald-200" };
  if (score >= 40) return { label: "HOLD", color: "bg-amber-100 text-amber-700 border-amber-200" };
  return { label: "REJECT", color: "bg-slate-100 text-slate-600 border-slate-200" };
}

export default function PrioritizationPage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [weights, setWeights] = useState<Weights>(DEFAULT_WEIGHTS);
  const [sortKey, setSortKey] = useState<SortKey>("pursue");
  const [sectorFilter, setSectorFilter] = useState<string>("");
  const [countryFilter, setCountryFilter] = useState<string>("");
  const [decisionFilter, setDecisionFilter] = useState<"all" | "pursue" | "hold" | "reject">("all");

  useEffect(() => {
    (async () => {
      try {
        const d = await fetchDeals();
        setDeals(d);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed to load deals");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Reference values for normalization
  const maxSize = useMemo(() => {
    const vals = deals.map((d) => d.normalized_value_usd ?? 0);
    return vals.length ? Math.max(...vals) : 0;
  }, [deals]);

  // Distinct sectors / countries for the filter dropdowns
  const sectors = useMemo(() => {
    const s = new Set<string>();
    deals.forEach((d) => { if (d.sector) s.add(d.sector); });
    return Array.from(s).sort();
  }, [deals]);

  const countries = useMemo(() => {
    const c = new Set<string>();
    deals.forEach((d) => { if (d.country) c.add(d.country); });
    return Array.from(c).sort();
  }, [deals]);

  // Composite scoring + filter + sort
  const ranked = useMemo(() => {
    const withScores = deals.map((d) => ({
      deal: d,
      pursue: computePursueScore(d, weights, maxSize),
    }));

    const filtered = withScores.filter(({ deal, pursue }) => {
      if (sectorFilter && deal.sector !== sectorFilter) return false;
      if (countryFilter && deal.country !== countryFilter) return false;
      if (decisionFilter !== "all") {
        const rec = recommendationFor(pursue).label.toLowerCase();
        if (rec !== decisionFilter) return false;
      }
      return true;
    });

    const sortFns: Record<SortKey, (a: typeof filtered[0], b: typeof filtered[0]) => number> = {
      pursue:   (a, b) => b.pursue - a.pursue,
      priority: (a, b) => (b.deal.priority_score ?? 0) - (a.deal.priority_score ?? 0),
      advisory: (a, b) => (b.deal.advisory_score ?? 0) - (a.deal.advisory_score ?? 0),
      size:     (a, b) => (b.deal.normalized_value_usd ?? 0) - (a.deal.normalized_value_usd ?? 0),
      risk:     (a, b) => (b.deal.risk_score ?? 0) - (a.deal.risk_score ?? 0),
      recent:   (a, b) => new Date(b.deal.created_at).getTime() - new Date(a.deal.created_at).getTime(),
    };
    filtered.sort(sortFns[sortKey]);
    return filtered;
  }, [deals, weights, maxSize, sortKey, sectorFilter, countryFilter, decisionFilter]);

  // Roll-up counts for the strip at the top
  const counts = useMemo(() => {
    const pursue = ranked.filter((r) => recommendationFor(r.pursue).label === "PURSUE").length;
    const hold = ranked.filter((r) => recommendationFor(r.pursue).label === "HOLD").length;
    const reject = ranked.length - pursue - hold;
    const totalValueUsd = ranked.reduce((s, r) => s + (r.deal.normalized_value_usd ?? 0), 0);
    const pursueValueUsd = ranked
      .filter((r) => recommendationFor(r.pursue).label === "PURSUE")
      .reduce((s, r) => s + (r.deal.normalized_value_usd ?? 0), 0);
    return { pursue, hold, reject, totalValueUsd, pursueValueUsd, total: ranked.length };
  }, [ranked]);

  if (loading) {
    return <div className="p-8"><Loader2 className="h-5 w-5 animate-spin text-indigo-600" /></div>;
  }
  if (err) {
    return <div className="p-8 text-red-600">Error: {err}</div>;
  }
  if (deals.length === 0) {
    return (
      <div className="mx-auto max-w-3xl p-8 text-center">
        <Sparkles className="mx-auto h-8 w-8 text-slate-300" />
        <h1 className="mt-4 text-xl font-semibold text-slate-700">No deals to prioritize yet</h1>
        <p className="mt-2 text-sm text-slate-500">
          Import deals via the Import Deals page, then enrich them on the AI Insights page so they
          receive priority / advisory / risk scores. Once scored, they&apos;ll appear here ranked by
          partner-pursuit potential.
        </p>
      </div>
    );
  }

  const unscored = deals.filter((d) => d.priority_score == null && d.advisory_score == null).length;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <Target className="h-6 w-6 text-indigo-600" />
          Deal Prioritization
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Composite Pursue Score blends partner-defined priority, advisory potential, deal size, and risk.
        </p>
      </div>

      <ScoringMethodologyCard />

      <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 p-3 dark:border-indigo-900 dark:bg-indigo-950/30">
        <p className="text-[12px] text-indigo-900 dark:text-indigo-200">
          <b>Pursue Score (composite):</b>{" "}
          <span className="font-mono text-[11px]">0.50·priority + 0.30·advisory + 0.20·size − 0.15·risk</span>
          {" "}— rebased to 0–100. Bands:{" "}
          <span className="rounded bg-emerald-200 px-1.5 py-0.5 text-emerald-900">PURSUE ≥ 60</span>{" "}
          <span className="rounded bg-amber-200 px-1.5 py-0.5 text-amber-900">HOLD 40–59</span>{" "}
          <span className="rounded bg-slate-200 px-1.5 py-0.5 text-slate-700">REJECT &lt; 40</span>.
          Weights are partner-tunable below.
        </p>
      </div>

      {/* TOP KPI STRIP */}
      <div className="grid gap-3 sm:grid-cols-4">
        <KpiTile
          label="PURSUE"
          value={counts.pursue}
          sub={`of ${counts.total} ranked`}
          color="emerald"
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <KpiTile
          label="HOLD"
          value={counts.hold}
          sub="needs review"
          color="amber"
          icon={<ArrowUpDown className="h-4 w-4" />}
        />
        <KpiTile
          label="Pursue Pipeline Value"
          value={formatUsdShort(counts.pursueValueUsd)}
          sub={`of ${formatUsdShort(counts.totalValueUsd)} total`}
          color="indigo"
          icon={<DollarSign className="h-4 w-4" />}
        />
        <KpiTile
          label="Reject"
          value={counts.reject}
          sub="low pursue score"
          color="slate"
          icon={<ShieldAlert className="h-4 w-4" />}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        {/* WEIGHT SLIDERS + FILTERS */}
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700">Score Weights</h3>
              <button
                onClick={() => setWeights(DEFAULT_WEIGHTS)}
                className="text-[10px] text-indigo-600 hover:underline"
              >
                Reset
              </button>
            </div>
            <WeightSlider label="Priority Signal"  value={weights.priority} onChange={(v) => setWeights({ ...weights, priority: v })} color="indigo" />
            <WeightSlider label="Advisory Potential" value={weights.advisory} onChange={(v) => setWeights({ ...weights, advisory: v })} color="emerald" />
            <WeightSlider label="Deal Size"         value={weights.size}     onChange={(v) => setWeights({ ...weights, size: v })}     color="amber" />
            <WeightSlider label="Risk (penalty)"    value={weights.risk}     onChange={(v) => setWeights({ ...weights, risk: v })}     color="red" />
            <p className="mt-3 text-[10px] leading-relaxed text-slate-400">
              Sliders re-rank live. Risk is subtracted from the composite score, so raising the risk
              weight makes flagged deals fall faster.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-700">
              <FilterIcon className="h-3 w-3" /> Filters
            </h3>
            <label className="text-[11px] font-medium text-slate-600">Sector</label>
            <select
              value={sectorFilter}
              onChange={(e) => setSectorFilter(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"
            >
              <option value="">All sectors</option>
              {sectors.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <label className="mt-3 block text-[11px] font-medium text-slate-600">Country</label>
            <select
              value={countryFilter}
              onChange={(e) => setCountryFilter(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"
            >
              <option value="">All countries</option>
              {countries.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <label className="mt-3 block text-[11px] font-medium text-slate-600">Decision</label>
            <select
              value={decisionFilter}
              onChange={(e) => setDecisionFilter(e.target.value as typeof decisionFilter)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"
            >
              <option value="all">All decisions</option>
              <option value="pursue">PURSUE only</option>
              <option value="hold">HOLD only</option>
              <option value="reject">REJECT only</option>
            </select>
            <label className="mt-3 block text-[11px] font-medium text-slate-600">Sort by</label>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"
            >
              <option value="pursue">Pursue Score (default)</option>
              <option value="priority">Priority signal</option>
              <option value="advisory">Advisory potential</option>
              <option value="size">Deal size</option>
              <option value="risk">Risk score</option>
              <option value="recent">Recency</option>
            </select>
          </div>
        </div>

        {/* RANKED LIST */}
        <div className="space-y-2">
          {ranked.slice(0, 100).map(({ deal, pursue }, rank) => {
            const rec = recommendationFor(pursue);
            const proposalParams = new URLSearchParams({
              deal_id: deal.id,
              buyer: deal.buyer ?? "",
              target: deal.target ?? "",
              sector: deal.sector ?? "",
              geography: deal.country ?? "",
              deal_size: deal.value_raw?.toString() ?? "",
            }).toString();
            return (
              <div
                key={deal.id}
                className="grid grid-cols-[40px_1fr_120px_120px] items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition hover:border-indigo-300 hover:shadow-md"
              >
                {/* Rank */}
                <div className="text-center">
                  <p className="font-mono text-lg font-bold text-slate-300">#{rank + 1}</p>
                </div>

                {/* Deal identity + scores */}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/dashboard/deals/${deal.id}`}
                      className="truncate text-sm font-semibold text-slate-900 hover:text-indigo-600"
                    >
                      {deal.buyer || "?"} → {deal.target || "?"}
                    </Link>
                    <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase ${rec.color}`}>
                      {rec.label}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-slate-500">
                    {[deal.sector, deal.country, deal.deal_type].filter(Boolean).join(" · ")}
                    {deal.normalized_value_usd ? ` · ${formatUsdShort(deal.normalized_value_usd)}` : ""}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px]">
                    <ScorePill label="Priority" value={deal.priority_score} color="indigo" />
                    <ScorePill label="Advisory" value={deal.advisory_score} color="emerald" />
                    <ScorePill label="Risk" value={deal.risk_score} color="red" />
                    {deal.targeting_recommendation && (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600">
                        AI: {deal.targeting_recommendation}
                      </span>
                    )}
                  </div>
                  {deal.deal_takeaway && (
                    <p className="mt-1.5 line-clamp-2 text-[11px] italic text-slate-600">
                      {deal.deal_takeaway}
                    </p>
                  )}
                </div>

                {/* Pursue Score gauge */}
                <div className="text-center">
                  <p className="font-mono text-2xl font-bold text-slate-900">{pursue.toFixed(0)}</p>
                  <p className="text-[10px] uppercase tracking-wide text-slate-400">Pursue</p>
                  <div className="mt-1 h-1 w-full rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${
                        pursue >= 75 ? "bg-emerald-500" : pursue >= 55 ? "bg-amber-500" : "bg-slate-400"
                      }`}
                      style={{ width: `${pursue}%` }}
                    />
                  </div>
                </div>

                {/* Action */}
                <div className="flex flex-col gap-1">
                  <Link
                    href={`/dashboard/proposals?${proposalParams}`}
                    className="flex items-center justify-center gap-1 rounded-md bg-indigo-600 px-2 py-1.5 text-[10px] font-semibold text-white hover:bg-indigo-700"
                  >
                    <FileText className="h-3 w-3" /> Propose
                  </Link>
                  <Link
                    href={`/dashboard/deals/${deal.id}`}
                    className="flex items-center justify-center rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Open
                  </Link>
                </div>
              </div>
            );
          })}
          {ranked.length > 100 && (
            <p className="pt-2 text-center text-xs text-slate-400">
              Showing top 100 of {ranked.length} ranked deals. Apply filters to narrow.
            </p>
          )}
          {ranked.length === 0 && (
            <div className="rounded-lg border border-dashed border-slate-200 p-12 text-center text-sm text-slate-500">
              No deals match the current filters.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function WeightSlider({
  label, value, onChange, color,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  color: "indigo" | "emerald" | "amber" | "red";
}) {
  const accents: Record<typeof color, string> = {
    indigo: "accent-indigo-600",
    emerald: "accent-emerald-600",
    amber: "accent-amber-500",
    red: "accent-red-600",
  };
  return (
    <div className="mb-3 last:mb-0">
      <div className="flex items-baseline justify-between">
        <label className="text-[11px] font-medium text-slate-700">{label}</label>
        <span className="font-mono text-[10px] text-slate-500">{(value * 100).toFixed(0)}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`w-full ${accents[color]}`}
      />
    </div>
  );
}

function KpiTile({
  label, value, sub, color, icon,
}: {
  label: string;
  value: number | string;
  sub?: string;
  color: "emerald" | "amber" | "indigo" | "slate";
  icon: React.ReactNode;
}) {
  const colors: Record<typeof color, string> = {
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    indigo: "bg-indigo-50 text-indigo-700 border-indigo-200",
    slate: "bg-slate-50 text-slate-600 border-slate-200",
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      <div className="flex items-center gap-2">
        {icon}
        <p className="text-[10px] font-semibold uppercase tracking-wider">{label}</p>
      </div>
      <p className="mt-2 text-2xl font-bold">{value}</p>
      {sub && <p className="text-[10px] opacity-70">{sub}</p>}
    </div>
  );
}

function ScorePill({ label, value, color }: { label: string; value?: number | null; color: "indigo" | "emerald" | "red" }) {
  if (value == null) return null;
  const colors: Record<typeof color, string> = {
    indigo: "bg-indigo-50 text-indigo-700",
    emerald: "bg-emerald-50 text-emerald-700",
    red: "bg-red-50 text-red-700",
  };
  return (
    <span className={`rounded px-1.5 py-0.5 font-medium ${colors[color]}`}>
      {label} {value.toFixed(0)}/10
    </span>
  );
}
