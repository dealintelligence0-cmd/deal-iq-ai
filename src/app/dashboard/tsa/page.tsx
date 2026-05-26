



"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { saveDealContext, loadDealContext, saveOutput, loadOutput, clearOutput, resetIfNewDeal } from "@/lib/dealContext";
import { ArrowLeftRight, Loader2, Copy, Printer, CheckCircle2, Sparkles, History, Trash2, Download, ChevronDown, ChevronUp, Cloud, FileText, Users, Truck, BarChart3, Briefcase, Plus } from "lucide-react";
import { renderVisualProposal } from "@/lib/proposal/visual-renderer";
import { openMbbPrintWindow } from "@/lib/proposal/mbb-print";
import AIGenerateConfirm from "@/components/AIGenerateConfirm";
import CognitionIndicators from "@/components/cognition/CognitionIndicators";
import { createClient } from "@/lib/supabase/client";
import { generateOfflineTsa } from "@/lib/proposal/offline-tsa";

const FUNCTIONS = ["IT & Systems", "Finance & Accounting", "HR & Payroll", "Legal", "Procurement", "Facilities", "Customer Service", "Supply Chain", "Manufacturing", "Sales Support", "Tax", "Treasury"];
const PRICING_OPTIONS = [
  { id: "cost_plus_5", label: "Cost + 5%" },
  { id: "cost_plus_10", label: "Cost + 10%" },
  { id: "market_rate", label: "Market Rate" },
  { id: "negotiated", label: "Negotiated" },
];
const DURATIONS = ["6", "12", "18", "24"];

// =====================================================================
// v29 Visual Layer — TSA / Carve-Out interactive visualization
// =====================================================================
// Auto-populates Carve-Out Entities from selected pipeline deal (seller/buyer).
// Service catalog with month sliders + live billing tally.
// Complements (does NOT replace) the AI TSA Framework generator below.
// =====================================================================

type VizService = {
  id: string;
  category: string;            // function — editable
  title: string;
  sla_baseline: string;
  duration_months: number;
  monthly_cost_k: number;      // base unit: USD thousands; display converts per currency
};

type Currency = "USD" | "INR";

const DEFAULT_VIZ_SERVICES: VizService[] = [
  { id: "vs1", category: "IT",        title: "AWS/Azure cloud infrastructure hosting",
    sla_baseline: "99.99% system virtualization cluster availability SLA",
    duration_months: 12, monthly_cost_k: 31 },
  { id: "vs2", category: "Finance",   title: "Multi-jurisdiction billing support & SaaS subscription ledger migration",
    sla_baseline: "Monthly ledger reconciliation within 3 days post-close",
    duration_months: 6, monthly_cost_k: 16 },
  { id: "vs3", category: "HR",        title: "Engineering team payroll, stock option benefits & visa sponsorships bridge",
    sla_baseline: "Paid monthly with zero error index",
    duration_months: 6, monthly_cost_k: 11 },
  { id: "vs4", category: "Logistics", title: "Global customer Zendesk CRM tenant hosting & workspace license administration",
    sla_baseline: "Continuous helpdesk ticket visibility integration SLA",
    duration_months: 9, monthly_cost_k: 24 },
  { id: "vs5", category: "IT",        title: "Email tenant + Microsoft 365 collaboration suite continuity",
    sla_baseline: "99.95% uptime · 24h mailbox migration cycle",
    duration_months: 4, monthly_cost_k: 8 },
  { id: "vs6", category: "Finance",   title: "Tax filing + audit support across separated entity boundaries",
    sla_baseline: "Quarterly tax pack + auditor query response < 5 BD",
    duration_months: 12, monthly_cost_k: 14 },
];

const KNOWN_FUNCTIONS = ["IT", "Finance", "HR", "Logistics", "Legal", "Procurement", "Facilities", "Commercial"];

const CAT_STYLE: Record<string, { badge: string; icon: any }> = {
  IT:        { badge: "bg-cyan-500/20 text-cyan-700 border-cyan-500/40 dark:text-cyan-300",        icon: Cloud },
  Finance:   { badge: "bg-amber-500/20 text-amber-700 border-amber-500/40 dark:text-amber-300",    icon: FileText },
  HR:        { badge: "bg-rose-500/20 text-rose-700 border-rose-500/40 dark:text-rose-300",        icon: Users },
  Logistics: { badge: "bg-emerald-500/20 text-emerald-700 border-emerald-500/40 dark:text-emerald-300", icon: Truck },
};
const catStyle = (c: string) => CAT_STYLE[c] ?? { badge: "bg-slate-500/20 text-slate-700 border-slate-500/40 dark:text-slate-300", icon: FileText };

let __tsaUid = 0;
const tsaNextId = () => `vs-${Date.now()}-${__tsaUid++}`;
const tsaClamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function TSAVisuals({ seller, buyer, sector, geography, dealSize }: { seller: string; buyer: string; sector: string; geography: string; dealSize: string }) {
  const [collapsed, setCollapsed] = useState(false);
  const [carveTarget, setCarveTarget] = useState("");
  const [parentGroup, setParentGroup] = useState("");
  const [buyerGroup, setBuyerGroup] = useState("");
  const [services, setServices] = useState<VizService[]>(DEFAULT_VIZ_SERVICES);
  const [adminOverheadPct, setAdminOverheadPct] = useState(10);
  const [maxMonths, setMaxMonths] = useState(24);
  const [currency, setCurrency] = useState<Currency>("USD");
  const [inrPerUsd, setInrPerUsd] = useState(83);
  const [copied, setCopied] = useState(false);
  const [pptBusy, setPptBusy] = useState(false);

  // Auto-populate carve-out entities from selected pipeline deal
  useEffect(() => {
    if (seller && !carveTarget) setCarveTarget(`${seller} Infrastructure Assets`);
    if (seller && !parentGroup) setParentGroup(seller);
    if (buyer && !buyerGroup)   setBuyerGroup(buyer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seller, buyer]);

  // Money is stored in USD thousands; display converts to the selected currency.
  // USD → "$NK"; INR → lakhs at the editable FX rate ("₹N.N L").
  const fmt = (usdK: number) => currency === "USD"
    ? `$${Math.round(usdK).toLocaleString()}K`
    : `₹${(usdK * inrPerUsd / 100).toLocaleString(undefined, { maximumFractionDigits: 1 })} L`;
  const toDisplay = (usdK: number) => currency === "USD" ? usdK : Math.round((usdK * inrPerUsd / 100) * 10) / 10;
  const fromDisplay = (v: number) => currency === "USD" ? v : (v * 100 / inrPerUsd);
  const unitLabel = currency === "USD" ? "$K / mo" : "₹L / mo";

  const totals = useMemo(() => {
    const directBilled = services.reduce((sum, s) => sum + s.duration_months * s.monthly_cost_k, 0);
    const overhead = directBilled * (adminOverheadPct / 100);
    return {
      directBilled, overhead, total: directBilled + overhead,
      activeServices: services.filter((s) => s.duration_months > 0).length,
    };
  }, [services, adminOverheadPct]);

  const update = (id: string, patch: Partial<VizService>) => setServices((prev) => prev.map((s) => s.id === id ? { ...s, ...patch } : s));
  const addService = () => setServices((prev) => [...prev, { id: tsaNextId(), category: "IT", title: "New transition service", sla_baseline: "Define SLA baseline", duration_months: Math.min(6, maxMonths), monthly_cost_k: 10 }]);
  const removeService = (id: string) => setServices((prev) => prev.filter((s) => s.id !== id));

  function buildMarkdown(): string {
    const L: string[] = [];
    const parties = `${parentGroup || seller || "Parent"} → ${buyerGroup || buyer || "Buyer"}`;
    L.push(`# TSA Service Catalog — ${parties}`, "");
    L.push(`**Currency:** ${currency}${currency === "INR" ? ` (₹${inrPerUsd}/USD)` : ""}${sector ? ` · Sector: ${sector}` : ""}${dealSize ? ` · ${dealSize}` : ""}`, "");
    if (carveTarget) L.push(`**Carve-out entity:** ${carveTarget}`, "");
    L.push("## Service Catalog", "");
    L.push(`| Function | Service | SLA Baseline | Duration (mo) | Monthly (${currency}) | Line Total (${currency}) |`);
    L.push("| --- | --- | --- | --- | --- | --- |");
    for (const s of services) L.push(`| ${s.category} | ${s.title} | ${s.sla_baseline} | ${s.duration_months} | ${fmt(s.monthly_cost_k)} | ${fmt(s.monthly_cost_k * s.duration_months)} |`);
    L.push("", "## Budget");
    L.push(`- Direct billed services: ${fmt(totals.directBilled)}`);
    L.push(`- Admin overhead (${adminOverheadPct}%): ${fmt(totals.overhead)}`);
    L.push(`- **Estimated TSA budget: ${fmt(totals.total)}**`);
    L.push(`- Active services: ${totals.activeServices}`);
    return L.join("\n");
  }

  function copyPlan() { navigator.clipboard.writeText(buildMarkdown()); setCopied(true); setTimeout(() => setCopied(false), 2000); }
  function printPlan() { openMbbPrintWindow({ contentMarkdown: buildMarkdown(), meta: { moduleLabel: "TSA Catalog", buyer, target: seller, sector, geography, dealSize } }); }
  async function pptPlan() {
    setPptBusy(true);
    try {
      const { exportProposalToPptx } = await import("@/lib/proposal/pptx-exporter");
      await exportProposalToPptx(buildMarkdown(), { buyer, target: seller, sector, geography, dealSize, moduleLabel: "TSA Catalog" }, undefined, `deal-iq-tsa-catalog-${buyer || "buyer"}-${seller || "target"}.pptx`);
    } catch (e) {
      alert("PPTX export failed: " + String(e));
    } finally {
      setPptBusy(false);
    }
  }

  return (
    <div className="card overflow-hidden">
      <button onClick={() => setCollapsed(!collapsed)}
              className="flex w-full items-center justify-between border-b border-slate-100 px-5 py-3 text-left transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/30">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-emerald-500" />
          <span className="text-sm font-semibold text-slate-800 dark:text-white">Interactive TSA Catalog (Editable)</span>
          <span className="hidden text-[10.5px] italic text-slate-500 sm:inline">Functions, SLAs, durations &amp; pricing · USD/INR · exportable</span>
        </div>
        {collapsed ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronUp className="h-4 w-4 text-slate-400" />}
      </button>

      {!collapsed && (
        <div className="p-5 space-y-4">
          {/* Toolbar: currency, period, export */}
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Currency</label>
            <select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[12px] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
              <option value="USD">USD ($)</option>
              <option value="INR">INR (₹)</option>
            </select>
            {currency === "INR" && (
              <span className="flex items-center gap-1 text-[11px] text-slate-500">
                ₹/$
                <input type="number" min={1} step={0.5} value={inrPerUsd}
                       onChange={(e) => setInrPerUsd(Math.max(1, Number(e.target.value) || 1))}
                       className="w-16 rounded border border-slate-300 px-1.5 py-1 text-[11px] dark:border-slate-700 dark:bg-slate-900" />
              </span>
            )}
            <label className="ml-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">Max period</label>
            <input type="number" min={1} max={60} value={maxMonths}
                   onChange={(e) => { const v = tsaClamp(parseInt(e.target.value || "1", 10) || 1, 1, 60); setMaxMonths(v); setServices((prev) => prev.map((s) => ({ ...s, duration_months: Math.min(s.duration_months, v) }))); }}
                   className="w-16 rounded-lg border border-slate-300 bg-white px-2 py-1 text-[12px] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200" />
            <span className="text-[11px] text-slate-500">months</span>
            <div className="ml-auto flex items-center gap-1.5">
              <button onClick={copyPlan} className="flex items-center gap-1 rounded border border-slate-200 px-2.5 py-1 text-[11px] dark:border-slate-700">
                {copied ? <CheckCircle2 className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />} {copied ? "Copied" : "Copy"}
              </button>
              <button onClick={printPlan} className="flex items-center gap-1 rounded border border-slate-200 px-2.5 py-1 text-[11px] dark:border-slate-700">
                <Printer className="h-3 w-3" /> PDF
              </button>
              <button onClick={pptPlan} disabled={pptBusy} className="flex items-center gap-1 rounded border border-slate-200 px-2.5 py-1 text-[11px] disabled:opacity-50 dark:border-slate-700">
                {pptBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />} PPTX
              </button>
            </div>
          </div>

          {/* Carve-Out Entities Setup */}
          <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">Carve-Out Entities Setup</h3>
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wider text-slate-500">Carve-Out Target Special Entity</label>
                <input value={carveTarget} onChange={(e) => setCarveTarget(e.target.value)}
                       placeholder="e.g. AJAX Therapeutics Infrastructure Assets"
                       className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800" />
              </div>
              <div>
                <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wider text-slate-500">Selling Parent Group</label>
                <input value={parentGroup} onChange={(e) => setParentGroup(e.target.value)}
                       placeholder="e.g. AJAX Therapeutics"
                       className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800" />
              </div>
              <div>
                <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wider text-slate-500">Acquiring Buyer Group</label>
                <input value={buyerGroup} onChange={(e) => setBuyerGroup(e.target.value)}
                       placeholder="e.g. Eli Lilly"
                       className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800" />
              </div>
            </div>
            <p className="mt-2 text-[10px] italic text-slate-500">
              Auto-populated from selected deal in Deal Pipeline. Override manually if needed.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-[2fr,1fr]">
            {/* Service catalog */}
            <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Interactive TSA Catalog</h3>
                <button onClick={addService} className="flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-400">
                  <Plus className="h-3 w-3" /> Service
                </button>
              </div>
              <p className="mb-3 text-[10.5px] text-slate-500">Edit function, service, SLA baseline, monthly price ({unitLabel}) and duration. Costs recalculate live in {currency}.</p>

              <div className="space-y-3">
                {services.map((s) => {
                  const cat = catStyle(s.category);
                  const Icon = cat.icon;
                  const lineCost = s.duration_months * s.monthly_cost_k;
                  return (
                    <div key={s.id} className="rounded-lg border border-slate-100 bg-slate-50/40 p-3 dark:border-slate-800 dark:bg-slate-800/20">
                      <div className="mb-2 flex items-start gap-2">
                        <span className={`mt-0.5 flex-shrink-0 rounded border px-1 py-0.5 text-[9px] font-bold uppercase ${cat.badge}`}>
                          <Icon className="inline h-2.5 w-2.5" />
                        </span>
                        <div className="flex-1 space-y-1">
                          <input value={s.title} onChange={(e) => update(s.id, { title: e.target.value })}
                                 className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-[12.5px] font-semibold text-slate-900 hover:border-slate-200 focus:border-slate-300 dark:text-white dark:hover:border-slate-700" />
                          <div className="flex items-center gap-1">
                            <input list="tsa-functions" value={s.category} onChange={(e) => update(s.id, { category: e.target.value })} placeholder="Function"
                                   className="w-28 rounded border border-slate-200 px-1.5 py-0.5 text-[10px] dark:border-slate-700 dark:bg-slate-800" />
                            <span className="text-[10px] text-slate-400">SLA:</span>
                            <input value={s.sla_baseline} onChange={(e) => update(s.id, { sla_baseline: e.target.value })} placeholder="SLA baseline"
                                   className="flex-1 rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300" />
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <div className="text-[14px] font-bold text-emerald-700 dark:text-emerald-400">{fmt(lineCost)}</div>
                          <button onClick={() => removeService(s.id)} title="Remove service" className="text-slate-300 hover:text-rose-500"><Trash2 className="h-3 w-3" /></button>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <label className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-slate-500">
                          Price
                          <input type="number" min={0} step={currency === "USD" ? 1 : 0.1} value={toDisplay(s.monthly_cost_k)}
                                 onChange={(e) => update(s.id, { monthly_cost_k: Math.max(0, fromDisplay(Number(e.target.value) || 0)) })}
                                 className="w-20 rounded border border-slate-200 px-1.5 py-0.5 text-[11px] dark:border-slate-700 dark:bg-slate-800" />
                          <span className="text-slate-400">{unitLabel}</span>
                        </label>
                        <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Duration</span>
                        <input type="range" min="0" max={maxMonths} step="1" value={Math.min(s.duration_months, maxMonths)}
                               onChange={(e) => update(s.id, { duration_months: tsaClamp(Number(e.target.value), 0, maxMonths) })}
                               className="min-w-[120px] flex-1 accent-emerald-500" />
                        <span className="w-20 text-right font-mono text-[11px] text-emerald-600">{s.duration_months} mo</span>
                      </div>
                    </div>
                  );
                })}
                {services.length === 0 && <p className="py-3 text-center text-[11px] italic text-slate-500">No services. Click “+ Service” to add one.</p>}
              </div>
              <datalist id="tsa-functions">
                {KNOWN_FUNCTIONS.map((f) => <option key={f} value={f} />)}
              </datalist>
            </div>

            {/* Billing tally */}
            <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <div className="mb-3 flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-emerald-500" />
                <h3 className="text-sm font-bold text-slate-800 dark:text-white">TSA Billing Tally</h3>
              </div>
              <p className="mb-3 text-[10.5px] text-slate-500">Compiled Transition Service Agreement budget — all billable items to the parent, in {currency}.</p>

              <div className="rounded-lg bg-emerald-50 p-4 text-center dark:bg-emerald-950/30">
                <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Estimated TSA Deal Budget</div>
                <div className="mt-1 text-3xl font-bold text-emerald-700 dark:text-emerald-400">
                  {fmt(totals.total)}
                </div>
                <div className="mt-1 text-[10.5px] text-slate-600 dark:text-slate-400">
                  Active durations + {adminOverheadPct}% admin overhead{currency === "INR" ? ` · ₹${inrPerUsd}/USD` : ""}
                </div>
              </div>

              <div className="mt-3 space-y-1.5 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Direct billed services</span>
                  <span className="font-mono text-slate-800 dark:text-slate-200">{fmt(totals.directBilled)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Admin overhead ({adminOverheadPct}%)</span>
                  <span className="font-mono text-slate-800 dark:text-slate-200">{fmt(totals.overhead)}</span>
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

              <p className="mt-3 text-[10px] italic text-slate-500">
                ↓ For the full AI TSA Framework with exit milestones, governance, risks &amp; negotiation strategy, use the <b>Generate TSA</b> panel below.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =====================================================================
// Main page — your original implementation, unchanged
// =====================================================================

export default function TSAGeneratorPage() {
  const [seller, setSeller] = useState("");
  const [buyer, setBuyer] = useState("");
  const [sector, setSec] = useState("");
  const [dealSize, setDS] = useState("");
  const [geography, setGeo] = useState("");
  const [closeDate, setCD] = useState("");
  const [selectedFns, setFns] = useState<string[]>([]);
  const [duration, setDur] = useState("12");
  const [pricing, setPricing] = useState("cost_plus_10");
  const [constraints, setCon] = useState("");
  const [generating, setGen] = useState(false);
  const [content, setContent] = useState<string | null>(null);
  const [dealId, setDealId] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [pptExporting, setPptExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mandateType, setMandateType] = useState<string>("buy_side");
  const [buyerTypeF, setBuyerTypeF] = useState<string>("strategic");
  const [ownershipType, setOwnershipType] = useState<string>("majority");
  const [integrationStyle, setIntegrationStyle] = useState<string>("functional");

  const sb = createClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [premiumTier, setPremiumTier] = useState<{ provider: string | null; model: string | null; hasKey: boolean }>({ provider: null, model: null, hasKey: false });
  const [economicTier, setEconomicTier] = useState<{ provider: string | null; model: string | null; hasKey: boolean }>({ provider: null, model: null, hasKey: false });

  type HistoryItem = {
    id: string; buyer: string | null; target: string | null;
    sector: string | null; deal_size: string | null;
    provider: string | null; cost_estimate_usd: number | null;
    content: string; created_at: string;
  };
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    saveDealContext({ buyer, target: seller, sector, geography, deal_size: dealSize, deal_id: dealId });
  }, [buyer, seller, sector, geography, dealSize, dealId]);

  const loadTiers = useCallback(async () => {
    const { data: u } = await sb.auth.getUser();
    if (!u.user) return;
    const { data } = await sb.from("ai_settings")
      .select("premium_provider,premium_model,premium_key_encrypted,economic_provider,economic_model,economic_key_encrypted")
      .eq("user_id", u.user.id).maybeSingle();
    if (data) {
      setPremiumTier({
        provider: data.premium_provider, model: data.premium_model,
        hasKey: !!data.premium_key_encrypted && data.premium_provider !== "free",
      });
      setEconomicTier({
        provider: data.economic_provider, model: data.economic_model,
        hasKey: !!data.economic_key_encrypted && data.economic_provider !== "free",
      });
    }
  }, [sb]);
  useEffect(() => { loadTiers(); }, [loadTiers]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);

    const did = params.get("deal_id");
    if (did) resetIfNewDeal(did);

    const stored = loadDealContext();
    const finalDID = did ?? stored.deal_id;
    const finalB = params.get("buyer") ?? stored.buyer;
    const finalT = params.get("target") ?? stored.target;
    const finalS = params.get("sector") ?? stored.sector;
    const finalG = params.get("geography") ?? stored.geography;
    const finalDS = params.get("deal_size") ?? stored.deal_size;

    if (finalDID) setDealId(finalDID);
    if (finalB) setBuyer(finalB);
    if (finalT) setSeller(finalT);
    if (finalS) setSec(finalS);
    if (finalG) setGeo(finalG);
    if (finalDS) setDS(finalDS);

    saveDealContext({
      buyer: finalB, target: finalT, sector: finalS,
      geography: finalG, deal_size: finalDS, deal_id: finalDID,
    });

    const cached = loadOutput("tsa");
    if (cached) setContent(cached);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const did = params.get("deal_id");
    if (did) setDealId(did);

    const buyerParam = params.get("buyer");
    const targetParam = params.get("target");
    const sectorParam = params.get("sector");
    const geographyParam = params.get("geography");
    const dealSizeParam = params.get("deal_size");

    if (buyerParam) setBuyer(buyerParam);
    if (targetParam) setSeller(targetParam);
    if (sectorParam) setSec(sectorParam);
    if (geographyParam) setGeo(geographyParam);
    if (dealSizeParam) setDS(dealSizeParam);
  }, []);

  async function reloadHistory() {
    const { data: u } = await sb.auth.getUser();
    if (!u.user) return;
    const { data } = await sb.from("ai_outputs")
      .select("id,buyer,target,sector,deal_size,provider,cost_estimate_usd,content,created_at")
      .eq("user_id", u.user.id).eq("module", "tsa")
      .order("created_at", { ascending: false }).limit(20);
    if (data) setHistory(data as HistoryItem[]);
  }

  async function deleteHistory(id: string) {
    if (!confirm("Delete this saved TSA?")) return;
    await sb.from("ai_outputs").delete().eq("id", id);
    reloadHistory();
  }

  function loadHistory(h: HistoryItem) {
    setContent(h.content);
    if (h.buyer) setBuyer(h.buyer);
    if (h.target) setSeller(h.target);
    if (h.sector) setSec(h.sector);
    if (h.deal_size) setDS(h.deal_size);
    setShowHistory(false);
  }

  function toggleFn(fn: string) {
    setFns((prev) => prev.includes(fn) ? prev.filter((f) => f !== fn) : [...prev, fn]);
  }

  function startGenerate() {
    if (!seller || !buyer || !dealSize || selectedFns.length === 0) return;
    setError(null);
    setConfirmOpen(true);
  }

  async function generate(tier: "premium" | "economic" | "offline", modelOverride?: string) {
    setConfirmOpen(false);
    if (tier === "offline") {
      const md = generateOfflineTsa({
        seller, buyer, sector, geography, dealSize,
        closeDate, functions: selectedFns, duration, pricing,
        constraints, mandateType, buyerType: buyerTypeF,
        ownershipType, integrationStyle,
      });
      setContent(md);
      saveOutput("tsa", md);
      reloadHistory();
      return;
    }
    setGen(true); setContent(null); setError(null);

    try {
      const res = await fetch("/api/ai/tsa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seller, buyer, sector, deal_size: dealSize, geography,
          deal_id: dealId || undefined,
          close_date: closeDate, functions: selectedFns,
          duration, pricing_basis: pricing, constraints, tier,
          model_override: modelOverride,
          mandate_type: mandateType,
          buyer_type: buyerTypeF,
          ownership_type: ownershipType,
          integration_style: integrationStyle,
        }),
      });
      const j = await res.json();
      if (j.content) {
        setContent(j.content);
        saveOutput("tsa", j.content);
        reloadHistory();
      } else {
        setError(j.error ?? "Generation failed.");
      }
    } catch {
      setError("Request failed. Check API key in Settings.");
    }
    setGen(false);
  }

  const fields: Array<[string, string, (v: string) => void, string]> = [
    ["Seller (service provider) *", seller, setSeller, "e.g. Divco Corp"],
    ["Buyer / Carve-out *", buyer, setBuyer, "e.g. NewCo / PE Firm"],
    ["Sector", sector, setSec, "e.g. Manufacturing"],
    ["Geography", geography, setGeo, "e.g. Europe, US"],
    ["Deal Size *", dealSize, setDS, "e.g. $800M"],
    ["Estimated Close Date", closeDate, setCD, "e.g. Q3 2025"],
  ];

  async function downloadPptx() {
    if (!content) return;
    setPptExporting(true);
    try {
      const { exportProposalToPptx } = await import("@/lib/proposal/pptx-exporter");
      await exportProposalToPptx(content, { buyer, target: seller, sector, geography, dealSize, moduleLabel: "TSA Framework" }, undefined, `deal-iq-tsa-${buyer || "buyer"}-${seller || "target"}.pptx`);
    } catch (e) {
      alert("PPTX export failed: " + String(e));
    } finally {
      setPptExporting(false);
    }
  }

  function printDoc() {
    if (!content) return;
    openMbbPrintWindow({
      contentMarkdown: content,
      meta: {
        moduleLabel: "TSA Framework",
        buyer,
        target: seller,
        sector,
        geography,
        dealSize,
      },
    });
  }

  return (
    <div className="space-y-6 p-6">
      <AIGenerateConfirm
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={generate}
        module="tsa"
        premiumProvider={{ tier: "premium", ...premiumTier }}
        economicProvider={{ tier: "economic", ...economicTier }}
        hasOfflineFallback={true}
      />

      <div className="page-header">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold text-white">
              <ArrowLeftRight className="h-5 w-5 text-indigo-400" />
              TSA Generator
            </h1>
            <p className="mt-1 text-sm text-white/50">AI-powered Transitional Service Agreement</p>
          </div>
          <button onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-1 rounded-md border border-white/20 bg-white/10 px-2 py-1 text-[10px] text-white hover:bg-white/20">
            <History className="h-3 w-3" /> History ({history.length})
          </button>
        </div>
      </div>

     //* v29 Visual Layer — auto-fills from seller/buyer, sits ABOVE the original AI generator
<TSAVisuals seller={seller} buyer={buyer} sector={sector} geography={geography} dealSize={dealSize} />

<CognitionIndicators
  dealId={dealId || null}
  workspaceId={null}
  keyPrefix="pmi,tsa,synergy"
  limit={5}
/>


      {showHistory && (
        <div className="card p-4">
          <h2 className="mb-2 text-sm font-semibold">TSA History</h2>
          {history.length === 0 ? (
            <p className="text-xs text-slate-500">No history yet.</p>
          ) : (
            <div className="space-y-1.5">
              {history.map((h) => (
                <div key={h.id} className="flex items-center gap-2 rounded border border-slate-200 bg-slate-50 p-2 text-[11px] dark:border-white/10 dark:bg-white/5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-slate-700 dark:text-slate-300">{h.target ?? "—"} → {h.buyer ?? "—"}</p>
                    <p className="text-[10px] text-slate-500">{h.sector ?? "—"} · {h.provider ?? "—"} · {h.cost_estimate_usd ? `$${h.cost_estimate_usd.toFixed(4)}` : "Free"} · {new Date(h.created_at).toLocaleDateString()}</p>
                  </div>
                  <button onClick={() => loadHistory(h)} className="rounded border border-slate-200 px-2 py-0.5 text-[10px] dark:border-white/10">Load</button>
                  <button onClick={() => deleteHistory(h.id)} className="rounded bg-red-50 p-1 text-red-700 dark:bg-red-950/30 dark:text-red-400">
                    <Trash2 className="h-2.5 w-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-1">
          <div className="card space-y-4 p-5">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-white">Deal Details</h2>
            {fields.map(([lbl, val, set, ph]) => (
              <div key={lbl}>
                <label className="text-xs font-medium text-slate-500">{lbl}</label>
                <input value={val} onChange={(e) => set(e.target.value)} placeholder={ph}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
              </div>
            ))}

            <div>
              <label className="text-xs font-medium text-slate-500">Shared Functions * (select all that apply)</label>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {FUNCTIONS.map((fn) => (
                  <button key={fn} onClick={() => toggleFn(fn)}
                    className={`rounded-lg border px-2.5 py-1.5 text-left text-xs transition ${
                      selectedFns.includes(fn)
                        ? "border-indigo-500 bg-indigo-50 font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                        : "border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-400"
                    }`}>
                    {fn}
                  </button>
                ))}
              </div>
              {selectedFns.length > 0 && (
                <p className="mt-1 text-[10px] text-slate-400">{selectedFns.length} selected · complexity: {selectedFns.length >= 7 ? "Complex" : selectedFns.length >= 4 ? "Standard" : "Simple"}</p>
              )}
            </div>

            <div>
              <label className="text-xs font-medium text-slate-500">TSA Duration (months)</label>
              <div className="mt-1 flex gap-2">
                {DURATIONS.map((d) => (
                  <button key={d} onClick={() => setDur(d)}
                    className={`flex-1 rounded-lg border py-1.5 text-xs font-medium transition ${
                      duration === d
                        ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                        : "border-slate-200 text-slate-500 hover:border-slate-300 dark:border-slate-700 dark:text-slate-400"
                    }`}>
                    {d}mo
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-500">Pricing Basis</label>
              <select value={pricing} onChange={(e) => setPricing(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white">
                {PRICING_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-500">Known Constraints / Context</label>
              <textarea value={constraints} onChange={(e) => setCon(e.target.value)} rows={3}
                placeholder="Data sovereignty requirements, system dependencies, hard exit dates..."
                className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            </div>

            <button onClick={startGenerate} disabled={generating || !seller || !buyer || !dealSize || selectedFns.length === 0}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40">
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {generating ? "Generating TSA…" : "Generate TSA"}
            </button>
          </div>
        </div>

        <div className="lg:col-span-2">
          {!content && !generating && !error && (
            <div className="flex h-64 items-center justify-center rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700">
              <div className="text-center">
                <ArrowLeftRight className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-2 text-sm text-slate-400">Select functions and fill deal details, then generate your AI-powered TSA framework</p>
                <p className="mt-1 text-xs text-slate-400">Requires Smart-tier AI key (Anthropic / OpenAI / Gemini)</p>
              </div>
            </div>
          )}

          {error && !generating && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900/30 dark:bg-amber-950/20">
              <p className="font-semibold text-amber-900 dark:text-amber-300">Setup needed</p>
              <p className="mt-1 text-sm text-amber-800 dark:text-amber-300/80">{error}</p>
              <a href="/dashboard/settings" className="mt-3 inline-block rounded bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700">
                Open Settings
              </a>
            </div>
          )}

          {generating && (
            <div className="flex h-64 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700">
              <div className="text-center">
                <Loader2 className="mx-auto h-8 w-8 animate-spin text-indigo-500" />
                <p className="mt-3 text-sm text-slate-500">Designing your TSA framework…</p>
                <p className="mt-1 text-xs text-slate-400">Building service catalog, pricing model, and exit milestones</p>
              </div>
            </div>
          )}

          {content && (
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3 dark:border-slate-800">
                <span className="text-sm font-semibold text-slate-800 dark:text-white">TSA Framework — {seller} → {buyer}</span>
                <div className="flex gap-2">
                  <button onClick={() => { navigator.clipboard.writeText(content); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300">
                    {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                  <button onClick={printDoc}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300">
                    <Printer className="h-3.5 w-3.5" /> Print / PDF
                  </button>
                  <button onClick={downloadPptx} disabled={pptExporting}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300">
                    {pptExporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} PPTX
                  </button>
                  <button onClick={() => { setContent(null); clearOutput("tsa"); }}
                    className="flex items-center gap-1.5 rounded-lg border border-red-100 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-400">
                    <Trash2 className="h-3.5 w-3.5" /> Clear
                  </button>
                </div>
              </div>
              <div className="mbb-inline p-5"
                dangerouslySetInnerHTML={{ __html: renderVisualProposal(content) }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
