"use client";

import { useMemo } from "react";
import { Sparkles, TrendingUp, AlertCircle } from "lucide-react";
import type { Deal } from "@/lib/analytics";

type Props = {
  deals: Deal[];
};

/**
 * Strategic Callout — the partner's "first 30 seconds" view of the pipeline.
 *
 * Surfaces the TOP 5 deals to pursue this week, with a one-line reason each.
 * Uses the existing priority_score field which is set by the deal-priority
 * engine on canonical data, so it reflects v2 pipeline quality automatically.
 *
 * This is what a senior MBB/Big4 partner looks at first thing Monday morning:
 *   • Highest-priority deals across the live pipeline
 *   • Why each one matters (sector / size / status)
 *   • One-click drill-down to the deal detail page
 *
 * Hidden when there are <3 deals — the callout needs a real pipeline to mean
 * anything.
 */
export default function StrategicCallout({ deals }: Props) {
  const top = useMemo(() => {
    return deals
      .filter((d) => {
        // Only deals where the partner can actually act — exclude completed and abandoned
        if (d.status && (d.status === "completed" || d.status === "abandoned")) return false;
        // Need buyer or target to be useful
        return d.buyer || d.target;
      })
      .map((d) => ({
        d,
        score: (d.priority_score ?? 0),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }, [deals]);

  if (top.length < 3) return null;

  return (
    <div className="mb-6 rounded-xl border-2 border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-white p-5 shadow-sm dark:border-indigo-800 dark:from-indigo-950/40 dark:via-[#15151f] dark:to-[#15151f]">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-indigo-600" />
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">
            Strategic Callout — Top {top.length} Deals to Pursue This Week
          </h2>
        </div>
        <span className="rounded bg-indigo-600 px-2 py-0.5 text-[10px] font-medium text-white">
          partner brief
        </span>
      </div>

      <p className="mb-3 text-[11px] text-slate-600 dark:text-slate-400">
        Auto-derived from priority scoring across your active pipeline. Click any deal to drill in.
      </p>

      <ol className="space-y-2">
        {top.map(({ d, score }, i) => {
          const value = d.normalized_value_usd
            ? `$${(d.normalized_value_usd / 1_000_000).toFixed(0)}m`
            : (d.value_raw ?? "—");
          const reason = buildReason(d, score);
          return (
            <li key={d.id} className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-indigo-600 text-[11px] font-bold text-white">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <a
                  href={`/dashboard/deals/${d.id}`}
                  className="block truncate text-sm font-semibold text-slate-900 hover:text-indigo-600 dark:text-white dark:hover:text-indigo-400"
                >
                  {d.buyer || "—"} {d.target ? `→ ${d.target}` : ""}
                </a>
                {d.heading && (
                  <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400" title={d.heading}>
                    {d.heading}
                  </p>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
                  {d.sector && (
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      {d.sector}
                    </span>
                  )}
                  {d.country && (
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      {d.country}
                    </span>
                  )}
                  {value !== "—" && (
                    <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      {value}
                    </span>
                  )}
                  {d.status && (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                      {d.status}
                    </span>
                  )}
                  <span className="ml-auto rounded bg-indigo-100 px-1.5 py-0.5 font-medium text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                    priority {score}
                  </span>
                </div>
                <p className="mt-1.5 flex items-start gap-1 text-[11px] text-slate-600 dark:text-slate-400">
                  <TrendingUp className="h-3 w-3 flex-shrink-0 mt-0.5 text-indigo-500" />
                  <span>{reason}</span>
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3 dark:border-slate-700">
        <a
          href="/dashboard/prioritization"
          className="text-[11px] font-medium text-indigo-600 hover:underline dark:text-indigo-400"
        >
          See full prioritization →
        </a>
        <a
          href="/dashboard/proposals"
          className="text-[11px] font-medium text-indigo-600 hover:underline dark:text-indigo-400"
        >
          Build proposals →
        </a>
      </div>
    </div>
  );
}

function buildReason(d: Deal, score: number): string {
  // If the priority engine already computed a reason, use it.
  if (d.priority_reason && d.priority_reason.trim()) return d.priority_reason;

  // Otherwise compose a short one from available signals.
  const parts: string[] = [];
  if (score >= 80) parts.push("very high priority");
  else if (score >= 60) parts.push("high priority");
  else if (score >= 40) parts.push("moderate priority");
  if (d.status === "announced") parts.push("just announced — proposal window open");
  else if (d.status === "live") parts.push("live deal — actively in market");
  if (d.targeting_recommendation === "HIGH") parts.push("strong advisory fit");
  if (d.normalized_value_usd && d.normalized_value_usd >= 500_000_000) {
    parts.push(`$${(d.normalized_value_usd / 1_000_000_000).toFixed(1)}bn+ deal size`);
  }
  return parts.length ? parts.join(" · ") : "Surfaced by priority engine";
}
