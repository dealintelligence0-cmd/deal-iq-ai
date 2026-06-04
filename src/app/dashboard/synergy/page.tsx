



"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { saveDealContext, loadDealContext, saveOutput, loadOutput, clearOutput, resetIfNewDeal } from "@/lib/dealContext";
import { TrendingUp, Loader2, Copy, Printer, CheckCircle2, Sparkles, History, Trash2, Download, ChevronDown, ChevronUp, BarChart3 } from "lucide-react";
import { renderVisualProposal } from "@/lib/proposal/visual-renderer";
import { openMbbPrintWindow } from "@/lib/proposal/mbb-print";
import { generateOfflineSynergy } from "@/lib/proposal/offline-synergy";
import AIGenerateConfirm from "@/components/AIGenerateConfirm";
import CognitionIndicators from "@/components/cognition/CognitionIndicators";
import { createClient } from "@/lib/supabase/client";
import { XAxis, YAxis, Legend, ResponsiveContainer, Tooltip, Area, AreaChart } from "recharts";

const AMBITIONS = [
  { id: "conservative", label: "Conservative", sub: "P25 benchmarks, high confidence" },
  { id: "base",         label: "Base Case",    sub: "Median benchmarks, balanced" },
  { id: "aggressive",   label: "Aggressive",   sub: "P75 benchmarks, aspirational" },
];

type HistoryItem = {
  id: string;
  buyer: string | null; target: string | null;
  sector: string | null; deal_size: string | null;
  tier: string | null; provider: string | null; model: string | null;
  cost_estimate_usd: number | null;
  content: string;
  created_at: string;
};

// =====================================================================
// v29 Visual Layer — Synergy quantification visualizations
// =====================================================================
// These sliders/charts complement the AI-generated synergy text below.
// All values are local-state only (no DB persistence required) — they
// give an interactive numerical view alongside the AI narrative.
// =====================================================================

type CurrencyCode = "USD" | "INR";

const DEFAULT_FX_USD_TO_INR = 83;

const r2 = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;

// Money is stored in the currently-selected display currency. The FX rate only
// converts values at the moment the currency is toggled (see changeCurrency);
// editing the rate afterwards must NOT move the numbers the user already typed.
function toDisplayFromUsdM(amount: number, _currency?: CurrencyCode, _fx?: number) {
  return r2(amount);
}

function toUsdMFromDisplay(amount: number, _currency?: CurrencyCode, _fx?: number) {
  return r2(amount);
}

function currencyMeta(currency: CurrencyCode) {
  return currency === "USD"
    ? { symbol: "$", unit: "M", label: "USD" }
    : { symbol: "₹", unit: "M", label: "INR" };
}

type VizModel = {
  currency: CurrencyCode;
  fxInrUsd: number;
  target_revenue_m: number;
  target_ebitda_m: number;
  wacc_pct: number;
  one_time_cost_m: number;
  cost_hq_ga_m: number; cost_it_infra_m: number; cost_procurement_m: number; cost_facilities_m: number; cost_other_m: number;
  rev_cross_sell_m: number; rev_price_opt_m: number; rev_territory_m: number; rev_bundling_m: number; rev_other_m: number;
  realize_y1_pct: number; realize_y2_pct: number; realize_y3_pct: number; realize_y4_pct: number; realize_y5_pct: number;
  cost_methods: Record<string, string>;
  rev_methods: Record<string, string>;
  cost_units: Record<string, string>;
  rev_units: Record<string, string>;
};

const DEFAULT_VIZ: VizModel = {
  currency: "USD",
  fxInrUsd: DEFAULT_FX_USD_TO_INR,
  target_revenue_m: 150, target_ebitda_m: 20, wacc_pct: 10, one_time_cost_m: 20,
  cost_hq_ga_m: 7, cost_it_infra_m: 4, cost_procurement_m: 5, cost_facilities_m: 3, cost_other_m: 0,
  rev_cross_sell_m: 9, rev_price_opt_m: 3, rev_territory_m: 5, rev_bundling_m: 2, rev_other_m: 0,
  realize_y1_pct: 25, realize_y2_pct: 50, realize_y3_pct: 80, realize_y4_pct: 95, realize_y5_pct: 100,
  cost_methods: {},
  rev_methods: {},
  cost_units: {},
  rev_units: {},
};

const MONEY_KEYS: (keyof VizModel)[] = [
  "target_revenue_m", "target_ebitda_m", "one_time_cost_m",
  "cost_hq_ga_m", "cost_it_infra_m", "cost_procurement_m", "cost_facilities_m", "cost_other_m",
  "rev_cross_sell_m", "rev_price_opt_m", "rev_territory_m", "rev_bundling_m", "rev_other_m",
];

type BreakdownRow = { key: keyof VizModel; label: string; method: string };

const COST_ROWS: BreakdownRow[] = [
  { key: "cost_hq_ga_m",       label: "HQ & Core G&A",   method: "Merge billing systems, dedupe management grids, consolidate legal controllers." },
  { key: "cost_it_infra_m",    label: "IT Infrastructure", method: "Retire duplicate cloud tools, unify databases, merge servers and ERP hosts." },
  { key: "cost_procurement_m", label: "Procurement",     method: "Negotiate bulk scale pricing on joint software partners and contractors." },
  { key: "cost_facilities_m",  label: "Facilities",      method: "Consolidate offices, sublet redundant space, single-network telecom." },
  { key: "cost_other_m",       label: "Other",           method: "Miscellaneous (insurance, legal, audit consolidation)." },
];
const REV_ROWS: BreakdownRow[] = [
  { key: "rev_cross_sell_m",  label: "Account Cross-Selling", method: "Bundle target services natively into existing buyer strategic networks." },
  { key: "rev_price_opt_m",   label: "Price Optimization",    method: "Unblock unextracted margins via tier adjustments and contract standardizations." },
  { key: "rev_territory_m",   label: "Territory Expansion",   method: "Export products directly using buyer's global sales channels without extra CAC." },
  { key: "rev_bundling_m",    label: "Product Bundling",      method: "Combine target SKUs with buyer flagship into premium-priced offerings." },
  { key: "rev_other_m",       label: "Other",                 method: "New use-cases, M&A halo, partnership effects." },
];

function computeViz(m: VizModel) {
  const totalCostRR = m.cost_hq_ga_m + m.cost_it_infra_m + m.cost_procurement_m + m.cost_facilities_m + m.cost_other_m;
  const totalRevRR = m.rev_cross_sell_m + m.rev_price_opt_m + m.rev_territory_m + m.rev_bundling_m + m.rev_other_m;
  const wacc = Math.max(0, Math.min(0.4, (m.wacc_pct || 10) / 100));
  const realize = [m.realize_y1_pct, m.realize_y2_pct, m.realize_y3_pct, m.realize_y4_pct, m.realize_y5_pct]
    .map((p) => Math.max(0, Math.min(100, p)) / 100);
  let npv = 0; let cum = 0;
  const year_curve = realize.map((r, i) => {
    const yr = i + 1; const c = totalCostRR * r; const v = totalRevRR * r; const t = c + v;
    cum += t; npv += t / Math.pow(1 + wacc, yr);
    return { year: `Year ${yr}`, Cost: Math.round(c * 100) / 100, Revenue: Math.round(v * 100) / 100, total_m: t, cumulative: cum };
  });
  return {
    totalCostRR, totalRevRR,
    npv: Math.round(npv * 100) / 100,
    npv_after_costs: Math.round((npv - m.one_time_cost_m) * 100) / 100,
    year_curve,
  };
}

function SynergyVisuals({ buyer, target, sector, geography, dealSize }: { buyer: string; target: string; sector: string; geography: string; dealSize: string }) {
  const [viz, setViz] = useState<VizModel>(DEFAULT_VIZ);
  const [collapsed, setCollapsed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pptBusy, setPptBusy] = useState(false);
  const [deckBusy, setDeckBusy] = useState(false);
  const output = useMemo(() => computeViz(viz), [viz]);
  const ccy = currencyMeta(viz.currency);

  // Default the USD→INR rate from the user's saved setting (Settings → FX Rate).
  useEffect(() => {
    (async () => {
      try {
        const sb = createClient();
        const { data: u } = await sb.auth.getUser();
        if (!u.user) return;
        const { data } = await sb.from("ai_settings").select("fx_inr_usd").eq("user_id", u.user.id).maybeSingle();
        if (data?.fx_inr_usd) setViz((v) => ({ ...v, fxInrUsd: Number(data.fx_inr_usd) }));
      } catch { /* keep default */ }
    })();
  }, []);
  const update = (patch: Partial<VizModel>) => setViz((v) => ({ ...v, ...patch }));
  const updateMoney = (key: keyof VizModel, displayValue: number) => {
    update({ [key]: r2(displayValue) } as Partial<VizModel>);
  };
  // Convert all money fields once, only when the currency is switched.
  const changeCurrency = (next: CurrencyCode) => {
    setViz((v) => {
      if (v.currency === next) return v;
      const factor = next === "INR" ? v.fxInrUsd : 1 / v.fxInrUsd;
      const converted = Object.fromEntries(
        MONEY_KEYS.map((k) => [k, r2((v[k] as number) * factor)]),
      ) as Partial<VizModel>;
      return { ...v, ...converted, currency: next };
    });
  };

  function buildInteractiveMarkdown(): string {
    const money = (value: number) => `${ccy.symbol}${r2(value).toFixed(2)}${ccy.unit}`;
    const L: string[] = [];
    const who = (buyer || target) ? ` — ${buyer || "Buyer"} → ${target || "Target"}` : "";
    L.push(`# Interactive Synergy Model${who}`, "");
    L.push(`**Currency:** ${viz.currency}${viz.currency === "INR" ? ` (₹${viz.fxInrUsd}/USD)` : ""}${sector ? ` · Sector: ${sector}` : ""}${dealSize ? ` · ${dealSize}` : ""}`, "");
    L.push("## Model Assumptions", "");
    L.push(`- Target revenue: ${money(viz.target_revenue_m)}`);
    L.push(`- Target EBITDA: ${money(viz.target_ebitda_m)}`);
    L.push(`- WACC / discount rate: ${viz.wacc_pct}%`);
    L.push(`- One-time integration cost: ${money(viz.one_time_cost_m)}`, "");
    L.push("## Editable Run-Rate Synergies", "");
    L.push("| Type | Initiative | Run-rate value | Methodology |");
    L.push("| --- | --- | --- | --- |");
    for (const row of COST_ROWS) L.push(`| Cost | ${row.label} | ${money(viz[row.key] as number)} | ${viz.cost_methods[row.key] || row.method} |`);
    for (const row of REV_ROWS) L.push(`| Revenue | ${row.label} | ${money(viz[row.key] as number)} | ${viz.rev_methods[row.key] || row.method} |`);
    L.push("", "## Value Summary", "");
    L.push(`- Cost synergy run-rate: ${money(output.totalCostRR)}`);
    L.push(`- Revenue synergy run-rate: ${money(output.totalRevRR)}`);
    L.push(`- Five-year NPV after one-time costs: ${money(output.npv_after_costs)}`, "");
    L.push("## Realization Curve", "");
    L.push("| Year | Cost synergies | Revenue synergies | Total realized | Cumulative |");
    L.push("| --- | --- | --- | --- | --- |");
    for (const year of output.year_curve) L.push(`| ${year.year} | ${money(year.Cost)} | ${money(year.Revenue)} | ${money(year.total_m)} | ${money(year.cumulative)} |`);
    return L.join("\n");
  }

  function copyInteractive() { navigator.clipboard.writeText(buildInteractiveMarkdown()); setCopied(true); setTimeout(() => setCopied(false), 2000); }
  function printInteractive() { openMbbPrintWindow({ contentMarkdown: buildInteractiveMarkdown(), meta: { moduleLabel: "Interactive Synergy Model", buyer, target, sector, geography, dealSize } }); }
  async function pptInteractive() {
    setPptBusy(true);
    try {
      const { exportProposalToPptx } = await import("@/lib/proposal/pptx-exporter");
      await exportProposalToPptx(buildInteractiveMarkdown(), { buyer, target, sector, geography, dealSize, moduleLabel: "Interactive Synergy Model" }, undefined, `deal-iq-interactive-synergy-${buyer || "buyer"}-${target || "target"}.pptx`);
    } catch (e) {
      alert("PPTX export failed: " + String(e));
    } finally {
      setPptBusy(false);
    }
  }
  // Consulting-grade deck built directly from the structured model (not prose).
  async function consultingDeck() {
    setDeckBusy(true);
    try {
      const { exportSynergyConsultingDeck } = await import("@/lib/proposal/module-decks");
      await exportSynergyConsultingDeck({
        meta: { buyer, target, sector, geography, dealSize },
        currencySymbol: ccy.symbol, currencyUnit: ccy.unit,
        totalCostRR: output.totalCostRR, totalRevRR: output.totalRevRR,
        npv: output.npv, npvAfterCosts: output.npv_after_costs,
        oneTimeCost: viz.one_time_cost_m, waccPct: viz.wacc_pct,
        yearCurve: output.year_curve.map((y) => ({ year: y.year, cost: y.Cost, revenue: y.Revenue, total: y.total_m, cumulative: y.cumulative })),
        costInitiatives: COST_ROWS.map((r) => ({ label: r.label, value: viz[r.key] as number, method: viz.cost_methods[r.key] || r.method })),
        revInitiatives: REV_ROWS.map((r) => ({ label: r.label, value: viz[r.key] as number, method: viz.rev_methods[r.key] || r.method })),
      }, `deal-iq-synergy-deck-${buyer || "buyer"}-${target || "target"}.pptx`);
    } catch (e) {
      alert("Consulting deck export failed: " + String(e));
    } finally {
      setDeckBusy(false);
    }
  }

  return (
    <div className="card mb-4 overflow-hidden">
      <button onClick={() => setCollapsed(!collapsed)}
              className="flex w-full items-center justify-between border-b border-slate-100 px-5 py-3 text-left transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/30">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-emerald-500" />
          <span className="text-sm font-semibold text-slate-800 dark:text-white">Synergy Visualization (Interactive)</span>
          <span className="text-[10.5px] italic text-slate-500">Complements AI narrative below · local model only</span>
        </div>
        {collapsed ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronUp className="h-4 w-4 text-slate-400" />}
      </button>

      {!collapsed && (
        <div className="p-5">
          <div className="mb-3 flex flex-wrap items-center justify-end gap-1.5">
            <button onClick={copyInteractive} className="flex items-center gap-1 rounded border border-slate-200 px-2.5 py-1 text-[11px] dark:border-slate-700">
              {copied ? <CheckCircle2 className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />} {copied ? "Copied" : "Copy"}
            </button>
            <button onClick={printInteractive} className="flex items-center gap-1 rounded border border-slate-200 px-2.5 py-1 text-[11px] dark:border-slate-700">
              <Printer className="h-3 w-3" /> PDF
            </button>
            <button onClick={pptInteractive} disabled={pptBusy} className="flex items-center gap-1 rounded border border-slate-200 px-2.5 py-1 text-[11px] disabled:opacity-50 dark:border-slate-700">
              {pptBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />} PPTX
            </button>
            <button onClick={consultingDeck} disabled={deckBusy} title="Big4-grade deck built from this model"
              className="flex items-center gap-1 rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
              {deckBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} Consulting Deck
            </button>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Modeler */}
            <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">EBITDA Synergies Modeler</h3>
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="font-semibold uppercase tracking-wider text-slate-500">Currency</span>
                  <select value={viz.currency} onChange={(e) => changeCurrency(e.target.value as CurrencyCode)}
                          className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium dark:border-slate-700 dark:bg-slate-800">
                    <option value="USD">USD</option>
                    <option value="INR">INR</option>
                  </select>
                  {viz.currency === "INR" && (
                    <>
                      <span className="font-semibold uppercase tracking-wider text-slate-500">₹/$</span>
                      <input type="number" min={1} step={0.5} value={viz.fxInrUsd}
                             onChange={(e) => update({ fxInrUsd: Math.max(1, Number(e.target.value) || 1) })}
                             aria-label="INR per USD rate"
                             className="w-16 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium dark:border-slate-700 dark:bg-slate-800" />
                    </>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wider text-slate-500">Target Revenue ({ccy.symbol}{ccy.unit})</label>
                  <input type="number" value={toDisplayFromUsdM(viz.target_revenue_m, viz.currency, viz.fxInrUsd)} onChange={(e) => updateMoney("target_revenue_m", Number(e.target.value))}
                         className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800" />
                </div>
                <div>
                  <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wider text-slate-500">Target EBITDA ({ccy.symbol}{ccy.unit})</label>
                  <input type="number" value={toDisplayFromUsdM(viz.target_ebitda_m, viz.currency, viz.fxInrUsd)} onChange={(e) => updateMoney("target_ebitda_m", Number(e.target.value))}
                         className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800" />
                </div>
              </div>

              <div className="mt-3">
                <label className="mb-1 flex items-center justify-between text-[11px] font-medium text-slate-600">
                  <span>WACC / Discount Rate</span>
                  <span className="font-mono text-emerald-600">{viz.wacc_pct}%</span>
                </label>
                <input type="range" min="0" max="30" step="0.5" value={viz.wacc_pct}
                       onChange={(e) => update({ wacc_pct: Number(e.target.value) })}
                       className="w-full accent-emerald-500" />
              </div>

              <div className="mt-3">
                <label className="mb-1 flex items-center justify-between text-[11px] font-medium text-slate-600">
                  <span>One-Time Integration Cost ({ccy.symbol}{ccy.unit})</span>
                  <span className="font-mono text-rose-600">-{ccy.symbol}{toDisplayFromUsdM(viz.one_time_cost_m, viz.currency, viz.fxInrUsd).toFixed(2)}{ccy.unit}</span>
                </label>
                <input type="range" min="0"
                       max={viz.currency === "INR" ? Math.round(200 * viz.fxInrUsd) : 200}
                       step={viz.currency === "INR" ? Math.max(1, Math.round(5 * viz.fxInrUsd)) : 5}
                       value={viz.one_time_cost_m}
                       onChange={(e) => update({ one_time_cost_m: Number(e.target.value) })}
                       className="w-full accent-rose-500" />
              </div>

              <div className="mt-4 rounded-lg bg-emerald-50 p-3 dark:bg-emerald-950/30">
                <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Estimated Synergy NPV (5-yr)</div>
                <div className="mt-1 text-3xl font-bold text-emerald-700 dark:text-emerald-400">
                  {ccy.symbol}{toDisplayFromUsdM(output.npv_after_costs, viz.currency, viz.fxInrUsd).toFixed(2)}{ccy.unit}
                </div>
                <div className="mt-1 text-[10.5px] text-slate-600 dark:text-slate-400">
                  Gross NPV {ccy.symbol}{toDisplayFromUsdM(output.npv, viz.currency, viz.fxInrUsd).toFixed(2)}{ccy.unit} · Offset by {ccy.symbol}{toDisplayFromUsdM(viz.one_time_cost_m, viz.currency, viz.fxInrUsd).toFixed(2)}{ccy.unit} one-time setup costs
                </div>
              </div>
            </div>

            {/* Curve */}
            <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">Realization Timeline Projection Curve</h3>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={output.year_curve}>
                  <XAxis dataKey="year" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} label={{ value: `${ccy.symbol}${ccy.unit}`, angle: -90, position: "insideLeft", fontSize: 10 }} />
                  <Tooltip contentStyle={{ fontSize: 11 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="Cost" stroke="#10b981" fill="#10b981" fillOpacity={0.3} />
                  <Area type="monotone" dataKey="Revenue" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} />
                </AreaChart>
              </ResponsiveContainer>

              <div className="mt-2 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                <div className="rounded-lg bg-emerald-50 p-2 dark:bg-emerald-950/30">
                  <div className="text-[9px] font-bold uppercase text-emerald-700 dark:text-emerald-400">Run-Rate Cost Efficiencies</div>
                  <div className="text-lg font-bold text-emerald-700 dark:text-emerald-400">{ccy.symbol}{toDisplayFromUsdM(output.totalCostRR, viz.currency, viz.fxInrUsd).toFixed(2)}{ccy.unit} <span className="text-[10px] font-normal">/ yr</span></div>
                </div>
                <div className="rounded-lg bg-sky-50 p-2 dark:bg-sky-950/30">
                  <div className="text-[9px] font-bold uppercase text-sky-700 dark:text-sky-400">Run-Rate Revenue Opportunity</div>
                  <div className="text-lg font-bold text-sky-700 dark:text-sky-400">{ccy.symbol}{toDisplayFromUsdM(output.totalRevRR, viz.currency, viz.fxInrUsd).toFixed(2)}{ccy.unit} <span className="text-[10px] font-normal">/ yr</span></div>
                </div>
              </div>

              <details className="mt-3 text-[11px]">
                <summary className="cursor-pointer text-slate-500 hover:text-slate-700">Adjust realization curve →</summary>
                <div className="mt-2 grid grid-cols-5 gap-1">
                  {([1, 2, 3, 4, 5] as const).map((yr) => {
                    const k = `realize_y${yr}_pct` as keyof VizModel;
                    return (
                      <div key={yr}>
                        <div className="text-center text-[9px] text-slate-500">Y{yr}</div>
                        <input type="number" min={0} max={100} value={viz[k] as number}
                               onChange={(e) => update({ [k]: Number(e.target.value) } as Partial<VizModel>)}
                               className="w-full rounded border border-slate-300 px-1 py-0.5 text-center text-[10px] dark:border-slate-700 dark:bg-slate-800" />
                      </div>
                    );
                  })}
                </div>
              </details>
            </div>
          </div>

          {/* Cost & revenue breakdown tables */}
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <BreakdownTable title="Cost Synergies (Target Redundancy Pools)"
                            subtitle="Estimated savings from rationalized back-offices, redundant tools, and scaled procurement."
                            rows={COST_ROWS} viz={viz} update={update} totalLabel="TOTAL COST" total={output.totalCostRR} accent="emerald" methodsKey="cost_methods" unitsKey="cost_units" />
            <BreakdownTable title="Revenue Synergies (Commercial Scale)"
                            subtitle="Top-line acceleration via cross-selling existing customer networks."
                            rows={REV_ROWS} viz={viz} update={update} totalLabel="TOTAL REVENUE" total={output.totalRevRR} accent="sky" methodsKey="rev_methods" unitsKey="rev_units" />
          </div>
        </div>
      )}
    </div>
  );
}

function BreakdownTable({ title, subtitle, rows, viz, update, totalLabel, total, accent, methodsKey, unitsKey }: {
  title: string;
  subtitle: string;
  rows: BreakdownRow[];
  viz: VizModel;
  update: (patch: Partial<VizModel>) => void;
  totalLabel: string;
  total: number;
  accent: "emerald" | "sky";
  methodsKey: "cost_methods" | "rev_methods";
  unitsKey: "cost_units" | "rev_units";
}) {
  const ccy = currencyMeta(viz.currency);
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <h3 className="text-[11.5px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">{title}</h3>
      <p className="text-[10.5px] text-slate-500">{subtitle}</p>
      <div className="mt-3 space-y-1">
        <div className="grid grid-cols-[1fr,2fr,80px] gap-2 border-b border-slate-200 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-700">
          <span>Functional Unit</span>
          <span>Method / Derivation</span>
          <span className="text-right">Savings ({ccy.symbol}{ccy.unit})</span>
        </div>
        {rows.map((r) => (
          <div key={r.key} className="grid grid-cols-[1fr,2fr,80px] gap-2 py-1 text-[11.5px]">
            <input
              type="text"
              value={viz[unitsKey][r.key] ?? r.label}
              onChange={(e) => update({ [unitsKey]: { ...viz[unitsKey], [r.key]: e.target.value } } as Partial<VizModel>)}
              placeholder="Edit functional unit"
              aria-label={`${title} functional unit ${r.label}`}
              className="w-full rounded border border-slate-300 bg-white px-1 py-0.5 font-medium text-slate-800 outline-none ring-0 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:focus:ring-indigo-900"
            />
            <input type="text" value={viz[methodsKey]?.[r.key] ?? r.method}
                   onChange={(e) => update({ [methodsKey]: { ...viz[methodsKey], [r.key]: e.target.value } } as Partial<VizModel>)}
                   className="rounded border border-slate-200 px-1 py-0.5 text-[10.5px] text-slate-600 dark:border-slate-700 dark:bg-slate-800" />
            <input type="number" value={toDisplayFromUsdM(viz[r.key] as number, viz.currency, viz.fxInrUsd)} step="0.5"
                   onChange={(e) => update({ [r.key]: toUsdMFromDisplay(Number(e.target.value), viz.currency, viz.fxInrUsd) } as Partial<VizModel>)}
                   className="rounded border border-slate-200 px-1 py-0.5 text-right font-mono text-[11px] dark:border-slate-700 dark:bg-slate-800" />
          </div>
        ))}
        <div className={`flex items-center justify-between border-t-2 border-${accent}-300 pt-1 text-[12px] font-bold dark:border-${accent}-800`}>
          <span className={`text-${accent}-700 dark:text-${accent}-400`}>{totalLabel}</span>
          <span className={`text-${accent}-700 dark:text-${accent}-400`}>{ccy.symbol}{toDisplayFromUsdM(total, viz.currency, viz.fxInrUsd).toFixed(2)}{ccy.unit}</span>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// Main page — your original implementation
// =====================================================================

export default function SynergyEnginePage() {
  const sb = createClient();

  const [buyer, setB] = useState("");
  const [target, setT] = useState("");
  const [sector, setSec] = useState("");
  const [geography, setGeo] = useState("");
  const [dealSize, setDS] = useState("");
  const [targetRevenue, setTR] = useState("");
  const [targetEbitda, setTE] = useState("");
  const [buyerRevenue, setBR] = useState("");
  const [ambition, setAmb] = useState("base");
  const [dealId, setDealId] = useState<string>("");
  const [mandateType, setMandateType] = useState<string>("buy_side");
  const [buyerTypeF, setBuyerTypeF] = useState<string>("strategic");
  const [ownershipType, setOwnershipType] = useState<string>("majority");
  const [integrationStyle, setIntegrationStyle] = useState<string>("functional");
  const [notes, setNotes] = useState("");
  const [generating, setGen] = useState(false);
  const [content, setContent] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pptExporting, setPptExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal + tiers
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [premiumTier, setPremiumTier] = useState<{ provider: string | null; model: string | null; hasKey: boolean }>({ provider: null, model: null, hasKey: false });
  const [economicTier, setEconomicTier] = useState<{ provider: string | null; model: string | null; hasKey: boolean }>({ provider: null, model: null, hasKey: false });

  // History
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const loadTiers = useCallback(async () => {
    const { data: u } = await sb.auth.getUser();
    if (!u.user) return;
    const { data } = await sb.from("ai_settings")
      .select("premium_provider,premium_model,premium_key_encrypted,economic_provider,economic_model,economic_key_encrypted")
      .eq("user_id", u.user.id).maybeSingle();
    if (data) {
      setPremiumTier({
        provider: data.premium_provider, model: data.premium_model,
        hasKey: !!data.premium_key_encrypted && data.premium_provider !== "free",
      });
      setEconomicTier({
        provider: data.economic_provider, model: data.economic_model,
        hasKey: !!data.economic_key_encrypted && data.economic_provider !== "free",
      });
    }
  }, [sb]);

  const loadHistory = useCallback(async () => {
    const { data: u } = await sb.auth.getUser();
    if (!u.user) return;
    const { data } = await sb.from("ai_outputs")
      .select("id,buyer,target,sector,deal_size,tier,provider,model,cost_estimate_usd,content,created_at")
      .eq("user_id", u.user.id).eq("module", "synergy")
      .order("created_at", { ascending: false }).limit(20);
    if (data) setHistory(data as HistoryItem[]);
  }, [sb]);

  useEffect(() => { loadTiers(); loadHistory(); }, [loadTiers, loadHistory]);
  function startGenerate() {
    if (!buyer || !target || !dealSize) return;
    setError(null);
    setConfirmOpen(true);
  }

  useEffect(() => {
    saveDealContext({ buyer, target, sector, geography, deal_size: dealSize, deal_id: dealId });
  }, [buyer, target, sector, geography, dealSize, dealId]);
  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);

    const did = params.get("deal_id");
    const buyerParam = params.get("buyer");
    const targetParam = params.get("target");
    const sectorParam = params.get("sector");
    const geographyParam = params.get("geography");
    const dealSizeParam = params.get("deal_size");

    if (did) resetIfNewDeal(did);

    const stored = loadDealContext();
    const finalDID = did ?? stored.deal_id;
    const finalB = buyerParam ?? stored.buyer;
    const finalT = targetParam ?? stored.target;
    const finalS = sectorParam ?? stored.sector;
    const finalG = geographyParam ?? stored.geography;
    const finalDS = dealSizeParam ?? stored.deal_size;

    if (finalDID) setDealId(finalDID);
    if (finalB) setB(finalB);
    if (finalT) setT(finalT);
    if (finalS) setSec(finalS);
    if (finalG) setGeo(finalG);
    if (finalDS) setDS(finalDS);

    saveDealContext({
      buyer: finalB, target: finalT, sector: finalS,
      geography: finalG, deal_size: finalDS, deal_id: finalDID,
    });

    const cached = loadOutput("synergy");
    if (cached) setContent(cached);
  }, []);

  async function generate(tier: "premium" | "economic" | "offline", modelOverride?: string) {
    setConfirmOpen(false);
    if (tier === "offline") {
      const md = generateOfflineSynergy({
        buyer, target, sector, geography, dealSize,
        targetRevenue, buyerRevenue,
        ambition: ambition as "conservative" | "base" | "aggressive",
        notes,
        mandateType, buyerType: buyerTypeF,
        ownershipType, integrationStyle,
      });
      setContent(md);
      saveOutput("synergy", md);
      loadHistory();
      return;
    }
    setGen(true);
    setContent(null);
    try {
      const res = await fetch("/api/ai/synergy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyer, target, sector, geography,
          deal_id: dealId || undefined,
          deal_size: dealSize,
          target_revenue: targetRevenue,
          target_ebitda: targetEbitda,
          buyer_revenue: buyerRevenue,
          ambition, notes, tier,
          model_override: modelOverride,
          mandate_type: mandateType,
          buyer_type: buyerTypeF,
          ownership_type: ownershipType,
          integration_style: integrationStyle,
        }),
      });
      const j = await res.json();
      if (j.content) {
        setContent(j.content);
        saveOutput("synergy", j.content);
        loadHistory();
      } else {
        setError(j.error ?? "Generation failed.");
      }
    } catch {
      setError("Request failed. Check API key in Settings.");
    }
    setGen(false);
  }

  function copyText() {
    if (!content) return;
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function downloadPptx() {
    if (!content) return;
    setPptExporting(true);
    try {
      const { exportProposalToPptx } = await import("@/lib/proposal/pptx-exporter");
      await exportProposalToPptx(content, { buyer, target, sector, geography, dealSize, moduleLabel: "Synergy Model" }, undefined, `deal-iq-synergy-${buyer || "buyer"}-${target || "target"}.pptx`);
    } catch (e) {
      alert("PPTX export failed: " + String(e));
    } finally {
      setPptExporting(false);
    }
  }

  function printDoc() {
    if (!content) return;
    openMbbPrintWindow({
      contentMarkdown: content,
      meta: {
        moduleLabel: "Synergy Model",
        buyer,
        target,
        sector,
        geography,
        dealSize,
      },
    });
  }

  function loadFromHistory(item: HistoryItem) {
    setContent(item.content);
    if (item.buyer) setB(item.buyer);
    if (item.target) setT(item.target);
    if (item.sector) setSec(item.sector);
    if (item.deal_size) setDS(item.deal_size);
    setShowHistory(false);
  }

  async function deleteFromHistory(id: string) {
    if (!confirm("Delete this saved synergy output?")) return;
    await sb.from("ai_outputs").delete().eq("id", id);
    loadHistory();
  }

  const fields: Array<[string, string, (v: string) => void, string]> = [
    ["Buyer / Acquirer *", buyer, setB, "e.g. Microsoft"],
    ["Target Company *", target, setT, "e.g. Salesforce"],
    ["Sector", sector, setSec, "e.g. SaaS / Technology"],
    ["Geography", geography, setGeo, "e.g. USA, Europe"],
    ["Deal Size *", dealSize, setDS, "e.g. $2.5B"],
    ["Target Revenue ($M)", targetRevenue, setTR, "Optional"],
    ["Target EBITDA ($M)", targetEbitda, setTE, "Optional"],
    ["Buyer Revenue ($M)", buyerRevenue, setBR, "Optional"],
  ];
  return (
    <div className="space-y-6 p-6">
<AIGenerateConfirm
  open={confirmOpen}
  onClose={() => setConfirmOpen(false)}
  onConfirm={generate}
  module="synergy"
  premiumProvider={{ tier: "premium", ...premiumTier }}
  economicProvider={{ tier: "economic", ...economicTier }}
  hasOfflineFallback={true}
/>

<div className="page-header">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold text-white">
              <TrendingUp className="h-5 w-5 text-indigo-400" />
              Synergy Engine
            </h1>
            <p className="mt-1 text-sm text-white/50">AI-powered synergy model · sector-specific initiatives · benchmarked against real transactions</p>
          </div>
          <button onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/20">
            <History className="h-3.5 w-3.5" /> History ({history.length})
          </button>
        </div>
      </div>

      {/* v29 Visual Layer — sits above main grid, complements AI text */}
      <SynergyVisuals buyer={buyer} target={target} sector={sector} geography={geography} dealSize={dealSize} />

      {/* Strategic insight changes — positioned between visualization and generated report */}
      <CognitionIndicators
        dealId={dealId || null}
        workspaceId={null}
        buyer={buyer || null}
        target={target || null}
        keyPrefix="synergy"
        limit={3}
      />

      {showHistory && (
        <div className="card p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-white">
            <History className="h-4 w-4" /> Synergy History
          </h2>
          {history.length === 0 ? (
            <p className="text-xs text-slate-500">No saved synergy outputs yet.</p>
          ) : (
            <div className="space-y-2">
              {history.map((h) => (
                <div key={h.id} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-slate-800 dark:text-slate-200">
                      {h.target ?? "Unnamed"} · {h.buyer ?? "—"}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      {h.sector ?? "—"} · {h.deal_size ?? "—"} · {h.provider ?? "—"} · {h.cost_estimate_usd ? `$${h.cost_estimate_usd.toFixed(4)}` : "Free"} · {new Date(h.created_at).toLocaleString()}
                    </p>
                  </div>
                  <button onClick={() => loadFromHistory(h)}
                    className="rounded-md border border-slate-200 px-2 py-1 text-[10px] text-slate-700 hover:bg-white dark:border-white/10 dark:text-slate-300">
                    Load
                  </button>
                  <button onClick={() => deleteFromHistory(h.id)}
                    className="rounded-md bg-red-50 p-1 text-red-700 hover:bg-red-100 dark:bg-red-950/30 dark:text-red-400">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-1">
          <div className="card space-y-4 p-5">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-white">Deal Details</h2>
            {fields.map(([lbl, val, set, ph]) => (
              <div key={lbl}>
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">{lbl}</label>
                <input value={val} onChange={(e) => set(e.target.value)} placeholder={ph}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
              </div>
            ))}

            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Synergy Ambition</label>
              <div className="mt-2 space-y-2">
                {AMBITIONS.map((a) => (
                  <button key={a.id} onClick={() => setAmb(a.id)}
                    className={`w-full rounded-lg border px-3 py-2.5 text-left text-sm transition ${
                      ambition === a.id
                        ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                        : "border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-400"
                    }`}>
                    <div className="font-medium">{a.label}</div>
                    <div className="text-xs opacity-70">{a.sub}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Analyst Notes</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
                placeholder="Known issues, specific synergy hypotheses, deal context..."
                className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            </div>

            <button onClick={startGenerate} disabled={generating || !buyer || !target || !dealSize}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40">
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {generating ? "Generating…" : "Generate Synergy Model"}
            </button>
          </div>
        </div>

        <div className="lg:col-span-2">
          {!content && !generating && !error && (
            <div className="flex h-64 items-center justify-center rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700">
              <div className="text-center">
                <TrendingUp className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-2 text-sm text-slate-400">Fill in deal details and click Generate to create your AI-powered synergy model</p>
                <p className="mt-1 text-xs text-slate-400">Modal will let you pick Premium / Economic AI</p>
              </div>
            </div>
          )}

          {error && !generating && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900/30 dark:bg-amber-950/20">
              <p className="font-semibold text-amber-900 dark:text-amber-300">Generation failed</p>
              <p className="mt-1 text-sm text-amber-800 dark:text-amber-300/80">{error}</p>
              <a href="/dashboard/settings" className="mt-3 inline-block rounded bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700">
                Open Settings
              </a>
            </div>
          )}

          {generating && (
            <div className="flex h-64 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700">
              <div className="text-center">
                <Loader2 className="mx-auto h-8 w-8 animate-spin text-indigo-500" />
                <p className="mt-3 text-sm text-slate-500">Building your synergy model…</p>
                <p className="mt-1 text-xs text-slate-400">Computing sector-specific initiatives and benchmarks</p>
              </div>
            </div>
          )}

          {content && (
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3 dark:border-slate-800">
                <span className="text-sm font-semibold text-slate-800 dark:text-white">Synergy Analysis — {target}</span>
                <div className="flex gap-2">
                  <button onClick={copyText}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300">
                    {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                  <button onClick={printDoc}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300">
                    <Printer className="h-3.5 w-3.5" /> Print / PDF
                  </button>
                  <button onClick={downloadPptx} disabled={pptExporting}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300">
                    {pptExporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} PPTX
                  </button>
                  <button onClick={() => { setContent(null); clearOutput("synergy"); }}
                    className="flex items-center gap-1.5 rounded-lg border border-red-100 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-400">
                    <Trash2 className="h-3.5 w-3.5" /> Clear
                  </button>
                </div>
              </div>
              <div className="mbb-inline p-5"
                dangerouslySetInnerHTML={{ __html: renderVisualProposal(content) }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
