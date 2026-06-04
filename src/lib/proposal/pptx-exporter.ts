/**
 * Deal IQ AI — Consulting-grade PPTX exporter (MBB / Big4 standard).
 *
 * PRESENTATION-LAYER ONLY. This module does NOT generate, fetch, or mutate deal
 * content — it receives already-generated markdown (`proposalMd`) and renders it
 * into a consulting-grade deck. The SAME public entry point is used by every
 * caller, for BOTH interactive-state exports and proposal exports; the caller
 * decides which markdown to pass, so the two surfaces never merge here.
 *
 * Upgrade (v30): wall-of-text slides are replaced by a fixed library of ten
 * consulting slide templates (see `deck-templates.ts`). Each content slide is
 * built from a typed object, capped to the Big4 word budget (`deck-quality.ts`),
 * styled from a single design-token system (`deck-tokens.ts`), and guaranteed to
 * carry a native chart / table / callout / timeline / card grid.
 *
 * Public surface (unchanged — callers must not change):
 *   export type DealMeta
 *   export async function exportProposalToPptx(...)
 */

import pptxgen from "pptxgenjs";
import { splitIntoSections, type ProposalSection } from "@/lib/proposal/visual-renderer";
import { classifyHeading, type SectionKind } from "@/lib/proposal/mbb/section-classifier";
import { getStoryline, type StorylineTemplate } from "@/lib/proposal/storyline-templates";
import { fitText, clean, scrubBannedPhrases, validateDeckJSON } from "@/lib/proposal/deck-quality";
import * as TPL from "@/lib/proposal/deck-templates";

export type DealMeta = {
  buyer: string;
  target: string;
  sector?: string;
  geography?: string;
  dealSize?: string;
  clientName?: string;
  moduleLabel?: string;
};

// ---------------------------------------------------------------------------
// Slide-sequence references (the ideal deck per document type). Section routing
// below produces these orders naturally when the source markdown carries the
// matching sections.
// ---------------------------------------------------------------------------
export const ADVISORY_SLIDES = [
  "cover", "verdict_split", "three_pillar", "synergy_table_chart",
  "three_scenario", "conditions_split", "risk_table",
  "timeline_three_phase", "function_grid_3x3", "recommendation_dark",
] as const;

export const PMI_SLIDES = [
  "cover", "integration_model", "functional_table",
  "dependency_table", "timeline_three_phase", "kpi_table",
  "risk_table", "cadence_split",
] as const;

export const SYNERGY_SLIDES = [
  "cover", "verdict_split", "cost_initiatives_table",
  "revenue_initiatives_table", "integration_cost_table",
  "waterfall_chart", "risk_table", "benchmark_split",
] as const;

export const TSA_SLIDES = [
  "cover", "verdict_split", "service_catalog_table",
  "pricing_table", "sla_table", "governance_split",
  "exit_timeline", "knowledge_transfer_split", "risk_table", "checklist_split",
] as const;

type DocType = "advisory" | "synergy" | "pmi" | "tsa" | "interactive";

function resolveDocType(moduleLabel?: string): DocType {
  const m = (moduleLabel ?? "").toLowerCase();
  if (m.includes("interactive")) return "interactive";
  if (m.includes("tsa")) return "tsa";
  if (m.includes("synergy")) return "synergy";
  if (m.includes("pmi") || m.includes("integration gantt") || m.includes("playbook")) return "pmi";
  return "advisory";
}

// ===========================================================================
// Public entry — signature preserved exactly.
// ===========================================================================
export async function exportProposalToPptx(
  proposalMd: string,
  meta: DealMeta,
  citationsMd?: string,
  filename?: string,
  storylineId?: string,
): Promise<void> {
  const pres = new pptxgen();
  pres.defineLayout({ name: "DECK_16x9", width: 10.0, height: 5.625 });
  pres.layout = "DECK_16x9";
  pres.title = `${meta.buyer} → ${meta.target} — ${meta.moduleLabel ?? "Advisory"}`;
  pres.author = meta.clientName || "Deal IQ AI";
  pres.company = "Deal IQ AI";
  pres.subject = "Consulting-grade generated deal document";

  const docType = resolveDocType(meta.moduleLabel);

  // Parse + (optionally) reorder sections — identical content contract as before.
  let sections = splitIntoSections(proposalMd);
  if (storylineId) {
    sections = applyStorylineOrder(sections, getStoryline(storylineId));
  }

  // Build the structured, banned-phrase-free deck model from the markdown.
  const model = buildDeckModel(proposalMd, sections, meta, docType, citationsMd);

  // Quality gate — advisory only; never blocks deck generation.
  const warnings = validateDeckJSON(model.validation, docType);
  if (warnings.length && typeof console !== "undefined") {
    console.warn(`[deck] ${meta.moduleLabel ?? "proposal"} quality notes: ${warnings.join("; ")}`);
  }

  // ---- Render ----
  TPL.renderCoverSlide(pres, model.cover);

  for (const slide of model.slides) {
    renderModelSlide(pres, slide);
  }

  if (model.recommendation) {
    TPL.renderRecommendationSlide(pres, model.recommendation);
  }

  await pres.writeFile({
    fileName: filename ||
      `${slugify(meta.buyer)}-${slugify(meta.target)}-${slugify(meta.moduleLabel ?? "deck")}.pptx`,
  });
}

// ===========================================================================
// Deck model — maps markdown sections to typed template content objects.
// ===========================================================================

type ModelSlide =
  | { t: "verdict"; c: TPL.VerdictContent }
  | { t: "pillar"; c: TPL.ThreePillarContent }
  | { t: "synergy"; c: TPL.SynergyContent }
  | { t: "scenario"; c: TPL.ScenarioContent }
  | { t: "conditions"; c: TPL.ConditionsContent }
  | { t: "risk"; c: TPL.RiskContent }
  | { t: "timeline"; c: TPL.TimelineContent }
  | { t: "workstream"; c: TPL.WorkstreamContent }
  | { t: "scorecard"; c: TPL.ScorecardContent }
  | { t: "generic"; c: TPL.GenericCardContent };

interface DeckModel {
  cover: TPL.CoverContent;
  slides: ModelSlide[];
  recommendation?: TPL.RecommendationContent;
  validation: unknown;
}

function renderModelSlide(pres: pptxgen, s: ModelSlide): void {
  switch (s.t) {
    case "verdict":    return TPL.renderVerdictSplitSlide(pres, s.c);
    case "pillar":     return TPL.renderThreePillarSlide(pres, s.c);
    case "synergy":    return TPL.renderSynergyTableChartSlide(pres, s.c);
    case "scenario":   return TPL.renderThreeScenarioSlide(pres, s.c);
    case "conditions": return TPL.renderConditionsSplitSlide(pres, s.c);
    case "risk":       return TPL.renderRiskTableSlide(pres, s.c);
    case "timeline":   return TPL.renderTimelineSlide(pres, s.c);
    case "workstream": return TPL.renderFunctionGridSlide(pres, s.c);
    case "scorecard":  return TPL.renderScorecardSlide(pres, s.c);
    case "generic":    return TPL.renderGenericContentSlide(pres, s.c);
  }
}

function buildDeckModel(
  proposalMd: string,
  sections: ProposalSection[],
  meta: DealMeta,
  docType: DocType,
  citationsMd?: string,
): DeckModel {
  const sectionLabel = (kind: SectionKind, heading: string) => LABELS[kind] ?? heading.toUpperCase();

  // ---- headline metrics for cover / verdict ----
  // Prefer the clean currency value parsed from the narrative; fall back to the
  // (sanitized) user-entered deal size. Avoids stray markdown like ">" leaking.
  const ev = findEnterpriseValue(proposalMd) || sanitizeValue(meta.dealSize) || undefined;
  const netSyn = findMetric(proposalMd, /net\s+(?:run[-\s]?rate\s+)?synergy[^₹$\d]*([₹$€£]?\s?[\d.,]+\s*[BMK])/i)
    || findMetric(proposalMd, /total\s+value[^₹$\d]*([₹$€£]?\s?[\d.,]+\s*[BMK])/i);
  const verdict = findVerdict(proposalMd);
  const confidence = findMetric(proposalMd, /([\d]{1,3}\s?%)\s*confidence/i)
    || findMetric(proposalMd, /confidence[^\d]*([\d]{1,3}\s?%)/i);

  const coverMetrics: TPL.MetricCallout[] = [];
  if (ev) coverMetrics.push({ value: ev, label: "Enterprise Value" });
  if (netSyn) coverMetrics.push({ value: netSyn, label: "Net Synergy" });
  if (verdict) coverMetrics.push({ value: verdict, label: "Recommendation" });

  const cover: TPL.CoverContent = {
    docLabel: docLabelFor(docType, meta.moduleLabel),
    buyer: meta.buyer,
    target: meta.target,
    subtitle: [meta.sector, meta.geography, ev ? `${ev} EV` : sanitizeValue(meta.dealSize)].filter(Boolean).join("  ·  "),
    metrics: coverMetrics.length ? coverMetrics : [{ value: "—", label: "Engagement", sub: meta.moduleLabel }],
    preparedBy: `Prepared by ${meta.clientName || "Deal IQ AI"}  ·  ${new Date().toLocaleDateString(undefined, { year: "numeric", month: "long" })}  ·  Confidential`,
  };

  const slides: ModelSlide[] = [];
  let recommendation: TPL.RecommendationContent | undefined;
  const validationServices: unknown[] = [];
  let synergyModelMath: unknown;

  for (const sec of sections) {
    const kind = classifyHeading(sec.heading);
    const body = scrubBannedPhrases(sec.body);
    const label = sectionLabel(kind, sec.heading);

    // Sources rendered compactly at the end (kept, not a disclaimer).
    if (kind === "sources") continue;

    if (kind === "recommendation" || kind === "next_steps") {
      recommendation = {
        sectionLabel: label,
        verdict: verdict || titleCase(sec.heading),
        confidence: confidence,
        justification: firstSentences(body, 60),
        nextSteps: extractBullets(body).slice(0, 4),
        valueRange: findValueRange(proposalMd),
      };
      continue;
    }

    if (kind === "exec_summary") {
      slides.push({
        t: "verdict",
        c: {
          sectionLabel: label,
          title: assertTitle(sec.heading, body, kind),
          verdict: verdict || "Assessment",
          confidence,
          justification: firstSentences(body, 60),
          valueRange: findValueRange(proposalMd),
          metrics: pickMetrics(body, ev, netSyn),
          conditions: extractConditions(body, proposalMd).slice(0, 4),
        },
      });
      continue;
    }

    if (kind === "score") {
      const sc = buildScorecard(label, body);
      if (sc) { slides.push({ t: "scorecard", c: sc }); continue; }
    }

    if (kind === "thesis") {
      const pillars = extractPillars(body);
      if (pillars.length >= 2) {
        slides.push({ t: "pillar", c: { sectionLabel: label, title: assertTitle(sec.heading, body, kind, thesisAssertion(pillars, meta)), pillars } });
        continue;
      }
    }

    if (kind === "ic_questions") {
      const qs = extractBullets(body).filter((q) => q.length > 12).slice(0, 6);
      if (qs.length >= 2) {
        slides.push({
          t: "generic",
          c: {
            sectionLabel: label,
            title: `${qs.length} questions the Investment Committee must resolve`,
            cards: qs.map((q, i) => ({ title: `Q${i + 1}`, body: q })),
          },
        });
        continue;
      }
    }

    if (kind === "synergy" || kind === "valuation") {
      const syn = buildSynergyContent(label, sec.heading, body, kind);
      if (syn) {
        slides.push({ t: "synergy", c: syn.content });
        if (docType === "synergy" && !synergyModelMath) synergyModelMath = syn.math;
        continue;
      }
    }

    if (kind === "scenario") {
      const scen = extractScenarios(body);
      if (scen.length >= 2) {
        slides.push({ t: "scenario", c: { sectionLabel: label, title: assertTitle(sec.heading, body, kind, scenarioAssertion(scen, body)), scenarios: scen } });
        continue;
      }
    }

    // Conditions / kill-switches — content-based (heading may classify as
    // generic, e.g. "Conditions & Kill Switches").
    if (kind === "must_be_true" || kind === "governance" ||
        (/kill[-\s]?switch|trigger/i.test(body) && /condition/i.test(body))) {
      const cond = extractConditions(body, body);
      const kills = extractKillSwitches(body);
      if (cond.length && kills.length) {
        const condLabel = LABELS.must_be_true ?? label;
        const condTitle = `Proceed only if all ${cond.length} conditions hold — any trigger stops the deal`;
        slides.push({ t: "conditions", c: { sectionLabel: condLabel, title: condTitle, conditions: cond, killSwitches: kills } });
        continue;
      }
    }

    if (kind === "risk" || kind === "contrarian") {
      const risks = extractRiskRows(body);
      if (risks.length >= 2) {
        slides.push({ t: "risk", c: { sectionLabel: label, title: assertTitle(sec.heading, body, kind, riskAssertion(risks)), risks } });
        continue;
      }
    }

    if (kind === "hundred_day" || kind === "day1" || kind === "integration") {
      const phases = extractPhases(body);
      if (phases.length >= 2) {
        slides.push({ t: "timeline", c: { sectionLabel: label, title: assertTitle(sec.heading, body, kind, timelineAssertion(phases)), phases } });
        continue;
      }
      // an "Integration Workstreams"-style section with functional cards, not phases
      const ws = extractWorkstreams(body);
      if (ws.length >= 3) {
        slides.push({ t: "workstream", c: { sectionLabel: LABELS.workstream ?? label, title: `${ws.length} functional workstreams with Day-100 outcomes`, cards: ws } });
        continue;
      }
    }

    if (kind === "workstream") {
      const cards = extractWorkstreams(body);
      if (cards.length >= 3) {
        slides.push({ t: "workstream", c: { sectionLabel: label, title: `${cards.length} functional workstreams with Day-100 outcomes`, cards } });
        continue;
      }
    }

    // Service catalog for TSA validation count
    if (kind === "tsa" || kind === "services") {
      const tbl = parseMarkdownTable(body);
      if (tbl.length > 1) for (let i = 1; i < tbl.length; i++) validationServices.push({ line: tbl[i][0] });
    }

    // ---- generic fallback (always carries a visual) ----
    slides.push({ t: "generic", c: buildGenericContent(label, sec.heading, body, kind) });
  }

  // Compact sources slide (optional, no disclaimer text).
  if (citationsMd) {
    const cites = parseCitations(citationsMd);
    if (cites.length) {
      slides.push({
        t: "generic",
        c: {
          sectionLabel: "Sources & Citations",
          title: `${cites.length} sources informing this analysis`,
          cards: cites.slice(0, 6).map((c) => ({ title: `[${c.n}]`, body: c.text })),
          footnote: cites.length > 6 ? `+ ${cites.length - 6} further sources on file` : undefined,
        },
      });
    }
  }

  const validation = {
    docType,
    cover,
    slides,
    recommendation,
    services: validationServices,
    synergy_model: synergyModelMath,
  };

  return { cover, slides, recommendation, validation };
}

// ===========================================================================
// Section label map
// ===========================================================================
const LABELS: Partial<Record<SectionKind, string>> = {
  exec_summary: "Executive Summary", thesis: "Deal Thesis", score: "Deal Score",
  synergy: "Synergy Model", valuation: "Valuation", scenario: "Scenario Analysis",
  risk: "Risk Register", regulatory: "Regulatory", must_be_true: "Conditions & Kill Switches",
  contrarian: "Contrarian View", ic_questions: "IC Questions", recommendation: "Recommendation",
  market: "Market", integration: "Integration", day1: "Day 1",
  hundred_day: "100-Day Integration Roadmap", workstream: "Integration Workstreams", governance: "Governance & Cadence",
  why_us: "Why Us", next_steps: "Next Steps", services: "Service Catalog",
  engagement: "Engagement", transaction: "Transaction", tsa: "Transition Services",
  diligence: "Diligence", sources: "Sources",
};

// ===========================================================================
// Markdown extraction helpers
// ===========================================================================

function parseMarkdownTable(md: string): string[][] {
  const rows: string[][] = [];
  for (const raw of md.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("|") && line.endsWith("|")) {
      if (/^\|[\s\-:|]+\|$/.test(line)) continue; // separator
      rows.push(line.slice(1, -1).split("|").map((c) => c.trim()));
    }
  }
  return rows;
}

function stripMd(s: string): string {
  return s
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/\[(\d+)\]/g, "")
    .replace(/^\s*#{1,6}\s+/gm, "")   // heading markers
    .replace(/^\s*[-*]\s+/gm, "")      // list markers
    .replace(/^\s*\d+\.\s+/gm, "")     // ordered markers
    .replace(/\s+/g, " ")              // single-line for inline use
    .trim();
}

function extractBullets(body: string): string[] {
  const out: string[] = [];
  const lines = body.split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    const m = /^(?:[-*]|\d+\.)\s+(.+)$/.exec(line);
    if (m) out.push(stripMd(m[1]));
  }
  if (out.length) return out;
  // fall back to sentences from prose
  return body
    .split(/\n\s*\n/)
    .map((p) => stripMd(p))
    .filter((p) => p && !p.startsWith("|") && !p.startsWith("#"))
    .flatMap((p) => p.split(/(?<=\.)\s+/))
    .map((s) => s.trim())
    .filter((s) => s.length > 8);
}

function extractMetricPairs(body: string): { label: string; value: string }[] {
  const pairs: { label: string; value: string }[] = [];
  for (const m of body.matchAll(/\*\*([^*\n:]{2,40}):\*\*\s*([^\n*]{1,40})/g)) {
    const value = m[2].trim();
    if (/[\d$%₹€£]/.test(value) && value.length < 36) {
      pairs.push({ label: m[1].trim(), value: value.replace(/[.;,]$/, "") });
    }
  }
  return pairs;
}

function pickMetrics(body: string, ev?: string, netSyn?: string): TPL.MetricCallout[] {
  const out: TPL.MetricCallout[] = [];
  const seen = new Set<string>();
  const push = (value: string, label: string, sub?: string) => {
    const k = value + label;
    if (value && !seen.has(k)) { seen.add(k); out.push({ value, label, sub }); }
  };
  if (ev) push(ev, "Enterprise Value");
  if (netSyn) push(netSyn, "Net Synergy", "Run-rate Y3");
  for (const p of extractMetricPairs(body)) {
    if (out.length >= 3) break;
    push(p.value, p.label);
  }
  return out.slice(0, 3);
}

function extractPillars(body: string): TPL.PillarContent[] {
  // Pattern A: ### subheads each with bullets
  const pillars: TPL.PillarContent[] = [];
  const parts = body.split(/^###\s+/m).map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) {
    for (const part of parts.slice(0, 3)) {
      const [head, ...rest] = part.split("\n");
      const bullets = extractBullets(rest.join("\n"));
      pillars.push({ heading: stripMd(head), bullets: bullets.slice(0, 4), kpi: findKpiLine(rest.join("\n")) });
    }
    return pillars;
  }
  // Pattern B: **Heading (optional metric):** body — bold-led paragraphs.
  // Long headings are shortened to a clean label; the parenthetical metric is
  // lifted into the pillar KPI so the column header stays tight.
  const bold = Array.from(body.matchAll(/\*\*\s*([^*\n]{3,90}?)\s*\*\*\s*:?\s*([^\n]*)/g));
  if (bold.length >= 3) {
    for (const m of bold.slice(0, 3)) {
      const rawHead = m[1].trim();
      const label = stripMd(rawHead.replace(/\s*[(:].*$/, "")).trim() || stripMd(rawHead);
      const paren = /\(([^)]*[\d%₹$][^)]*)\)/.exec(rawHead);
      const kpi = paren ? stripMd(paren[1]) : undefined;
      const bulletText = stripMd(m[2]);
      pillars.push({
        heading: label,
        bullets: bulletText ? splitSentences(bulletText).slice(0, 3) : [],
        kpi,
      });
    }
    return pillars;
  }
  return [];
}

function splitSentences(text: string): string[] {
  return text.split(/(?<=[.;])\s+/).map((s) => s.trim()).filter((s) => s.length > 4);
}

/** Build a Deal Score scorecard from a "Dimension | Score | Rationale" table. */
function buildScorecard(label: string, body: string): TPL.ScorecardContent | null {
  const table = parseMarkdownTable(body);
  if (table.length < 2) return null;
  const header = table[0].map((h) => h.toLowerCase());
  const di = header.findIndex((h) => /dimension|category|criteria|area/.test(h));
  const si = header.findIndex((h) => /score|rating|\/\s*10/.test(h));
  const ri = header.findIndex((h) => /rational|comment|note|assessment/.test(h));
  const dIdx = di >= 0 ? di : 0;
  const sIdx = si >= 0 ? si : 1;
  const rIdx = ri >= 0 ? ri : 2;
  const dims: TPL.ScoreDimension[] = [];
  for (let r = 1; r < table.length; r++) {
    const row = table[r];
    const name = stripMd(row[dIdx] || "");
    const scoreNum = parseFloat((row[sIdx] || "").replace(/[^\d.]/g, ""));
    if (!name || !isFinite(scoreNum)) continue;
    dims.push({ name, score: scoreNum, rationale: stripMd(row[rIdx] || "") });
  }
  if (dims.length < 2) return null;
  const composite = findMetric(body, /composite[^\d]*([\d.]+\s*\/\s*10)/i)
    || findMetric(body, /overall[^\d]*([\d.]+\s*\/\s*10)/i)
    || `${(dims.reduce((a, d) => a + d.score, 0) / dims.length).toFixed(1)} / 10`;
  const verdict = findMetric(body, /verdict[:\s]*([A-Za-z][A-Za-z\s/]{2,18})/i)
    || scoreVerdict(parseFloat(composite));
  return {
    sectionLabel: label,
    title: `Composite ${composite.replace(/\s/g, "")} — ${verdict}`,
    composite: composite.replace(/\s+/g, ""),
    verdict,
    dimensions: dims,
  };
}

function scoreVerdict(n: number): string {
  if (!isFinite(n)) return "Assessed";
  if (n >= 8) return "Strong";
  if (n >= 6.5) return "Favourable";
  if (n >= 5) return "Moderate";
  return "Cautious";
}

/** Assertive thesis title from pillar headings. */
function thesisAssertion(pillars: TPL.PillarContent[], meta: DealMeta): string {
  const heads = pillars.map((p) => p.heading).filter(Boolean);
  const tri = heads.filter((h) => /strateg|financ|operat|commercial|market/i.test(h)).slice(0, 3);
  const tgt = meta.target ? ` to acquire ${meta.target}` : "";
  if (tri.length >= 2) {
    const list = tri.length === 3 ? `${tri[0]}, ${tri[1]} and ${tri[2]}` : tri.join(" and ");
    return `The ${list.toLowerCase()} case${tgt}`;
  }
  return `The strategic case${tgt}`;
}

function findKpiLine(body: string): string | undefined {
  const m = /(?:^|\n)\s*(?:[-*]\s*)?\*\*([^*\n]+)\*\*\s*$/m.exec(body);
  if (m && /[\d$%₹]/.test(m[1])) return stripMd(m[1]);
  const pair = extractMetricPairs(body)[0];
  return pair ? `${pair.label}: ${pair.value}` : undefined;
}

function buildSynergyContent(
  label: string, heading: string, body: string, kind: SectionKind,
): { content: TPL.SynergyContent; math: unknown } | null {
  const table = parseMarkdownTable(body);
  // Identify a Year-based synergy table
  const rows = table.length > 1 ? table : [];
  const rowKinds: ("revenue" | "cost" | "integration" | "net" | "plain")[] = [];
  let revY: number[] = [], costY: number[] = [], years: string[] = [];

  if (rows.length) {
    const header = rows[0].map((h) => h.toLowerCase());
    const yearCols = header.map((h, i) => (/year|y\d| y[123]/.test(h) ? i : -1)).filter((i) => i >= 0);
    years = yearCols.length ? yearCols.map((i) => rows[0][i].replace(/year\s*/i, "Y").trim()) : ["Y1", "Y2", "Y3"];

    for (let r = 1; r < rows.length; r++) {
      const first = (rows[r][0] || "").toLowerCase();
      let rk: typeof rowKinds[number] = "plain";
      if (/revenue/.test(first)) rk = "revenue";
      else if (/cost/.test(first) && !/integration/.test(first)) rk = "cost";
      else if (/integration|one[-\s]?time/.test(first)) rk = "integration";
      else if (/net|run[-\s]?rate|total/.test(first)) rk = "net";
      rowKinds.push(rk);
      const vals = (yearCols.length ? yearCols : rows[r].map((_, i) => i).slice(1)).map((i) => parseMoney(rows[r][i]));
      if (rk === "revenue") revY = vals;
      if (rk === "cost") costY = vals;
    }
  }

  // Fall back to inline "$Xrevenue $Ycost $Ztotal" pattern
  if (!revY.length || !costY.length) {
    const m = /([₹$€£]?\s?[\d.,]+\s*[BMK])\s*revenue[^₹$\d]{0,40}([₹$€£]?\s?[\d.,]+\s*[BMK])\s*cost/i.exec(body);
    if (m) {
      const rv = parseMoney(m[1]); const cv = parseMoney(m[2]);
      revY = [rv * 0.2, rv * 0.6, rv]; costY = [cv * 0.2, cv * 0.6, cv]; years = ["Y1", "Y2", "Y3"];
    }
  }

  if (!revY.length && !costY.length && rows.length === 0) return null;

  const r3 = revY[revY.length - 1] || 0;
  const c3 = costY[costY.length - 1] || 0;
  const netY3 = r3 + c3;

  const kpis: TPL.MetricCallout[] = [];
  const npv = findMetric(body, /NPV[^₹$\d]*([₹$€£]?\s?[\d.,]+\s*[BMK])/i);
  const pct = findMetric(body, /([\d.]+\s?%)\s*(?:of\s*ev|synergy\s*\/\s*ev)/i) || findMetric(body, /synergy[^%\d]*([\d.]+\s?%)/i);
  const be = findMetric(body, /(?:break[-\s]?even|payback)[^\d]*([\d]+\s*(?:months?|mo))/i);
  if (npv) kpis.push({ value: npv, label: "NPV", sub: "10% discount" });
  if (pct) kpis.push({ value: pct, label: "Synergy / EV" });
  if (be) kpis.push({ value: be, label: "Break-even" });

  const title = assertTitle(heading, body, kind, netY3 ? `${fmtMoney(netY3)} net run-rate synergy by Year 3` : undefined);

  return {
    content: {
      sectionLabel: label,
      title,
      rows: rows.length ? rows : [["Type", ...years], ["Revenue Synergy", ...revY.map(fmtMoney)], ["Cost Synergy", ...costY.map(fmtMoney)]],
      rowKinds: rows.length ? rowKinds : ["revenue", "cost"],
      kpis,
      chart: { years: years.length ? years : ["Y1", "Y2", "Y3"], revenue: revY.length ? revY : [0, 0, 0], cost: costY.length ? costY : [0, 0, 0] },
      footnote: findSynergyFootnote(body),
    },
    math: { revenue_synergy: { y3: r3 }, cost_synergy: { y3: c3 }, net_run_rate_y3: netY3 },
  };
}

function findSynergyFootnote(body: string): string | undefined {
  const m = /(?:^|\n)\s*(?:>?\s*)?(?:note|footnote)[:\s]+(.+)/i.exec(body);
  return m ? fitText(stripMd(m[1]), "footnote") : undefined;
}

function extractScenarios(body: string): TPL.ScenarioCard[] {
  const table = parseMarkdownTable(body);
  const cards: TPL.ScenarioCard[] = [];
  const toneOf = (name: string): TPL.ScenarioCard["tone"] =>
    /down|bear|low|pessim/i.test(name) ? "down" : /up|bull|high|optim/i.test(name) ? "up" : "base";

  // Table form: rows = scenario, columns = metrics
  if (table.length > 1 && /down|base|up/i.test(table.map((r) => r[0]).join(" "))) {
    const header = table[0];
    for (let r = 1; r < table.length && cards.length < 3; r++) {
      const name = table[r][0];
      if (!/down|base|up|bear|bull/i.test(name)) continue;
      const rows = table[r].slice(1).map((v, i) => ({ label: header[i + 1] || "", value: stripMd(v) })).filter((x) => x.value);
      cards.push({ name: stripMd(name), tone: toneOf(name), rows: rows.slice(0, 4) });
    }
    if (cards.length >= 2) return cards;
  }

  // Heading form: **Downside** ... **Base Case** ... **Upside**.
  // Locate each bold scenario header by index, then slice the body between
  // consecutive headers (avoids brittle lazy-lookahead matching).
  const headerRe = /\*\*\s*(downside|base(?:\s*case)?|upside|bear\s*case|bull\s*case|conservative|aggressive)\s*\*\*/gi;
  const heads: { name: string; start: number; end: number }[] = [];
  for (const m of body.matchAll(headerRe)) {
    heads.push({ name: m[1], start: m.index ?? 0, end: (m.index ?? 0) + m[0].length });
  }
  for (let i = 0; i < heads.length && cards.length < 3; i++) {
    const seg = body.slice(heads[i].end, i + 1 < heads.length ? heads[i + 1].start : body.length);
    const rows = extractLabelValueRows(seg).slice(0, 4);
    const note = extractBullets(seg).find((b) => b.length > 24 && !/^[A-Za-z][A-Za-z /&%-]{1,28}:/.test(b));
    cards.push({ name: titleCase(heads[i].name), tone: toneOf(heads[i].name), rows, note });
  }
  return cards;
}

/** Parse "Label: value" pairs from bullets or bold lines (for scenario cards). */
function extractLabelValueRows(seg: string): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  for (const raw of seg.split("\n")) {
    const line = stripMd(raw.trim());
    const m = /^([A-Za-z][A-Za-z /&%-]{1,28}):\s*(.+)$/.exec(line);
    if (m && /[\d$%₹€£x]/i.test(m[2])) {
      out.push({ label: m[1].trim(), value: m[2].trim().replace(/[.;,]$/, "") });
    }
  }
  if (out.length) return out;
  return extractMetricPairs(seg).map((p) => ({ label: p.label, value: p.value }));
}

/** Assertive risk title — total count and how many at high probability. */
function riskAssertion(risks: TPL.RiskRow[]): string {
  const high = risks.filter((r) => r.probabilityPct >= 20).length;
  return high > 0
    ? `${risks.length} material risks; ${high} at high probability`
    : `${risks.length} material risks under active management`;
}

/** Assertive timeline title — phase progression to Day-100. */
function timelineAssertion(phases: TPL.PhaseContent[]): string {
  const steps = phases
    .map((p) => p.name.split("·").pop()?.trim() || p.name)
    .filter(Boolean);
  return steps.length >= 2
    ? `${steps.join(" → ")}: three phases to Day-100 value capture`
    : "Three phases to Day-100 value capture";
}

/** Build an assertive scenario title from NPV/value range or weighted EV. */
function scenarioAssertion(scen: TPL.ScenarioCard[], body: string): string | undefined {
  const weighted = findMetric(body, /(?:risk[-\s]?weighted|expected\s+value)[^₹$\d]*([₹$€£]?\s?[\d.,]+\s*[BMK])/i);
  if (weighted) return `${weighted} risk-weighted expected value across scenarios`;
  const npv = (tone: TPL.ScenarioCard["tone"]) =>
    scen.find((s) => s.tone === tone)?.rows.find((r) => /npv|value/i.test(r.label))?.value;
  const base = npv("base"), down = npv("down"), up = npv("up");
  if (base && down && up) return `Base NPV ${base}; ${down} downside to ${up} upside`;
  return undefined;
}

function extractConditions(body: string, fallback: string): string[] {
  const src = /condition/i.test(body) ? body : fallback;
  const m = /conditions?\s+precedent[\s\S]*?(?=kill[-\s]?switch|$)/i.exec(src);
  const region = m ? m[0] : src;
  const bullets = extractBullets(region).filter((b) => !/kill|trigger|stop/i.test(b));
  return bullets.slice(0, 4);
}

function extractKillSwitches(body: string): string[] {
  const m = /kill[-\s]?switch[\s\S]*/i.exec(body);
  if (!m) return [];
  return extractBullets(m[0]).slice(0, 5);
}

function extractRiskRows(body: string): TPL.RiskRow[] {
  const table = parseMarkdownTable(body);
  const rows: TPL.RiskRow[] = [];

  if (table.length > 1) {
    const header = table[0].map((h) => h.toLowerCase());
    const idx = (re: RegExp, d: number) => { const i = header.findIndex((h) => re.test(h)); return i >= 0 ? i : d; };
    const ri = idx(/risk|description/, 0), ti = idx(/type|categ/, 1), pi = idx(/prob|likeli/, 2), ii = idx(/impact|exposure|₹|\$/, 3), mi = idx(/mitig|response|action/, 4);
    for (let r = 1; r < table.length && rows.length < 6; r++) {
      const cells = table[r];
      const probLabel = stripMd(cells[pi] || "");
      rows.push({
        risk: stripMd(cells[ri] || ""),
        type: stripMd(cells[ti] || ""),
        probabilityPct: parsePct(probLabel),
        probabilityLabel: probLabel || "—",
        impact: stripMd(cells[ii] || ""),
        mitigation: stripMd(cells[mi] || ""),
      });
    }
    if (rows.length) return rows;
  }

  // "Title — body" bullet form
  for (const b of extractBullets(body)) {
    if (rows.length >= 6) break;
    const m = /^(.+?)\s*[—:-]\s*(.+)$/.exec(b);
    const pct = parsePct(b);
    rows.push({
      risk: m ? m[1].trim() : b.slice(0, 60),
      type: "—",
      probabilityPct: pct,
      probabilityLabel: pct ? `${pct}%` : "Med",
      impact: "—",
      mitigation: m ? m[2].trim() : "",
    });
  }
  return rows;
}

function extractPhases(body: string): TPL.PhaseContent[] {
  const phases: TPL.PhaseContent[] = [];
  const tones: TPL.PhaseContent["tone"][] = ["teal", "navy", "amber"];
  const re = /\*\*\s*(phase\s*\d[^*]*|days?\s*[\d–\-]+[^*]*)\*\*([\s\S]*?)(?=\*\*\s*(?:phase\s*\d|days?\s*\d)|$)/gi;
  let i = 0;
  for (const m of body.matchAll(re)) {
    if (phases.length >= 3) break;
    const head = stripMd(m[1]);
    const win = /(days?\s*[\d–\-]+\d*|day\s*\d+)/i.exec(head)?.[0] || "";
    // keep the descriptive label (e.g. "Phase 1 · Stabilize"), drop the day window
    const name = head.replace(win, "").replace(/[·:\-\s]+$/, "").trim() || `Phase ${i + 1}`;
    phases.push({ name, window: win || ["Days 1–30", "Days 31–60", "Days 61–100"][i] || "", tone: tones[i % 3], bullets: extractBullets(m[2]).slice(0, 4) });
    i++;
  }
  if (phases.length) return phases;

  // ### subhead form
  const parts = body.split(/^###\s+/m).map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) {
    parts.slice(0, 3).forEach((p, j) => {
      const [head, ...rest] = p.split("\n");
      phases.push({ name: stripMd(head), window: ["Days 1–30", "Days 31–60", "Days 61–100"][j] || "", tone: tones[j % 3], bullets: extractBullets(rest.join("\n")).slice(0, 4) });
    });
  }
  return phases;
}

function extractWorkstreams(body: string): TPL.WorkstreamCard[] {
  const cards: TPL.WorkstreamCard[] = [];
  for (const m of body.matchAll(/\*\*([^*:\n]{2,40}):\*\*\s*([^\n*]+)/g)) {
    cards.push({ title: m[1].trim(), body: stripMd(m[2]) });
  }
  if (cards.length >= 3) return cards.slice(0, 9);

  const parts = body.split(/^###\s+/m).map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 3) {
    return parts.slice(0, 9).map((p) => {
      const [head, ...rest] = p.split("\n");
      return { title: stripMd(head), body: stripMd(extractBullets(rest.join("\n"))[0] || rest.join(" ")) };
    });
  }
  return cards.slice(0, 9);
}

function buildGenericContent(label: string, heading: string, body: string, kind: SectionKind): TPL.GenericCardContent {
  const table = parseMarkdownTable(body);
  const metrics = pickMetrics(body).slice(0, 4);
  const out: TPL.GenericCardContent = {
    sectionLabel: label,
    title: assertTitle(heading, body, kind),
    metrics: metrics.length >= 2 ? metrics : undefined,
  };
  if (table.length > 1) {
    out.table = table.slice(0, 7);
  } else {
    const bullets = extractBullets(body).slice(0, 6);
    out.cards = bullets.map((b) => {
      const m = /^(.+?)\s*[—:-]\s*(.+)$/.exec(b);
      return m ? { title: m[1].trim(), body: m[2].trim() } : { title: b.slice(0, 40), body: b.length > 40 ? b.slice(40) : "" };
    });
    if (!out.cards.length && !out.metrics) {
      out.cards = [{ title: titleCase(heading), body: firstSentences(body, 35) }];
    }
  }
  return out;
}

// ===========================================================================
// Title / verdict / number helpers
// ===========================================================================

// Strip leading list/quote markers and trailing punctuation so a title never
// reads like a fragment ("— Service catalog…", "Day-1 readiness:").
function cleanTitle(s: string): string {
  return stripMd(s)
    .replace(/^[\s—–\-•*>#]+/, "")
    .replace(/[\s:;,.\-–—]+$/, "")
    .trim();
}

// A candidate makes a usable assertion only if it reads like a clause, not a
// label fragment (no trailing colon, has substance, isn't a parenthetical stub).
function looksLikeAssertion(s: string): boolean {
  if (!s) return false;
  if (/:\s*$/.test(s)) return false;                 // label header
  if (/^[a-z]?\W/.test(s)) return false;             // starts with punctuation/lowercase stub
  if (/\(\s*term[^)]*$/.test(s)) return false;       // garbled "(term- 3)"
  const words = s.split(/\s+/).filter(Boolean);
  return words.length >= 5;
}

function assertTitle(heading: string, body: string, kind: SectionKind, override?: string): string {
  if (override) return fitText(cleanTitle(override), "slideTitle");
  // Prefer a bolded lead assertion or first strong sentence; fall back to a
  // kind-specific assertion built from the heading.
  const leadBold = /\*\*([^*]{12,90})\*\*/.exec(body);
  if (leadBold && /[.\d%₹$]/.test(leadBold[1])) {
    const t = cleanTitle(leadBold[1]);
    if (looksLikeAssertion(t)) return fitText(t, "slideTitle");
  }
  const firstSentence = cleanTitle(firstSentences(body, 14));
  if (/\d|%|₹|\$/.test(firstSentence) && looksLikeAssertion(firstSentence)) {
    return fitText(firstSentence, "slideTitle");
  }
  const base = titleCase(stripMd(heading));
  const prefix: Partial<Record<SectionKind, string>> = {
    thesis: "The case for ", market: "Market context: ", regulatory: "Regulatory path: ",
    why_us: "Why Deal IQ: ", diligence: "Diligence priorities: ", transaction: "Transaction overview: ",
    services: "Service scope: ", tsa: "Transition services: ", governance: "Governance: ",
    engagement: "Commercial terms: ", day1: "Day-1 priorities: ", integration: "Integration approach: ",
    next_steps: "Next steps: ",
  };
  return fitText(cleanTitle((prefix[kind] ?? "") + base), "slideTitle");
}

function findVerdict(md: string): string | undefined {
  const m = /\b(conditional\s+go|go\b|no[-\s]?go|pass\b|proceed|hold|decline)\b/i.exec(md);
  if (!m) return undefined;
  return titleCase(m[1].replace(/\bgo\b/i, "Go").replace(/no[-\s]?go/i, "No-Go"));
}

function findValueRange(md: string): string | undefined {
  const m = /([₹$€£]\s?[\d.,]+\s*[BMK]?)\s*(?:–|—|-|to)\s*([₹$€£]?\s?[\d.,]+\s*[BMK]?)/.exec(md.replace(/\n/g, " "));
  if (!m) return undefined;
  return `${m[1].trim()}  —  ${m[2].trim()}`;
}

function findEnterpriseValue(md: string): string | undefined {
  return findMetric(md, /enterprise\s+value[^₹$\d]*([₹$€£]?\s?[\d.,]+\s*[BMK])/i)
    || findMetric(md, /\bEV[^₹$\d]{0,6}([₹$€£]\s?[\d.,]+\s*[BMK])/);
}

function findMetric(md: string, re: RegExp): string | undefined {
  const m = re.exec(md);
  return m ? m[1].replace(/\s+/g, "").trim() : undefined;
}

/** Sanitize a free-text value (deal size, metric) — strip markdown + stray
 *  leading symbols like ">" / "~" so cover/subtitle values render clean. */
function sanitizeValue(s: string | undefined): string {
  return clean(s ?? "").replace(/^[>~≈±\s]+/, "").trim();
}

function parsePct(s: string): number {
  const m = /(\d{1,3})\s?%/.exec(s || "");
  return m ? parseInt(m[1], 10) : 0;
}

function parseMoney(s: string | undefined): number {
  if (!s) return 0;
  const neg = /\(/.test(s);
  const m = /([\d.,]+)\s*([BMK])?/i.exec(s.replace(/[, ]/g, (c) => (c === "," ? "" : c)));
  if (!m) return 0;
  let v = parseFloat(m[1].replace(/,/g, ""));
  const u = (m[2] || "M").toUpperCase();
  if (u === "B") v *= 1000;
  else if (u === "K") v /= 1000;
  return neg ? -v : v; // in millions
}

function fmtMoney(n: number): string {
  const abs = Math.abs(n);
  const s = abs >= 1000 ? `₹${(abs / 1000).toFixed(2)}B` : `₹${abs.toFixed(1)}M`;
  return n < 0 ? `(${s})` : s;
}

function firstSentences(body: string, maxWords: number): string {
  const text = stripMd(body.replace(/^#{1,6}\s+.*$/gm, "").replace(/^\s*[|>].*$/gm, "").replace(/^\s*[-*]\s+/gm, ""))
    .replace(/\s+/g, " ").trim();
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return text;
  // cut at sentence boundary within budget if possible
  const slice = words.slice(0, maxWords).join(" ");
  const lastDot = slice.lastIndexOf(". ");
  return (lastDot > 40 ? slice.slice(0, lastDot + 1) : slice + "…");
}

function titleCase(s: string): string {
  return stripMd(s).replace(/^\d+\.\s*/, "").replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}

function docLabelFor(docType: DocType, moduleLabel?: string): string {
  switch (docType) {
    case "synergy": return "Synergy & Value-Creation Model";
    case "pmi": return "Post-Merger Integration Playbook";
    case "tsa": return "Transition Services Framework";
    case "interactive": return (moduleLabel ?? "Interactive Export").toUpperCase();
    default: return "M&A Advisory Proposal  ·  Post-Deal Engagement";
  }
}

function parseCitations(citationsMd: string): { n: string; text: string }[] {
  return citationsMd.split("\n")
    .map((l) => /^\[(\d+)\]\s*(.+)$/.exec(l.trim()))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => ({ n: m[1], text: stripMd(m[2]).replace(/https?:\/\/\S+/g, "").trim() || m[2] }))
    .slice(0, 24);
}

// ===========================================================================
// Storyline ordering (unchanged behaviour)
// ===========================================================================
function applyStorylineOrder(
  sections: ProposalSection[],
  storyline: StorylineTemplate,
): ProposalSection[] {
  if (!storyline) return sections;
  const used = new Set<number>();
  const ordered: ProposalSection[] = [];
  for (const slide of storyline.slides) {
    if (!slide.source_section) continue;
    const patterns = slide.source_section.split("|").map((p) => p.trim().toLowerCase());
    const idx = sections.findIndex((s, i) => !used.has(i) && patterns.some((p) => s.heading.toLowerCase().includes(p)));
    if (idx >= 0) { ordered.push(sections[idx]); used.add(idx); }
  }
  for (let i = 0; i < sections.length; i++) if (!used.has(i)) ordered.push(sections[i]);
  return ordered;
}

function slugify(s: string): string {
  return (s || "deal").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}
