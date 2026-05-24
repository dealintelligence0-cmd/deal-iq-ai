

"use client";

import { useState, useMemo } from "react";
import { Briefcase, Sparkles, ChevronDown, ChevronUp, Cloud, FileText, Users, Truck, BarChart3 } from "lucide-react";

type Service = {
  id: string;
  category: "IT" | "Finance" | "HR" | "Logistics";
  title: string;
  sla_baseline: string;
  duration_months: number;
  monthly_cost_k: number;
};

const DEFAULT_SERVICES: Service[] = [
  { id: "s1", category: "IT",        title: "AWS/Azure cloud infrastructure hosting for AJAX Therapeutics",
    sla_baseline: "99.99% system virtualization cluster availability SLA",
    duration_months: 12, monthly_cost_k: 31 },
  { id: "s2", category: "Finance",   title: "Multi-jurisdiction billing support & SaaS subscription ledger migration",
    sla_baseline: "Monthly ledger reconciliation within 3 days post-close",
    duration_months: 6, monthly_cost_k: 16 },
  { id: "s3", category: "HR",        title: "Engineering team payroll, stock option benefits & visa sponsorships bridge",
    sla_baseline: "Paid monthly with zero error index",
    duration_months: 6, monthly_cost_k: 11 },
  { id: "s4", category: "Logistics", title: "Global customer Zendesk CRM tenant hosting & workspace license administration",
    sla_baseline: "Continuous helpdesk ticket visibility integration SLA",
    duration_months: 9, monthly_cost_k: 24 },
  { id: "s5", category: "IT",        title: "Email tenant + Microsoft 365 collaboration suite continuity",
    sla_baseline: "99.95% uptime · 24h mailbox migration cycle",
    duration_months: 4, monthly_cost_k: 8 },
  { id: "s6", category: "Finance",   title: "Tax filing + audit support across separated entity boundaries",
    sla_baseline: "Quarterly tax pack + auditor query response < 5 BD",
    duration_months: 12, monthly_cost_k: 14 },
];

const CAT_STYLE: Record<string, { badge: string; icon: any }> = {
  IT:        { badge: "bg-cyan-500/20 text-cyan-700 border-cyan-500/40 dark:text-cyan-300",        icon: Cloud },
  Finance:   { badge: "bg-amber-500/20 text-amber-700 border-amber-500/40 dark:text-amber-300",    icon: FileText },
  HR:        { badge: "bg-rose-500/20 text-rose-700 border-rose-500/40 dark:text-rose-300",        icon: Users },
  Logistics: { badge: "bg-emerald-500/20 text-emerald-700 border-emerald-500/40 dark:text-emerald-300", icon: Truck },
};

function TSAVisuals() {
  const [collapsed, setCollapsed] = useState(false);
  const [carveTarget, setCarveTarget] = useState("AJAX Therapeutics Infrastructure Assets");
  const [parentGroup, setParentGroup] = useState("AJAX Therapeutics");
  const [buyerGroup, setBuyerGroup] = useState("Eli Lilly");
  const [services, setServices] = useState<Service[]>(DEFAULT_SERVICES);
  const [adminOverheadPct, setAdminOverheadPct] = useState(10);

  const totals = useMemo(() => {
    const directBilled = services.reduce((sum, s) => sum + s.duration_months * s.monthly_cost_k, 0);
    const overhead = Math.round(directBilled * (adminOverheadPct / 100));
    return {
      directBilled, overhead, total: directBilled + overhead,
      activeServices: services.filter((s) => s.duration_months > 0).length,
    };
  }, [services, adminOverheadPct]);

  function updateDuration(id: string, months: number) {
    setServices((prev) => prev.map((s) => s.id === id ? { ...s, duration_months: Math.max(0, Math.min(24, months)) } : s));
  }

  return (
    <div className="card mb-4 overflow-hidden">
      <button onClick={() => setCollapsed(!collapsed)}
              className="flex w-full items-center justify-between border-b border-slate-100 px-5 py-3 text-left transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/30">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-emerald-500" />
          <span className="text-sm font-semibold text-slate-800 dark:text-white">TSA / Carve-Out Visualization (Interactive)</span>
          <span className="text-[10.5px] italic text-slate-500">Complements AI narrative below · local model only</span>
        </div>
        {collapsed ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronUp className="h-4 w-4 text-slate-400" />}
      </button>

      {!collapsed && (
        <div className="p-5 space-y-4">
          {/* Carve-Out Entities Setup */}
          <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">Carve-Out Entities Setup</h3>
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wider text-slate-500">Carve-Out Target Special Entity</label>
                <input value={carveTarget} onChange={(e) => setCarveTarget(e.target.value)}
                       className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800" />
              </div>
              <div>
                <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wider text-slate-500">Selling Parent Group</label>
                <input value={parentGroup} onChange={(e) => setParentGroup(e.target.value)}
                       className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800" />
              </div>
              <div>
                <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wider text-slate-500">Acquiring Buyer Group</label>
                <input value={buyerGroup} onChange={(e) => setBuyerGroup(e.target.value)}
                       className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800" />
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[2fr,1fr]">
            {/* Service catalog */}
            <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Interactive TSA Catalog</h3>
                <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[9px] font-bold uppercase text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-400">Billable Service Registry</span>
              </div>
              <p className="mb-3 text-[10.5px] text-slate-500">Toggle service months to calculate direct parent billing in real-time.</p>

              <div className="space-y-3">
                {services.map((s) => {
                  const cat = CAT_STYLE[s.category];
                  const Icon = cat.icon;
                  const lineCost = s.duration_months * s.monthly_cost_k;
                  return (
                    <div key={s.id} className="rounded-lg border border-slate-100 bg-slate-50/40 p-3 dark:border-slate-800 dark:bg-slate-800/20">
                      <div className="mb-2 flex items-start gap-2">
                        <span className={`flex-shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase ${cat.badge}`}>
                          <Icon className="mr-0.5 inline h-2.5 w-2.5" /> {s.category}
                        </span>
                        <div className="flex-1">
                          <div className="text-[12.5px] font-semibold text-slate-900 dark:text-white">{s.title}</div>
                          <div className="text-[10.5px] text-slate-500">SLA Baseline: {s.sla_baseline}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Est Cost</div>
                          <div className="text-[14px] font-bold text-emerald-700 dark:text-emerald-400">${lineCost}K</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Duration</span>
                        <input type="range" min="0" max="24" step="1" value={s.duration_months}
                               onChange={(e) => updateDuration(s.id, Number(e.target.value))}
                               className="flex-1 accent-emerald-500" />
                        <span className="w-20 text-right font-mono text-[11px] text-emerald-600">{s.duration_months} Months</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Billing tally */}
            <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <div className="mb-3 flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-emerald-500" />
                <h3 className="text-sm font-bold text-slate-800 dark:text-white">TSA Billing Tally</h3>
              </div>
              <p className="mb-3 text-[10.5px] text-slate-500">Provides the compiled Transition Service Agreement budget representing fully calculated billable items to the parent.</p>

              <div className="rounded-lg bg-emerald-50 p-4 text-center dark:bg-emerald-950/30">
                <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Estimated TSA Deal Budget</div>
                <div className="mt-1 text-3xl font-bold text-emerald-700 dark:text-emerald-400">
                  ${totals.total}K
                </div>
                <div className="mt-1 text-[10.5px] text-slate-600 dark:text-slate-400">
                  Calculated on active durations over {adminOverheadPct}% standard admin overhead
                </div>
              </div>

              <div className="mt-3 space-y-1.5 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Direct billed services</span>
                  <span className="font-mono text-slate-800 dark:text-slate-200">${totals.directBilled}K</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Admin overhead ({adminOverheadPct}%)</span>
                  <span className="font-mono text-slate-800 dark:text-slate-200">${totals.overhead}K</span>
                </div>
                <div className="flex items-center justify-between border-t border-slate-200 pt-1 dark:border-slate-700">
                  <span className="font-medium text-slate-700 dark:text-slate-300">Active services</span>
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{totals.activeServices}</span>
                </div>
              </div>

              <div className="mt-3">
                <label className="mb-1 flex items-center justify-between text-[10.5px] font-medium text-slate-600">
                  <span>Admin Overhead %</span>
                  <span className="font-mono text-emerald-600">{adminOverheadPct}%</span>
                </label>
                <input type="range" min="0" max="30" step="1" value={adminOverheadPct}
                       onChange={(e) => setAdminOverheadPct(Number(e.target.value))}
                       className="w-full accent-emerald-500" />
              </div>

              <button onClick={() => alert("This is the visual layer only. Use the AI Carve-Out Rationale generator below (when wired) to produce text narrative explaining service selection.")}
                      className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500">
                <Sparkles className="h-4 w-4" />
                Request AI Carve-Out Rationale
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =====================================================================
// Main page wrapper — preserves any existing TSA functionality below.
// If you have an existing TSA page with AI generation, copy the body
// of this default export into the top of yours (above your current JSX).
// =====================================================================
export default function TSAPage() {
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900 dark:text-white">
          <Briefcase className="h-6 w-6 text-emerald-500" />
          Carve-Out Transition Services Agreement (TSA) Suite
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Formulate legal and financial parameters when detaching corporate divisions. Build precise migration catalogs, model service levels (SLAs), and tally TSA budgets dynamically.
        </p>
      </div>

      <TSAVisuals />

      {/* If you have an existing TSA AI flow, paste its JSX below this comment.
          The visualization above will sit on top, your existing functionality stays below. */}
    </div>
  );
}
