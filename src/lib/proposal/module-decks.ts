/**
 * Deal IQ AI — Module consulting decks (PMI / Synergy / TSA).
 *
 * Produces Big4-grade PPTX decks DIRECTLY from each module's STRUCTURED
 * interactive model (synergy numbers, integration Gantt/checklist, TSA service
 * catalog) — not from parsed prose. Because the input is structured, every
 * chart, table and callout is exact and the deck is consistently 10/10.
 *
 * Reuses the shared consulting design system (`deck-tokens`, `deck-templates`,
 * `deck-quality`) so these decks match the proposal decks pixel-for-pixel.
 *
 * Architecture note: these builders consume INTERACTIVE model state only. They
 * never read or embed the AI-generated proposal narrative — the two export
 * surfaces stay strictly separate.
 */

import pptxgen from "pptxgenjs";
import * as TPL from "@/lib/proposal/deck-templates";

export interface DeckMeta {
  buyer: string;
  target: string;
  sector?: string;
  geography?: string;
  dealSize?: string;
  clientName?: string;
}

// ---------------------------------------------------------------------------
// Shared deck scaffolding
// ---------------------------------------------------------------------------
function newDeck(meta: DeckMeta, title: string): pptxgen {
  const pres = new pptxgen();
  pres.defineLayout({ name: "DECK_16x9", width: 10.0, height: 5.625 });
  pres.layout = "DECK_16x9";
  pres.title = `${meta.buyer} → ${meta.target} — ${title}`;
  pres.author = meta.clientName || "Deal IQ AI";
  pres.company = "Deal IQ AI";
  pres.subject = "Consulting-grade module deck";
  return pres;
}

function coverFor(meta: DeckMeta, docLabel: string, metrics: TPL.MetricCallout[]): TPL.CoverContent {
  return {
    docLabel,
    buyer: meta.buyer || "Buyer",
    target: meta.target,
    subtitle: [meta.sector, meta.geography, meta.dealSize].filter(Boolean).join("  ·  "),
    metrics: metrics.slice(0, 3),
    preparedBy: `Prepared by ${meta.clientName || "Deal IQ AI"}  ·  ${new Date().toLocaleDateString(undefined, { year: "numeric", month: "long" })}  ·  Confidential`,
  };
}

function slug(s: string): string {
  return (s || "deal").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

function fmtMoney(n: number, sym: string, unit: string): string {
  return `${sym}${(Math.round(n * 10) / 10).toFixed(1)}${unit}`;
}

// ===========================================================================
// SYNERGY — value-creation model deck
// ===========================================================================
export interface SynergyDeckInput {
  meta: DeckMeta;
  currencySymbol: string;
  currencyUnit: string;
  totalCostRR: number;
  totalRevRR: number;
  npv: number;
  npvAfterCosts: number;
  oneTimeCost: number;
  waccPct: number;
  yearCurve: { year: string; cost: number; revenue: number; total: number; cumulative: number }[];
  costInitiatives: { label: string; value: number; method: string }[];
  revInitiatives: { label: string; value: number; method: string }[];
}

export async function exportSynergyConsultingDeck(input: SynergyDeckInput, filename?: string): Promise<void> {
  const { meta, currencySymbol: sym, currencyUnit: unit } = input;
  const m = (n: number) => fmtMoney(n, sym, unit);
  const netRR = input.totalCostRR + input.totalRevRR;
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
  const paybackMo = paybackMonths(input.yearCurve, input.oneTimeCost);

  const pres = newDeck(meta, "Synergy Model");

  TPL.renderCoverSlide(pres, coverFor(meta, "Synergy & Value-Creation Model", [
    { value: m(netRR), label: "Run-rate Synergy", sub: "Cost + Revenue" },
    { value: m(input.npvAfterCosts), label: "NPV", sub: `${input.waccPct}% discount` },
    { value: paybackMo ? `${paybackMo} mo` : "—", label: "Payback" },
  ]));

  // Value summary — metric callouts
  TPL.renderGenericContentSlide(pres, {
    sectionLabel: "Value Creation",
    title: `${m(netRR)} run-rate synergy — ${pct(input.totalCostRR, netRR)} cost, ${pct(input.totalRevRR, netRR)} revenue`,
    metrics: [
      { value: m(input.totalCostRR), label: "Cost Synergy", sub: "Annual run-rate" },
      { value: m(input.totalRevRR), label: "Revenue Synergy", sub: "Annual run-rate" },
      { value: m(input.npvAfterCosts), label: "NPV after cost", sub: `${input.waccPct}% WACC` },
      { value: m(input.oneTimeCost), label: "One-time cost", sub: "Integration" },
    ],
    footnote: `Net run-rate synergy of ${m(netRR)} against ${m(input.oneTimeCost)} one-time integration investment.`,
  });

  // Synergy table + native phased chart
  const years = input.yearCurve.map((y) => y.year.replace(/year\s*/i, "Y").trim());
  TPL.renderSynergyTableChartSlide(pres, {
    sectionLabel: "Synergy Model",
    title: `${m(netRR)} run-rate synergy phased to Year ${input.yearCurve.length}`,
    rows: [
      ["Type", ...years],
      ["Revenue Synergy", ...input.yearCurve.map((y) => m(y.revenue))],
      ["Cost Synergy", ...input.yearCurve.map((y) => m(y.cost))],
      ["Total Realized", ...input.yearCurve.map((y) => m(y.total))],
    ],
    rowKinds: ["revenue", "cost", "net"],
    kpis: [
      { value: m(input.npvAfterCosts), label: "NPV", sub: `${input.waccPct}% disc.` },
      { value: m(netRR), label: "Run-rate", sub: "Steady state" },
      { value: paybackMo ? `${paybackMo} mo` : "—", label: "Break-even" },
    ],
    chart: {
      years,
      revenue: input.yearCurve.map((y) => Math.round(y.revenue * 10) / 10),
      cost: input.yearCurve.map((y) => Math.round(y.cost * 10) / 10),
    },
    footnote: "Phased realization of cost and revenue synergies against the integration curve.",
  });

  // Cost initiatives table
  if (input.costInitiatives.length) {
    TPL.renderGenericContentSlide(pres, {
      sectionLabel: "Cost Synergies",
      title: `${m(input.totalCostRR)} of cost synergy across ${input.costInitiatives.length} initiatives`,
      table: [
        ["Initiative", "Run-rate", "Methodology"],
        ...input.costInitiatives.filter((i) => i.value > 0).map((i) => [i.label, m(i.value), i.method]),
      ],
    });
  }

  // Revenue initiatives table
  if (input.revInitiatives.length) {
    TPL.renderGenericContentSlide(pres, {
      sectionLabel: "Revenue Synergies",
      title: `${m(input.totalRevRR)} of revenue synergy across ${input.revInitiatives.length} initiatives`,
      table: [
        ["Initiative", "Run-rate", "Methodology"],
        ...input.revInitiatives.filter((i) => i.value > 0).map((i) => [i.label, m(i.value), i.method]),
      ],
    });
  }

  // Realization curve table
  TPL.renderGenericContentSlide(pres, {
    sectionLabel: "Realization Curve",
    title: `Cumulative value reaches ${m(input.yearCurve[input.yearCurve.length - 1]?.cumulative ?? 0)} by Year ${input.yearCurve.length}`,
    table: [
      ["Year", "Cost", "Revenue", "Total", "Cumulative"],
      ...input.yearCurve.map((y) => [y.year, m(y.cost), m(y.revenue), m(y.total), m(y.cumulative)]),
    ],
    footnote: `Discounted at ${input.waccPct}% WACC; five-year NPV after one-time costs of ${m(input.npvAfterCosts)}.`,
  });

  TPL.renderRecommendationSlide(pres, {
    sectionLabel: "Value Creation Verdict",
    verdict: netRR > input.oneTimeCost ? "Value-accretive" : "Marginal",
    confidence: undefined,
    justification: `The integration unlocks ${m(netRR)} of annual run-rate synergy — ${pct(input.totalCostRR, netRR)} from cost and ${pct(input.totalRevRR, netRR)} from revenue — for ${m(input.oneTimeCost)} of one-time investment, delivering ${m(input.npvAfterCosts)} of NPV.`,
    nextSteps: [
      "Validate cost initiatives with functional owners",
      "Pressure-test revenue synergies against the commercial plan",
      "Lock the realization curve into the 100-day plan",
      "Establish a synergy tracking and governance cadence",
    ],
    valueRange: `${m(input.npvAfterCosts)} NPV  ·  ${paybackMo ? paybackMo + "-month" : "—"} payback`,
  });

  await pres.writeFile({ fileName: filename || `deal-iq-synergy-deck-${slug(meta.buyer)}-${slug(meta.target)}.pptx` });
}

function paybackMonths(curve: { cumulative: number }[], oneTime: number): number | null {
  if (oneTime <= 0) return 0;
  for (let i = 0; i < curve.length; i++) {
    if (curve[i].cumulative >= oneTime) {
      const prev = i === 0 ? 0 : curve[i - 1].cumulative;
      const gained = curve[i].cumulative - prev;
      const frac = gained > 0 ? (oneTime - prev) / gained : 0;
      return Math.max(1, Math.round((i + frac) * 12));
    }
  }
  return null;
}

// ===========================================================================
// PMI — integration playbook deck
// ===========================================================================
export interface PmiTask { title: string; workstream: string; start: number; end: number; progress: number; deps: string; }
export interface PmiCheck { phase: string; title: string; owner: string; done: boolean; }
export interface PmiPhase { key: string; label: string; desc: string; }
export interface PmiDeckInput {
  meta: DeckMeta;
  unitLabel: string;       // "Wk" | "Mo"
  periods: number;
  workstreams: string[];
  tasks: PmiTask[];
  checks: PmiCheck[];
  phases: PmiPhase[];
}

export async function exportPmiConsultingDeck(input: PmiDeckInput, filename?: string): Promise<void> {
  const { meta, tasks, checks, phases, workstreams } = input;
  const pres = newDeck(meta, "PMI Playbook");
  const avgProgress = tasks.length ? Math.round(tasks.reduce((a, t) => a + t.progress, 0) / tasks.length) : 0;
  const doneChecks = checks.filter((c) => c.done).length;

  TPL.renderCoverSlide(pres, coverFor(meta, "Post-Merger Integration Playbook", [
    { value: String(workstreams.length), label: "Workstreams" },
    { value: String(tasks.length), label: "Activities", sub: `${avgProgress}% avg progress` },
    { value: `${doneChecks}/${checks.length}`, label: "Day-1 Ready" },
  ]));

  // Integration model — callouts
  TPL.renderGenericContentSlide(pres, {
    sectionLabel: "Integration Model",
    title: `${workstreams.length} workstreams, ${tasks.length} activities across ${phases.length} phases`,
    metrics: [
      { value: String(workstreams.length), label: "Workstreams" },
      { value: String(tasks.length), label: "Activities", sub: `${avgProgress}% complete` },
      { value: String(phases.length), label: "Phases", sub: `${input.periods} ${input.unitLabel === "Wk" ? "weeks" : "months"}` },
      { value: `${doneChecks}/${checks.length}`, label: "Milestones met" },
    ],
    footnote: `Integration governed across ${phases.length} phases over ${input.periods} ${input.unitLabel === "Wk" ? "weeks" : "months"}.`,
  });

  // 100-day timeline from phases + checklist
  const tones: TPL.PhaseContent["tone"][] = ["teal", "navy", "amber"];
  const timelinePhases: TPL.PhaseContent[] = phases.slice(0, 3).map((p, i) => ({
    name: p.label,
    window: p.desc,
    tone: tones[i % 3],
    bullets: checks.filter((c) => c.phase === p.key).slice(0, 4).map((c) => c.title),
  }));
  if (timelinePhases.some((p) => p.bullets.length)) {
    TPL.renderTimelineSlide(pres, {
      sectionLabel: "100-Day Integration Roadmap",
      title: `${phases.length}-phase integration sequenced to Day-100 value capture`,
      phases: timelinePhases,
    });
  }

  // Workstream grid — each workstream + its activities
  const wsCards: TPL.WorkstreamCard[] = workstreams.slice(0, 9).map((ws) => {
    const wsTasks = tasks.filter((t) => t.workstream === ws);
    const prog = wsTasks.length ? Math.round(wsTasks.reduce((a, t) => a + t.progress, 0) / wsTasks.length) : 0;
    const lead = wsTasks[0]?.title ?? "Workstream activities in planning";
    return { title: ws, body: `${wsTasks.length} activities · ${prog}% complete. ${lead}.` };
  });
  if (wsCards.length >= 3) {
    TPL.renderFunctionGridSlide(pres, {
      sectionLabel: "Integration Workstreams",
      title: `${workstreams.length} workstreams driving Day-100 outcomes`,
      cards: wsCards,
    });
  }

  // Gantt activity table
  if (tasks.length) {
    TPL.renderGenericContentSlide(pres, {
      sectionLabel: "Integration Plan",
      title: `${tasks.length} sequenced activities with ownership and dependencies`,
      table: [
        ["Activity", "Workstream", "Start", "End", "Progress"],
        ...tasks.slice(0, 7).map((t) => [t.title, t.workstream, `${input.unitLabel} ${t.start}`, `${input.unitLabel} ${t.end}`, `${t.progress}%`]),
      ],
      footnote: tasks.length > 7 ? `Showing 7 of ${tasks.length} activities; full plan in the interactive Gantt.` : undefined,
    });
  }

  // Day-1 readiness checklist
  if (checks.length) {
    TPL.renderGenericContentSlide(pres, {
      sectionLabel: "Day-1 Readiness",
      title: `${doneChecks} of ${checks.length} Day-1 milestones confirmed`,
      table: [
        ["Milestone", "Phase", "Owner", "Status"],
        ...checks.slice(0, 8).map((c) => [
          c.title,
          phases.find((p) => p.key === c.phase)?.label ?? c.phase,
          c.owner || "—",
          c.done ? "Complete" : "Open",
        ]),
      ],
    });
  }

  TPL.renderRecommendationSlide(pres, {
    sectionLabel: "Integration Verdict",
    verdict: "Execute",
    justification: `A ${phases.length}-phase integration across ${workstreams.length} workstreams and ${tasks.length} activities, governed to Day-100. ${doneChecks} of ${checks.length} Day-1 milestones already confirmed.`,
    nextSteps: [
      "Stand up the IMO and confirm workstream leads",
      "Close open Day-1 milestones before close",
      "Lock the synergy capture plan into the timeline",
      "Establish weekly SteerCo cadence and KPI tracking",
    ],
  });

  await pres.writeFile({ fileName: filename || `deal-iq-pmi-deck-${slug(meta.buyer)}-${slug(meta.target)}.pptx` });
}

// ===========================================================================
// TSA — transition services framework deck
// ===========================================================================
export interface TsaService { category: string; title: string; sla_baseline: string; duration_months: number; monthly_cost_k: number; }
export interface TsaDeckInput {
  meta: DeckMeta;
  currencySymbol: string;
  currencyUnit: string;       // e.g. "k" or "" — formatting unit suffix
  carveTarget?: string;
  adminOverheadPct: number;
  services: TsaService[];
  totals: { directBilled: number; overhead: number; total: number; activeServices: number };
}

export async function exportTsaConsultingDeck(input: TsaDeckInput, filename?: string): Promise<void> {
  const { meta, currencySymbol: sym, currencyUnit: unit, services, totals } = input;
  const m = (n: number) => `${sym}${(Math.round(n * 10) / 10).toLocaleString()}${unit}`;
  const pres = newDeck(meta, "TSA Framework");
  const maxDur = services.reduce((a, s) => Math.max(a, s.duration_months), 0);
  const byFunction = aggregateByCategory(services);

  TPL.renderCoverSlide(pres, coverFor(meta, "Transition Services Framework", [
    { value: m(totals.total), label: "TSA Budget", sub: `${totals.activeServices} services` },
    { value: `${maxDur} mo`, label: "Longest Exit" },
    { value: String(byFunction.length), label: "Functions" },
  ]));

  // Budget callouts
  TPL.renderGenericContentSlide(pres, {
    sectionLabel: "TSA Economics",
    title: `${m(totals.total)} transition budget across ${totals.activeServices} services`,
    metrics: [
      { value: m(totals.total), label: "Total Budget", sub: "Incl. overhead" },
      { value: m(totals.directBilled), label: "Direct Billed", sub: "Service charges" },
      { value: m(totals.overhead), label: "Admin Overhead", sub: `${input.adminOverheadPct}%` },
      { value: String(totals.activeServices), label: "Active Services" },
    ],
    footnote: input.carveTarget ? `Carve-out entity: ${input.carveTarget}.` : undefined,
  });

  // Service catalog table
  TPL.renderGenericContentSlide(pres, {
    sectionLabel: "Service Catalog",
    title: `${services.length} transition services with SLAs and exit durations`,
    table: [
      ["Function", "Service", "SLA Baseline", "Mo", "Line Total"],
      ...services.slice(0, 8).map((s) => [s.category, s.title, s.sla_baseline, String(s.duration_months), m(s.monthly_cost_k * s.duration_months)]),
    ],
    footnote: services.length > 8 ? `Showing 8 of ${services.length} services; full catalog in the interactive view.` : undefined,
  });

  // Cost & duration by function
  TPL.renderGenericContentSlide(pres, {
    sectionLabel: "Cost by Function",
    title: `Transition cost concentrated in ${byFunction[0]?.category ?? "key"} services`,
    table: [
      ["Function", "Services", "Longest Exit", "Total Cost"],
      ...byFunction.map((f) => [f.category, String(f.count), `${f.maxDuration} mo`, m(f.total)]),
    ],
  });

  // Exit timeline — services grouped by exit window
  const exitCards: TPL.WorkstreamCard[] = bucketExit(services).map((b) => ({
    title: b.label,
    body: b.services.length ? b.services.map((s) => s.title).slice(0, 4).join("; ") : "No services in this window.",
  }));
  TPL.renderFunctionGridSlide(pres, {
    sectionLabel: "TSA Exit Roadmap",
    title: `Phased TSA exit over ${maxDur} months to standalone`,
    cards: exitCards,
  });

  TPL.renderRecommendationSlide(pres, {
    sectionLabel: "TSA Verdict",
    verdict: "Standalone-ready",
    justification: `A ${m(totals.total)} transition framework across ${services.length} services exits over ${maxDur} months, enabling clean separation while protecting operational continuity.`,
    nextSteps: [
      "Finalize SLAs and service-level credits with the counterparty",
      "Sequence exits to minimise stranded cost",
      "Stand up TSA governance and monthly billing reconciliation",
      "Build the standalone target operating model per function",
    ],
    valueRange: `${m(totals.total)} budget  ·  ${maxDur}-month exit`,
  });

  await pres.writeFile({ fileName: filename || `deal-iq-tsa-deck-${slug(meta.buyer)}-${slug(meta.target)}.pptx` });
}

function aggregateByCategory(services: TsaService[]): { category: string; count: number; total: number; maxDuration: number }[] {
  const map = new Map<string, { count: number; total: number; maxDuration: number }>();
  for (const s of services) {
    const cur = map.get(s.category) ?? { count: 0, total: 0, maxDuration: 0 };
    cur.count += 1;
    cur.total += s.monthly_cost_k * s.duration_months;
    cur.maxDuration = Math.max(cur.maxDuration, s.duration_months);
    map.set(s.category, cur);
  }
  return Array.from(map.entries())
    .map(([category, v]) => ({ category, ...v }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 7);
}

function bucketExit(services: TsaService[]): { label: string; services: TsaService[] }[] {
  const buckets = [
    { label: "Exit ≤ 3 months", test: (d: number) => d <= 3 },
    { label: "Exit 4–6 months", test: (d: number) => d > 3 && d <= 6 },
    { label: "Exit 7–12 months", test: (d: number) => d > 6 && d <= 12 },
    { label: "Exit > 12 months", test: (d: number) => d > 12 },
  ];
  return buckets
    .map((b) => ({ label: b.label, services: services.filter((s) => b.test(s.duration_months)) }))
    .filter((b) => b.services.length > 0);
}
