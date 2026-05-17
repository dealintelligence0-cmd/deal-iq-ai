"use client";

import { useState } from "react";
import { Calculator, ChevronRight } from "lucide-react";

/**
 * Methodology card — sits at the top of the Pipeline and Prioritization pages.
 *
 * Surfaces the EXACT scoring rubric so partners can defend any decision
 * to a managing partner. Includes:
 *   - the formula (named factors + point allocations)
 *   - the three thresholds (PURSUE / WATCH / PASS)
 *   - a worked example using a real deal pattern
 *
 * The factor weights here MUST match those in:
 *   - /supabase function compute_mbb_scores (the database trigger)
 *   - hover-card breakdown shown by ScorePill
 * Any change to weights must be applied in all three places.
 */
export default function ScoringMethodologyCard() {
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-4 rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-4 shadow-sm dark:border-indigo-900 dark:from-indigo-950/40 dark:to-[#15151f]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <div className="flex items-center gap-2">
          <Calculator className="h-4 w-4 text-indigo-600" />
          <span className="text-sm font-bold text-slate-900 dark:text-white">
            How Priority / Advisory / Risk scores are calculated
          </span>
          <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 dark:bg-indigo-900 dark:text-indigo-200">
            transparent rubric
          </span>
        </div>
        <ChevronRight className={`h-4 w-4 text-slate-500 transition-transform ${open ? "rotate-90" : ""}`} />
      </button>

      {open && (
        <div className="mt-3 space-y-4 border-t border-indigo-200 pt-3 text-[12px] text-slate-700 dark:border-indigo-900 dark:text-slate-300">
          <p className="text-[11px] text-slate-600 dark:text-slate-400">
            Every deal is scored on three independent axes using a fixed rubric. The breakdown is
            saved on each row and shown on hover. The badge value is the saved value — there is no
            recomputation in the browser, so badge and tooltip always agree.
          </p>

          {/* ============ PRIORITY ============ */}
          <section className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-900 dark:bg-emerald-950/30">
            <h3 className="mb-2 text-[12px] font-bold text-emerald-900 dark:text-emerald-200">
              Priority Score (0–100) — &ldquo;How urgently do we work this deal?&rdquo;
            </h3>
            <p className="mb-2 text-[11px] text-emerald-900 dark:text-emerald-200">
              <b>Formula:</b>{" "}
              <span className="font-mono">size + sector heat + cross-border + stage + stake</span>
            </p>
            <table className="w-full text-[10.5px]">
              <thead>
                <tr className="text-emerald-700 dark:text-emerald-400">
                  <th className="text-left font-medium">Factor</th>
                  <th className="text-left font-medium">Buckets</th>
                  <th className="text-right font-medium">Points</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-emerald-100 dark:divide-emerald-900/50">
                <tr><td className="py-1 font-medium">Deal size</td>
                  <td className="py-1 text-slate-600 dark:text-slate-400">Mega ($250m+) · Large · Mid · Small · Micro</td>
                  <td className="py-1 text-right font-mono">30 · 22 · 14 · 8 · 4</td></tr>
                <tr><td className="py-1 font-medium">Sector heat</td>
                  <td className="py-1 text-slate-600 dark:text-slate-400">Tech/SW · Health/Internet · Fin/Energy · Consumer · Industrial · Other</td>
                  <td className="py-1 text-right font-mono">18 · 16 · 15 · 12 · 10 · 8</td></tr>
                <tr><td className="py-1 font-medium">Cross-border</td>
                  <td className="py-1 text-slate-600 dark:text-slate-400">Cross-border · Single-country</td>
                  <td className="py-1 text-right font-mono">15 · 6</td></tr>
                <tr><td className="py-1 font-medium">Stage</td>
                  <td className="py-1 text-slate-600 dark:text-slate-400">Live (pre-deal) · Announced · Completed · Abandoned</td>
                  <td className="py-1 text-right font-mono">16 · 14 · 8 · 2</td></tr>
                <tr><td className="py-1 font-medium">Stake</td>
                  <td className="py-1 text-slate-600 dark:text-slate-400">Control (≥50%) · Significant (25-49%) · Minority (&lt;25%) · Unknown</td>
                  <td className="py-1 text-right font-mono">12 · 8 · 5 · 6</td></tr>
              </tbody>
            </table>
            <p className="mt-2 text-[11px]">
              <b>Bands:</b>{" "}
              <span className="rounded bg-emerald-200 px-1.5 py-0.5 text-emerald-900">PURSUE ≥ 60</span>{" "}
              <span className="rounded bg-amber-200 px-1.5 py-0.5 text-amber-900">WATCH 40–59</span>{" "}
              <span className="rounded bg-slate-200 px-1.5 py-0.5 text-slate-700">PASS &lt; 40</span>
            </p>
          </section>

          {/* ============ ADVISORY ============ */}
          <section className="rounded-lg border border-blue-200 bg-blue-50/60 p-3 dark:border-blue-900 dark:bg-blue-950/30">
            <h3 className="mb-2 text-[12px] font-bold text-blue-900 dark:text-blue-200">
              Advisory Score (0–100) — &ldquo;How much advisory wallet is here?&rdquo;
            </h3>
            <p className="mb-2 text-[11px] text-blue-900 dark:text-blue-200">
              <b>Formula:</b>{" "}
              <span className="font-mono">deal-type complexity + (size × 0.8) + cross-border + stage adj</span>
            </p>
            <table className="w-full text-[10.5px]">
              <tbody className="divide-y divide-blue-100 dark:divide-blue-900/50">
                <tr><td className="py-1 font-medium">Deal type</td>
                  <td className="py-1 text-slate-600 dark:text-slate-400">Merger 24 · Takeover/Buyout 22 · Acquisition 20 · IPO 14 · Investment 12 · CapMkts 10 · Other 8</td></tr>
                <tr><td className="py-1 font-medium">Size (scaled 0.8×)</td>
                  <td className="py-1 text-slate-600 dark:text-slate-400">Mega 24 · Large 18 · Mid 11 · Small 6 · Micro 3</td></tr>
                <tr><td className="py-1 font-medium">Cross-border</td>
                  <td className="py-1 text-slate-600 dark:text-slate-400">Yes 15 · No 6</td></tr>
                <tr><td className="py-1 font-medium">Stage adj</td>
                  <td className="py-1 text-slate-600 dark:text-slate-400">Live 11 · Announced 10 · Other 5</td></tr>
              </tbody>
            </table>
            <p className="mt-2 text-[11px] italic text-blue-900 dark:text-blue-200">
              Fee wallet estimate: ~1% of deal value (e.g. $360m deal → ~$3.6m wallet).
            </p>
          </section>

          {/* ============ RISK ============ */}
          <section className="rounded-lg border border-rose-200 bg-rose-50/60 p-3 dark:border-rose-900 dark:bg-rose-950/30">
            <h3 className="mb-2 text-[12px] font-bold text-rose-900 dark:text-rose-200">
              Risk Score (0–100) — &ldquo;How likely is this to fall apart?&rdquo;
            </h3>
            <p className="mb-2 text-[11px] text-rose-900 dark:text-rose-200">
              <b>Formula:</b>{" "}
              <span className="font-mono">regulatory + data-quality + stage-risk</span>
            </p>
            <table className="w-full text-[10.5px]">
              <tbody className="divide-y divide-rose-100 dark:divide-rose-900/50">
                <tr><td className="py-1 font-medium">Regulatory</td>
                  <td className="py-1 text-slate-600 dark:text-slate-400">Regulated sector (Fin/Health/Energy/Telecom/Defense) 22 · Cross-border 15 · Standard 6</td></tr>
                <tr><td className="py-1 font-medium">Data quality</td>
                  <td className="py-1 text-slate-600 dark:text-slate-400">Parse confidence &lt;50% 25 · 50-74% 12 · ≥75% 3</td></tr>
                <tr><td className="py-1 font-medium">Stage risk</td>
                  <td className="py-1 text-slate-600 dark:text-slate-400">Abandoned 35 · Live (uncertain outcome) 12 · Firm 5</td></tr>
              </tbody>
            </table>
            <p className="mt-2 text-[11px]">
              <b>Bands:</b>{" "}
              <span className="rounded bg-emerald-200 px-1.5 py-0.5 text-emerald-900">LOW &lt; 30</span>{" "}
              <span className="rounded bg-amber-200 px-1.5 py-0.5 text-amber-900">MED 30–49</span>{" "}
              <span className="rounded bg-rose-200 px-1.5 py-0.5 text-rose-900">HIGH ≥ 50</span>
            </p>
          </section>

          {/* ============ WORKED EXAMPLE ============ */}
          <section className="rounded-lg border border-slate-300 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
            <h3 className="mb-2 text-[12px] font-bold text-slate-900 dark:text-white">
              📋 Worked example: PI Investment Advisory → Escape PLAN
            </h3>
            <ul className="space-y-0.5 text-[11px] text-slate-700 dark:text-slate-300">
              <li><b>Inputs:</b> Size INR 400m–2bn (Small) · Sector Consumer:Retail · Country India · Stage live · Stake unknown · Deal type Investment · Parse confidence 98%</li>
            </ul>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <div className="rounded border border-emerald-300 bg-white p-2 dark:border-emerald-800 dark:bg-slate-900">
                <div className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">Priority</div>
                <div className="font-mono text-[11px] text-slate-700 dark:text-slate-300">
                  Small <span className="text-slate-400">+8</span><br/>
                  Consumer <span className="text-slate-400">+12</span><br/>
                  single-country <span className="text-slate-400">+6</span><br/>
                  live (pre-deal) <span className="text-slate-400">+16</span><br/>
                  unknown stake <span className="text-slate-400">+6</span><br/>
                  <span className="font-bold">= 48 → WATCH</span>
                </div>
              </div>
              <div className="rounded border border-blue-300 bg-white p-2 dark:border-blue-800 dark:bg-slate-900">
                <div className="text-[10px] font-semibold text-blue-700 dark:text-blue-300">Advisory</div>
                <div className="font-mono text-[11px] text-slate-700 dark:text-slate-300">
                  Investment <span className="text-slate-400">+12</span><br/>
                  Small ×0.8 <span className="text-slate-400">+6</span><br/>
                  single-country <span className="text-slate-400">+6</span><br/>
                  Live <span className="text-slate-400">+11</span><br/>
                  <span className="font-bold">= 35</span><br/>
                  <span className="text-[10px] italic text-slate-500">Fee wallet ~$0.1m</span>
                </div>
              </div>
              <div className="rounded border border-rose-300 bg-white p-2 dark:border-rose-800 dark:bg-slate-900">
                <div className="text-[10px] font-semibold text-rose-700 dark:text-rose-300">Risk</div>
                <div className="font-mono text-[11px] text-slate-700 dark:text-slate-300">
                  Standard sector <span className="text-slate-400">+6</span><br/>
                  Conf 98% <span className="text-slate-400">+3</span><br/>
                  Live (uncertain) <span className="text-slate-400">+12</span><br/>
                  <span className="font-bold">= 21 → LOW</span>
                </div>
              </div>
            </div>
            <p className="mt-2 text-[11px] italic text-slate-600 dark:text-slate-400">
              Verdict: WATCH-list. Sub-economic fee size for a partner-led mandate, but live pre-deal status
              means we monitor for follow-on advisory if the round closes and PE-backed buyer triggers a PMI mandate.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
