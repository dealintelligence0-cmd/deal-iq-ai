

"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { saveDealContext, loadDealContext, saveOutput, loadOutput, clearOutput, resetIfNewDeal } from "@/lib/dealContext";
import { Briefcase, Sparkles, ChevronDown, ChevronUp, Cloud, FileText, Users, Truck, BarChart3, Loader2, Copy, Printer, CheckCircle2, History, Trash2, Download } from "lucide-react";
import { renderVisualProposal } from "@/lib/proposal/visual-renderer";
import { openMbbPrintWindow } from "@/lib/proposal/mbb-print";
import AIGenerateConfirm from "@/components/AIGenerateConfirm";
import { createClient } from "@/lib/supabase/client";

type Service = {
  id: string;
  category: "IT" | "Finance" | "HR" | "Logistics";
  title: string;
  sla_baseline: string;
  duration_months: number;
  monthly_cost_k: number;
};

type HistoryItem = {
  id: string; buyer: string | null; target: string | null;
  sector: string | null; deal_size: string | null;
  tier: string | null; provider: string | null; model: string | null;
  cost_estimate_usd: number | null;
  content: string; created_at: string;
};

const DEFAULT_SERVICES: Service[] = [
  { id: "s1", category: "IT",        title: "AWS/Azure cloud infrastructure hosting",
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

export default function TSAPage() {
  const sb = createClient();

  // Deal context (auto-populated from pipeline)
  const [buyer, setBuyer] = useState("");
  const [target, setTarget] = useState("");
  const [sector, setSector] = useState("");
  const [geography, setGeography] = useState("");
  const [dealSize, setDealSize] = useState("");
  const [dealId, setDealId] = useState<string>("");

  // Carve-out entities (driven by deal context)
  const [carveTarget, setCarveTarget] = useState("");
  const [parentGroup, setParentGroup] = useState("");
  const [buyerGroup, setBuyerGroup] = useState("");

  // Visualization state
  const [services, setServices] = useState<Service[]>(DEFAULT_SERVICES);
  const [adminOverheadPct, setAdminOverheadPct] = useState(10);
  const [vizCollapsed, setVizCollapsed] = useState(false);

  // AI generation state
  const [generating, setGenerating] = useState(false);
  const [content, setContent] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pptExporting, setPptExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  // Modal + tiers
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [premiumTier, setPremiumTier] = useState<{ provider: string | null; model: string | null; hasKey: boolean }>({ provider: null, model: null, hasKey: false });
  const [economicTier, setEconomicTier] = useState<{ provider: string | null; model: string | null; hasKey: boolean }>({ provider: null, model: null, hasKey: false });

  // History
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Live totals
  const totals = useMemo(() => {
    const directBilled = services.reduce((sum, s) => sum + s.duration_months * s.monthly_cost_k, 0);
    const overhead = Math.round(directBilled * (adminOverheadPct / 100));
    return {
      directBilled, overhead, total: directBilled + overhead,
      activeServices: services.filter((s) => s.duration_months > 0).length,
    };
  }, [services, adminOverheadPct]);

  // Load tiers + history
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

  const loadHistory = useCallback(async () => {
    const { data: u } = await sb.auth.getUser();
    if (!u.user) return;
    const { data } = await sb.from("ai_outputs")
      .select("id,buyer,target,sector,deal_size,tier,provider,model,cost_estimate_usd,content,created_at")
      .eq("user_id", u.user.id).eq("module", "tsa")
      .order("created_at", { ascending: false }).limit(20);
    if (data) setHistory(data as HistoryItem[]);
  }, [sb]);

  useEffect(() => { loadTiers(); loadHistory(); }, [loadTiers, loadHistory]);

  // Load deal context (URL params + sessionStorage)
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
    if (finalT) setTarget(finalT);
    if (finalS) setSector(finalS);
    if (finalG) setGeography(finalG);
    if (finalDS) setDealSize(finalDS);

    saveDealContext({ buyer: finalB, target: finalT, sector: finalS, geography: finalG, deal_size: finalDS, deal_id: finalDID });
    const cached = loadOutput("tsa");
    if (cached) setContent(cached);
  }, []);

  // Auto-fill carve-out entities from deal context whenever target/buyer change
  useEffect(() => {
    if (target && !carveTarget) setCarveTarget(`${target} Infrastructure Assets`);
    if (target && !parentGroup) setParentGroup(target);
    if (buyer && !buyerGroup) setBuyerGroup(buyer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, buyer]);

  // Save context on changes
  useEffect(() => {
    saveDealContext({ buyer, target, sector, geography, deal_size: dealSize, deal_id: dealId });
  }, [buyer, target, sector, geography, dealSize, dealId]);

  function updateDuration(id: string, months: number) {
    setServices((prev) => prev.map((s) => s.id === id ? { ...s, duration_months: Math.max(0, Math.min(24, months)) } : s));
  }

  function startGenerate() {
    if (!target && !buyer) {
      setError("Select a deal from the Deal Pipeline first (or fill Carve-Out Entities Setup manually).");
      return;
    }
    setError(null);
    setConfirmOpen(true);
  }

  async function generate(tier: "premium" | "economic" | "offline", modelOverride?: string) {
    setConfirmOpen(false);
    setGenerating(true);
    setError(null);
    setContent(null);
    try {
      const res = await fetch("/api/ai/tsa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyer, target, sector, geography,
          deal_id: dealId || undefined,
          deal_size: dealSize,
          carve_target: carveTarget,
          parent_group: parentGroup,
          buyer_group: buyerGroup,
          services: services.map((s) => ({
            category: s.category,
            title: s.title,
            sla: s.sla_baseline,
            duration_months: s.duration_months,
            monthly_cost_k: s.monthly_cost_k,
            line_cost_k: s.duration_months * s.monthly_cost_k,
          })),
          admin_overhead_pct: adminOverheadPct,
          total_budget_k: totals.total,
          direct_billed_k: totals.directBilled,
          overhead_k: totals.overhead,
          active_services: totals.activeServices,
          notes,
          tier,
          model_override: modelOverride,
        }),
      });
      const j = await res.json();
      if (j.content) {
        setContent(j.content);
        saveOutput("tsa", j.content);
        loadHistory();
      } else {
        setError(j.error ?? "Generation failed. Check your API key in Settings.");
      }
    } catch (e: any) {
      setError(e?.message ?? "Request failed. Check API key in Settings.");
    }
    setGenerating(false);
  }

  function copyText() {
    if (!content) return;
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function downloadPptx() {
    if (!content) return;
    setPptExporting(true);
    try {
      const { exportProposalToPptx } = await import("@/lib/proposal/pptx-exporter");
      await exportProposalToPptx(content, { buyer, target, sector, geography, dealSize, moduleLabel: "TSA / Carve-Out" }, undefined, `deal-iq-tsa-${buyer || "buyer"}-${target || "target"}.pptx`);
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
        moduleLabel: "TSA / Carve-Out Suite",
        buyer, target, sector, geography, dealSize,
      },
    });
  }

  function loadFromHistory(item: HistoryItem) {
    setContent(item.content);
    if (item.buyer) setBuyer(item.buyer);
    if (item.target) setTarget(item.target);
    if (item.sector) setSector(item.sector);
    if (item.deal_size) setDealSize(item.deal_size);
    setShowHistory(false);
  }

  async function deleteFromHistory(id: string) {
    if (!confirm("Delete this saved TSA output?")) return;
    await sb.from("ai_outputs").delete().eq("id", id);
    loadHistory();
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
        hasOfflineFallback={false}
      />

      <div className="page-header">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold text-white">
              <Briefcase className="h-5 w-5 text-emerald-400" />
              Carve-Out Transition Services Agreement (TSA) Suite
            </h1>
            <p className="mt-1 text-sm text-white/50">
              Formulate legal and financial parameters when detaching corporate divisions. Build precise migration catalogs, model SLAs, and tally TSA budgets dynamically.
            </p>
          </div>
          <button onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/20">
            <History className="h-3.5 w-3.5" /> History ({history.length})
          </button>
        </div>
      </div>

      {showHistory && (
        <div className="card p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-white">
            <History className="h-4 w-4" /> TSA History
          </h2>
          {history.length === 0 ? (
            <p className="text-xs text-slate-500">No saved TSA outputs yet.</p>
          ) : (
            <div className="space-y-2">
              {history.map((h) => (
                <div key={h.id} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-slate-800 dark:text-slate-200">
                      {h.target ?? "Unnamed"} · {h.buyer ?? "—"}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      {h.sector ?? "—"} · {h.deal_size ?? "—"} · {h.provider ?? "—"} · {h.cost_estimate_usd ? `$${h.cost_estimate_usd.toFixed(4)}` : "Free"} · {new Date(h.created_at).toLocaleString()}
                    </p>
                  </div>
                  <button onClick={() => loadFromHistory(h)}
                    className="rounded-md border border-slate-200 px-2 py-1 text-[10px] text-slate-700 hover:bg-white dark:border-white/10 dark:text-slate-300">
                    Load
                  </button>
                  <button onClick={() => deleteFromHistory(h.id)}
                    className="rounded-md bg-red-50 p-1 text-red-700 hover:bg-red-100 dark:bg-red-950/30 dark:text-red-400">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Active deal indicator */}
      {(target || buyer) && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-[12px] dark:border-emerald-900 dark:bg-emerald-950/30">
          <span className="font-bold text-emerald-700 dark:text-emerald-300">Active deal from pipeline:</span>{" "}
          <span className="text-slate-800 dark:text-slate-200">{buyer || "—"} → {target || "—"}</span>
          {sector && <span className="text-slate-500"> · {sector}</span>}
          {dealSize && <span className="text-slate-500"> · {dealSize}</span>}
        </div>
      )}

      {/* Visualization */}
      <div className="card overflow-hidden">
        <button onClick={() => setVizCollapsed(!vizCollapsed)}
                className="flex w-full items-center justify-between border-b border-slate-100 px-5 py-3 text-left transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/30">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-emerald-500" />
            <span className="text-sm font-semibold text-slate-800 dark:text-white">TSA / Carve-Out Visualization (Interactive)</span>
            <span className="text-[10.5px] italic text-slate-500">Complements AI narrative below</span>
          </div>
          {vizCollapsed ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronUp className="h-4 w-4 text-slate-400" />}
        </button>

        {!vizCollapsed && (
          <div className="p-5 space-y-4">
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

              {/* Billing tally + AI button */}
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

                <div className="mt-3">
                  <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wider text-slate-500">Notes (optional)</label>
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                            placeholder="Specific carve-out hypotheses, known constraints..."
                            className="w-full rounded border border-slate-300 px-2 py-1.5 text-[11px] dark:border-slate-700 dark:bg-slate-800" />
                </div>

                <button onClick={startGenerate} disabled={generating}
                        className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50">
                  {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {generating ? "Generating…" : "Request AI Carve-Out Rationale"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* AI output */}
      {error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900/30 dark:bg-amber-950/20">
          <p className="font-semibold text-amber-900 dark:text-amber-300">Generation failed</p>
          <p className="mt-1 text-sm text-amber-800 dark:text-amber-300/80">{error}</p>
          <a href="/dashboard/settings" className="mt-3 inline-block rounded bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700">
            Open Settings
          </a>
        </div>
      )}

      {generating && (
        <div className="flex h-64 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700">
          <div className="text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-emerald-500" />
            <p className="mt-3 text-sm text-slate-500">Building your TSA carve-out rationale…</p>
            <p className="mt-1 text-xs text-slate-400">Reading service catalog and billing tally</p>
          </div>
        </div>
      )}

      {content && (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3 dark:border-slate-800">
            <span className="text-sm font-semibold text-slate-800 dark:text-white">TSA Carve-Out Rationale — {target}</span>
            <div className="flex gap-2">
              <button onClick={copyText}
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
  );
}
