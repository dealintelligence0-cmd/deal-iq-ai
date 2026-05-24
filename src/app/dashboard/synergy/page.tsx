"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { TrendingUp, Loader2, Sparkles, Calculator, Search, ChevronRight, FileText } from "lucide-react";
import { XAxis, YAxis, Legend, ResponsiveContainer, Tooltip, Area, AreaChart } from "recharts";

type Model = {
  account_name: string; buyer_name: string | null;
  target_revenue_m: number; target_ebitda_m: number;
  wacc_pct: number; one_time_cost_m: number;
  cost_hq_ga_m: number; cost_it_infra_m: number; cost_procurement_m: number; cost_facilities_m: number; cost_other_m: number;
  rev_cross_sell_m: number; rev_price_opt_m: number; rev_territory_m: number; rev_bundling_m: number; rev_other_m: number;
  realize_y1_pct: number; realize_y2_pct: number; realize_y3_pct: number; realize_y4_pct: number; realize_y5_pct: number;
  ai_narrative?: string | null;
};
type Output = {
  total_cost_run_rate_m: number; total_rev_run_rate_m: number; total_run_rate_m: number;
  year_curve: Array<{ year: number; cost_m: number; rev_m: number; total_m: number; cumulative_m: number }>;
  npv_m: number; npv_after_costs_m: number;
};

const COST_ROWS: Array<{ key: keyof Model; label: string; method: string }> = [
  { key: "cost_hq_ga_m",       label: "HQ & Core G&A",   method: "Merge billing systems, dedupe management grids, consolidate legal controllers." },
  { key: "cost_it_infra_m",    label: "IT Infrastructure", method: "Retire duplicate cloud tools, unify databases, merge servers and ERP hosts." },
  { key: "cost_procurement_m", label: "Procurement",     method: "Negotiate bulk scale pricing on joint software partners and contractors." },
  { key: "cost_facilities_m",  label: "Facilities",      method: "Consolidate offices, sublet redundant space, single-network telecom." },
  { key: "cost_other_m",       label: "Other",           method: "Miscellaneous (insurance, legal, audit consolidation)." },
];
const REV_ROWS: Array<{ key: keyof Model; label: string; method: string }> = [
  { key: "rev_cross_sell_m",  label: "Account Cross-Selling", method: "Bundle target services natively into existing buyer strategic networks." },
  { key: "rev_price_opt_m",   label: "Price Optimization",    method: "Unblock unextracted margins via tier adjustments and contract standardizations." },
  { key: "rev_territory_m",   label: "Territory Expansion",   method: "Export products directly using buyer's global sales channels without extra CAC." },
  { key: "rev_bundling_m",    label: "Product Bundling",      method: "Combine target SKUs with buyer flagship into premium-priced offerings." },
  { key: "rev_other_m",       label: "Other",                 method: "New use-cases, M&A halo, partnership effects." },
];

export default function SynergyPage() {
  const [list, setList] = useState<Array<{ id: string; account_name: string; buyer_name: string | null; total_cost_synergies_m: number; total_rev_synergies_m: number; updated_at: string }>>([]);
  const [model, setModel] = useState<Model | null>(null);
  const [output, setOutput] = useState<Output | null>(null);
  const [accountInput, setAccountInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [narrating, setNarrating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/synergy").then((x) => x.json());
      setList(r.models ?? []);
    } catch (e: any) { setError(e?.message ?? "Load failed"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { loadList(); }, [loadList]);

  async function loadOne(account: string) {
    setError(null);
    try {
      const r = await fetch(`/api/synergy?account=${encodeURIComponent(account)}`).then((x) => x.json());
      setModel(r.model); setOutput(r.output);
    } catch (e: any) { setError(e?.message ?? "Load failed"); }
  }

  useEffect(() => {
    if (!model) return;
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const r = await fetch("/api/synergy", {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(model),
        });
        const j = await r.json();
        if (j.output) setOutput(j.output);
      } catch (e: any) { setError(e?.message ?? "Save failed"); }
      finally { setBusy(false); }
    }, 600);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model && JSON.stringify(model)]);

  async function startNew() {
    const account = accountInput.trim();
    if (!account) return;
    setError(null);
    try {
      const r = await fetch("/api/synergy", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_name: account }),
      });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      setModel(j.model); setOutput(j.output);
      setAccountInput("");
      await loadList();
    } catch (e: any) { setError(e?.message ?? "Create failed"); }
  }

  async function generateNarrative() {
    if (!model) return;
    setNarrating(true); setError(null);
    try {
      const r = await fetch("/api/synergy/narrative", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_name: model.account_name }),
      });
      const j = await r.json();
      if (j.error && !j.narrative) throw new Error(j.error);
      setModel((m) => m ? { ...m, ai_narrative: j.narrative } : m);
    } catch (e: any) { setError(e?.message ?? "Generation failed"); }
    finally { setNarrating(false); }
  }

  const update = (patch: Partial<Model>) => setModel((m) => m ? { ...m, ...patch } : m);

  const chartData = useMemo(() =>
    output?.year_curve.map((y) => ({
      year: `Year ${y.year}`,
      Cost: y.cost_m, Revenue: y.rev_m, Total: y.total_m, Cumulative: y.cumulative_m,
    })) ?? []
  , [output]);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900 dark:text-white">
          <TrendingUp className="h-6 w-6 text-emerald-500" />
          Synergy Quantification Analyst
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Model, negotiate, and display synergies. Compare bottom-up functional savings, and map 5-year post-merger integration curves with configurable NPV options.
        </p>
      </div>

      {error && <div className="rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">{error}</div>}

      {!model && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Start a new synergy model</h2>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input value={accountInput} onChange={(e) => setAccountInput(e.target.value)}
                     placeholder='Target firm name (e.g. "AJAX Therapeutics")'
                     onKeyDown={(e) => { if (e.key === "Enter") startNew(); }}
                     className="w-full rounded border border-slate-300 bg-white px-8 py-2 text-sm dark:border-slate-700 dark:bg-slate-800" />
            </div>
            <button onClick={startNew} disabled={!accountInput.trim()}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50">
              <Calculator className="mr-1 inline h-4 w-4" /> Start modeling
            </button>
          </div>
        </section>
      )}

      {!model && list.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Saved models ({list.length})</h2>
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            {list.map((m) => (
              <button key={m.id} onClick={() => loadOne(m.account_name)}
                      className="rounded-lg border border-slate-200 bg-white p-3 text-left hover:border-emerald-300 dark:border-slate-700 dark:bg-slate-900">
                <div className="flex items-start justify-between">
                  <span className="text-sm font-bold">{m.account_name}</span>
                  <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                </div>
                <p className="text-[10.5px] text-slate-500">
                  Cost ${m.total_cost_synergies_m}M · Rev ${m.total_rev_synergies_m}M · {new Date(m.updated_at).toLocaleDateString()}
                </p>
              </button>
            ))}
          </div>
        </section>
      )}

      {model && output && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold">{model.account_name}</h2>
              <input value={model.buyer_name ?? ""} onChange={(e) => update({ buyer_name: e.target.value })}
                     placeholder="Buyer name (optional)"
                     className="mt-0.5 rounded border-0 bg-transparent text-[12px] text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 focus:outline-none focus:bg-slate-50" />
            </div>
            <button onClick={() => { setModel(null); setOutput(null); loadList(); }}
                    className="text-[11px] text-slate-500 hover:text-slate-700 underline">
              ← Back to list
            </button>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <h2 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                <Calculator className="h-3.5 w-3.5" /> EBITDA Synergies Modeler {busy && <Loader2 className="h-3 w-3 animate-spin" />}
              </h2>

              <div className="grid grid-cols-2 gap-2">
                <Field label="Target Revenue ($M)" value={model.target_revenue_m} onChange={(v) => update({ target_revenue_m: v })} />
                <Field label="Target EBITDA ($M)"  value={model.target_ebitda_m}  onChange={(v) => update({ target_ebitda_m: v })} />
              </div>

              <div className="mt-3">
                <label className="mb-1 flex items-center justify-between text-[11px] font-medium text-slate-600">
                  <span>WACC / Discount Rate</span>
                  <span className="font-mono text-emerald-600">{model.wacc_pct}%</span>
                </label>
                <input type="range" min="0" max="30" step="0.5" value={model.wacc_pct}
                       onChange={(e) => update({ wacc_pct: Number(e.target.value) })}
                       className="w-full accent-emerald-500" />
              </div>

              <div className="mt-3">
                <label className="mb-1 flex items-center justify-between text-[11px] font-medium text-slate-600">
                  <span>One-Time Integration Cost ($M)</span>
                  <span className="font-mono text-rose-600">-${model.one_time_cost_m}M</span>
                </label>
                <input type="range" min="0" max="200" step="5" value={model.one_time_cost_m}
                       onChange={(e) => update({ one_time_cost_m: Number(e.target.value) })}
                       className="w-full accent-rose-500" />
              </div>

              <div className="mt-4 rounded-lg bg-emerald-50 p-3 dark:bg-emerald-950/30">
                <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Estimated Synergy NPV (5-yr)</div>
                <div className="mt-1 text-3xl font-bold text-emerald-700 dark:text-emerald-400">
                  ${output.npv_after_costs_m}M
                </div>
                <div className="mt-1 text-[10.5px] text-slate-600 dark:text-slate-400">
                  Gross NPV ${output.npv_m}M · Offset by ${model.one_time_cost_m}M one-time setup costs
                </div>
              </div>

              <button onClick={generateNarrative} disabled={narrating}
                      className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50">
                {narrating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {narrating ? "Generating…" : "Ask AI for Detailed Math Narrative"}
              </button>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">Realization Timeline Projection Curve</h2>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={chartData}>
                  <XAxis dataKey="year" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} label={{ value: "$M", angle: -90, position: "insideLeft", fontSize: 10 }} />
                  <Tooltip contentStyle={{ fontSize: 11 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="Cost" stroke="#10b981" fill="#10b981" fillOpacity={0.3} />
                  <Area type="monotone" dataKey="Revenue" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} />
                </AreaChart>
              </ResponsiveContainer>

              <div className="mt-2 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                <div className="rounded-lg bg-emerald-50 p-2 dark:bg-emerald-950/30">
                  <div className="text-[9px] font-bold uppercase text-emerald-700 dark:text-emerald-400">Run-Rate Cost Efficiencies</div>
                  <div className="text-lg font-bold text-emerald-700 dark:text-emerald-400">${output.total_cost_run_rate_m}M <span className="text-[10px] font-normal">/ yr</span></div>
                </div>
                <div className="rounded-lg bg-sky-50 p-2 dark:bg-sky-950/30">
                  <div className="text-[9px] font-bold uppercase text-sky-700 dark:text-sky-400">Run-Rate Revenue Opportunity</div>
                  <div className="text-lg font-bold text-sky-700 dark:text-sky-400">${output.total_rev_run_rate_m}M <span className="text-[10px] font-normal">/ yr</span></div>
                </div>
              </div>

              <details className="mt-3 text-[11px]">
                <summary className="cursor-pointer text-slate-500 hover:text-slate-700">Adjust realization curve →</summary>
                <div className="mt-2 grid grid-cols-5 gap-1">
                  {([1,2,3,4,5] as const).map((yr) => {
                    const k = `realize_y${yr}_pct` as keyof Model;
                    return (
                      <div key={yr}>
                        <div className="text-center text-[9px] text-slate-500">Y{yr}</div>
                        <input type="number" min={0} max={100} value={model[k] as number}
                               onChange={(e) => update({ [k]: Number(e.target.value) } as any)}
                               className="w-full rounded border border-slate-300 px-1 py-0.5 text-center text-[10px] dark:border-slate-700 dark:bg-slate-800" />
                      </div>
                    );
                  })}
                </div>
              </details>
            </section>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Breakdown title="Cost Synergies (Target Redundancy Pools)"
                       subtitle="Estimated savings from rationalized back-offices, redundant tools, and scaled procurement."
                       rows={COST_ROWS} model={model} update={update} totalLabel="TOTAL COST"
                       total={output.total_cost_run_rate_m} accent="emerald" />
            <Breakdown title="Revenue Synergies (Commercial Scale)"
                       subtitle="Top-line acceleration via cross-selling existing customer networks."
                       rows={REV_ROWS} model={model} update={update} totalLabel="TOTAL REVENUE"
                       total={output.total_rev_run_rate_m} accent="sky" />
          </div>

          {model.ai_narrative && (
            <section className="rounded-xl border border-emerald-200 bg-emerald-50/30 p-5 dark:border-emerald-900 dark:bg-emerald-950/20">
              <h2 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                <FileText className="h-3.5 w-3.5" /> AI-Generated Math Narrative
              </h2>
              <div className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-slate-800 dark:text-slate-200">
                {model.ai_narrative}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wider text-slate-500">{label}</label>
      <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))}
             className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800" />
    </div>
  );
}

function Breakdown({ title, subtitle, rows, model, update, totalLabel, total, accent }: any) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <h2 className="text-[11.5px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">{title}</h2>
      <p className="text-[10.5px] text-slate-500">{subtitle}</p>
      <div className="mt-3 space-y-1">
        <div className="grid grid-cols-[1fr,2fr,80px] gap-2 border-b border-slate-200 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-700">
          <span>Functional Unit</span>
          <span>Method / Derivation</span>
          <span className="text-right">Savings ($M)</span>
        </div>
        {rows.map((r: any) => (
          <div key={r.key} className="grid grid-cols-[1fr,2fr,80px] gap-2 py-1 text-[11.5px]">
            <span className="font-medium text-slate-800 dark:text-slate-200">{r.label}</span>
            <span className="text-[10.5px] text-slate-500">{r.method}</span>
            <input type="number" value={model[r.key]} step="0.5"
                   onChange={(e) => update({ [r.key]: Number(e.target.value) })}
                   className="rounded border border-slate-200 px-1 py-0.5 text-right font-mono text-[11px] dark:border-slate-700 dark:bg-slate-800" />
          </div>
        ))}
        <div className={`flex items-center justify-between border-t-2 border-${accent}-300 pt-1 text-[12px] font-bold dark:border-${accent}-800`}>
          <span className={`text-${accent}-700 dark:text-${accent}-400`}>{totalLabel}</span>
          <span className={`text-${accent}-700 dark:text-${accent}-400`}>${total}M</span>
        </div>
      </div>
    </section>
  );
}
