

"use client";

import { Search, X } from "lucide-react";

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
  timeSensitivity: string;
};

export const EMPTY_FILTERS: Filters = {
  q: "", sector: "", country: "", dealType: "", status: "",
  indiaFlow: "", stakeStatus: "", targeting: "",
  dateFrom: "", dateTo: "", minValueM: "", maxValueM: "",
  minPriority: "", maxPriority: "", minAdvisory: "", maxAdvisory: "",
  minRisk: "", maxRisk: "", timeSensitivity: "",
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
const MULTI_DELIMITER = "|";


export default function FilterBar({ filters, onChange, options }: Props) {
  const active = Object.values(filters).some((v) => v !== "");
  const set = (k: keyof Filters, v: string) => onChange({ ...filters, [k]: v });

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#15151f]">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={filters.q}
            onChange={(e) => set("q", e.target.value)}
            placeholder="Search buyer, target, notes…"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
        </div>
       <MultiSelect label="Sector" value={filters.sector} options={options.sectors} onChange={(v) => set("sector", v)} />
        <MultiSelect label="Country" value={filters.country} options={options.countries} onChange={(v) => set("country", v)} />
        <MultiSelect label="Deal Type" value={filters.dealType} options={options.dealTypes} onChange={(v) => set("dealType", v)} />
        <MultiSelect label="Status" value={filters.status} options={options.statuses} onChange={(v) => set("status", v)} />


        {active && (
          <button
            onClick={() => onChange(EMPTY_FILTERS)}
            className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </button>
        )}
      </div>

      {/* Row 2: India Flow / Stake / Targeting */}
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
        <Select label="India Flow" value={filters.indiaFlow} options={["domestic", "outbound", "inbound", "other"]} onChange={(v) => set("indiaFlow", v)} />
        <Select label="Stake" value={filters.stakeStatus} options={["minority", "majority", "control"]} onChange={(v) => set("stakeStatus", v)} />
        <Select label="Targeting" value={filters.targeting} options={["HIGH", "MEDIUM", "LOW"]} onChange={(v) => set("targeting", v)} />

        <details className="cursor-pointer">
          <summary className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
            Scores ▾
          </summary>
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 p-2 dark:border-white/5 dark:bg-white/5">
            <span className="text-[10px] text-slate-500">Priority:</span>
           <input type="number" value={filters.minPriority} onChange={(e) => set("minPriority", e.target.value)} placeholder="Min" className="w-16 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            <span className="text-slate-400">→</span>
           <input type="number" value={filters.maxPriority} onChange={(e) => set("maxPriority", e.target.value)} placeholder="Max" className="w-16 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            <span className="ml-2 text-[10px] text-slate-500">Advisory:</span>
            <input type="number" value={filters.minAdvisory} onChange={(e) => set("minAdvisory", e.target.value)} placeholder="Min" className="w-16 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            <span className="text-slate-400">→</span>
            <input type="number" value={filters.maxAdvisory} onChange={(e) => set("maxAdvisory", e.target.value)} placeholder="Max" className="w-16 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            <span className="ml-2 text-[10px] text-slate-500">Risk:</span>
           <input type="number" value={filters.minRisk} onChange={(e) => set("minRisk", e.target.value)} placeholder="Min" className="w-16 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            <span className="text-slate-400">→</span>
             <input type="number" value={filters.maxRisk} onChange={(e) => set("maxRisk", e.target.value)} placeholder="Max" className="w-16 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
          </div>
        </details>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
        <span className="text-slate-500">Date:</span>
         <input type="date" value={filters.dateFrom} onChange={(e) => set("dateFrom", e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
        <span className="text-slate-400">→</span>
        <input type="date" value={filters.dateTo} onChange={(e) => set("dateTo", e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white" />

        <span className="ml-4 text-slate-500">Value ($M):</span>
         <input type="number" value={filters.minValueM} onChange={(e) => set("minValueM", e.target.value)} placeholder="Min" className="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1.5 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
        <span className="text-slate-400">→</span>
          <input type="number" value={filters.maxValueM} onChange={(e) => set("maxValueM", e.target.value)} placeholder="Max" className="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1.5 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
      </div>
    </div>
  );
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white">
      <option value="">{label}: All</option>
      {options.map((o) => (<option key={o} value={o}>{o}</option>))}
    </select>
  );
}
function MultiSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  const selected = new Set(value ? value.split(MULTI_DELIMITER).filter(Boolean) : []);

  const toggle = (item: string) => {
    const next = new Set(selected);
    if (next.has(item)) next.delete(item);
    else next.add(item);
    onChange(Array.from(next).join(MULTI_DELIMITER));
  };

  return (
    <details className="relative">
      <summary className="list-none cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-white">
        {selected.size ? `${label}: ${selected.size} selected` : `${label}: All`} ▾
      </summary>
      <div className="absolute z-20 mt-2 max-h-64 w-64 overflow-auto rounded-lg border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900">
        {options.map((item) => (
          <label key={item} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
            <input type="checkbox" checked={selected.has(item)} onChange={() => toggle(item)} className="h-4 w-4 rounded border-slate-300 text-indigo-600" />
            <span className="text-slate-700 dark:text-slate-200">{item}</span>
          </label>
        ))}
      </div>
    </details>
  );
}
