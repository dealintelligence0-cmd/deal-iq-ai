"use client";

import { useEffect, useState } from "react";
import {
  Download, FileSpreadsheet, FileJson, FileText, Presentation,
  Loader2, CheckCircle2, Filter,
} from "lucide-react";
import { fetchDeals, formatUsdShort, type Deal } from "@/lib/analytics";
import { exportCsv, exportJson, exportPdf, exportPptx } from "@/lib/export";

type Format = "csv" | "json" | "pdf" | "pptx";

const FORMATS: { id: Format; label: string; desc: string; icon: typeof Download; color: string }[] = [
  { id: "csv",  label: "CSV",  desc: "Spreadsheet-compatible raw data",         icon: FileSpreadsheet, color: "emerald" },
  { id: "json", label: "JSON", desc: "Structured data for developers / APIs",   icon: FileJson,        color: "amber" },
  { id: "pdf",  label: "PDF",  desc: "Branded report with KPIs + deal table",   icon: FileText,        color: "red" },
  { id: "pptx", label: "PPTX", desc: "4-slide presentation with charts",         icon: Presentation,    color: "orange" },
];

const TONES: Record<string, string> = {
  emerald: "bg-emerald-50 text-emerald-600 border-emerald-200",
  amber: "bg-amber-50 text-amber-600 border-amber-200",
  red: "bg-red-50 text-red-600 border-red-200",
  orange: "bg-orange-50 text-orange-600 border-orange-200",
};

export default function ExportsPage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<Format | null>(null);
  const [done, setDone] = useState<Format | null>(null);
  const [sectorFilter, setSectorFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  useEffect(() => {
    (async () => {
      setDeals(await fetchDeals());
      setLoading(false);
    })();
  }, []);

  const sectors = Array.from(new Set(deals.map((d) => d.sector).filter(Boolean) as string[])).sort();
  const filtered = deals.filter((d) =>
    (!sectorFilter || d.sector === sectorFilter) &&
    (!statusFilter || d.status === statusFilter)
  );

  const total = filtered.reduce((s, d) => s + (d.normalized_value_usd ?? 0), 0);

  async function handleExport(fmt: Format) {
    setExporting(fmt);
    setDone(null);
    try {
      if (fmt === "csv") exportCsv(filtered);
      else if (fmt === "json") exportJson(filtered);
      else if (fmt === "pdf") exportPdf(filtered, "Deal Pipeline Report");
      else if (fmt === "pptx") await exportPptx(filtered, "Deal Pipeline");
      setDone(fmt);
      setTimeout(() => setDone(null), 3000);
    } catch (e) {
      alert("Export failed: " + String(e));
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-900">
          <Download className="h-5 w-5 text-indigo-500" />
          Export Center
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Download your deal data in 4 branded formats — all generated in your browser.
        </p>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
        </div>
      ) : (
        <>
          {/* Filters */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">
              <Filter className="h-3.5 w-3.5" /> Filter What to Export
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-slate-600">Sector</label>
                <select value={sectorFilter} onChange={(e) => setSectorFilter(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500">
                  <option value="">All sectors</option>
                  {sectors.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-600">Status</label>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500">
                  <option value="">All statuses</option>
                  {["rumor","announced","live","closed","dropped"].map((s) =>
                    <option key={s} value={s} className="capitalize">{s}</option>
                  )}
                </select>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-4 border-t border-slate-100 pt-3 text-sm">
              <span className="text-slate-500">Ready to export:</span>
              <span className="font-semibold text-slate-900">{filtered.length} deals</span>
              <span className="text-slate-400">·</span>
              <span className="font-semibold text-indigo-600">{formatUsdShort(total)}</span>
            </div>
          </div>

          {/* Format cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FORMATS.map((f) => {
              const isExporting = exporting === f.id;
              const isDone = done === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => handleExport(f.id)}
                  disabled={exporting !== null || filtered.length === 0}
                  className="group rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-indigo-200 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <div className={`flex h-12 w-12 items-center justify-center rounded-lg border ${TONES[f.color]}`}>
                    <f.icon className="h-6 w-6" />
                  </div>
                  <p className="mt-4 text-sm font-semibold text-slate-900">{f.label}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{f.desc}</p>
                  <div className="mt-4 flex items-center gap-1.5 text-xs font-medium">
                    {isExporting ? (
                      <><Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-500" /><span className="text-indigo-600">Exporting…</span></>
                    ) : isDone ? (
                      <><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /><span className="text-emerald-600">Downloaded</span></>
                    ) : (
                      <><Download className="h-3.5 w-3.5 text-slate-400 group-hover:text-indigo-500" /><span className="text-slate-500 group-hover:text-indigo-600">Download</span></>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs text-blue-700">
            <strong>Tip:</strong> PDF opens a print dialog — choose &quot;Save as PDF&quot; as destination. PPTX downloads directly and opens in PowerPoint, Keynote, or Google Slides.
          </div>
        </>
      )}
    </div>
  );
}
