"use client";

import { Search, X } from "lucide-react";

export type Filters = {
  q: string;
  sector: string;
  country: string;
  dealType: string;
  status: string;
  dateFrom: string;
  dateTo: string;
  minValueM: string;
  maxValueM: string;
};

export const EMPTY_FILTERS: Filters = {
  q: "", sector: "", country: "", dealType: "", status: "",
  dateFrom: "", dateTo: "", minValueM: "", maxValueM: "",
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

export default function FilterBar({ filters, onChange, options }: Props) {
  const active = Object.values(filters).some((v) => v !== "");
  const set = (k: keyof Filters, v: string) => onChange({ ...filters, [k]: v });

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={filters.q}
            onChange={(e) => set("q", e.target.value)}
            placeholder="Search buyer, target, notes…"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <Select label="Sector" value={filters.sector} options={options.sectors} onChange={(v) => set("sector", v)} />
        <Select label="Country" value={filters.country} options={options.countries} onChange={(v) => set("country", v)} />
        <Select label="Deal Type" value={filters.dealType} options={options.dealTypes} onChange={(v) => set("dealType", v)} />
        <Select label="Status" value={filters.status} options={options.statuses} onChange={(v) => set("status", v)} />

        {active && (
          <button
            onClick={() => onChange(EMPTY_FILTERS)}
            className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </button>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
        <span className="text-slate-500">Date:</span>
        <input
          type="date"
          value={filters.dateFrom}
          onChange={(e) => set("dateFrom", e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 outline-none focus:border-indigo-500"
        />
        <span className="text-slate-400">→</span>
        <input
          type="date"
          value={filters.dateTo}
          onChange={(e) => set("dateTo", e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 outline-none focus:border-indigo-500"
        />

        <span className="ml-4 text-slate-500">Value ($M):</span>
        <input
          type="number"
          value={filters.minValueM}
          onChange={(e) => set("minValueM", e.target.value)}
          placeholder="Min"
          className="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1.5 outline-none focus:border-indigo-500"
        />
        <span className="text-slate-400">→</span>
        <input
          type="number"
          value={filters.maxValueM}
          onChange={(e) => set("maxValueM", e.target.value)}
          placeholder="Max"
          className="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1.5 outline-none focus:border-indigo-500"
        />
      </div>
    </div>
  );
}

function Select({
  label, value, options, onChange,
}: {
  label: string; value: string; options: string[]; onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500"
    >
      <option value="">{label}: All</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}
