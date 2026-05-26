

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
  { id: "base", label: "Base Case", sub: "Median benchmarks, balanced" },
  { id: "aggressive", label: "Aggressive", sub: "P75 benchmarks, aspirational" },
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

type CurrencyCode = "USD" | "INR";

const FX_USD_TO_INR = 83;

function toDisplayFromUsdM(usdM: number, currency: CurrencyCode) {
  return currency === "USD" ? usdM : usdM * FX_USD_TO_INR;
}

function toUsdMFromDisplay(amount: number, currency: CurrencyCode) {
  return currency === "USD" ? amount : amount / FX_USD_TO_INR;
}

function currencyMeta(currency: CurrencyCode) {
  return currency === "USD"
    ? { symbol: "$", unit: "M", label: "USD" }
    : { symbol: "₹", unit: "M", label: "INR" };
}

type VizModel = {
  currency: CurrencyCode;
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
  target_revenue_m: 150, target_ebitda_m: 20, wacc_pct: 10, one_time_cost_m: 20,
  cost_hq_ga_m: 7, cost_it_infra_m: 4, cost_procurement_m: 5, cost_facilities_m: 3, cost_other_m: 0,
  rev_cross_sell_m: 9, rev_price_opt_m: 3, rev_territory_m: 5, rev_bundling_m: 2, rev_other_m: 0,
  realize_y1_pct: 25, realize_y2_pct: 50, realize_y3_pct: 80, realize_y4_pct: 95, realize_y5_pct: 100,
  cost_methods: {},
  rev_methods: {},
  cost_units: {},
  rev_units: {},
};

type BreakdownRow = { key: keyof VizModel; label: string; method: string };

const COST_ROWS: BreakdownRow[] = [
  { key: "cost_hq_ga_m", label: "HQ & Core G&A", method: "Merge billing systems, dedupe management grids, consolidate legal controllers." },
  { key: "cost_it_infra_m", label: "IT Infrastructure", method: "Retire duplicate cloud tools, unify databases, merge servers and ERP hosts." },
  { key: "cost_procurement_m", label: "Procurement", method: "Negotiate bulk scale pricing on joint software partners and contractors." },
  { key: "cost_facilities_m", label: "Facilities", method: "Consolidate offices, sublet redundant space, single-network telecom." },
  { key: "cost_other_m", label: "Other", method: "Miscellaneous (insurance, legal, audit consolidation)." },
];
const REV_ROWS: BreakdownRow[] = [
  { key: "rev_cross_sell_m", label: "Account Cross-Selling", method: "Bundle target services natively into existing buyer strategic networks." },
  { key: "rev_price_opt_m", label: "Price Optimization", method: "Unblock unextracted margins via tier adjustments and contract standardizations." },
  { key: "rev_territory_m", label: "Territory Expansion", method: "Export products directly using buyer's global sales channels without extra CAC." },
  { key: "rev_bundling_m", label: "Product Bundling", method: "Combine target SKUs with buyer flagship into premium-priced offerings." },
  { key: "rev_other_m", label: "Other", method: "New use-cases, M&A halo, partnership effects." },
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

function SynergyVisuals() {
  const [viz, setViz] = useState<VizModel>(DEFAULT_VIZ);
  const [collapsed, setCollapsed] = useState(false);
  const output = useMemo(() => computeViz(viz), [viz]);
  const ccy = currencyMeta(viz.currency);
  const update = (patch: Partial<VizModel>) => setViz((v) => ({ ...v, ...patch }));
  const updateMoney = (key: keyof VizModel, displayValue: number) => {
    update({ [key]: toUsdMFromDisplay(displayValue, viz.currency) } as Partial<VizModel>);
  };

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
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">EBITDA Synergies Modeler</h3>
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="font-semibold uppercase tracking-wider text-slate-500">Currency</span>
                  <select value={viz.currency} onChange={(e) => update({ currency: e.target.value as CurrencyCode })}
                    className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium dark:border-slate-700 dark:bg-slate-800">
                    <option value="USD">USD</option>
                    <option value="INR">INR</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wider text-slate-500">Target Revenue ({ccy.symbol}{ccy.unit})</label>
                  <input type="number" value={toDisplayFromUsdM(viz.target_revenue_m, viz.currency)} onChange={(e) => updateMoney("target_revenue_m", Number(e.target.value))}
                    className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800" />
                </div>
                <div>
                  <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wider text-slate-500">Target EBITDA ({ccy.symbol}{ccy.unit})</label>
                  <input type="number" value={toDisplayFromUsdM(viz.target_ebitda_m, viz.currency)} onChange={(e) => updateMoney("target_ebitda_m", Number(e.target.value))}
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
                  <span className="font-mono text-rose-600">-{ccy.symbol}{toDisplayFromUsdM(viz.one_time_cost_m, viz.currency).toFixed(2)}{ccy.unit}</span>
                </label>
                <input type="range" min="0" max="200" step="5" value={viz.one_time_cost_m}
                  onChange={(e) => update({ one_time_cost_m: Number(e.target.value) })}
                  className="w-full accent-rose-500" />
              </div>

              <div className="mt-4 rounded-lg bg-emerald-50 p-3 dark:bg-emerald-950/30">
                <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Estimated Synergy NPV (5-yr)</div>
                <div className="mt-1 text-3xl font-bold text-emerald-700 dark:text-emerald-400">
                  {ccy.symbol}{toDisplayFromUsdM(output.npv_after_costs, viz.currency).toFixed(2)}{ccy.unit}
                </div>
                <div className="mt-1 text-[10.5px] text-slate-600 dark:text-slate-400">
                  Gross NPV {ccy.symbol}{toDisplayFromUsdM(output.npv, viz.currency).toFixed(2)}{ccy.unit} · Offset by {ccy.symbol}{toDisplayFromUsdM(viz.one_time_cost_m, viz.currency).toFixed(2)}{ccy.unit} one-time setup costs
                </div>
              </div>
            </div>

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
                  <div className="text-lg font-bold text-emerald-700 dark:text-emerald-400">{ccy.symbol}{toDisplayFromUsdM(output.totalCostRR, viz.currency).toFixed(2)}{ccy.unit} <span className="text-[10px] font-normal">/ yr</span></div>
                </div>
                <div className="rounded-lg bg-sky-50 p-2 dark:bg-sky-950/30">
                  <div className="text-[9px] font-bold uppercase text-sky-700 dark:text-sky-400">Run-Rate Revenue Opportunity</div>
                  <div className="text-lg font-bold text-sky-700 dark:text-sky-400">{ccy.symbol}{toDisplayFromUsdM(output.totalRevRR, viz.currency).toFixed(2)}{ccy.unit} <span className="text-[10px] font-normal">/ yr</span></div>
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
                          onChange={(e) => update({ [k]: Number(e.target.value) } as any)}
                          className="w-full rounded border border-slate-300 px-1 py-0.5 text-center text-[10px] dark:border-slate-700 dark:bg-slate-800" />
                      </div>
                    );
                  })}
                </div>
              </details>
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <BreakdownTable
              title="Cost Synergies (Target Redundancy Pools)"
              subtitle="Estimated savings from rationalized back-offices, redundant tools, and scaled procurement."
              rows={COST_ROWS}
              viz={viz}
              update={update}
              totalLabel="TOTAL COST"
              total={output.totalCostRR}
              accent="emerald"
              methodsKey="cost_methods"
              unitsKey="cost_units"
            />
            <BreakdownTable
              title="Revenue Synergies (Commercial Scale)"
              subtitle="Top-line acceleration via cross-selling existing customer networks."
              rows={REV_ROWS}
              viz={viz}
              update={update}
              totalLabel="TOTAL REVENUE"
              total={output.totalRevRR}
              accent="sky"
              methodsKey="rev_methods"
              unitsKey="rev_units"
            />
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
              onChange={(e) => update({ [unitsKey]: { ...viz[unitsKey], [r.key]: e.target.value } })}
              placeholder="Edit functional unit"
              aria-label={`${title} functional unit ${r.label}`}
              className="w-full rounded border border-slate-300 bg-white px-1 py-0.5 font-medium text-slate-800 outline-none ring-0 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:focus:ring-indigo-900"
            />
            <input
              type="text"
              value={viz[methodsKey][r.key] ?? r.method}
              onChange={(e) => update({ [methodsKey]: { ...viz[methodsKey], [r.key]: e.target.value } })}
              className="w-full rounded border border-slate-300 bg-white px-1 py-0.5 text-[10.5px] text-slate-600 outline-none ring-0 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:focus:ring-indigo-900"
            />
            <input
              type="number"
              value={toDisplayFromUsdM(viz[r.key] as number, viz.currency)}
              step="0.5"
              onChange={(e) => update({ [r.key]: toUsdMFromDisplay(Number(e.target.value), viz.currency) })}
              className="rounded border border-slate-200 px-1 py-0.5 text-right font-mono text-[11px] dark:border-slate-700 dark:bg-slate-800"
            />
          </div>
        ))}
        <div className={`flex items-center justify-between border-t-2 border-${accent}-300 pt-1 text-[12px] font-bold dark:border-${accent}-800`}>
          <span className={`text-${accent}-700 dark:text-${accent}-400`}>{totalLabel}</span>
          <span className={`text-${accent}-700 dark:text-${accent}-400`}>{ccy.symbol}{toDisplayFromUsdM(total, viz.currency).toFixed(2)}{ccy.unit}</span>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// Main page — original implementation below
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

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [premiumTier, setPremiumTier] = useState<{ provider: string | null; model: string | null; hasKey: boolean }>({ provider: null, model: null, hasKey: false });
  const [economicTier, setEconomicTier] = useState<{ provider: string | null; model: string | null; hasKey: boolean }>({ provider: null, model: null, hasKey: false });

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
    const finalBuyer = buyerParam ?? stored.buyer;
    const finalTarget = targetParam ?? stored.target;
    const finalSector = sectorParam ?? stored.sector;
    const finalGeo = geographyParam ?? stored.geography;
    const finalDealSize = dealSizeParam ?? stored.deal_size;

    if (finalDID) setDealId(finalDID);
    if (finalBuyer) setB(finalBuyer);
    if (finalTarget) setT(finalTarget);
    if (finalSector) setSec(finalSector);
    if (finalGeo) setGeo(finalGeo);
    if (finalDealSize) setDS(finalDealSize);

    const out = loadOutput("synergy");
    if (out) setContent(out);
  }, []);

  // ... keep the remainder of your existing file unchanged (generate logic, actions, render shell, etc.)
  // IMPORTANT: keep <SynergyVisuals /> mounted where it already is in your page body.

  return (
    <div className="space-y-4">
      {/* existing page layout */}
      <SynergyVisuals />
      {/* existing rest of the UI */}
    </div>
  );
}
