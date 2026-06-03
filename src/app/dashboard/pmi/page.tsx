



"use client";

import { useState, useEffect, useMemo } from "react";
import { saveDealContext, loadDealContext, saveOutput, loadOutput, clearOutput, resetIfNewDeal } from "@/lib/dealContext";
import { Layers, Loader2, Copy, Printer, CheckCircle2, Sparkles, History, Trash2, Download, ChevronDown, ChevronUp, CheckSquare, Square, BarChart3, Plus, X } from "lucide-react";
import { generatePmiProposal, type PmiInput } from "@/lib/intelligence/pmi-engine";
import { renderVisualProposal } from "@/lib/proposal/visual-renderer";
import { openMbbPrintWindow } from "@/lib/proposal/mbb-print";
import AIGenerateConfirm from "@/components/AIGenerateConfirm";
import CognitionIndicators from "@/components/cognition/CognitionIndicators";
import { createClient } from "@/lib/supabase/client";

const MODES = [
  { id: "narrative",   label: "Narrative Proposal",   desc: "Full board-ready PMI proposal" },
  { id: "slides",      label: "Executive Slides",     desc: "Slide-style structured deck" },
  { id: "workplan",    label: "Workplan Table",       desc: "Function × phase deliverables" },
  { id: "roadmap",     label: "Gantt Roadmap",        desc: "Pre-/Post-Day-1 visual" },
  { id: "steerco",     label: "Steering Committee Pack", desc: "Concise update format" },
];

type HistoryItem = {
  id: string; buyer: string | null; target: string | null;
  sector: string | null; deal_size: string | null;
  tier: string | null; provider: string | null; model: string | null;
  cost_estimate_usd: number | null;
  content: string; created_at: string;
};

// =====================================================================
// v29 Visual Layer — interactive Gantt + checklist
// =====================================================================

type VizTask = { id: string; title: string; workstream: string; start: number; end: number; progress: number; deps: string };
type VizCheck = { id: string; phase: string; title: string; owner: string; done: boolean };
type TimelineUnit = "weeks" | "months";

const WEEKS_PER_MONTH = 4;
const DEFAULT_WORKSTREAMS = ["IMO", "HR", "IT", "Finance", "GTM", "Legal", "Ops"];
const WS_PALETTE = ["bg-purple-500", "bg-rose-500", "bg-cyan-500", "bg-amber-500", "bg-blue-500", "bg-pink-500", "bg-emerald-500", "bg-indigo-500", "bg-teal-500"];

const DEFAULT_TASKS: VizTask[] = [
  { id: "t1", title: "Joint Integration IMO Setup",          workstream: "IMO",     start: 1, end: 4,  progress: 90,  deps: "None" },
  { id: "t2", title: "Day 1 Communications & Announcement",  workstream: "IMO",     start: 1, end: 2,  progress: 100, deps: "None" },
  { id: "t3", title: "HR Payroll Migration & Comp Alignment",workstream: "HR",      start: 3, end: 8,  progress: 40,  deps: "IMO Setup" },
  { id: "t4", title: "IT Stack Audit & Network Bridging",    workstream: "IT",      start: 2, end: 7,  progress: 25,  deps: "IMO Setup" },
  { id: "t5", title: "Financial Reporting Consolidation",    workstream: "Finance", start: 5, end: 12, progress: 15,  deps: "HR Payroll Migration" },
  { id: "t6", title: "GTM Channel Launch & Sales Pairing",   workstream: "GTM",     start: 8, end: 16, progress: 0,   deps: "HR Payroll Migration" },
  { id: "t7", title: "ERP Systems & Cloud Stack Cutover",    workstream: "IT",      start: 10, end: 20,progress: 0,   deps: "IT Stack Audit, Financial Reporting" },
];

const DEFAULT_CHECK: VizCheck[] = [
  { id: "c1", phase: "pre_close", title: "Regulatory antitrust approvals secured", owner: "Legal Counsel", done: false },
  { id: "c2", phase: "pre_close", title: "SLA approvals and antitrust checks",     owner: "Legal Counsel", done: false },
  { id: "c3", phase: "day_1_core",title: "Synchronize Global Public Announcements", owner: "Communications Lead", done: true },
  { id: "c4", phase: "day_1_core",title: "Enforce Technology Code & Database Freeze", owner: "IT & Engineering Lead", done: true },
  { id: "c5", phase: "day_1_core",title: "Corporate notifications and tech freezes", owner: "CFO", done: false },
  { id: "c6", phase: "day_30",    title: "Payroll cutover verified, zero errors",  owner: "HR Lead", done: false },
  { id: "c7", phase: "day_100",   title: "Financial reporting on single ERP",      owner: "CFO", done: false },
];

const PHASES = [
  { key: "pre_close",  label: "Pre-Close / Day 0", desc: "SLA approvals and antitrust checks" },
  { key: "day_1_core", label: "Day 1 Core",        desc: "Corporate notifications and tech freezes" },
  { key: "day_30",     label: "Day 30 Stabilization", desc: "Cutover verification" },
  { key: "day_100",    label: "Day 100 Integration", desc: "Operational consolidation" },
  { key: "post_close", label: "Post-Close",        desc: "Synergy review and lessons learned" },
];

let __ganttUid = 0;
const nextId = (p: string) => `${p}-${Date.now()}-${__ganttUid++}`;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function PMIVisuals({ buyer, target, sector, geography, dealSize }: { buyer: string; target: string; sector: string; geography: string; dealSize: string }) {
  const [collapsed, setCollapsed] = useState(false);
  const [unit, setUnit] = useState<TimelineUnit>("weeks");
  const [periods, setPeriods] = useState(20);
  const [tasks, setTasks] = useState<VizTask[]>(DEFAULT_TASKS);
  const [check, setCheck] = useState<VizCheck[]>(DEFAULT_CHECK);
  const [workstreams, setWorkstreams] = useState<string[]>(DEFAULT_WORKSTREAMS);
  const [newWs, setNewWs] = useState("");
  const [phaseTab, setPhaseTab] = useState("day_1_core");
  const [copied, setCopied] = useState(false);
  const [pptBusy, setPptBusy] = useState(false);

  const unitLabel = unit === "weeks" ? "Wk" : "Mo";
  const wsColor = (ws: string) => WS_PALETTE[Math.max(0, workstreams.indexOf(ws)) % WS_PALETTE.length];

  function switchUnit(next: TimelineUnit) {
    if (next === unit) return;
    const conv = (v: number) => next === "months" ? Math.max(1, Math.round(v / WEEKS_PER_MONTH)) : v * WEEKS_PER_MONTH;
    setTasks((prev) => prev.map((t) => {
      const s = conv(t.start);
      return { ...t, start: s, end: Math.max(s, conv(t.end)) };
    }));
    setPeriods((p) => Math.max(1, conv(p)));
    setUnit(next);
  }

  function updateTask(id: string, patch: Partial<VizTask>) {
    setTasks((prev) => prev.map((t) => t.id === id ? { ...t, ...patch } : t));
  }
  function addTask() {
    setTasks((prev) => [...prev, { id: nextId("t"), title: "New activity", workstream: workstreams[0] ?? "IMO", start: 1, end: Math.min(periods, unit === "weeks" ? 4 : 1), progress: 0, deps: "None" }]);
  }
  const removeTask = (id: string) => setTasks((prev) => prev.filter((t) => t.id !== id));

  function addWorkstream() {
    const name = newWs.trim();
    if (!name || workstreams.includes(name)) return;
    setWorkstreams((prev) => [...prev, name]);
    setNewWs("");
  }
  function removeWorkstream(ws: string) {
    if (tasks.some((t) => t.workstream === ws)) return; // keep workstreams that are in use
    setWorkstreams((prev) => prev.filter((w) => w !== ws));
  }

  const updateCheck = (id: string, patch: Partial<VizCheck>) => setCheck((prev) => prev.map((c) => c.id === id ? { ...c, ...patch } : c));
  const addCheck = () => setCheck((prev) => [...prev, { id: nextId("c"), phase: phaseTab, title: "New checklist item", owner: "", done: false }]);
  const removeCheck = (id: string) => setCheck((prev) => prev.filter((c) => c.id !== id));

  const periodHeaders = Array.from({ length: periods }, (_, i) => i + 1);
  const phaseFiltered = useMemo(() => check.filter((c) => c.phase === phaseTab), [check, phaseTab]);

  function buildGanttMarkdown(): string {
    const L: string[] = [];
    const who = (buyer || target) ? ` — ${buyer || "Buyer"} → ${target || "Target"}` : "";
    L.push(`# Interactive Integration Gantt${who}`, "");
    L.push(`**Timeline:** ${periods} ${unit}${sector ? ` · Sector: ${sector}` : ""}${dealSize ? ` · ${dealSize}` : ""}`, "");
    L.push(`**Workstreams:** ${workstreams.join(" · ")}`, "");
    L.push("## Editable Gantt Activities", "");
    L.push("| Activity | Workstream | Start | End | Progress | Dependencies |");
    L.push("| --- | --- | --- | --- | --- | --- |");
    for (const t of tasks) L.push(`| ${t.title} | ${t.workstream} | ${unitLabel} ${t.start} | ${unitLabel} ${t.end} | ${t.progress}% | ${t.deps || "None"} |`);
    return L.join("\n");
  }

  function copyPlan() { navigator.clipboard.writeText(buildGanttMarkdown()); setCopied(true); setTimeout(() => setCopied(false), 2000); }
  function printPlan() { openMbbPrintWindow({ contentMarkdown: buildGanttMarkdown(), meta: { moduleLabel: "Interactive Integration Gantt", buyer, target, sector, geography, dealSize } }); }
  async function pptPlan() {
    setPptBusy(true);
    try {
      const { exportProposalToPptx } = await import("@/lib/proposal/pptx-exporter");
      await exportProposalToPptx(buildGanttMarkdown(), { buyer, target, sector, geography, dealSize, moduleLabel: "Interactive Integration Gantt" }, undefined, `deal-iq-integration-gantt-${buyer || "buyer"}-${target || "target"}.pptx`);
    } catch (e) {
      alert("PPTX export failed: " + String(e));
    } finally {
      setPptBusy(false);
    }
  }

  return (
    <div className="card mb-4 overflow-hidden">
      <button onClick={() => setCollapsed(!collapsed)}
              className="flex w-full items-center justify-between border-b border-slate-100 px-5 py-3 text-left transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/30">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-purple-500" />
          <span className="text-sm font-semibold text-slate-800 dark:text-white">Integration Gantt &amp; Checklist (Interactive)</span>
          <span className="hidden text-[10.5px] italic text-slate-500 sm:inline">Editable timeline, workstreams, dependencies &amp; checklist · exportable</span>
        </div>
        {collapsed ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronUp className="h-4 w-4 text-slate-400" />}
      </button>

      {!collapsed && (
        <div className="p-5">
          {/* Toolbar: timeline controls + export */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">View by</label>
            <select value={unit} onChange={(e) => switchUnit(e.target.value as TimelineUnit)}
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[12px] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
              <option value="weeks">Weeks</option>
              <option value="months">Months</option>
            </select>
            <label className="ml-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">Duration</label>
            <input type="number" min={1} max={unit === "weeks" ? 104 : 36} value={periods}
                   onChange={(e) => setPeriods(clamp(parseInt(e.target.value || "1", 10) || 1, 1, unit === "weeks" ? 104 : 36))}
                   className="w-16 rounded-lg border border-slate-300 bg-white px-2 py-1 text-[12px] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200" />
            <span className="text-[11px] text-slate-500">{unit}</span>
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

          {/* Workstreams editor */}
          <div className="mb-3 flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-200 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-900">
            <span className="mr-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Workstreams</span>
            {workstreams.map((ws) => (
              <span key={ws} className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold text-white ${wsColor(ws)}`}>
                {ws}
                {!tasks.some((t) => t.workstream === ws) && (
                  <button onClick={() => removeWorkstream(ws)} title="Remove unused workstream" className="opacity-80 hover:opacity-100"><X className="h-2.5 w-2.5" /></button>
                )}
              </span>
            ))}
            <input value={newWs} onChange={(e) => setNewWs(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addWorkstream(); }}
                   placeholder="Add workstream" className="ml-1 w-28 rounded border border-slate-300 px-1.5 py-0.5 text-[10.5px] dark:border-slate-700 dark:bg-slate-800" />
            <button onClick={addWorkstream} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"><Plus className="inline h-2.5 w-2.5" /> Add</button>
          </div>

          {/* Gantt */}
          <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Interactive Integration Gantt ({unitLabel} 1 – {periods})</h3>
              <button onClick={addTask} className="flex items-center gap-1 rounded border border-purple-200 bg-purple-50 px-2 py-0.5 text-[10px] font-bold uppercase text-purple-700 hover:bg-purple-100 dark:border-purple-900 dark:bg-purple-950/30 dark:text-purple-400">
                <Plus className="h-3 w-3" /> Activity
              </button>
            </div>
            <p className="mb-3 text-[10.5px] text-slate-500">Edit each activity — title, workstream, start/end, % complete and dependencies. Bars update live.</p>

            <div className="overflow-x-auto">
              <div style={{ minWidth: 860 }}>
                {/* header */}
                <div className="flex items-end gap-2 border-b border-slate-200 pb-1 dark:border-slate-700">
                  <div style={{ width: 372 }} className="flex-shrink-0 text-[9.5px] font-bold uppercase tracking-wider text-slate-500">Active Transition Activity</div>
                  <div className="flex flex-1">
                    {periodHeaders.map((w) => <div key={w} className="flex-1 text-center text-[9px] text-slate-400">{w}</div>)}
                  </div>
                </div>

                {tasks.map((t) => {
                  const col = wsColor(t.workstream);
                  const left = ((clamp(t.start, 1, periods) - 1) / periods) * 100;
                  const width = ((clamp(t.end, t.start, periods) - clamp(t.start, 1, periods) + 1) / periods) * 100;
                  return (
                    <div key={t.id} className="flex items-center gap-2 border-b border-slate-100 py-2 hover:bg-slate-50/60 dark:border-slate-800 dark:hover:bg-slate-800/30">
                      <div style={{ width: 372 }} className="flex-shrink-0 space-y-1">
                        <input value={t.title} onChange={(e) => updateTask(t.id, { title: e.target.value })}
                               className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-[11px] font-medium text-slate-900 hover:border-slate-200 focus:border-slate-300 dark:text-white dark:hover:border-slate-700" />
                        <div className="flex items-center gap-1">
                          <select value={t.workstream} onChange={(e) => updateTask(t.id, { workstream: e.target.value })}
                                  className="rounded border border-slate-200 px-1 py-0.5 text-[9.5px] dark:border-slate-700 dark:bg-slate-800">
                            {workstreams.map((ws) => <option key={ws} value={ws}>{ws}</option>)}
                          </select>
                          <input type="number" min={1} max={periods} value={t.start} title="Start"
                                 onChange={(e) => { const s = clamp(parseInt(e.target.value || "1", 10) || 1, 1, periods); updateTask(t.id, { start: s, end: Math.max(s, t.end) }); }}
                                 className="w-11 rounded border border-slate-200 px-1 py-0.5 text-[9.5px] dark:border-slate-700 dark:bg-slate-800" />
                          <span className="text-[9px] text-slate-400">→</span>
                          <input type="number" min={t.start} max={periods} value={t.end} title="End"
                                 onChange={(e) => updateTask(t.id, { end: clamp(parseInt(e.target.value || "1", 10) || 1, t.start, periods) })}
                                 className="w-11 rounded border border-slate-200 px-1 py-0.5 text-[9.5px] dark:border-slate-700 dark:bg-slate-800" />
                          <input type="number" min={0} max={100} value={t.progress} title="% complete"
                                 onChange={(e) => updateTask(t.id, { progress: clamp(parseInt(e.target.value || "0", 10) || 0, 0, 100) })}
                                 className="w-12 rounded border border-slate-200 px-1 py-0.5 text-[9.5px] dark:border-slate-700 dark:bg-slate-800" />
                          <span className="text-[9px] text-slate-400">%</span>
                          <button onClick={() => removeTask(t.id)} title="Remove activity" className="ml-auto text-slate-300 hover:text-rose-500"><Trash2 className="h-3 w-3" /></button>
                        </div>
                        <input value={t.deps} onChange={(e) => updateTask(t.id, { deps: e.target.value })} placeholder="Dependencies (comma-separated)"
                               className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-[9.5px] text-slate-500 hover:border-slate-200 focus:border-slate-300 dark:hover:border-slate-700" />
                      </div>
                      <div className="relative flex-1" style={{ height: 22 }}>
                        {periodHeaders.map((w) => (
                          <div key={w} className="absolute inset-y-0 border-l border-slate-100 dark:border-slate-800/60" style={{ left: `${((w - 1) / periods) * 100}%` }} />
                        ))}
                        <div className="absolute inset-y-1 rounded-sm" style={{ left: `${left}%`, width: `${width}%` }} title={`${t.title}: ${unitLabel} ${t.start}–${t.end} · ${t.progress}%`}>
                          <div className={`h-full rounded-sm ${col}/40 relative overflow-hidden`}>
                            <div className={`absolute inset-y-0 left-0 ${col} opacity-80`} style={{ width: `${t.progress}%` }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {tasks.length === 0 && <p className="py-4 text-center text-[11px] italic text-slate-500">No activities. Click “+ Activity” to add one.</p>}
              </div>
            </div>
          </div>

          {/* Checklist */}
          <div className="mt-4 grid gap-4 md:grid-cols-[1fr,2fr]">
            <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Integration Phase Checklist</h3>
              <div className="space-y-1">
                {PHASES.map((p) => {
                  const count = check.filter((c) => c.phase === p.key).length;
                  const done = check.filter((c) => c.phase === p.key && c.done).length;
                  return (
                    <button key={p.key} onClick={() => setPhaseTab(p.key)}
                            className={`flex w-full items-center justify-between rounded p-2 text-left transition ${phaseTab === p.key ? "bg-purple-100 dark:bg-purple-950/40" : "hover:bg-slate-50 dark:hover:bg-slate-800"}`}>
                      <div>
                        <div className={`text-[12px] font-bold ${phaseTab === p.key ? "text-purple-700 dark:text-purple-400" : "text-slate-700 dark:text-slate-300"}`}>{p.label}</div>
                        <div className="text-[10px] text-slate-500">{p.desc}</div>
                      </div>
                      <span className="font-mono text-[10px] text-slate-500">{done}/{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">{PHASES.find((p) => p.key === phaseTab)?.label}</h3>
                <button onClick={addCheck} className="flex items-center gap-1 rounded border border-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"><Plus className="h-3 w-3" /> Item</button>
              </div>
              <div className="space-y-2">
                {phaseFiltered.length === 0 ? (
                  <p className="text-[11px] italic text-slate-500">No checklist items in this phase yet — click “+ Item” to add one.</p>
                ) : phaseFiltered.map((c) => (
                  <div key={c.id} className="flex items-start gap-2 rounded border border-slate-100 p-2 dark:border-slate-800">
                    <button onClick={() => updateCheck(c.id, { done: !c.done })} className="mt-1 flex-shrink-0">
                      {c.done ? <CheckSquare className="h-4 w-4 text-emerald-600" /> : <Square className="h-4 w-4 text-slate-400" />}
                    </button>
                    <div className="flex-1 space-y-1">
                      <input value={c.title} onChange={(e) => updateCheck(c.id, { title: e.target.value })}
                             className={`w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-[12px] font-medium hover:border-slate-200 focus:border-slate-300 dark:hover:border-slate-700 ${c.done ? "text-slate-400 line-through" : "text-slate-900 dark:text-white"}`} />
                      <input value={c.owner} onChange={(e) => updateCheck(c.id, { owner: e.target.value })} placeholder="Owner"
                             className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-[10px] text-slate-500 hover:border-slate-200 focus:border-slate-300 dark:hover:border-slate-700" />
                    </div>
                    <button onClick={() => removeCheck(c.id)} title="Remove item" className="mt-1 text-slate-300 hover:text-rose-500"><Trash2 className="h-3 w-3" /></button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =====================================================================
// Main page — your original implementation
// =====================================================================

export default function PmiStudioPage() {
  const [buyer, setBuyer] = useState("");
  const [target, setTarget] = useState("");
  const [sector, setSector] = useState("");
  const [geography, setGeography] = useState("");
  const [dealSize, setDealSize] = useState("");
  const [dealId, setDealId] = useState<string>("");
  const [synergyAmbition, setSynergyAmbition] = useState<"low" | "medium" | "high">("medium");
  const [mandateType, setMandateType] = useState<string>("buy_side");
  const [buyerTypeF, setBuyerTypeF] = useState<string>("strategic");
  const [ownershipType, setOwnershipType] = useState<string>("majority");
  const [integrationStyle, setIntegrationStyle] = useState<string>("functional");
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
  const [pptExporting, setPptExporting] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [premiumTier, setPremiumTier] = useState<{ provider: string | null; model: string | null; hasKey: boolean }>({ provider: null, model: null, hasKey: false });
  const [economicTier, setEconomicTier] = useState<{ provider: string | null; model: string | null; hasKey: boolean }>({ provider: null, model: null, hasKey: false });

  const sb = createClient();
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // 1) Load tier settings + history
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

  // 2) Read URL params + sessionStorage fallback (mount-only)
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
    const cached = loadOutput("pmi");
    if (cached) setContent(cached);
  }, []);

  // 3) Save context whenever any field changes
  useEffect(() => {
    saveDealContext({ buyer, target, sector, geography, deal_size: dealSize, deal_id: dealId });
  }, [buyer, target, sector, geography, dealSize, dealId]);

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

  function generateOffline() {
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
    saveOutput("pmi", result);
    setGenerating(false);
  }

  function startAIGenerate() {
    if (!buyer || !target) return;
    setConfirmOpen(true);
  }

  async function generate(tier: "premium" | "economic" | "offline", modelOverride?: string) {
    setConfirmOpen(false);
    if (tier === "offline") { generateOffline(); return; }
    if (!buyer || !target) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/ai/pmi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyer, target, sector, geography,
          deal_id: dealId || undefined,
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
        saveOutput("pmi", j.content);
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

  async function downloadPptx() {
    if (!content) return;
    setPptExporting(true);
    try {
      const { exportProposalToPptx } = await import("@/lib/proposal/pptx-exporter");
      await exportProposalToPptx(content, { buyer, target, sector, geography, dealSize, moduleLabel: "PMI Playbook" }, undefined, `deal-iq-pmi-${buyer || "buyer"}-${target || "target"}.pptx`);
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
        moduleLabel: "PMI Playbook",
        buyer,
        target,
        sector,
        geography,
        dealSize,
      },
    });
  }

  return (
    <>
      <AIGenerateConfirm
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={generate}
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

            <div>
              <label className="text-xs text-slate-500">Mandate Type</label>
              <select value={mandateType} onChange={(e) => setMandateType(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white">
                <option value="buy_side">Buy-side</option>
                <option value="sell_side">Sell-side</option>
                <option value="pmi_only">PMI only</option>
                <option value="carve_out">Carve-out</option>
                <option value="synergy_capture">Synergy capture</option>
                <option value="value_creation">Value creation</option>
                <option value="distressed">Distressed</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-slate-500">Buyer Type</label>
              <select value={buyerTypeF} onChange={(e) => setBuyerTypeF(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white">
                <option value="strategic">Strategic</option>
                <option value="pe">PE sponsor</option>
                <option value="family_office">Family office</option>
                <option value="sovereign">Sovereign / infra</option>
                <option value="founder">Founder buyer</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-slate-500">Ownership</label>
              <select value={ownershipType} onChange={(e) => setOwnershipType(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white">
                <option value="minority">Minority</option>
                <option value="majority">Majority</option>
                <option value="full">Full (100%)</option>
                <option value="jv">Joint venture</option>
                <option value="merger">Merger of equals</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-slate-500">Integration Style</label>
              <select value={integrationStyle} onChange={(e) => setIntegrationStyle(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white">
                <option value="light_touch">Light touch</option>
                <option value="controlled_autonomy">Controlled autonomy</option>
                <option value="functional">Functional integration</option>
                <option value="full_absorption">Full absorption</option>
                <option value="standalone_holdco">Standalone holdco</option>
              </select>
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
              <button onClick={startAIGenerate} disabled={generating || !buyer || !target}
                className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
                {generating ? <Loader2 className="h-4 w-4 animate-spin"/> : <Sparkles className="h-4 w-4"/>}
                Generate with AI ✦
              </button>
              <button onClick={generateOffline} disabled={generating || !buyer || !target}
                className="flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 disabled:opacity-40">
                Quick (Offline)
              </button>
            </div>
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto bg-slate-50 p-6 dark:bg-[#0a0a14]">
  {/* v29 Visual Layer — Gantt + checklist above AI output */}
  <PMIVisuals buyer={buyer} target={target} sector={sector} geography={geography} dealSize={dealSize} />

  <CognitionIndicators
    dealId={dealId || null}
    workspaceId={null}
    keyPrefix="pmi,tsa,synergy"
    limit={5}
  />

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
                  <button onClick={downloadPptx} disabled={pptExporting} className="flex items-center gap-1 rounded border border-slate-200 px-3 py-1.5 text-xs disabled:opacity-50">
                    {pptExporting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />} PPTX
                  </button>
                  <button onClick={() => { setContent(null); clearOutput("pmi"); }}
                    className="flex items-center gap-1 rounded-lg border border-red-100 bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-400">
                    <Trash2 className="h-3 w-3" /> Clear
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
