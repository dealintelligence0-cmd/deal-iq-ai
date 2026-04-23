"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  XCircle,
  Filter,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Exception = {
  id: string;
  deal_id: string | null;
  field: string;
  severity: "info" | "warn" | "error";
  message: string;
  raw_value: string | null;
  suggested_value: string | null;
  resolved: boolean;
  created_at: string;
};

const severityConfig = {
  info: { icon: Info, color: "text-blue-600", bg: "bg-blue-50", label: "Info" },
  warn: {
    icon: AlertTriangle,
    color: "text-amber-600",
    bg: "bg-amber-50",
    label: "Warning",
  },
  error: {
    icon: XCircle,
    color: "text-red-600",
    bg: "bg-red-50",
    label: "Error",
  },
};

export default function ExceptionsPage() {
  const supabase = createClient();
  const [rows, setRows] = useState<Exception[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "info" | "warn" | "error">("all");
  const [showResolved, setShowResolved] = useState(false);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, showResolved]);

  async function load() {
    setLoading(true);
    let q = supabase
      .from("exceptions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (filter !== "all") q = q.eq("severity", filter);
    if (!showResolved) q = q.eq("resolved", false);
    const { data } = await q;
    setRows((data ?? []) as Exception[]);
    setLoading(false);
  }

  async function resolve(id: string) {
    await supabase.from("exceptions").update({ resolved: true }).eq("id", id);
    setRows((p) => p.filter((r) => r.id !== id));
  }

  const counts = {
    total: rows.length,
    error: rows.filter((r) => r.severity === "error").length,
    warn: rows.filter((r) => r.severity === "warn").length,
    info: rows.filter((r) => r.severity === "info").length,
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <AlertTriangle className="h-6 w-6 text-amber-600" />
          Data Exceptions
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Issues flagged by the cleansing engine during import. Review and
          resolve as needed.
        </p>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <StatCard label="Open issues" value={counts.total} tone="slate" />
        <StatCard label="Errors" value={counts.error} tone="red" />
        <StatCard label="Warnings" value={counts.warn} tone="amber" />
        <StatCard label="Info" value={counts.info} tone="blue" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Filter className="h-4 w-4 text-slate-500" />
        {(["all", "error", "warn", "info"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
              filter === f
                ? "bg-slate-900 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {f === "all" ? "All" : severityConfig[f].label}
          </button>
        ))}
        <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={showResolved}
            onChange={(e) => setShowResolved(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-indigo-600"
          />
          Show resolved
        </label>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {loading ? (
          <div className="p-10 text-center text-sm text-slate-500">
            Loading…
          </div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            ߎ No open exceptions.
          </div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Severity</th>
                <th className="px-4 py-3">Field</th>
                <th className="px-4 py-3">Issue</th>
                <th className="px-4 py-3">Raw → Suggested</th>
                <th className="px-4 py-3 w-28"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const cfg = severityConfig[r.severity];
                const Icon = cfg.icon;
                return (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium ${cfg.bg} ${cfg.color}`}
                      >
                        <Icon className="h-3 w-3" />
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">
                      {r.field}
                    </td>
                    <td className="px-4 py-3 text-slate-800">{r.message}</td>
                    <td className="px-4 py-3 text-xs">
                      {r.raw_value && (
                        <div className="text-slate-500">
                          <span className="text-slate-400">Raw:</span>{" "}
                          {r.raw_value}
                        </div>
                      )}
                      {r.suggested_value && (
                        <div className="text-emerald-700">
                          <span className="text-emerald-500">Suggested:</span>{" "}
                          {r.suggested_value}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {!r.resolved && (
                        <button
                          onClick={() => resolve(r.id)}
                          className="flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                        >
                          <CheckCircle2 className="h-3 w-3" />
                          Resolve
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "slate" | "red" | "amber" | "blue";
}) {
  const colors = {
    slate: "text-slate-900",
    red: "text-red-600",
    amber: "text-amber-600",
    blue: "text-blue-600",
  };
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${colors[tone]}`}>
        {value}
      </div>
    </div>
  );
}
