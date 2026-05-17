"use client";

import { useState, useMemo } from "react";

type Props = {
  score: number;
  /** The stored reason string from DB compute_mbb_scores().
   *  Format: "Size: Small ($5m-$20m) (+8) · Sector: warm (consumer) (+12) · ... = 48"
   *  Parsed into a structured breakdown so the badge & hover ALWAYS agree. */
  reason?: string | null;
  kind?: "priority" | "advisory" | "risk";
  className?: string;
};

function bandStyle(kind: Props["kind"], score: number): string {
  if (kind === "risk") {
    if (score >= 50) return "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-900";
    if (score >= 30) return "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900";
    return "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900";
  }
  if (score >= 60) return "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900";
  if (score >= 40) return "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900";
  return "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700";
}

function bandLabel(kind: Props["kind"], score: number): string {
  if (kind === "risk") {
    if (score >= 50) return "HIGH";
    if (score >= 30) return "MED";
    return "LOW";
  }
  if (score >= 60) return "PURSUE";
  if (score >= 40) return "WATCH";
  return "PASS";
}

type ParsedFactor = { label: string; pts: number };

function parseReason(reason: string | null | undefined): { factors: ParsedFactor[]; total: number | null; tail: string | null } {
  if (!reason) return { factors: [], total: null, tail: null };
  const parts = reason.split(" · ");
  const factors: ParsedFactor[] = [];
  let total: number | null = null;
  let tail: string | null = null;

  for (const part of parts) {
    const eq = part.match(/^\s*=\s*(\d+)\s*$/);
    if (eq) { total = parseInt(eq[1], 10); continue; }
    const m = part.match(/^(.*?)\s*\(\+(\d+)\)\s*$/);
    if (m) { factors.push({ label: m[1].trim(), pts: parseInt(m[2], 10) }); continue; }
    const inlineEq = part.match(/=\s*(\d+)/);
    if (inlineEq && total === null) total = parseInt(inlineEq[1], 10);
    if (!tail) tail = part; else tail += ` · ${part}`;
  }
  return { factors, total, tail };
}

export default function ScorePill({ score, reason, kind = "priority", className }: Props) {
  const [open, setOpen] = useState(false);
  const style = bandStyle(kind, score);
  const band = bandLabel(kind, score);
  const parsed = useMemo(() => parseReason(reason), [reason]);
  const sum = parsed.factors.reduce((s, f) => s + f.pts, 0);
  const showSumNote = parsed.total !== null && parsed.total !== sum;

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

      {open && (
        <span
          className="absolute right-0 top-full z-50 mt-1 w-80 rounded-lg border border-slate-300 bg-white p-3 text-left shadow-xl dark:border-slate-700 dark:bg-slate-900"
          role="tooltip"
        >
          <div className="mb-2 flex items-center justify-between border-b border-slate-200 pb-2 dark:border-slate-700">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
              {kind === "priority" ? "Priority" : kind === "advisory" ? "Advisory Wallet" : "Execution Risk"} · saved on row
            </span>
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${style}`}>
              {score} · {band}
            </span>
          </div>

          {parsed.factors.length > 0 ? (
            <table className="w-full text-[10.5px]">
              <thead>
                <tr className="text-slate-400">
                  <th className="text-left font-normal">Factor</th>
                  <th className="text-right font-normal">Pts</th>
                </tr>
              </thead>
              <tbody>
                {parsed.factors.map((f, i) => (
                  <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="py-1 align-top text-slate-700 dark:text-slate-200">{f.label}</td>
                    <td className={`py-1 text-right align-top tabular-nums font-mono ${f.pts >= 18 ? "text-emerald-600 font-bold" : "text-slate-600 dark:text-slate-400"}`}>
                      +{f.pts}
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-200 dark:border-slate-700">
                  <td className="py-1 font-bold text-slate-800 dark:text-slate-200">
                    {showSumNote ? `Sum ${sum} → capped at 100` : "Total"}
                  </td>
                  <td className="py-1 text-right font-mono font-bold tabular-nums">{parsed.total ?? sum}</td>
                </tr>
              </tbody>
            </table>
          ) : (
            <p className="text-[11px] italic text-slate-600 dark:text-slate-400">
              {reason ?? "No detailed breakdown available for this row."}
            </p>
          )}

          {parsed.tail && (
            <p className="mt-2 border-t border-slate-100 pt-2 text-[10.5px] italic text-slate-600 dark:border-slate-800 dark:text-slate-400">
              {parsed.tail}
            </p>
          )}

          <p className="mt-2 border-t border-slate-200 pt-2 text-[10px] italic text-slate-500 dark:border-slate-700 dark:text-slate-400">
            <b>How it&apos;s used:</b> {kind === "priority"
              ? "PURSUE (≥60) / WATCH (40-59) / PASS (<40). Top-band deals surface on the Executive Dashboard."
              : kind === "advisory"
                ? "Advisory wallet ranks similarly-priced deals by mandate complexity."
                : "Execution risk flags complexity. HIGH (≥50) requires senior partner review."}
          </p>
        </span>
      )}
    </span>
  );
}
