

"use client";

import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { Bucket } from "@/lib/analytics";

const COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f59e0b",
  "#10b981", "#06b6d4", "#ef4444", "#64748b",
];

export function MonthlyTrend({
  data,
}: {
  data: Array<{ month: string; count: number; value: number }>;
}) {
  return (
    <ChartFrame title="Deal Flow (Last 12 Months)" sub="Count and total value ($M) by month">
      {data.length === 0 ? (
        <EmptyState label="No monthly data yet" />
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="gCount" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gValue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Area type="monotone" dataKey="count" name="Deals" stroke="#6366f1" fill="url(#gCount)" strokeWidth={2} />
            <Area type="monotone" dataKey="value" name="Value ($M)" stroke="#8b5cf6" fill="url(#gValue)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </ChartFrame>
  );
}

export function HorizontalBars({
  title,
  sub,
  data,
}: {
  title: string;
  sub: string;
  data: Bucket[];
}) {
  return (
    <ChartFrame title={title} sub={sub}>
      {data.length === 0 ? (
        <EmptyState label="No data yet" />
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data} layout="vertical" margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fontSize: 10, fill: "#334155" }}
              width={140}
              axisLine={false}
              tickLine={false}
              interval={0}
              tickFormatter={(v: string) => (v && v.length > 22 ? v.slice(0, 20) + "…" : v)}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="value" name="Value ($M)" radius={[0, 6, 6, 0]}>
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartFrame>
  );
}

export function DealTypePie({ data }: { data: Bucket[] }) {
  // Truncate long type labels for legend
  const cleaned = data.slice(0, 6).map((d) => ({
    ...d,
    name: d.name && d.name.length > 24 ? d.name.slice(0, 22) + "…" : d.name,
  }));
  const total = cleaned.reduce((sum, d) => sum + (d.value ?? 0), 0);

  return (
    <ChartFrame title="Deal Type Split" sub="By deal value (USD M)">
      {cleaned.length === 0 ? (
        <EmptyState label="No data yet" />
      ) : (
        <div className="flex h-full flex-col">
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={cleaned}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={75}
                paddingAngle={2}
                stroke="#fff"
                strokeWidth={2}
              >
                {cleaned.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(val: number) => [`$${val.toFixed(1)}M (${total > 0 ? ((val/total)*100).toFixed(1) : 0}%)`, "Value"]}
                contentStyle={{ borderRadius: 8, fontSize: 11, border: "1px solid #e2e8f0" }}
              />
            </PieChart>
          </ResponsiveContainer>

          {/* Custom legend with $ values + % share */}
          <div className="mt-2 grid grid-cols-1 gap-1 text-[10px]">
            {cleaned.map((d, i) => {
              const pct = total > 0 ? ((d.value / total) * 100).toFixed(1) : "0";
              return (
                <div key={i} className="flex items-center justify-between gap-2 rounded px-1.5 py-0.5 hover:bg-slate-50 dark:hover:bg-white/5">
                  <span className="flex items-center gap-1.5 truncate">
                    <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <span className="truncate text-slate-700 dark:text-slate-300">{d.name}</span>
                  </span>
                  <span className="shrink-0 font-mono text-slate-600 dark:text-slate-400">
                    ${d.value.toFixed(0)}M · {pct}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </ChartFrame>
  );
}

function ChartFrame({
  title,
  sub,
  children,
}: {
  title: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      <p className="text-xs text-slate-500">{sub}</p>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-slate-200 text-sm text-slate-400">
      {label}
    </div>
  );
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number | string; color?: string }>;
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      {label && <div className="mb-1 font-medium text-slate-900">{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="text-slate-600">{p.name}:</span>
          <span className="font-semibold text-slate-900">
            {typeof p.value === "number" ? p.value.toLocaleString() : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}
