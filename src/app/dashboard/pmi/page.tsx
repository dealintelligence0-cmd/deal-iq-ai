"use client";

import { useState, useEffect } from "react";
import { Layers, Loader2, Copy, Printer, CheckCircle2, Sparkles, History, Trash2 } from "lucide-react";
import { generatePmiProposal, type PmiInput } from "@/lib/intelligence/pmi-engine";
import { renderVisualProposal } from "@/lib/proposal/visual-renderer";
import { buildIndustryContextBlock } from "@/lib/intelligence/industry";
import AIGenerateConfirm from "@/components/AIGenerateConfirm";
import { createClient } from "@/lib/supabase/client";

const MODES = [
  { id: "narrative",   label: "Narrative Proposal",   desc: "Full board-ready PMI proposal" },
  { id: "slides",      label: "Executive Slides",     desc: "Slide-style structured deck" },
  { id: "workplan",    label: "Workplan Table",       desc: "Function × phase deliverables" },
  { id: "roadmap",     label: "Gantt Roadmap",        desc: "Pre-/Post-Day-1 visual" },
  { id: "steerco",     label: "Steering Committee Pack", desc: "Concise update format" },
];

export default function PmiStudioPage() {
  const [buyer, setBuyer] = useState("");
  const [target, setTarget] = useState("");
  const [sector, setSector] = useState("");
  const [geography, setGeography] = useState("");
  const [dealSize, setDealSize] = useState("");
  const [synergyAmbition, setSynergyAmbition] = useState<"low" | "medium" | "high">("medium");
  const [keyRisks, setKeyRisks] = useState("");
  const [publicPrivate, setPublicPrivate] = useState<"public" | "private">("private");
  const [listed, setListed] = useState<"listed" | "unlisted">("unlisted");
  const [knownIssues, setKnownIssues] = useState("");
  const [tsaNeeded, setTsaNeeded] = useState(false);
  const [crossBorder, setCrossBorder] = useState(false);
  const [notes, setNotes] = useState("");
  const [outputMode, setOutputMode] = useState("narrative");

 const [generating, setGenerating] = useState(false);
  const [content, setContent] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Modal + tiers
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [premiumTier, setPremiumTier] = useState<{ provider: string | null; model: string | null; hasKey: boolean }>({ provider: null, model: null, hasKey: false });
  const [economicTier, setEconomicTier] = useState<{ provider: string | null; model: string | null; hasKey: boolean }>({ provider: null, model: null, hasKey: false });

  // History
  const sb = createClient();
  type HistoryItem = {
    id: string; buyer: string | null; target: string | null;
    sector: string | null; deal_size: string | null;
    tier: string | null; provider: string | null; model: string | null;
    cost_estimate_usd: number | null;
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
        setPremiumTier({
          provider: data.premium_provider, model: data.premium_model,
          hasKey: !!data.premium_key_encrypted && data.premium_provider !== "free",
        });
        setEconomicTier({
          provider: data.economic_provider, model: data.economic_model,
          hasKey: !!data.economic_key_encrypted && data.economic_provider !== "free",
        });
      }
      const { data: h } = await sb.from("ai_outputs")
        .select("id,buyer,target,sector,deal_size,tier,provider,model,cost_estimate_usd,content,created_at")
        .eq("user_id", u.user.id).eq("module", "pmi")
        .order("created_at", { ascending: false }).limit(20);
      if (h) setHistory(h as HistoryItem[]);
    })();
  }, [sb]);

  async function reloadHistory() {
    const { data: u } = await sb.auth.getUser();
    if (!u.user) return;
    const { data: h } = await sb.from("ai_outputs")
      .select("id,buyer,target,sector,deal_size,tier,provider,model,cost_estimate_usd,content,created_at")
      .eq("user_id", u.user.id).eq("module", "pmi")
      .order("created_at", { ascending: false }).limit(20);
    if (h) setHistory(h as HistoryItem[]);
  }

  async function deleteFromHistory(id: string) {
    if (!confirm("Delete this saved PMI output?")) return;
    await sb.from("ai_outputs").delete().eq("id", id);
    reloadHistory();
  }

  function loadFromHistory(item: HistoryItem) {
    setContent(item.content);
    if (item.buyer) setBuyer(item.buyer);
    if (item.target) setTarget(item.target);
    if (item.sector) setSector(item.sector);
    if (item.deal_size) setDealSize(item.deal_size);
    setShowHistory(false);
  }

  // Add useEffect import — already imported via React 19? Otherwise add:

  function generate() {
    if (!buyer || !target) return;
    setGenerating(true);
    const input: PmiInput = {
      buyer, target, sector, geography, deal_size: dealSize,
      synergy_ambition: synergyAmbition, key_risks: keyRisks,
      public_private: publicPrivate, listed, known_issues: knownIssues,
      tsa_needed: tsaNeeded, cross_border: crossBorder, notes,
    };
    const result = generatePmiProposal(input);
    setContent(result);
    setGenerating(false);
  }

function startAIGenerate() {
    if (!buyer || !target) return;
    setConfirmOpen(true);
  }

  async function generateWithAI(tier: "premium" | "economic" | "offline") {
    setConfirmOpen(false);
    if (tier === "offline") { generate(); return; }

    if (!buyer || !target) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/ai/pmi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyer, target, sector, geography,
          deal_size: dealSize,
          synergy_ambition: synergyAmbition,
          key_risks: keyRisks,
          public_private: publicPrivate,
          listed,
          known_issues: knownIssues,
          tsa_needed: tsaNeeded,
          cross_border: crossBorder,
          notes,
          output_mode: outputMode,
          tier,
        }),
      });
      const j = await res.json();
      if (j.content) {
        setContent(j.content);
        reloadHistory();
      } else if (j.error) alert("AI error: " + j.error);
    } catch {
      alert("Request failed. Check your API key in Settings.");
    }
    setGenerating(false);
  }

  function copyText() {
    if (!content) return;
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function printDoc() {
    if (!content) return;
    const win = window.open("", "_blank");
    if (!win) return;
    const today = new Date().toLocaleDateString();
    const title = `PMI Proposal — ${target} · ${buyer}`;
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${title}</title><script src="https://cdn.tailwindcss.com"></script>
<style>
@page{margin:20mm 18mm 24mm 18mm}
body{font-family:-apple-system,Helvetica,Arial,sans-serif;color:#0f172a;background:#fff;font-size:11px;line-height:1.55;margin:0;padding:0}
.pdf-wrap{max-width:780px;margin:0 auto;padding:0 8px}
.pdf-header{border-bottom:2px solid #4f46e5;padding-bottom:12px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:flex-start}
.pdf-header .label{font-size:9px;font-weight:700;letter-spacing:2px;color:#4f46e5;text-transform:uppercase}
.pdf-header h1{font-size:18px;font-weight:700;margin:4px 0 0;color:#0f172a}
.conf{font-size:8px;color:#94a3b8;margin-top:2px}
h2{font-size:13px;font-weight:700;border-bottom:1px solid #e2e8f0;padding-bottom:5px;margin:18px 0 8px;color:#1e1b4b}
h3{font-size:11px;font-weight:600;margin:12px 0 4px;color:#3730a3}
p,li{color:#334155;line-height:1.55}
table{width:100%;border-collapse:collapse;font-size:10px;margin:8px 0}
th{background:#eef2ff;color:#3730a3;font-weight:700;padding:7px 8px;text-align:left;-webkit-print-color-adjust:exact;print-color-adjust:exact}
td{padding:6px 8px;border-bottom:1px solid #f1f5f9;vertical-align:top}
tr{page-break-inside:avoid}
.pdf-footer{position:fixed;bottom:6mm;left:18mm;right:18mm;font-size:7.5px;color:#94a3b8;text-align:center;border-top:.5px solid #e2e8f0;padding-top:3px}
</style></head><body>
<div class="pdf-wrap">
<div class="pdf-header">
<div><div class="label">Deal IQ AI · PMI Studio · Confidential</div><h1>${title}</h1><div style="font-size:11px;color:#64748b;margin-top:4px">${sector} · ${geography} · ${dealSize}</div></div>
<div style="text-align:right;font-size:10px;color:#64748b">${today}</div>
</div>
${renderVisualProposal(content)}
</div>
<div class="pdf-footer">This document is for informational purposes only. Independent verification required. © ${new Date().getFullYear()} Rahul Yadav.</div>
</body></html>`);
    win.document.close();
    win.onload = () => setTimeout(() => { win.focus(); win.print(); }, 250);
  }

 return (
    <>
      <AIGenerateConfirm
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={generateWithAI}
        module="pmi"
        premiumProvider={{ tier: "premium", ...premiumTier }}
        economicProvider={{ tier: "economic", ...economicTier }}
        hasOfflineFallback={true}
      />
    <div className="flex h-full min-h-screen flex-col lg:flex-row">
      <aside className="w-full shrink-0 border-b border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#15151f] lg:w-80 lg:border-b-0 lg:border-r lg:p-6">
       <div className="page-header">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-white" />
              <div>
                <h1 className="text-lg font-semibold text-white">PMI Studio</h1>
                <p className="text-[11px] text-white/60">Post-Merger Integration · Synergy · Roadmap</p>
              </div>
            </div>
            <button onClick={() => setShowHistory(!showHistory)}
              className="flex items-center gap-1 rounded-md border border-white/20 bg-white/10 px-2 py-1 text-[10px] text-white hover:bg-white/20">
              <History className="h-3 w-3" /> {history.length}
            </button>
          </div>
        </div>

        {showHistory && (
          <div className="mb-3 max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 dark:border-white/10 dark:bg-[#15151f]">
            {history.length === 0 ? (
              <p className="px-2 py-3 text-[11px] text-slate-500">No PMI history yet.</p>
            ) : history.map((h) => (
              <div key={h.id} className="mb-1 flex items-center gap-2 rounded p-2 text-[10px] hover:bg-slate-50 dark:hover:bg-white/5">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-700 dark:text-slate-300">
                    {h.target ?? "—"} · {h.buyer ?? "—"}
                  </p>
                  <p className="truncate text-slate-500">
                    {h.provider ?? "—"} · {h.cost_estimate_usd ? `$${h.cost_estimate_usd.toFixed(4)}` : "Free"} · {new Date(h.created_at).toLocaleDateString()}
                  </p>
                </div>
                <button onClick={() => loadFromHistory(h)} className="rounded border border-slate-200 px-1.5 py-0.5 text-slate-700 dark:border-white/10 dark:text-slate-300">Load</button>
                <button onClick={() => deleteFromHistory(h.id)} className="rounded bg-red-50 p-1 text-red-700 dark:bg-red-950/30 dark:text-red-400">
                  <Trash2 className="h-2.5 w-2.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-slate-600 dark:text-slate-400">Buyer</label>
              <input value={buyer} onChange={(e) => setBuyer(e.target.value)} placeholder="Apollo Capital"
                className="w-full rounded border border-slate-200 px-2 py-1.5 text-[11px]" />
            </div>
            <div>
              <label className="text-[10px] text-slate-600 dark:text-slate-400">Target</label>
              <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Acme Tech"
                className="w-full rounded border border-slate-200 px-2 py-1.5 text-[11px]" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-slate-600 dark:text-slate-400">Sector</label>
              <input value={sector} onChange={(e) => setSector(e.target.value)} placeholder="Manufacturing"
                className="w-full rounded border border-slate-200 px-2 py-1.5 text-[11px]" />
            </div>
            <div>
              <label className="text-[10px] text-slate-600 dark:text-slate-400">Geography</label>
              <input value={geography} onChange={(e) => setGeography(e.target.value)} placeholder="USA"
                className="w-full rounded border border-slate-200 px-2 py-1.5 text-[11px]" />
            </div>
          </div>

          <div>
            <label className="text-[10px] text-slate-600 dark:text-slate-400">Deal Size</label>
            <input value={dealSize} onChange={(e) => setDealSize(e.target.value)} placeholder="$2.5B"
              className="w-full rounded border border-slate-200 px-2 py-1.5 text-[11px]" />
          </div>

          <div>
            <label className="text-[10px] font-semibold text-slate-700 dark:text-slate-300">Synergy Ambition</label>
            <div className="mt-1 flex gap-1">
              {(["low", "medium", "high"] as const).map((a) => (
                <button key={a} onClick={() => setSynergyAmbition(a)}
                  className={`flex-1 rounded px-2 py-1 text-[10px] font-medium capitalize ${synergyAmbition === a ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                  {a}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-slate-600 dark:text-slate-400">Public/Private</label>
              <select value={publicPrivate} onChange={(e) => setPublicPrivate(e.target.value as "public" | "private")}
                className="w-full rounded border border-slate-200 px-2 py-1.5 text-[11px]">
                <option value="private">Private</option>
                <option value="public">Public</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-slate-600 dark:text-slate-400">Listed</label>
              <select value={listed} onChange={(e) => setListed(e.target.value as "listed" | "unlisted")}
                className="w-full rounded border border-slate-200 px-2 py-1.5 text-[11px]">
                <option value="unlisted">Unlisted</option>
                <option value="listed">Listed</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="flex items-center gap-2 rounded border border-slate-200 px-2 py-1.5 text-[11px]">
              <input type="checkbox" checked={tsaNeeded} onChange={(e) => setTsaNeeded(e.target.checked)} className="rounded" />
              TSA Needed
            </label>
            <label className="flex items-center gap-2 rounded border border-slate-200 px-2 py-1.5 text-[11px]">
              <input type="checkbox" checked={crossBorder} onChange={(e) => setCrossBorder(e.target.checked)} className="rounded" />
              Cross Border
            </label>
          </div>

          <div>
            <label className="text-[10px] text-slate-600 dark:text-slate-400">Key Risks</label>
            <textarea value={keyRisks} onChange={(e) => setKeyRisks(e.target.value)} rows={2} placeholder="Customer concentration, regulatory..."
              className="w-full rounded border border-slate-200 px-2 py-1 text-[11px]" />
          </div>

          <div>
            <label className="text-[10px] text-slate-600 dark:text-slate-400">Known Issues</label>
            <textarea value={knownIssues} onChange={(e) => setKnownIssues(e.target.value)} rows={2} placeholder="Pending litigation, IT debt..."
              className="w-full rounded border border-slate-200 px-2 py-1 text-[11px]" />
          </div>

          <div>
            <label className="text-[10px] text-slate-600 dark:text-slate-400">Notes / Custom Insights</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              className="w-full rounded border border-slate-200 px-2 py-1 text-[11px]" />
          </div>

          <div>
            <label className="text-[10px] font-semibold text-slate-700 dark:text-slate-300">Output Mode</label>
            <select value={outputMode} onChange={(e) => setOutputMode(e.target.value)}
              className="mt-1 w-full rounded border border-slate-200 px-2 py-1.5 text-[11px]">
              {MODES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
            <p className="mt-1 text-[9px] text-slate-500">{MODES.find(m => m.id === outputMode)?.desc}</p>
          </div>

          <div className="flex gap-3">
            <button onClick={generateWithAI} disabled={generating || !buyer || !target}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
              {generating ? <Loader2 className="h-4 w-4 animate-spin"/> : <Sparkles className="h-4 w-4"/>}
              Generate with AI ✦
            </button>
            <button onClick={generate} disabled={generating || !buyer || !target}
              className="flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 disabled:opacity-40">
              Quick (Offline)
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto bg-slate-50 p-6 dark:bg-[#0a0a14]">
        {!content && (
          <div className="flex h-full min-h-[400px] items-center justify-center">
            <div className="text-center">
              <Layers className="mx-auto h-12 w-12 text-indigo-300" />
              <p className="mt-4 text-base font-semibold text-slate-700 dark:text-slate-200">PMI Studio</p>
              <p className="mt-1 text-sm text-slate-500">Generate board-ready Post-Merger Integration proposals.</p>
              <p className="mt-3 max-w-sm text-xs text-slate-400">Fill the panel left → pick output mode → Generate. Synergy benchmarks auto-tuned by sector.</p>
            </div>
          </div>
        )}

        {content && (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-[#15151f]">
              <div>
                <p className="text-sm font-semibold">PMI Proposal</p>
                <p className="text-xs text-slate-500">{target} · {buyer} · {sector} · {dealSize}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={copyText} className="flex items-center gap-1 rounded border border-slate-200 px-3 py-1.5 text-xs">
                  {copied ? <CheckCircle2 className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                  {copied ? "Copied" : "Copy"}
                </button>
                <button onClick={printDoc} className="flex items-center gap-1 rounded border border-slate-200 px-3 py-1.5 text-xs">
                  <Printer className="h-3 w-3" /> Print / PDF
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-8 dark:border-white/10 dark:bg-[#15151f]">
              <div dangerouslySetInnerHTML={{ __html: renderVisualProposal(content) }} />
            </div>
          </div>
        )}
    </main>
    </div>
    </>
  );
}
