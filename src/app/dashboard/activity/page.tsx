"use client";

import { useEffect, useState } from "react";
import { Shield, Loader2, Activity } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type LogRow = {
  id: string;
  action: string;
  entity: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

const ACTION_ICONS: Record<string, string> = {
  enrich_batch: "ߧ",
  proposal_generated: "ߓ",
  deal_created: "➕",
  deal_deleted: "ߗ️",
  login: "ߔ",
};

export default function ActivityPage() {
  const sb = createClient();
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await sb
        .from("activity_log")
        .select("id,action,entity,entity_id,metadata,created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      setRows((data ?? []) as LogRow[]);
      setLoading(false);
    })();
  }, [sb]);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-900">
          <Shield className="h-5 w-5 text-indigo-500" />
          Activity & Audit Log
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Last 200 actions performed by your account. Rate limits and security events are recorded here.
        </p>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
        </div>
      ) : rows.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-slate-200 bg-white">
          <Activity className="h-8 w-8 text-slate-300" />
          <p className="mt-2 text-sm text-slate-500">No activity yet.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">When</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Action</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Entity</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-500">
                    {new Date(r.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="mr-1.5">{ACTION_ICONS[r.action] ?? "•"}</span>
                    <span className="font-mono text-xs text-slate-700">{r.action}</span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-600">{r.entity ?? "—"}</td>
                  <td className="px-4 py-2.5 font-mono text-[11px] text-slate-500">
                    {r.metadata ? JSON.stringify(r.metadata) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
