

"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Sliders, Save, RotateCcw } from "lucide-react";

type DealModel = {
  deal_id: string;
  primary_currency: string;
  ev_primary: number;
  cost_synergy_runrate: number;
  rev_synergy_runrate: number;
  one_time_integration_cost: number;
  net_runrate_y3: number;
  cost_synergy_confidence: "HIGH" | "MEDIUM" | "STRETCH";
  rev_synergy_confidence: "HIGH" | "MEDIUM" | "STRETCH";
  partner_overrides: Record<string, true>;
  written_by: Record<string, string>;
  base_case: { synergy_capture_pct: number; irr_pct: number; multiple: number; probability_pct: number };
};

function fmt(n: number, cur: string) {
  const symbol = cur === "USD" ? "$" : cur === "INR" ? "₹" : cur === "EUR" ? "€" : cur + " ";
  if (n >= 1e9) return `${symbol}${(n/1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${symbol}${(n/1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${symbol}${(n/1e3).toFixed(0)}K`;
  return `${symbol}${n.toFixed(0)}`;
}

export default function DealModelCard({ dealId }: { dealId: string }) {
  const sb = createClient();
  const [model, setModel] = useState<DealModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [edits, setEdits] = useState<Partial<DealModel>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await sb.from("deal_models").select("*").eq("deal_id", dealId).maybeSingle();
      if (cancelled) return;
      if (data) {
        setModel(data as DealModel);
        setLoading(false);
        return;
      }
      // No model row yet → ask the server to seed it from sector benchmarks
      // so the partner sees canonical numbers immediately instead of
      // "Generate a proposal to seed it" friction.
      try {
        const r = await fetch("/api/deals/seed-model", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deal_id: dealId }),
        });
        const j = await r.json();
        if (!cancelled && j.model) setModel(j.model as DealModel);
      } catch {
        // Seeding failed — fall through to the empty-state message
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [dealId, sb]);

  if (loading) return <div className="card p-4 text-xs text-slate-500">Loading deal model…</div>;
  if (!model) {
    return (
      <div className="card p-4 text-xs text-slate-500">
        Deal model could not be seeded. Generate any proposal/PMI/synergy/TSA document to retry seeding, or check that the deal has a sector and value set.
      </div>
    );
  }

  const current = { ...model, ...edits };
  const cur = current.primary_currency;

  function set<K extends keyof DealModel>(key: K, value: DealModel[K]) {
    setEdits((e) => ({ ...e, [key]: value }));
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    const overrides = { ...(model!.partner_overrides ?? {}) };
    Object.keys(edits).forEach((k) => { overrides[k] = true; });
    const { data } = await sb.from("deal_models")
      .update({ ...edits, partner_overrides: overrides })
      .eq("deal_id", dealId).select("*").single();
    if (data) {
      setModel(data as DealModel);
      setEdits({});
      setDirty(false);
    }
    setSaving(false);
  }

  async function resetField(key: keyof DealModel) {
    const overrides = { ...(model!.partner_overrides ?? {}) };
    delete overrides[key as string];
    await sb.from("deal_models").update({ partner_overrides: overrides }).eq("deal_id", dealId);
    // Trigger re-seed by clearing the field and letting next AI run repopulate — for now just reload
    const { data } = await sb.from("deal_models").select("*").eq("deal_id", dealId).maybeSingle();
    if (data) setModel(data as DealModel);
  }

  const fields: Array<{
    key: keyof DealModel;
    label: string;
    min: number; max: number; step: number;
    pctOfEv?: boolean;
  }> = [
    { key: "ev_primary",                 label: "Enterprise Value",       min: current.ev_primary * 0.5, max: current.ev_primary * 2.0, step: current.ev_primary * 0.01 },
    { key: "cost_synergy_runrate",       label: "Cost Synergy Run-rate",  min: 0, max: current.ev_primary * 0.30, step: current.ev_primary * 0.005, pctOfEv: true },
    { key: "rev_synergy_runrate",        label: "Revenue Synergy Run-rate", min: 0, max: current.ev_primary * 0.20, step: current.ev_primary * 0.005, pctOfEv: true },
    { key: "one_time_integration_cost",  label: "One-time Integration Cost", min: 0, max: current.ev_primary * 0.15, step: current.ev_primary * 0.005, pctOfEv: true },
  ];

  const netRunrate = (current.cost_synergy_runrate ?? 0) + (current.rev_synergy_runrate ?? 0);
  const synEvPct = current.ev_primary > 0 ? (netRunrate / current.ev_primary * 100) : 0;

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center gap-2">
        <Sliders className="h-4 w-4 text-indigo-600" />
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Canonical Deal Model</h2>
        <span className="ml-auto text-[10px] text-slate-500">
          Currency: {cur} · Source of truth across Proposal / PMI / Synergy / TSA
        </span>
      </div>

      <p className="mb-4 text-[11px] text-slate-600 dark:text-slate-400">
        AI seeds these from sector benchmarks. Slide to override based on your judgment — overridden fields are locked from future AI changes.
        Cleared overrides return to AI control on next generation.
      </p>

      <div className="space-y-4">
        {fields.map(({ key, label, min, max, step, pctOfEv }) => {
          const value = (current[key] as number) ?? 0;
          const isOverridden = !!model.partner_overrides[key as string];
          const writtenBy = model.written_by[key as string] ?? "auto-seed";
          const pctEv = pctOfEv && current.ev_primary > 0 ? ` (${(value / current.ev_primary * 100).toFixed(1)}% of EV)` : "";
          return (
            <div key={key as string}>
              <div className="flex items-baseline justify-between">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  {label}
                  {isOverridden && <span className="ml-2 rounded bg-indigo-100 px-1.5 py-0.5 text-[9px] font-bold text-indigo-700">PARTNER-LOCKED</span>}
                </label>
                <span className="font-mono text-[11px] text-slate-700 dark:text-slate-300">
                  {fmt(value, cur)}{pctEv}
                </span>
              </div>
              <input
                type="range" min={min} max={max} step={step}
                value={value}
                onChange={(e) => set(key, Number(e.target.value) as DealModel[typeof key])}
                className="w-full accent-indigo-600"
              />
              <div className="mt-0.5 flex items-center justify-between text-[10px] text-slate-400">
                <span>Source: {writtenBy}</span>
                {isOverridden && (
                  <button onClick={() => resetField(key)} className="flex items-center gap-1 text-indigo-600 hover:text-indigo-800">
                    <RotateCcw className="h-3 w-3" /> Reset to AI
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Confidence pickers */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] font-medium text-slate-700 dark:text-slate-300">Cost Synergy Confidence</label>
          <select value={current.cost_synergy_confidence}
            onChange={(e) => set("cost_synergy_confidence", e.target.value as DealModel["cost_synergy_confidence"])}
            className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1 text-[11px] dark:border-white/10 dark:bg-[#15151f] dark:text-slate-200">
            <option value="HIGH">HIGH</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="STRETCH">STRETCH</option>
          </select>
        </div>
        <div>
          <label className="text-[11px] font-medium text-slate-700 dark:text-slate-300">Revenue Synergy Confidence</label>
          <select value={current.rev_synergy_confidence}
            onChange={(e) => set("rev_synergy_confidence", e.target.value as DealModel["rev_synergy_confidence"])}
            className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1 text-[11px] dark:border-white/10 dark:bg-[#15151f] dark:text-slate-200">
            <option value="HIGH">HIGH</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="STRETCH">STRETCH</option>
          </select>
        </div>
      </div>

      {/* Live derived metrics */}
      <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
        <p className="text-[11px] font-medium text-slate-700 dark:text-slate-300">Live derived metrics (recomputed from sliders):</p>
        <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
          <div>
            <div className="text-slate-500">Net Runrate Y3</div>
            <div className="font-mono font-semibold text-slate-900 dark:text-slate-100">{fmt(netRunrate, cur)}</div>
          </div>
          <div>
            <div className="text-slate-500">Synergy / EV %</div>
            <div className="font-mono font-semibold text-slate-900 dark:text-slate-100">{synEvPct.toFixed(1)}%</div>
          </div>
          <div>
            <div className="text-slate-500">Payback (est)</div>
            <div className="font-mono font-semibold text-slate-900 dark:text-slate-100">
              {netRunrate > 0 ? `${Math.max(12, Math.round(current.one_time_integration_cost / Math.max(netRunrate / 12, 1))).toFixed(0)} mo` : "—"}
            </div>
          </div>
        </div>
      </div>

      {/* Save */}
      <div className="mt-4 flex justify-end gap-2">
        {dirty && (
          <button onClick={() => { setEdits({}); setDirty(false); }}
            className="rounded-md border border-slate-200 px-3 py-1.5 text-xs text-slate-700 dark:border-white/10 dark:text-slate-300">
            Discard
          </button>
        )}
        <button onClick={save} disabled={!dirty || saving}
          className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
          <Save className="h-3 w-3" /> {saving ? "Saving…" : "Save overrides"}
        </button>
      </div>
    </div>
  );
}
