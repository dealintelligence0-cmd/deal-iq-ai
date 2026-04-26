"use client";

import { useState, useEffect, useCallback } from "react";
import { TrendingUp, Loader2, Copy, Printer, CheckCircle2, Sparkles, History, Trash2 } from "lucide-react";
import { cleanMarkdownToHTML } from "@/lib/ai/utils";
import AIGenerateConfirm from "@/components/AIGenerateConfirm";
import { createClient } from "@/lib/supabase/client";

const AMBITIONS = [
  { id: "conservative", label: "Conservative", sub: "P25 benchmarks, high confidence" },
  { id: "base",         label: "Base Case",    sub: "Median benchmarks, balanced" },
  { id: "aggressive",   label: "Aggressive",   sub: "P75 benchmarks, aspirational" },
];

type HistoryItem = {
  id: string;
  buyer: string | null; target: string | null;
  sector: string | null; deal_size: string | null;
  tier: string | null; provider: string | null; model: string | null;
  cost_estimate_usd: number | null;
  content: string;
  created_at: string;
};

export default function SynergyEnginePage() {
  const sb = createClient();

  const [buyer, setB] = useState("");
  const [target, setT] = useState("");
  const [sector, setSec] = useState("");
  const [geography, setGeo] = useState("");
  const [dealSize, setDS] = useState("");
  const [targetRevenue, setTR] = useState("");
  const [targetEbitda, setTE] = useState("");
  const [buyerRevenue, setBR] = useState("");
  const [ambition, setAmb] = useState("base");
  const [notes, setNotes] = useState("");
  const [generating, setGen] = useState(false);
  const [content, setContent] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal + tiers
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [premiumTier, setPremiumTier] = useState<{ provider: string | null; model: string | null; hasKey: boolean }>({ provider: null, model: null, hasKey: false });
  const [economicTier, setEconomicTier] = useState<{ provider: string | null; model: string | null; hasKey: boolean }>({ provider: null, model: null, hasKey: false });

  // History
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);

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
      .eq("user_id", u.user.id).eq("module", "synergy")
      .order("created_at", { ascending: false }).limit(20);
    if (data) setHistory(data as HistoryItem[]);
  }, [sb]);

  useEffect(() => { loadTiers(); loadHistory(); }, [loadTiers, loadHistory]);
  function startGenerate() {
    if (!buyer || !target || !dealSize) return;
    setError(null);
    setConfirmOpen(true);
  }

  async function generate(tier: "premium" | "economic" | "offline") {
    setConfirmOpen(false);
    setGen(true);
    setContent(null);
    try {
      const res = await fetch("/api/ai/synergy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyer, target, sector, geography,
          deal_size: dealSize,
          target_revenue: targetRevenue,
          target_ebitda: targetEbitda,
          buyer_revenue: buyerRevenue,
          ambition, notes, tier,
        }),
      });
      const j = await res.json();
      if (j.content) {
        setContent(j.content);
        loadHistory();
      } else {
        setError(j.error ?? "Generation failed.");
      }
    } catch {
      setError("Request failed. Check API key in Settings.");
    }
    setGen(false);
  }

  function copyText() {
    if (!content) return;
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function loadFromHistory(item: HistoryItem) {
    setContent(item.content);
    if (item.buyer) setB(item.buyer);
    if (item.target) setT(item.target);
    if (item.sector) setSec(item.sector);
    if (item.deal_size) setDS(item.deal_size);
    setShowHistory(false);
  }

  async function deleteFromHistory(id: string) {
    if (!confirm("Delete this saved synergy output?")) return;
    await sb.from("ai_outputs").delete().eq("id", id);
    loadHistory();
  }

  const fields: Array<[string, string, (v: string) => void, string]> = [
    ["Buyer / Acquirer *", buyer, setB, "e.g. Microsoft"],
    ["Target Company *", target, setT, "e.g. Salesforce"],
    ["Sector", sector, setSec, "e.g. SaaS / Technology"],
    ["Geography", geography, setGeo, "e.g. USA, Europe"],
    ["Deal Size *", dealSize, setDS, "e.g. $2.5B"],
    ["Target Revenue ($M)", targetRevenue, setTR, "Optional"],
    ["Target EBITDA ($M)", targetEbitda, setTE, "Optional"],
    ["Buyer Revenue ($M)", buyerRevenue, setBR, "Optional"],
  ];
  return (
    <div className="space-y-6 p-6">
      <AIGenerateConfirm
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={generate}
        module="synergy"
        premiumProvider={{ tier: "premium", ...premiumTier }}
        economicProvider={{ tier: "economic", ...economicTier }}
        hasOfflineFallback={false}
      />

      <div className="page-header">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold text-white">
              <TrendingUp className="h-5 w-5 text-indigo-400" />
              Synergy Engine
            </h1>
            <p className="mt-1 text-sm text-white/50">AI-powered synergy model · sector-specific initiatives · benchmarked against real transactions</p>
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
            <History className="h-4 w-4" /> Synergy History
          </h2>
          {history.length === 0 ? (
            <p className="text-xs text-slate-500">No saved synergy outputs yet.</p>
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

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-1">
          <div className="card space-y-4 p-5">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-white">Deal Details</h2>
            {fields.map(([lbl, val, set, ph]) => (
              <div key={lbl}>
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">{lbl}</label>
                <input value={val} onChange={(e) => set(e.target.value)} placeholder={ph}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
              </div>
            ))}

            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Synergy Ambition</label>
              <div className="mt-2 space-y-2">
                {AMBITIONS.map((a) => (
                  <button key={a.id} onClick={() => setAmb(a.id)}
                    className={`w-full rounded-lg border px-3 py-2.5 text-left text-sm transition ${
                      ambition === a.id
                        ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                        : "border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-400"
                    }`}>
                    <div className="font-medium">{a.label}</div>
                    <div className="text-xs opacity-70">{a.sub}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Analyst Notes</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
                placeholder="Known issues, specific synergy hypotheses, deal context..."
                className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            </div>

            <button onClick={startGenerate} disabled={generating || !buyer || !target || !dealSize}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40">
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {generating ? "Generating…" : "Generate Synergy Model"}
            </button>
          </div>
        </div>

        <div className="lg:col-span-2">
          {!content && !generating && !error && (
            <div className="flex h-64 items-center justify-center rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700">
              <div className="text-center">
                <TrendingUp className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-2 text-sm text-slate-400">Fill in deal details and click Generate to create your AI-powered synergy model</p>
                <p className="mt-1 text-xs text-slate-400">Modal will let you pick Premium / Economic AI</p>
              </div>
            </div>
          )}

          {error && !generating && (
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
                <Loader2 className="mx-auto h-8 w-8 animate-spin text-indigo-500" />
                <p className="mt-3 text-sm text-slate-500">Building your synergy model…</p>
                <p className="mt-1 text-xs text-slate-400">Computing sector-specific initiatives and benchmarks</p>
              </div>
            </div>
          )}

          {content && (
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3 dark:border-slate-800">
                <span className="text-sm font-semibold text-slate-800 dark:text-white">Synergy Analysis — {target}</span>
                <div className="flex gap-2">
                  <button onClick={copyText}
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
