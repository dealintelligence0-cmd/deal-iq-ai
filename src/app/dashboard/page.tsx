import { BarChart3, DollarSign, Target, TrendingUp } from "lucide-react";

const stats = [
  { label: "Active Deals", value: "24", change: "+12%", icon: Target, iconBg: "bg-indigo-50", iconColor: "text-indigo-600" },
  { label: "Pipeline Value", value: "$847K", change: "+18%", icon: DollarSign, iconBg: "bg-emerald-50", iconColor: "text-emerald-600" },
  { label: "Win Rate", value: "34%", change: "+4pp", icon: TrendingUp, iconBg: "bg-purple-50", iconColor: "text-purple-600" },
  { label: "Avg. Deal Size", value: "$35K", change: "-2%", icon: BarChart3, iconBg: "bg-amber-50", iconColor: "text-amber-600" },
];

export default function DashboardPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">Here&apos;s a snapshot of your pipeline and recent activity.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${s.iconBg}`}>
                <s.icon className={`h-5 w-5 ${s.iconColor}`} />
              </div>
              <span className={`text-xs font-medium ${s.change.startsWith("+") ? "text-emerald-600" : "text-red-600"}`}>
                {s.change}
              </span>
            </div>
            <div className="mt-4 text-2xl font-semibold text-slate-900">{s.value}</div>
            <div className="mt-0.5 text-sm text-slate-500">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Recent Deals</h2>
          <p className="mt-1 text-sm text-slate-500">Your most recently created opportunities will appear here.</p>
          <div className="mt-6 flex h-48 items-center justify-center rounded-lg border border-dashed border-slate-200 text-sm text-slate-400">
            No deals yet — Phase 2 ships the deal pipeline
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">AI Insights</h2>
          <p className="mt-1 text-sm text-slate-500">Deal IQ will surface winnability signals and next actions here.</p>
          <div className="mt-6 flex h-48 items-center justify-center rounded-lg border border-dashed border-slate-200 text-sm text-slate-400">
            Insights unlock after your first deal
          </div>
        </div>
      </div>
    </div>
  );
}
