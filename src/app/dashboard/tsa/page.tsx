"use client";

import { useState, useEffect } from "react";
import { ArrowLeftRight, Loader2, Copy, Printer, CheckCircle2, Sparkles, History, Trash2 } from "lucide-react";
import { cleanMarkdownToHTML } from "@/lib/ai/utils";
import AIGenerateConfirm from "@/components/AIGenerateConfirm";
import { createClient } from "@/lib/supabase/client";

const FUNCTIONS = ["IT & Systems", "Finance & Accounting", "HR & Payroll", "Legal", "Procurement", "Facilities", "Customer Service", "Supply Chain", "Manufacturing", "Sales Support", "Tax", "Treasury"];
const PRICING_OPTIONS = [
  { id: "cost_plus_5", label: "Cost + 5%" },
  { id: "cost_plus_10", label: "Cost + 10%" },
  { id: "market_rate", label: "Market Rate" },
  { id: "negotiated", label: "Negotiated" },
];
const DURATIONS = ["6", "12", "18", "24"];

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
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    (async () => {
      const { data: u } = await sb.auth.getUser();
      if (!u.user) return;
      const { data } = await sb.from("ai_settings")
        .select("premium_provider,premium_model,premium_key_encrypted,economic_provider,economic_model,economic_key_encrypted")
        .eq("user_id", u.user.id).maybeSingle();
      if (data) {
        setPremiumTier({ provider: data.premium_provider, model: data.premium_model, hasKey: !!data.premium_key_encrypted && data.premium_provider !== "free" });
        setEconomicTier({ provider: data.economic_provider, model: data.economic_model, hasKey: !!data.economic_key_encrypted && data.economic_provider !== "free" });
      }
      reloadHistory();
    })();
  }, []); // eslint-disable-line

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
      setError("Offline mode not available for TSA — needs AI for service catalog generation. Pick Premium or Economic.");
      return;
    }
    setGen(true); setContent(null); setError(null);
    try {
      const res = await fetch("/api/ai/tsa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seller, buyer, sector, deal_size: dealSize, geography,
          close_date: closeDate, functions: selectedFns,
          duration, pricing_basis: pricing, constraints, tier,
            model_override: modelOverride,
        }),
      });
      const j = await res.json();
      if (j.content) { setContent(j.content); reloadHistory(); }
      else setError(j.error ?? "Generation failed.");
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
                  <button onClick={() => window.print()}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300">
                    <Printer className="h-3.5 w-3.5" /> Print
                  </button>
                </div>
              </div>
              <div className="prose prose-sm max-w-none p-5 dark:prose-invert"
                dangerouslySetInnerHTML={{ __html: cleanMarkdownToHTML(content) }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
