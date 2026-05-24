"use client";

import { useState, useEffect, useCallback } from "react";
import { Briefcase, Loader2, Plus, Search, ChevronRight, Layers, CheckSquare, Square } from "lucide-react";

type Playbook = { id: string; account_name: string; buyer_name: string | null; total_weeks: number; current_week: number; updated_at: string };
type Task = { id: string; title: string; workstream: string; start_week: number; end_week: number; progress_pct: number; dependencies: string[] };
type Check = { id: string; phase: string; title: string; owner_role: string | null; done: boolean; notes: string | null };

const WS_COLORS: Record<string, string> = {
  IMO: "bg-purple-500/70", HR: "bg-rose-500/70", IT: "bg-cyan-500/70",
  Finance: "bg-amber-500/70", GTM: "bg-blue-500/70", Legal: "bg-pink-500/70", Ops: "bg-emerald-500/70",
};
const PHASES = [
  { key: "pre_close",        label: "Pre-Close / Day 0",     desc: "SLA approvals and antitrust checks" },
  { key: "day_1_core",       label: "Day 1 Core",            desc: "Corporate notifications and tech freezes" },
  { key: "day_30_stabilize", label: "Day 30 Stabilization",  desc: "Cutover verification and SLA alignment" },
  { key: "day_100_integrate",label: "Day 100 Integration",   desc: "Operational consolidation milestones" },
  { key: "post_close",       label: "Post-Close",            desc: "Synergy review and lessons learned" },
];

export default function PMIPage() {
  const [list, setList] = useState<Playbook[]>([]);
  const [active, setActive] = useState<Playbook | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [checklist, setChecklist] = useState<Check[]>([]);
  const [accountInput, setAccountInput] = useState("");
  const [buyerInput, setBuyerInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phaseTab, setPhaseTab] = useState("day_1_core");

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/pmi").then((x) => x.json());
      setList(r.playbooks ?? []);
    } catch (e: any) { setError(e?.message ?? "Load failed"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { loadList(); }, [loadList]);

  async function open(account: string) {
    setError(null);
    try {
      const r = await fetch(`/api/pmi?account=${encodeURIComponent(account)}`).then((x) => x.json());
      setActive(r.playbook);
      setTasks(r.tasks ?? []);
      setChecklist(r.checklist ?? []);
    } catch (e: any) { setError(e?.message ?? "Load failed"); }
  }

  async function create(useAI: boolean) {
    if (!accountInput.trim()) return;
    setCreating(true); setError(null);
    try {
      const r = await fetch("/api/pmi", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_name: accountInput.trim(), buyer_name: buyerInput.trim() || null, use_ai: useAI }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Create failed");
      setAccountInput(""); setBuyerInput("");
      await loadList();
      await open(accountInput.trim());
    } catch (e: any) { setError(e?.message ?? "Create failed"); }
    finally { setCreating(false); }
  }

  async function bumpProgress(t: Task, delta: number) {
    const np = Math.max(0, Math.min(100, t.progress_pct + delta));
    setTasks((prev) => prev.map((x) => x.id === t.id ? { ...x, progress_pct: np } : x));
    await fetch("/api/pmi/task", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: t.id, progress_pct: np }),
    });
  }

  async function toggleCheck(c: Check) {
    const nd = !c.done;
    setChecklist((prev) => prev.map((x) => x.id === c.id ? { ...x, done: nd } : x));
    await fetch("/api/pmi/checklist", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: c.id, done: nd }),
    });
  }

  const totalWeeks = active?.total_weeks ?? 20;
  const weekHeaders = Array.from({ length: totalWeeks }, (_, i) => i + 1);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900 dark:text-white">
          <Briefcase className="h-6 w-6 text-purple-500" />
          Post-Merger Integration Playbook Studio
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Formulate Joint IMO architectures, draft Day-1 advisory communications, edit workstream progress, and deploy Gantt schedules.
        </p>
      </div>

      {error && <div className="rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">{error}</div>}

      {!active && (
        <>
          <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Create new playbook</h2>
            <div className="grid gap-2 sm:grid-cols-[2fr,2fr,auto,auto]">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input value={accountInput} onChange={(e) => setAccountInput(e.target.value)}
                       placeholder="Target firm" className="w-full rounded border border-slate-300 px-8 py-2 text-sm dark:border-slate-700 dark:bg-slate-800" />
              </div>
              <input value={buyerInput} onChange={(e) => setBuyerInput(e.target.value)}
                     placeholder="Acquirer (optional)" className="rounded border border-slate-300 px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-800" />
              <button onClick={() => create(false)} disabled={!accountInput.trim() || creating}
                      className="rounded border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800 disabled:opacity-50">
                <Plus className="mr-1 inline h-4 w-4" /> Default plan
              </button>
              <button onClick={() => create(true)} disabled={!accountInput.trim() || creating}
                      className="rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white hover:bg-purple-500 disabled:opacity-50">
                {creating ? <Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> : <Plus className="mr-1 inline h-4 w-4" />}
                AI-tailored plan
              </button>
            </div>
            <p className="mt-2 text-[10.5px] italic text-slate-500">Default plan seeds 10 standard tasks + 15 checklist items in 1 second. AI-tailored adapts to sector/geography (~$0.03, 20 sec).</p>
          </section>

          {list.length > 0 && (
            <section>
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Active playbooks ({list.length})</h2>
              <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                {list.map((p) => (
                  <button key={p.id} onClick={() => open(p.account_name)}
                          className="rounded-lg border border-slate-200 bg-white p-3 text-left hover:border-purple-300 dark:border-slate-700 dark:bg-slate-900">
                    <div className="flex items-start justify-between">
                      <span className="text-sm font-bold">{p.account_name}</span>
                      <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                    </div>
                    <p className="text-[10.5px] text-slate-500">
                      {p.buyer_name && `Acquirer: ${p.buyer_name} · `}Week {p.current_week} of {p.total_weeks}
                    </p>
                  </button>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {active && (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold">{active.account_name}</h2>
              <p className="text-[11px] text-slate-500">{active.buyer_name && `Acquirer: ${active.buyer_name} · `}{active.total_weeks}-week integration · {tasks.length} workstream tasks</p>
            </div>
            <button onClick={() => { setActive(null); setTasks([]); setChecklist([]); loadList(); }}
                    className="text-[11px] text-slate-500 hover:text-slate-700 underline">← Back to list</button>
          </div>

          {/* Gantt */}
          <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Interactive Integration Gantt (Weeks 1 - {active.total_weeks})</h2>
              <span className="rounded border border-purple-200 bg-purple-50 px-2 py-0.5 text-[9px] font-bold uppercase text-purple-700 dark:border-purple-900 dark:bg-purple-950/30 dark:text-purple-400">Active IMO Track</span>
            </div>
            <p className="mb-3 text-[10.5px] text-slate-500">Edit task completion directly on current workstream bars.</p>

            <div className="overflow-x-auto">
              <div style={{ minWidth: 800 }}>
                {/* Header */}
                <div className="grid gap-1 border-b border-slate-200 pb-1 text-[9.5px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-700"
                     style={{ gridTemplateColumns: `2fr 60px 50px 80px repeat(${totalWeeks}, 1fr)` }}>
                  <span>Active Transition Activity</span>
                  <span className="text-center">WS</span>
                  <span className="text-center">Prog</span>
                  <span className="text-center">±</span>
                  {weekHeaders.map((w) => <span key={w} className="text-center">{w}</span>)}
                </div>

                {tasks.map((t) => {
                  const start = t.start_week - 1;
                  const span = t.end_week - t.start_week + 1;
                  const wsColor = WS_COLORS[t.workstream] ?? "bg-slate-500/70";
                  return (
                    <div key={t.id} className="grid gap-1 border-b border-slate-100 py-2 text-[11px] hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/30"
                         style={{ gridTemplateColumns: `2fr 60px 50px 80px repeat(${totalWeeks}, 1fr)` }}>
                      <div>
                        <div className="font-medium text-slate-900 dark:text-white">{t.title}</div>
                        <div className="text-[9.5px] text-slate-500">Dependency: {t.dependencies?.length ? t.dependencies.join(", ") : "None"}</div>
                      </div>
                      <div className="text-center">
                        <span className={`rounded px-1 py-0.5 text-[9px] font-bold uppercase ${wsColor.replace("/70","/30")} text-slate-700 dark:text-slate-100`}>{t.workstream}</span>
                      </div>
                      <div className="text-center font-mono text-[10.5px]">{t.progress_pct}%</div>
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => bumpProgress(t, -10)} className="text-[10px] text-slate-400 hover:text-slate-700">−</button>
                        <button onClick={() => bumpProgress(t, +10)} className="text-[10px] text-slate-400 hover:text-slate-700">+</button>
                      </div>
                      {/* Bars */}
                      <div className="relative" style={{ gridColumn: `5 / span ${totalWeeks}`, height: "20px" }}>
                        <div className="absolute inset-y-1 rounded-sm" style={{
                          left: `${(start / totalWeeks) * 100}%`,
                          width: `${(span / totalWeeks) * 100}%`,
                        }}>
                          <div className={`h-full rounded-sm ${wsColor} relative overflow-hidden`}>
                            <div className={`absolute inset-y-0 left-0 ${wsColor.replace("/70","")} opacity-60`}
                                 style={{ width: `${t.progress_pct}%` }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Checklist */}
          <div className="grid gap-4 md:grid-cols-[1fr,2fr]">
            <section className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
              <h2 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                <Layers className="h-3.5 w-3.5" /> Integration Phase Checklist
              </h2>
              <div className="space-y-1">
                {PHASES.map((p) => {
                  const count = checklist.filter((c) => c.phase === p.key).length;
                  const done = checklist.filter((c) => c.phase === p.key && c.done).length;
                  return (
                    <button key={p.key} onClick={() => setPhaseTab(p.key)}
                            className={`flex w-full items-center justify-between rounded p-2 text-left transition ${phaseTab === p.key ? "bg-purple-100 dark:bg-purple-950/40" : "hover:bg-slate-50 dark:hover:bg-slate-800"}`}>
                      <div>
                        <div className={`text-[12px] font-bold ${phaseTab === p.key ? "text-purple-700 dark:text-purple-400" : "text-slate-700 dark:text-slate-300"}`}>{p.label}</div>
                        <div className="text-[10px] text-slate-500">{p.desc}</div>
                      </div>
                      <span className="text-[10px] font-mono text-slate-500">{done}/{count}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">{PHASES.find((p) => p.key === phaseTab)?.label}</h2>
                <span className="text-[9.5px] uppercase tracking-wider text-slate-400">Checklist</span>
              </div>
              <div className="space-y-2">
                {checklist.filter((c) => c.phase === phaseTab).map((c) => (
                  <div key={c.id} className="flex items-start gap-2 rounded border border-slate-100 p-2 text-[12px] dark:border-slate-800">
                    <button onClick={() => toggleCheck(c)} className="mt-0.5 flex-shrink-0">
                      {c.done ? <CheckSquare className="h-4 w-4 text-emerald-600" /> : <Square className="h-4 w-4 text-slate-400" />}
                    </button>
                    <div className="flex-1">
                      <div className={`font-medium ${c.done ? "line-through text-slate-400" : "text-slate-900 dark:text-white"}`}>{c.title}</div>
                      {c.owner_role && <div className="text-[10px] text-slate-500">Owner: {c.owner_role}</div>}
                    </div>
                  </div>
                ))}
                {checklist.filter((c) => c.phase === phaseTab).length === 0 && (
                  <p className="text-[11px] italic text-slate-500">No checklist items in this phase yet.</p>
                )}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
