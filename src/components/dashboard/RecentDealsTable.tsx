

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Deal } from "@/lib/analytics";
import { formatUsdShort } from "@/lib/analytics";

const statusStyle: Record<string, string> = {
  announced: "bg-blue-50 text-blue-700",
  live: "bg-emerald-50 text-emerald-700",
  closed: "bg-slate-100 text-slate-700",
  rumor: "bg-amber-50 text-amber-700",
  dropped: "bg-red-50 text-red-700",
};

export default function RecentDealsTable({ deals }: { deals: Deal[] }) {
  const recent = deals.slice(0, 8);
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Recent Deals</h3>
          <p className="text-xs text-slate-500">Latest transactions from your dataset</p>
        </div>
        <Link
          href="/dashboard/deals"
          className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700"
        >
          View all <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      {recent.length === 0 ? (
        <div className="flex h-48 items-center justify-center text-sm text-slate-400">
          No deals imported yet
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Buyer</th>
                <th className="px-4 py-3">Target</th>
                <th className="px-4 py-3">Sector</th>
                <th className="px-4 py-3">Country</th>
                <th className="px-4 py-3 text-right">Value</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((d) => (
                <tr key={d.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                    {d.deal_date ?? "—"}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900">{d.buyer ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-700">{d.target ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{d.sector ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{d.country ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-mono text-slate-800">
                    {d.normalized_value_usd ? formatUsdShort(d.normalized_value_usd) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                        statusStyle[d.status ?? ""] ?? "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {d.status ?? "—"}
                    </span>
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
