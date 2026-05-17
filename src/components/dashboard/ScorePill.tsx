"use client";

import { useState } from "react";
import type { ScoreBreakdown, ScoreFactor } from "@/lib/scoring/mbb-rubric";

type Props = {
  score: number;
  breakdown?: ScoreBreakdown | null;
  /** "priority" or "advisory" → higher is better; "risk" → higher is worse */
  kind?: "priority" | "advisory" | "risk";
  className?: string;
};

function bandStyle(kind: Props["kind"], score: number): string {
  if (kind === "risk") {
    if (score >= 50) return "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-900";
    if (score >= 30) return "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900";
    return "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900";
  }
  if (score >= 70) return "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900";
  if (score >= 50) return "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900";
  return "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700";
}

/**
 * Compact score badge that reveals the full rubric on hover.
 * Designed for use in dense table cells.
 */
export default function ScorePill({ score, breakdown, kind = "priority", className }: Props) {
  const [open, setOpen] = useState(false);
  const style = bandStyle(kind, score);

  return (
    <span
      className={`relative inline-block ${className ?? ""}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <span
        className={`inline-flex min-w-[36px] cursor-help items-center justify-center rounded border px-2 py-0.5 text-[11px] font-bold tabular-nums ${style}`}
        tabIndex={0}
      >
        {score}
      </span>

      {open && breakdown && (
        <span
          className="absolute right-0 top-full z-50 mt-1 w-72 rounded-lg border border-slate-300 bg-white p-3 text-left shadow-xl dark:border-slate-700 dark:bg-slate-900"
          role="tooltip"
        >
          <div className="mb-2 flex items-center justify-between border-b border-slate-200 pb-2 dark:border-slate-700">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
              {kind === "priority" ? "Priority" : kind === "advisory" ? "Advisory Wallet" : "Execution Risk"} Score
            </span>
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${bandStyle(kind, breakdown.total)}`}>
              {breakdown.total} · {breakdown.band}
            </span>
          </div>

          <p className="mb-2 text-[11px] italic text-slate-600 dark:text-slate-400">
            {breakdown.summary}
          </p>

          <table className="w-full text-[10.5px]">
            <thead>
              <tr className="text-slate-400">
                <th className="text-left font-normal">Factor</th>
                <th className="text-left font-normal">Value</th>
                <th className="text-right font-normal">Pts</th>
              </tr>
            </thead>
            <tbody>
              {breakdown.factors.map((f: ScoreFactor, i: number) => (
                <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="py-1 align-top text-slate-700 dark:text-slate-200">{f.name}</td>
                  <td className="py-1 align-top text-slate-500 dark:text-slate-400">{f.value}</td>
                  <td className={`py-1 text-right align-top tabular-nums font-mono ${f.points < 0 ? "text-rose-600" : f.points >= 18 ? "text-emerald-600 font-bold" : "text-slate-600 dark:text-slate-400"}`}>
                    {f.points >= 0 ? "+" : ""}{f.points}
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-slate-200 dark:border-slate-700">
                <td colSpan={2} className="py-1 font-bold text-slate-800 dark:text-slate-200">Total</td>
                <td className="py-1 text-right font-mono font-bold tabular-nums">{breakdown.total}</td>
              </tr>
            </tbody>
          </table>

          {breakdown.factors.length > 0 && (
            <p className="mt-2 border-t border-slate-200 pt-2 text-[10px] italic text-slate-500 dark:border-slate-700 dark:text-slate-400">
              <b>How it&apos;s used:</b> {kind === "priority"
                ? "Drives PURSUE/WATCH/PASS recommendation. Top-band deals get auto-surfaced on the Executive Dashboard."
                : kind === "advisory"
                  ? "Estimates fee wallet for the engagement. Used to rank similarly-priced deals."
                  : "Flags execution complexity. High risk → require senior partner review before pursuit."}
            </p>
          )}
        </span>
      )}
    </span>
  );
}
