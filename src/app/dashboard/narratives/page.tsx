"use client";

import { useState, useEffect, useCallback } from "react";
import { Lightbulb, Loader2, RefreshCw, Search, ChevronRight, FileText } from "lucide-react";

type NarrativeRow = {
  id: string;
  account_name: string;
  exec_summary: string;
  signals_referenced: number;
  themes_referenced: number;
  boltons_referenced: number;
  advisors_referenced: number;
  deals_referenced: number;
  generated_at: string;
  ai_provider: string | null;
  ai_model: string | null;
};

type Narrative = NarrativeRow & {
  strategic_situation: string;
  signal_summary: string;
  theme_relevance: string;
  bolt_on_summary: string;
  advisor_landscape: string;
  pitch_angle: string;
  recommended_next_steps: string;
};

export default function NarrativesPage() {
  const [narratives, setNarratives] = useState<NarrativeRow[]>([]);
  const [active, setActive] = useState<Narrative | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accountInput, setAccountInput] = useState("");

  const loadOne = useCallback(async (account: string) => {
    setError(null);
    try {
      const r = await fetch(`/api/narratives?account=${encodeURIComponent(account)}`).then((x) => x.json());
      if (r.narrative) setActive(r.narrative as Narrative);
    } catch (e: any) { setError(e?.message ?? "Load failed"); }
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/narratives").then((x) => x.json());
      if (r.error) throw new Error(r.error);
      const list = (r.narratives ?? []) as NarrativeRow[];
      setNarratives(list);
      // Auto-load the most recent brief if nothing is active
      if (list.length > 0 && !active) {
        await loadOne(list[0].account_name);
      }
    } catch (e: any) { setError(e?.message ?? "Load failed"); }
    finally { setLoading(false); }
  }, [active, loadOne]);

  useEffect(() => { loadList(); }, [loadList]);

  async function generate() {
    const account = accountInput.trim();
    if (!account) return;
    setGenerating(true); setError(null);
    try {
      const r = await fetch("/api/narratives", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_name: account }),
      });
      const j = await r.json();
      if (j.error) setError(`Note: ${j.error}`);
      if (j.narrative) setActive(j.narrative as Narrative);
      await loadList();
    } catch (e: any) { setError(e?.message ?? "Generate failed"); }
    finally { setGenerating(false); }
  }

  function exportMarkdown(n: Narrative) {
    const md = [
      `# ${n.account_name} — Strategic Brief`,
      ``,
      `**Generated**: ${new Date(n.generated_at).toLocaleString()} · ${n.ai_provider}/${n.ai_model}`,
      `**Sources**: ${n.deals_referenced} deals · ${n.signals_referenced} signals · ${n.themes_referenced} themes · ${n.boltons_referenced} bolt-ons · ${n.advisors_referenced} advisors`,
      ``,
      `## Executive Summary`, n.exec_summary,
      ``, `## Strategic Situation`, n.strategic_situation,
      ``, `## Signal Summary`, n.signal_summary,
      ``, `## Theme Relevance`, n.theme_relevance,
      ``, `## Bolt-on Opportunities`, n.bolt_on_summary,
      ``, `## Advisor Landscape`, n.advisor_landscape,
      ``, `## Pitch Angle`, n.pitch_angle,
      ``, `## Recommended Next Steps`, n.recommended_next_steps,
    ].join("\n");
    const blob = new Blob([md], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${n.account_name.replace(/[^a-z0-9]+/gi, "_")}_brief.md`;
    a.click();
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900 dark:text-white">
          <Lightbulb className="h-6 w-6 text-amber-500" />
          Account Narratives
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          For any account, synthesise a partner-ready 1-pager combining deals + signals + themes + bolt-ons + advisors. The AI pulls from all your existing intelligence.
        </p>
      </div>

      {/* Generator */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <h2 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
          <RefreshCw className="h-3.5 w-3.5" /> Generate new / refresh existing
        </h2>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input value={accountInput} onChange={(e) => setAccountInput(e.target.value)}
                   placeholder='Type an account name (e.g. "Reliance Industries")'
                   onKeyDown={(e) => { if (e.key === "Enter" && !generating) generate(); }}
                   className="w-full rounded border border-slate-300 bg-white px-8 py-2 text-sm dark:border-slate-700 dark:bg-slate-800" />
          </div>
          <button onClick={generate} disabled={generating || !accountInput.trim()}
                  className="flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lightbulb className="h-4 w-4" />}
            {generating ? "Generating…" : "Generate brief"}
          </button>
        </div>
        <p className="mt-2 text-[10.5px] italic text-slate-500">
          ~$0.03 per brief on NVIDIA NIM. Works best for accounts that already appear in your deal pipeline, watchlist, themes or bolt-on shortlists. Empty sections mean nothing in that dimension yet.
        </p>
      </section>

      {error && <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">{error}</div>}

      {/* Active narrative */}
      {active && (
        <section className="rounded-xl border border-amber-200 bg-amber-50/50 p-5 dark:border-amber-900 dark:bg-amber-950/20">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">{active.account_name}</h2>
              <p className="text-[11px] text-slate-500">
                Generated {new Date(active.generated_at).toLocaleString()} · {active.ai_provider}/{active.ai_model} · {active.deals_referenced}D / {active.signals_referenced}S / {active.themes_referenced}T / {active.boltons_referenced}B / {active.advisors_referenced}A
              </p>
            </div>
            <button onClick={() => exportMarkdown(active)}
                    className="flex items-center gap-1 rounded border border-slate-300 bg-white px-3 py-1.5 text-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
              <FileText className="h-3 w-3" /> Export .md
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Section title="Executive Summary" body={active.exec_summary} accent="indigo" wide />
            <Section title="Strategic Situation" body={active.strategic_situation} accent="purple" />
            <Section title="Signal Summary" body={active.signal_summary} accent="rose" />
            <Section title="Theme Relevance" body={active.theme_relevance} accent="emerald" />
            <Section title="Bolt-on Opportunities" body={active.bolt_on_summary} accent="sky" />
            <Section title="Advisor Landscape" body={active.advisor_landscape} accent="amber" />
            <Section title="Pitch Angle" body={active.pitch_angle} accent="indigo" wide />
            <Section title="Recommended Next Steps" body={active.recommended_next_steps} accent="emerald" wide />
          </div>
        </section>
      )}

      {/* Previous narratives */}
      <section>
        <h2 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
          <Lightbulb className="h-3.5 w-3.5" /> Previously generated ({narratives.length})
        </h2>
        {loading ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
        ) : narratives.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-8 text-center dark:border-slate-700 dark:bg-slate-900/50">
            <Lightbulb className="mx-auto mb-3 h-8 w-8 text-slate-400" />
            <p className="text-sm text-slate-600 dark:text-slate-400">
              No briefs yet. Type an account name above and click Generate brief.
            </p>
          </div>
        ) : (
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            {narratives.map((n) => (
              <button key={n.id} onClick={() => loadOne(n.account_name)}
                      className="rounded-lg border border-slate-200 bg-white p-3 text-left hover:border-amber-300 hover:shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <div className="mb-1 flex items-start justify-between">
                  <span className="text-[12.5px] font-bold text-slate-900 dark:text-white">{n.account_name}</span>
                  <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                </div>
                <p className="line-clamp-2 text-[11px] text-slate-600 dark:text-slate-400">{n.exec_summary}</p>
                <div className="mt-1 text-[9.5px] text-slate-400">
                  {n.deals_referenced}D · {n.signals_referenced}S · {n.themes_referenced}T · {n.boltons_referenced}B · {n.advisors_referenced}A · {new Date(n.generated_at).toLocaleDateString()}
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Section({ title, body, accent, wide }: { title: string; body: string; accent: string; wide?: boolean }) {
  if (!body) return null;
  return (
    <div className={`rounded-lg border border-${accent}-200 bg-white p-3 dark:border-${accent}-900 dark:bg-slate-900 ${wide ? "md:col-span-2" : ""}`}>
      <h3 className={`mb-1 text-[10px] font-bold uppercase tracking-wider text-${accent}-700 dark:text-${accent}-400`}>{title}</h3>
      <p className="text-[12.5px] leading-relaxed text-slate-800 dark:text-slate-200">{body}</p>
    </div>
  );
}
