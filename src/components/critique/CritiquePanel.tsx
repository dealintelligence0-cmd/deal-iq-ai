"use client";

import { useState, useEffect, useCallback } from "react";
import { Target, X, Sparkles, AlertTriangle, CheckCircle2, Zap, Copy, Loader2 } from "lucide-react";

type Critique = {
  id: string;
  credibility_score: number;
  differentiation_score: number;
  executive_relevance_score: number;
  strategic_sharpness_score: number;
  overall_score: number;
  personas_json: Array<{
    display_name: string;
    credibility: number; differentiation: number; executive_relevance: number; strategic_sharpness: number;
    one_line_verdict: string;
    flags: Array<{ severity: string; category: string; text: string }>;
    strengths: string[];
    sharpening_suggestions: Array<{ weakness: string; suggested_revision: string }>;
  }>;
  top_warnings: string[];
  top_strengths: string[];
  sharpened_summary: string | null;
  cost_usd: number | null;
  ai_provider: string | null;
  ai_model: string | null;
};

type Props = {
  proposalId: string;
  proposalLabel: string;
  open: boolean;
  onClose: () => void;
};

const SCORE_RUBRIC = `
SCORING RUBRIC (each 0-100, averaged across 5 personas)
  Credibility         — assumptions defensible? evidence cited?
  Differentiation     — distinct from McKinsey/BCG/Bain?
  Executive Relevance — would the CFO open this email?
  Strategic Sharpness — clear thesis vs methodology dump?

OVERALL — weighted: 30% diff, 25% credibility, 25% sharpness, 20% relevance
PURSUE ≥ 70    REVISE 50-69    REWORK < 50
`.trim();

export default function CritiquePanel({ proposalId, proposalLabel, open, onClose }: Props) {
  const [critique, setCritique] = useState<Critique | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sharpening, setSharpening] = useState(false);
  const [expandedPersona, setExpandedPersona] = useState<string | null>(null);

  const loadExisting = useCallback(async () => {
    if (!proposalId) return;
    try {
      const r = await fetch(`/api/critique?proposal_id=${proposalId}`);
      const j = await r.json();
      if (j.critique) setCritique(j.critique);
    } catch { /* ignore */ }
  }, [proposalId]);

  useEffect(() => { if (open) loadExisting(); }, [open, loadExisting]);

  async function runCritique() {
    setLoading(true); setError(null);
    try {
      const r = await fetch("/api/critique", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposal_id: proposalId }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Critique failed");
      setCritique(j.critique);
    } catch (e: any) {
      setError(e?.message ?? "Critique failed");
    } finally { setLoading(false); }
  }

  async function sharpen() {
    if (!critique) return;
    setSharpening(true); setError(null);
    try {
      const r = await fetch("/api/critique/sharpen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ critique_id: critique.id }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Sharpen failed");
      setCritique({ ...critique, sharpened_summary: j.sharpened });
    } catch (e: any) {
      setError(e?.message ?? "Sharpen failed");
    } finally { setSharpening(false); }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-rose-600" />
            <div>
              <div className="text-sm font-bold text-slate-900 dark:text-white">Critique This Pitch</div>
              <div className="text-[11px] text-slate-500">{proposalLabel}</div>
            </div>
          </div>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {!critique && !loading && (
            <div className="space-y-4">
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 dark:border-rose-900 dark:bg-rose-950/30">
                <h3 className="mb-2 text-sm font-bold text-rose-900 dark:text-rose-200">
                  Pressure-test this pitch through 5 hostile personas
                </h3>
                <ul className="space-y-1 text-[11px] text-rose-900 dark:text-rose-200">
                  <li>🎯 Skeptical PE Partner</li>
                  <li>💰 Fortune 500 CFO</li>
                  <li>📋 Investment Committee Member</li>
                  <li>⚔️ Activist Investor</li>
                  <li>🔧 PE Operating Partner</li>
                </ul>
                <p className="mt-3 text-[11px] italic text-rose-700 dark:text-rose-300">
                  Each persona will attack the pitch's weak points, score it 0–100 on four
                  axes, and propose sharpenings. Takes ~30 seconds. Uses your smart-tier key.
                </p>
              </div>

              <pre className="rounded bg-slate-50 p-3 text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-400">{SCORE_RUBRIC}</pre>

              <button onClick={runCritique} className="flex w-full items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-500">
                <Target className="h-4 w-4" /> Run critique
              </button>
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center gap-3 py-12">
              <Loader2 className="h-6 w-6 animate-spin text-rose-600" />
              <p className="text-sm text-slate-500">Running 5 critique personas in parallel…</p>
              <p className="text-[11px] text-slate-400">~30 seconds</p>
            </div>
          )}

          {error && <div className="rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">{error}</div>}

          {critique && (
            <div className="space-y-5">
              {/* Score overview */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <ScoreTile label="Credibility" value={critique.credibility_score} />
                <ScoreTile label="Differentiation" value={critique.differentiation_score} />
                <ScoreTile label="Exec Relevance" value={critique.executive_relevance_score} />
                <ScoreTile label="Sharpness" value={critique.strategic_sharpness_score} />
              </div>
              <div className="rounded-lg border-2 p-3 text-center" style={{
                borderColor: critique.overall_score >= 70 ? "#10b981" : critique.overall_score >= 50 ? "#f59e0b" : "#ef4444",
              }}>
                <div className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Overall</div>
                <div className="text-3xl font-bold tabular-nums" style={{
                  color: critique.overall_score >= 70 ? "#059669" : critique.overall_score >= 50 ? "#d97706" : "#dc2626",
                }}>{critique.overall_score}</div>
                <div className="text-[11px] font-medium" style={{
                  color: critique.overall_score >= 70 ? "#059669" : critique.overall_score >= 50 ? "#d97706" : "#dc2626",
                }}>
                  {critique.overall_score >= 70 ? "PURSUE — strong pitch" : critique.overall_score >= 50 ? "REVISE — sharpen first" : "REWORK — significant weaknesses"}
                </div>
              </div>

              {/* Top warnings */}
              {critique.top_warnings.length > 0 && (
                <section>
                  <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-rose-700 dark:text-rose-300">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Top warnings ({critique.top_warnings.length})
                  </h3>
                  <ul className="space-y-1.5">
                    {critique.top_warnings.map((w, i) => (
                      <li key={i} className="rounded border-l-4 border-rose-400 bg-rose-50 px-3 py-2 text-[12px] text-rose-900 dark:border-rose-600 dark:bg-rose-950/30 dark:text-rose-200">{w}</li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Strengths */}
              {critique.top_strengths.length > 0 && (
                <section>
                  <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    What works
                  </h3>
                  <ul className="space-y-1.5">
                    {critique.top_strengths.map((s, i) => (
                      <li key={i} className="rounded border-l-4 border-emerald-400 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-900 dark:border-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-200">{s}</li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Per-persona drilldown */}
              <section>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Per-persona breakdown</h3>
                <div className="space-y-1.5">
                  {critique.personas_json.map((p) => {
                    const avg = Math.round((p.credibility + p.differentiation + p.executive_relevance + p.strategic_sharpness) / 4);
                    const isOpen = expandedPersona === p.display_name;
                    return (
                      <div key={p.display_name} className="rounded border border-slate-200 dark:border-slate-700">
                        <button
                          onClick={() => setExpandedPersona(isOpen ? null : p.display_name)}
                          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-slate-900 dark:text-white">{p.display_name}</div>
                            <div className="truncate text-[11px] italic text-slate-500">{p.one_line_verdict}</div>
                          </div>
                          <div className={`flex-shrink-0 rounded px-2 py-1 text-xs font-bold tabular-nums ${
                            avg >= 70 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                            : avg >= 50 ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                            : "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
                          }`}>{avg}</div>
                        </button>
                        {isOpen && (
                          <div className="border-t border-slate-200 bg-slate-50 p-3 text-[11px] dark:border-slate-700 dark:bg-slate-800/50">
                            <div className="mb-2 grid grid-cols-4 gap-2">
                              <Mini label="Cred" v={p.credibility} />
                              <Mini label="Diff" v={p.differentiation} />
                              <Mini label="Exec" v={p.executive_relevance} />
                              <Mini label="Sharp" v={p.strategic_sharpness} />
                            </div>
                            {p.flags.length > 0 && (
                              <>
                                <div className="mb-1 mt-2 font-bold text-rose-700 dark:text-rose-300">Flags:</div>
                                <ul className="space-y-1">
                                  {p.flags.map((f, i) => (
                                    <li key={i} className="text-slate-700 dark:text-slate-300">
                                      <span className={`mr-1 rounded px-1 text-[9px] font-bold ${
                                        f.severity === "high" ? "bg-rose-200 text-rose-900" : f.severity === "medium" ? "bg-amber-200 text-amber-900" : "bg-slate-200 text-slate-700"
                                      }`}>{f.severity.toUpperCase()}</span>
                                      {f.text}
                                    </li>
                                  ))}
                                </ul>
                              </>
                            )}
                            {p.sharpening_suggestions.length > 0 && (
                              <>
                                <div className="mb-1 mt-2 font-bold text-indigo-700 dark:text-indigo-300">Suggested sharpenings:</div>
                                <ul className="space-y-1.5">
                                  {p.sharpening_suggestions.map((s, i) => (
                                    <li key={i} className="text-slate-700 dark:text-slate-300">
                                      <div className="text-rose-600 dark:text-rose-400">✗ {s.weakness}</div>
                                      <div className="ml-3 text-emerald-700 dark:text-emerald-400">✓ {s.suggested_revision}</div>
                                    </li>
                                  ))}
                                </ul>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Sharpen action */}
              {!critique.sharpened_summary && (
                <button onClick={sharpen} disabled={sharpening} className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-2.5 text-sm font-semibold text-white hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50">
                  {sharpening ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {sharpening ? "Sharpening pitch…" : "Generate sharpened version"}
                </button>
              )}

              {critique.sharpened_summary && (
                <section>
                  <h3 className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
                    <span className="flex items-center gap-1.5"><Zap className="h-3.5 w-3.5" /> Sharpened version</span>
                    <button
                      onClick={() => navigator.clipboard.writeText(critique.sharpened_summary ?? "")}
                      className="rounded border border-indigo-300 px-2 py-0.5 text-[10px] font-medium text-indigo-700 hover:bg-indigo-50 dark:border-indigo-700 dark:text-indigo-300 dark:hover:bg-indigo-950"
                    ><Copy className="inline h-2.5 w-2.5" /> Copy</button>
                  </h3>
                  <div className="rounded border-2 border-indigo-200 bg-indigo-50/50 p-3 dark:border-indigo-900 dark:bg-indigo-950/30">
                    <pre className="whitespace-pre-wrap text-[11px] leading-relaxed text-slate-800 dark:text-slate-200 font-sans">{critique.sharpened_summary}</pre>
                  </div>
                </section>
              )}

              {critique.cost_usd != null && (
                <p className="text-center text-[10px] text-slate-400">
                  Critique cost ~${critique.cost_usd.toFixed(3)} · {critique.ai_provider} · {critique.ai_model}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ScoreTile({ label, value }: { label: string; value: number }) {
  const color = value >= 70 ? "emerald" : value >= 50 ? "amber" : "rose";
  return (
    <div className={`rounded border-2 p-2 text-center border-${color}-200 bg-${color}-50/50 dark:border-${color}-900 dark:bg-${color}-950/30`}>
      <div className="text-[9px] font-medium uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`text-xl font-bold tabular-nums text-${color}-700 dark:text-${color}-300`}>{value}</div>
    </div>
  );
}

function Mini({ label, v }: { label: string; v: number }) {
  return <div className="text-center"><div className="text-[8px] text-slate-500">{label}</div><div className="font-mono tabular-nums">{v}</div></div>;
}
