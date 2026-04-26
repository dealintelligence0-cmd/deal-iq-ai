"use client";

import { useState } from "react";
import { TrendingUp, Loader2, Copy, Printer, CheckCircle2, Sparkles } from "lucide-react";
import { cleanMarkdownToHTML } from "@/lib/ai/utils";

const AMBITIONS = [
  { id: "conservative", label: "Conservative", sub: "P25 benchmarks, high confidence" },
  { id: "base",         label: "Base Case",    sub: "Median benchmarks, balanced" },
  { id: "aggressive",   label: "Aggressive",   sub: "P75 benchmarks, aspirational" },
];

export default function SynergyEnginePage() {
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
  
  async function generate() {
    if (!buyer || !target || !dealSize) return;
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
          ambition, notes,
        }),
      });
      const j = await res.json();
      if (j.content) {
        setContent(j.content);
        setError(null);
      } else {
        setError(j.error ?? "Generation failed.");
      }
    } catch {
      alert("Request failed. Check your API key in Settings.");
    }
    setGen(false);
  }

  function copyText() {
    if (!content) return;
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
      <div className="page-header">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold text-white">
              <TrendingUp className="h-5 w-5 text-indigo-400" />
              Synergy Engine
            </h1>
            <p className="mt-1 text-sm text-white/50">AI-powered synergy model · sector-specific initiatives · benchmarked against real transactions</p>
          </div>
        </div>
      </div>

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

            <button onClick={generate} disabled={generating || !buyer || !target || !dealSize}
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
                <p className="mt-1 text-xs text-slate-400">Requires Smart-tier AI key (Anthropic / OpenAI / Gemini) saved in Settings</p>
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
