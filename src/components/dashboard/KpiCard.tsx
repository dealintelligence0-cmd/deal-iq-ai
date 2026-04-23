

import { type LucideIcon } from "lucide-react";

type Props = {
  label: string;
  value: string;
  sublabel?: string;
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
};

export default function KpiCard({
  label,
  value,
  sublabel,
  icon: Icon,
  iconBg,
  iconColor,
}: Props) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
      <div className="flex items-center justify-between">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${iconBg}`}>
          <Icon className={`h-5 w-5 ${iconColor}`} />
        </div>
      </div>
      <div className="mt-4 text-3xl font-semibold tracking-tight text-slate-900">
        {value}
      </div>
      <div className="mt-1 text-sm text-slate-600">{label}</div>
      {sublabel && (
        <div className="mt-1 text-xs text-slate-400">{sublabel}</div>
      )}
    </div>
  );
}
