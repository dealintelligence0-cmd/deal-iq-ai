

"use client";

import { Search, X, SlidersHorizontal } from "lucide-react";
import { useState } from "react";

export type Filters = {
  q: string;
  sector: string;
  country: string;
  dealType: string;
  status: string;
  indiaFlow: string;
  stakeStatus: string;
  targeting: string;
  dateFrom: string;
  dateTo: string;
  minValueM: string;
  maxValueM: string;
  minPriority: string;
  maxPriority: string;
  minAdvisory: string;
  maxAdvisory: string;
  minRisk: string;
  maxRisk: string;
  targeting?: string;
  minPriority?: string;
  minAdvisory?: string;
  timeSensitivity?: string;

  
};

export const EMPTY_FILTERS: Filters = {
  q: "", sector: "", country: "", dealType: "", status: "",
  indiaFlow: "", stakeStatus: "", targeting: "",
  dateFrom: "", dateTo: "", minValueM: "", maxValueM: "",
  minPriority: "", maxPriority: "", minAdvisory: "", maxAdvisory: "",
  minRisk: "", maxRisk: "",
  targeting: null,
  minPriority: null,
  minAdvisory: null,
  timeSensitivity: null,

  
};

type Props = {
  filters: Filters;
  onChange: (f: Filters) => void;
  options: {
    sectors: string[];
    countries: string[];
    dealTypes: string[];
    statuses: string[];
  };
};

const INDIA_FLOWS = ["domestic", "inbound", "outbound", "other"];
const STAKE_STATUSES = ["minority", "majority", "control", "unknown"];
const TARGETING = ["HIGH", "MEDIUM", "LOW"];

export default function FilterBar({ filters, onChange, options }: Props) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const active = Object.values(filters).some((v) => v !== "");
  const set = (k: keyof Filters, v: string) => onChange({ ...filters, [k]: v });
  const activeCount = Object.values(filters).filter((v) => v !== "").length;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
      {/* Row 1 – search + primary selects */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={filters.q}
            onChange={(e) => set("q", e.target.value)}
            placeholder="Search buyer, target, summary…"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <Sel label="Sector" value={filters.sector} opts={options.sectors} onChange={(v) => set("sector", v)} />
        <Sel label="Country" value={filters.country} opts={options.countries} onChange={(v) => set("country", v)} />
        <Sel label="Deal Type" value={filters.dealType} opts={options.dealTypes} onChange={(v) => set("dealType", v)} />
        <Sel label="Status" value={filters.status} opts={options.statuses} onChange={(v) => set("status", v)} />
        <Sel label="India Flow" value={filters.indiaFlow} opts={INDIA_FLOWS} onChange={(v) => set("indiaFlow", v)} />
        <Sel label="Stake" value={filters.stakeStatus} opts={STAKE_STATUSES} onChange={(v) => set("stakeStatus", v)} />
        <Sel label="Targeting" value={filters.targeting} opts={TARGETING} onChange={(v) => set("targeting", v)} />

        <button
          onClick={() => setShowAdvanced((s) => !s)}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${showAdvanced ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Scores{showAdvanced ? " ▲" : " ▼"}
        </button>

        {active && (
          <button
            onClick={() => onChange(EMPTY_FILTERS)}
            className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            <X className="h-3.5 w-3.5" />
            Clear{activeCount > 0 ? ` (${activeCount})` : ""}
          </button>
        )}
      </div>

      {/* Row 2 – date + value range */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span className="font-medium">Date:</span>
        <input type="date" value={filters.dateFrom} onChange={(e) => set("dateFrom", e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-indigo-500" />
        <span className="text-slate-400">→</span>
        <input type="date" value={filters.dateTo} onChange={(e) => set("dateTo", e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-indigo-500" />
        <span className="ml-3 font-medium">Value ($M):</span>
        <input type="number" value={filters.minValueM} onChange={(e) => set("minValueM", e.target.value)} placeholder="Min" className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-indigo-500" />
        <span className="text-slate-400">→</span>
        <input type="number" value={filters.maxValueM} onChange={(e) => set("maxValueM", e.target.value)} placeholder="Max" className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-indigo-500" />
      </div>

      {/* Row 3 – score ranges (collapsible) */}
      {showAdvanced && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 border border-slate-100">
          <ScoreRange label="Priority" min={filters.minPriority} max={filters.maxPriority} onMin={(v) => set("minPriority", v)} onMax={(v) => set("maxPriority", v)} color="text-indigo-600" />
          <span className="text-slate-300">|</span>
          <ScoreRange label="Advisory" min={filters.minAdvisory} max={filters.maxAdvisory} onMin={(v) => set("minAdvisory", v)} onMax={(v) => set("maxAdvisory", v)} color="text-emerald-600" />
          <span className="text-slate-300">|</span>
          <ScoreRange label="Risk" min={filters.minRisk} max={filters.maxRisk} onMin={(v) => set("minRisk", v)} onMax={(v) => set("maxRisk", v)} color="text-red-600" />
        </div>
      )}
    </div>
  );
}

function Sel({ label, value, opts, onChange }: { label: string; value: string; opts: string[]; onChange: (v: string) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`rounded-lg border px-3 py-2 text-sm outline-none focus:border-indigo-500 ${value ? "border-indigo-300 bg-indigo-50 text-indigo-800 font-medium" : "border-slate-200 bg-white text-slate-700"}`}
    >
      <option value="">{label}: All</option>
      {opts.map((o) => <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>)}
    </select>
  );
}

function ScoreRange({ label, min, max, onMin, onMax, color }: { label: string; min: string; max: string; onMin: (v: string) => void; onMax: (v: string) => void; color: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`font-medium ${color}`}>{label}:</span>
      <input type="number" min={0} max={100} value={min} onChange={(e) => onMin(e.target.value)} placeholder="0" className="w-12 rounded border border-slate-200 bg-white px-1.5 py-1 text-xs outline-none focus:border-indigo-500" />
      <span className="text-slate-400">–</span>
      <input type="number" min={0} max={100} value={max} onChange={(e) => onMax(e.target.value)} placeholder="100" className="w-12 rounded border border-slate-200 bg-white px-1.5 py-1 text-xs outline-none focus:border-indigo-500" />
    </div>
  );
}
