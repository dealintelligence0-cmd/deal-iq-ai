/**
 * Deal IQ AI — Consulting-grade slide templates.
 *
 * Ten standalone slide renderers + the shared visual primitives they compose
 * from. Every renderer accepts a typed content object and the PptxGenJS instance,
 * creates its own slide, and guarantees at least one visual element
 * (chart / table / metric callout / phase timeline / card grid).
 *
 * Canvas is 10.0" × 5.625" (16:9). All colours, fonts and coordinates come from
 * `deck-tokens.ts`; word budgets are enforced via `deck-quality.ts`.
 *
 * NOTE: these renderers are PRESENTATION-ONLY. They never fetch, generate, or
 * mutate deal content — they draw exactly the typed object handed to them.
 */

import pptxgen from "pptxgenjs";
import { DECK_TOKENS as T, DECK_FONTS as F, DECK_LAYOUT as L, probabilityBand } from "./deck-tokens";
import { fitText, clean, VisualGuard } from "./deck-quality";

const CONTENT_W = L.W - 2 * L.marginX;

/** Truncate to at most `n` words at a word boundary (ellipsis when trimmed). */
function capWords(text: string, n: number): string {
  const words = (text ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length <= n) return words.join(" ");
  return words.slice(0, n).join(" ") + "…";
}

// ===========================================================================
// Typed content objects
// ===========================================================================
export interface MetricCallout {
  value: string;
  label: string;
  sub?: string;
}

export interface CoverContent {
  docLabel: string;     // "M&A ADVISORY PROPOSAL · POST-DEAL ENGAGEMENT"
  buyer: string;
  target?: string;
  subtitle: string;     // "Strategic Acquisition · Financial Services · INR 12.5B EV"
  metrics: MetricCallout[];
  preparedBy: string;   // "Prepared by Deal IQ AI · June 2026 · Confidential"
}

export interface VerdictContent {
  sectionLabel: string;
  title: string;        // assertion
  verdict: string;      // "CONDITIONAL GO"
  confidence?: string;  // "70% Confidence"
  justification: string;
  valueRange?: string;  // "₹3,226M — ₹9,678M"
  metrics: MetricCallout[];
  conditions: string[];
}

export interface PillarContent {
  heading: string;
  bullets: string[];
  kpi?: string;
}
export interface ThreePillarContent {
  sectionLabel: string;
  title: string;
  pillars: PillarContent[];
}

export interface SynergyContent {
  sectionLabel: string;
  title: string;
  rows: string[][];     // table incl. header row
  rowKinds?: ("revenue" | "cost" | "integration" | "net" | "plain")[];
  kpis: MetricCallout[];
  chart: { years: string[]; revenue: number[]; cost: number[] };
  footnote?: string;
}

export interface ScenarioCard {
  name: string;
  tone: "down" | "base" | "up";
  rows: { label: string; value: string }[];
  note?: string;
}
export interface ScenarioContent {
  sectionLabel: string;
  title: string;
  scenarios: ScenarioCard[];
}

export interface ConditionsContent {
  sectionLabel: string;
  title: string;
  conditions: string[];
  killSwitches: string[];
}

export interface RiskRow {
  risk: string;
  type: string;
  probabilityPct: number;
  probabilityLabel: string;
  impact: string;
  mitigation: string;
}
export interface RiskContent {
  sectionLabel: string;
  title: string;
  risks: RiskRow[];
}

export interface PhaseContent {
  name: string;
  window: string;
  tone: "teal" | "navy" | "amber";
  bullets: string[];
}
export interface TimelineContent {
  sectionLabel: string;
  title: string;
  phases: PhaseContent[];
}

export interface WorkstreamCard {
  title: string;
  body: string;
}
export interface WorkstreamContent {
  sectionLabel: string;
  title: string;
  cards: WorkstreamCard[];
}

export interface RecommendationContent {
  sectionLabel: string;
  verdict: string;
  confidence?: string;
  justification: string;
  nextSteps: string[];
  valueRange?: string;
}

// Generic fallback (for sections that do not map to a named template — still
// guaranteed a visual via callouts / table / card grid).
export interface GenericCardContent {
  sectionLabel: string;
  title: string;
  metrics?: MetricCallout[];
  cards?: WorkstreamCard[];
  table?: string[][];
  footnote?: string;
}

// ===========================================================================
// Shared header + visual primitives
// ===========================================================================

/** White content slide with top hairline, teal marker, brand mark, footer. */
function newContentSlide(pres: pptxgen): pptxgen.Slide {
  const slide = pres.addSlide();
  slide.background = { color: T.white };
  // top navy hairline + teal marker
  slide.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: L.W, h: 0.05, fill: { color: T.navy }, line: { type: "none" } });
  slide.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: 0.18, h: 0.16, fill: { color: T.teal }, line: { type: "none" } });
  // brand wordmark top-right
  slide.addText("DEAL IQ AI", {
    x: L.W - 2.0, y: 0.14, w: 1.62, h: 0.2,
    fontFace: F.face, fontSize: 7.5, bold: true, color: T.muted, align: "right", charSpacing: 2,
  });
  // footer
  slide.addShape(pres.ShapeType.rect, { x: L.marginX, y: L.H - 0.26, w: CONTENT_W, h: 0.006, fill: { color: T.gray200 }, line: { type: "none" } });
  slide.addText("CONFIDENTIAL", {
    x: L.marginX, y: L.H - 0.22, w: 4, h: 0.16,
    fontFace: F.face, fontSize: F.footnoteSize, bold: true, color: T.teal, charSpacing: 2,
  });
  return slide;
}

/** Section label (uppercase teal eyebrow). */
export function renderSectionHeader(slide: pptxgen.Slide, sectionLabel: string): void {
  slide.addShape("rect" as pptxgen.ShapeType, { x: L.marginX, y: 0.24, w: 0.22, h: 0.1, fill: { color: T.teal }, line: { type: "none" } });
  slide.addText(clean(sectionLabel).toUpperCase(), {
    x: L.marginX + 0.3, y: 0.17, w: CONTENT_W - 0.3, h: 0.24,
    fontFace: F.face, fontSize: F.sectionSize, bold: true, color: T.teal, charSpacing: 2, valign: "middle",
  });
}

/** Assertive slide title (one claim per slide). */
export function renderSlideTitle(slide: pptxgen.Slide, assertion: string): void {
  slide.addText(fitText(assertion, "slideTitle"), {
    x: L.marginX, y: L.titleY, w: CONTENT_W, h: 0.5,
    fontFace: F.face, fontSize: F.titleSize, bold: true, color: T.navy, valign: "top",
  });
  slide.addShape("rect" as pptxgen.ShapeType, { x: L.marginX, y: 1.06, w: 0.9, h: 0.03, fill: { color: T.teal }, line: { type: "none" } });
}

/** Metric callout card: teal top bar, large value, label, optional sub. */
export function addMetricCallout(
  slide: pptxgen.Slide,
  x: number, y: number, w: number, h: number,
  m: MetricCallout,
  accent: string = T.teal,
  guard?: VisualGuard,
): void {
  slide.addShape("rect" as pptxgen.ShapeType, { x, y, w, h: 0.055, fill: { color: accent }, line: { type: "none" } });
  slide.addShape("rect" as pptxgen.ShapeType, { x, y: y + 0.055, w, h: h - 0.055, fill: { color: T.white }, line: { color: T.gray200, width: 0.75 } });
  slide.addText(fitText(m.value, "metricValue"), {
    x: x + 0.12, y: y + 0.16, w: w - 0.24, h: 0.46,
    fontFace: F.face, fontSize: F.metricSize, bold: true, color: T.navy, valign: "middle",
  });
  slide.addText(fitText(m.label, "metricLabel").toUpperCase(), {
    x: x + 0.12, y: y + 0.62, w: w - 0.24, h: 0.2,
    fontFace: F.face, fontSize: 8, bold: true, color: T.muted, charSpacing: 1, valign: "top",
  });
  if (m.sub) {
    slide.addText(fitText(m.sub, "footnote"), {
      x: x + 0.12, y: y + 0.82, w: w - 0.24, h: 0.2,
      fontFace: F.face, fontSize: F.footnoteSize, color: T.gray400, valign: "top",
    });
  }
  guard?.mark();
}

/** Grid of accent-bar cards. */
export function addCardGrid(
  slide: pptxgen.Slide,
  x: number, y: number, w: number, h: number,
  cards: { title: string; body: string; accent?: string }[],
  cols: number,
  guard?: VisualGuard,
): void {
  if (!cards.length) return;
  const n = cards.length;
  const rows = Math.ceil(n / cols);
  const gap = 0.12;
  const cardW = (w - (cols - 1) * gap) / cols;
  const cardH = (h - (rows - 1) * gap) / rows;
  // Adaptive sizing so body text never overflows its card.
  const bodyFont = cardH >= 1.7 ? 9.5 : cardH >= 1.2 ? 8.5 : 8;
  const titleH = 0.34;
  const innerW = cardW - 0.24;
  const charsPerLine = Math.max(12, (innerW * 72) / (bodyFont * 0.52));
  const lineH = (bodyFont * 1.22) / 72;
  const bodyLines = Math.max(1, Math.floor((cardH - titleH - 0.18) / lineH));
  const maxBodyWords = Math.max(6, Math.floor((charsPerLine * bodyLines) / 6.3));
  cards.forEach((c, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = x + col * (cardW + gap);
    const cy = y + row * (cardH + gap);
    const accent = c.accent ?? T.teal;
    slide.addShape("rect" as pptxgen.ShapeType, { x: cx, y: cy, w: cardW, h: 0.05, fill: { color: accent }, line: { type: "none" } });
    slide.addShape("rect" as pptxgen.ShapeType, { x: cx, y: cy + 0.05, w: cardW, h: cardH - 0.05, fill: { color: T.white }, line: { color: T.gray200, width: 0.75 } });
    slide.addText(capWords(clean(c.title), 9), {
      x: cx + 0.12, y: cy + 0.12, w: innerW, h: titleH,
      fontFace: F.face, fontSize: 9.5, bold: true, color: T.navy, valign: "top",
    });
    if (c.body) {
      slide.addText(capWords(clean(c.body), maxBodyWords), {
        x: cx + 0.12, y: cy + 0.12 + titleH, w: innerW, h: cardH - titleH - 0.16,
        fontFace: F.face, fontSize: bodyFont, color: T.text, valign: "top",
      });
    }
  });
  guard?.mark();
}

/** Three-phase 100-day timeline with day-ruler. */
export function addPhaseTimeline(
  slide: pptxgen.Slide,
  x: number, y: number, w: number, h: number,
  phases: PhaseContent[],
  guard?: VisualGuard,
): void {
  const toneColor: Record<PhaseContent["tone"], string> = { teal: T.teal, navy: T.navyMd, amber: T.amber };
  // ruler strip
  const rulerH = 0.3;
  slide.addShape("rect" as pptxgen.ShapeType, { x, y, w, h: rulerH, fill: { color: T.gray50 }, line: { color: T.gray200, width: 0.5 } });
  ["Day 0 · Close", "Day 30", "Day 60", "Day 100"].forEach((d, i, arr) => {
    slide.addText(d, {
      x: x + (w / arr.length) * i + 0.06, y, w: w / arr.length - 0.1, h: rulerH,
      fontFace: F.face, fontSize: 7.5, bold: true, color: T.muted, valign: "middle",
    });
  });

  const top = y + rulerH + 0.1;
  const bodyH = h - rulerH - 0.1;
  const gap = 0.12;
  // Phase 3 slightly wider (40%)
  const widths = phases.length === 3
    ? [w * 0.30 - gap, w * 0.30 - gap, w * 0.40 - gap + 2 * gap - gap]
    : phases.map(() => (w - (phases.length - 1) * gap) / phases.length);
  let cx = x;
  phases.forEach((p, i) => {
    const pw = widths[i] ?? (w - (phases.length - 1) * gap) / phases.length;
    const accent = toneColor[p.tone];
    // header block
    slide.addShape("rect" as pptxgen.ShapeType, { x: cx, y: top, w: pw, h: 0.4, fill: { color: accent }, line: { type: "none" } });
    slide.addText(`${clean(p.name)}  ·  ${clean(p.window)}`, {
      x: cx + 0.1, y: top, w: pw - 0.2, h: 0.4,
      fontFace: F.face, fontSize: 9, bold: true, color: T.white, valign: "middle",
    });
    // body
    slide.addShape("rect" as pptxgen.ShapeType, { x: cx, y: top + 0.4, w: pw, h: bodyH - 0.4, fill: { color: T.gray50 }, line: { color: T.gray200, width: 0.5 } });
    const bullets = p.bullets.slice(0, 4).map((b) => ({
      text: fitText(b, "bulletPoint"),
      options: { fontFace: F.face, fontSize: 8, color: T.text, bullet: { code: "25AA", indent: 10 } as const, paraSpaceAfter: 4 },
    }));
    slide.addText(bullets, {
      x: cx + 0.12, y: top + 0.5, w: pw - 0.24, h: bodyH - 0.55, valign: "top",
    });
    cx += pw + gap;
  });
  guard?.mark();
}

// ===========================================================================
// 1. Cover
// ===========================================================================
export function renderCoverSlide(pres: pptxgen, content: CoverContent): void {
  const slide = pres.addSlide();
  slide.background = { color: T.navy };
  // left teal accent bar
  slide.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: 0.55, h: L.H, fill: { color: T.teal }, line: { type: "none" } });

  slide.addText(clean(content.docLabel).toUpperCase(), {
    x: 0.85, y: 0.5, w: L.W - 1.2, h: 0.3,
    fontFace: F.face, fontSize: 10, bold: true, color: T.teal, charSpacing: 3,
  });

  slide.addText(clean(content.buyer) || "—", {
    x: 0.85, y: 1.35, w: L.W - 1.2, h: 0.8,
    fontFace: F.face, fontSize: 32, bold: true, color: T.white, valign: "middle",
  });
  if (content.target) {
    slide.addText([
      { text: "→  ", options: { color: T.teal, bold: true } },
      { text: clean(content.target), options: { color: T.white, bold: true } },
    ], {
      x: 0.85, y: 2.15, w: L.W - 1.2, h: 0.5,
      fontFace: F.face, fontSize: 20,
    });
  }
  slide.addText(clean(content.subtitle), {
    x: 0.85, y: 2.75, w: L.W - 1.2, h: 0.3,
    fontFace: F.face, fontSize: 12, color: T.steelBl,
  });

  // bottom darker panel with 3 metric callouts
  const panelY = 3.5;
  slide.addShape(pres.ShapeType.rect, { x: 0.55, y: panelY, w: L.W - 0.55, h: 1.25, fill: { color: T.navyMd }, line: { type: "none" } });
  const metrics = content.metrics.slice(0, 3);
  const gap = 0.25;
  const mW = (L.W - 0.55 - 0.85 - (metrics.length - 1) * gap) / Math.max(metrics.length, 1);
  metrics.forEach((m, i) => {
    const mx = 0.85 + i * (mW + gap);
    slide.addText(fitText(m.value, "metricValue"), {
      x: mx, y: panelY + 0.2, w: mW, h: 0.5,
      fontFace: F.face, fontSize: 24, bold: true, color: T.white, valign: "middle",
    });
    slide.addText(fitText(m.label, "metricLabel").toUpperCase(), {
      x: mx, y: panelY + 0.72, w: mW, h: 0.22,
      fontFace: F.face, fontSize: 8.5, bold: true, color: T.teal, charSpacing: 1,
    });
    if (m.sub) {
      slide.addText(fitText(m.sub, "footnote"), {
        x: mx, y: panelY + 0.93, w: mW, h: 0.22,
        fontFace: F.face, fontSize: 7.5, color: T.steelBl,
      });
    }
  });

  slide.addText(clean(content.preparedBy), {
    x: 0.85, y: L.H - 0.35, w: L.W - 1.2, h: 0.22,
    fontFace: F.face, fontSize: 8.5, color: T.steelBl,
  });
}

// ===========================================================================
// 2. Verdict split (Executive Summary)
// ===========================================================================
export function renderVerdictSplitSlide(pres: pptxgen, content: VerdictContent): void {
  const guard = new VisualGuard();
  const slide = newContentSlide(pres);

  // ---- left dark panel ----
  const pw = 3.3;
  slide.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: pw, h: L.H, fill: { color: T.navy }, line: { type: "none" } });
  slide.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: 0.12, h: L.H, fill: { color: T.teal }, line: { type: "none" } });
  slide.addText("VERDICT", {
    x: 0.35, y: 0.4, w: pw - 0.6, h: 0.24,
    fontFace: F.face, fontSize: 10, bold: true, color: T.teal, charSpacing: 3,
  });
  slide.addText(clean(content.verdict).toUpperCase(), {
    x: 0.35, y: 0.7, w: pw - 0.6, h: 0.9,
    fontFace: F.face, fontSize: 26, bold: true, color: T.white, valign: "top",
  });
  if (content.confidence) {
    slide.addShape(pres.ShapeType.roundRect, { x: 0.35, y: 1.62, w: 1.7, h: 0.3, fill: { color: T.teal }, line: { type: "none" }, rectRadius: 0.05 } as never);
    slide.addText(clean(content.confidence), {
      x: 0.35, y: 1.62, w: 1.7, h: 0.3,
      fontFace: F.face, fontSize: 9, bold: true, color: T.white, align: "center", valign: "middle",
    });
  }
  slide.addShape(pres.ShapeType.rect, { x: 0.35, y: 2.12, w: pw - 0.7, h: 0.012, fill: { color: T.navyMd }, line: { type: "none" } });
  slide.addText(fitText(content.justification, "justification"), {
    x: 0.35, y: 2.28, w: pw - 0.6, h: 2.1,
    fontFace: F.face, fontSize: 9, color: T.steelBl, valign: "top", lineSpacingMultiple: 1.15,
  });
  if (content.valueRange) {
    slide.addText("RISK-ADJUSTED VALUE RANGE", {
      x: 0.35, y: L.H - 0.75, w: pw - 0.6, h: 0.18,
      fontFace: F.face, fontSize: 7.5, bold: true, color: T.teal, charSpacing: 1,
    });
    slide.addText(content.valueRange, {
      x: 0.35, y: L.H - 0.55, w: pw - 0.6, h: 0.3,
      fontFace: F.face, fontSize: 13, bold: true, color: T.white,
    });
  }

  // ---- right region ----
  const rx = pw + 0.25;
  const rw = L.W - rx - L.marginX;
  slide.addShape(pres.ShapeType.rect, { x: rx, y: 0.24, w: 0.2, h: 0.1, fill: { color: T.teal }, line: { type: "none" } });
  slide.addText(content.sectionLabel.toUpperCase(), {
    x: rx + 0.28, y: 0.17, w: rw - 0.28, h: 0.24,
    fontFace: F.face, fontSize: F.sectionSize, bold: true, color: T.teal, charSpacing: 2, valign: "middle",
  });
  slide.addText(fitText(content.title, "slideTitle"), {
    x: rx, y: 0.46, w: rw, h: 0.6,
    fontFace: F.face, fontSize: 15, bold: true, color: T.navy, valign: "top",
  });

  // 3 metric callouts
  const metrics = content.metrics.slice(0, 3);
  if (metrics.length) {
    const gap = 0.15;
    const mW = (rw - (metrics.length - 1) * gap) / metrics.length;
    metrics.forEach((m, i) => addMetricCallout(slide, rx + i * (mW + gap), 1.2, mW, 1.0, m, T.teal, guard));
  }

  // 2x2 conditions grid
  const conds = content.conditions.slice(0, 4);
  if (conds.length) {
    slide.addText("CONDITIONS PRECEDENT  ·  ALL MUST BE SATISFIED", {
      x: rx, y: 2.35, w: rw, h: 0.2,
      fontFace: F.face, fontSize: 8, bold: true, color: T.muted, charSpacing: 1,
    });
    const gap = 0.14;
    const cols = 2;
    const cardW = (rw - (cols - 1) * gap) / cols;
    const cardH = 1.05;
    conds.forEach((c, i) => {
      const cx = rx + (i % cols) * (cardW + gap);
      const cy = 2.6 + Math.floor(i / cols) * (cardH + gap);
      slide.addShape(pres.ShapeType.rect, { x: cx, y: cy, w: cardW, h: cardH, fill: { color: T.tealLt }, line: { color: T.teal, width: 0.5 } });
      slide.addShape(pres.ShapeType.ellipse, { x: cx + 0.1, y: cy + 0.1, w: 0.26, h: 0.26, fill: { color: T.teal }, line: { type: "none" } });
      slide.addText(String(i + 1), {
        x: cx + 0.1, y: cy + 0.1, w: 0.26, h: 0.26,
        fontFace: F.face, fontSize: 10, bold: true, color: T.white, align: "center", valign: "middle",
      });
      slide.addText(fitText(c, "cardBody"), {
        x: cx + 0.44, y: cy + 0.08, w: cardW - 0.54, h: cardH - 0.16,
        fontFace: F.face, fontSize: 8.5, color: T.text, valign: "top",
      });
    });
    guard.mark();
  }

  guard.assert(content.title);
}

// ===========================================================================
// 3. Three pillar (Deal Thesis)
// ===========================================================================
export function renderThreePillarSlide(pres: pptxgen, content: ThreePillarContent): void {
  const guard = new VisualGuard();
  const slide = newContentSlide(pres);
  renderSectionHeader(slide, content.sectionLabel);
  renderSlideTitle(slide, content.title);

  const pillars = content.pillars.slice(0, 3);
  const accents = [T.teal, T.navyMd, T.amber];
  const gap = 0.18;
  const colW = (CONTENT_W - (pillars.length - 1) * gap) / Math.max(pillars.length, 1);
  const top = L.contentTop + 0.15;
  const colH = L.H - top - 0.4;

  pillars.forEach((p, i) => {
    const x = L.marginX + i * (colW + gap);
    const accent = accents[i % accents.length];
    slide.addShape(pres.ShapeType.rect, { x, y: top, w: colW, h: 0.06, fill: { color: accent }, line: { type: "none" } });
    slide.addShape(pres.ShapeType.rect, { x, y: top + 0.06, w: colW, h: colH - 0.06, fill: { color: T.gray50 }, line: { color: T.gray200, width: 0.5 } });
    slide.addText(p.heading.toUpperCase(), {
      x: x + 0.14, y: top + 0.18, w: colW - 0.28, h: 0.26,
      fontFace: F.face, fontSize: 10.5, bold: true, color: accent, charSpacing: 1,
    });
    const bullets = p.bullets.slice(0, 4).map((b) => ({
      text: fitText(b, "bulletPoint"),
      options: { fontFace: F.face, fontSize: 9, color: T.text, bullet: { code: "25AA", indent: 10 } as const, paraSpaceAfter: 6 },
    }));
    slide.addText(bullets, {
      x: x + 0.14, y: top + 0.5, w: colW - 0.28, h: colH - 1.05, valign: "top",
    });
    if (p.kpi) {
      slide.addShape(pres.ShapeType.rect, { x: x + 0.14, y: top + colH - 0.5, w: colW - 0.28, h: 0.38, fill: { color: T.white }, line: { color: accent, width: 0.75 } });
      slide.addText(fitText(p.kpi, "bulletPoint"), {
        x: x + 0.2, y: top + colH - 0.5, w: colW - 0.4, h: 0.38,
        fontFace: F.face, fontSize: 10, bold: true, color: T.navy, valign: "middle",
      });
    }
  });
  guard.mark();
  guard.assert(content.title);
}

// ===========================================================================
// 4. Synergy table + native chart
// ===========================================================================
export function renderSynergyTableChartSlide(pres: pptxgen, content: SynergyContent): void {
  const guard = new VisualGuard();
  const slide = newContentSlide(pres);
  renderSectionHeader(slide, content.sectionLabel);
  renderSlideTitle(slide, content.title);

  const top = L.contentTop + 0.15;
  const leftW = 4.5;

  // ---- left: color-coded table ----
  if (content.rows.length) {
    const kindFill: Record<string, string> = {
      revenue: T.tealLt, cost: T.gray50, integration: T.redLt, net: T.navy, plain: T.white,
    };
    const tableData = content.rows.map((row, r) => {
      const kind = r === 0 ? "header" : (content.rowKinds?.[r - 1] ?? "plain");
      const isHeader = r === 0;
      const isNet = kind === "net";
      return row.map((cell) => ({
        text: fitText(cell, "tableCell"),
        options: {
          fill: { color: isHeader ? T.navyMd : (kindFill[kind] ?? T.white) },
          color: isHeader || isNet ? T.white : T.text,
          bold: isHeader || isNet,
          fontSize: isHeader ? 8 : 8,
          fontFace: F.face,
          border: { type: "solid" as const, pt: 0.5, color: T.gray200 },
          margin: 2,
          valign: "middle" as const,
        },
      }));
    });
    slide.addTable(tableData as never, { x: L.marginX, y: top, w: leftW, autoPage: false });
    guard.mark();
  }

  // ---- left bottom: KPI callouts ----
  const kpis = content.kpis.slice(0, 3);
  if (kpis.length) {
    const gap = 0.12;
    const kW = (leftW - (kpis.length - 1) * gap) / kpis.length;
    const kY = L.H - 1.25;
    kpis.forEach((k, i) => addMetricCallout(slide, L.marginX + i * (kW + gap), kY, kW, 0.95, k, T.teal, guard));
  }

  // ---- right: native stacked column chart ----
  const rx = L.marginX + leftW + 0.3;
  const rw = L.W - rx - L.marginX;
  const c = content.chart;
  if (c && c.years.length) {
    const chartData = [
      { name: "Revenue Synergy", labels: c.years, values: c.revenue },
      { name: "Cost Synergy", labels: c.years, values: c.cost },
    ];
    slide.addChart(pres.ChartType.bar, chartData, {
      x: rx, y: top, w: rw, h: 2.6,
      barDir: "col",
      barGrouping: "stacked",
      chartColors: [T.teal, T.navyMd],
      showLegend: true,
      legendPos: "b",
      legendFontFace: F.face,
      legendFontSize: 8,
      showValue: false,
      showTitle: false,
      catAxisLabelFontFace: F.face,
      catAxisLabelFontSize: 8,
      valAxisLabelFontFace: F.face,
      valAxisLabelFontSize: 7,
      valGridLine: { style: "none" },
    } as never);
    guard.mark();
  }
  if (content.footnote) {
    slide.addText(fitText(content.footnote, "footnote"), {
      x: rx, y: top + 2.7, w: rw, h: 0.9,
      fontFace: F.face, fontSize: F.footnoteSize, italic: true, color: T.muted, valign: "top",
    });
  }
  guard.assert(content.title);
}

// ===========================================================================
// 5. Three scenario (Downside / Base / Upside)
// ===========================================================================
export function renderThreeScenarioSlide(pres: pptxgen, content: ScenarioContent): void {
  const guard = new VisualGuard();
  const slide = newContentSlide(pres);
  renderSectionHeader(slide, content.sectionLabel);
  renderSlideTitle(slide, content.title);

  const toneColor: Record<ScenarioCard["tone"], string> = { down: T.red, base: T.teal, up: T.green };
  const cards = content.scenarios.slice(0, 3);
  const gap = 0.18;
  const top = L.contentTop + 0.15;
  const colW = (CONTENT_W - (cards.length - 1) * gap) / Math.max(cards.length, 1);
  const colH = L.H - top - 0.4;

  cards.forEach((s, i) => {
    const x = L.marginX + i * (colW + gap);
    const accent = toneColor[s.tone];
    slide.addShape(pres.ShapeType.rect, { x, y: top, w: colW, h: 0.42, fill: { color: accent }, line: { type: "none" } });
    slide.addText(clean(s.name).toUpperCase(), {
      x: x + 0.14, y: top, w: colW - 0.28, h: 0.42,
      fontFace: F.face, fontSize: 11, bold: true, color: T.white, valign: "middle",
    });
    slide.addShape(pres.ShapeType.rect, { x, y: top + 0.42, w: colW, h: colH - 0.42, fill: { color: T.gray50 }, line: { color: T.gray200, width: 0.5 } });
    let ry = top + 0.56;
    s.rows.slice(0, 4).forEach((r) => {
      slide.addText(clean(r.label).toUpperCase(), {
        x: x + 0.14, y: ry, w: colW - 0.28, h: 0.18,
        fontFace: F.face, fontSize: 7, bold: true, color: T.muted, charSpacing: 1,
      });
      slide.addText(fitText(r.value, "metricValue"), {
        x: x + 0.14, y: ry + 0.16, w: colW - 0.28, h: 0.3,
        fontFace: F.face, fontSize: 14, bold: true, color: T.navy,
      });
      ry += 0.5;
    });
    if (s.note) {
      slide.addText(fitText(s.note, "cardBody"), {
        x: x + 0.14, y: top + colH - 0.7, w: colW - 0.28, h: 0.6,
        fontFace: F.face, fontSize: 7.5, italic: true, color: T.text, valign: "top",
      });
    }
  });
  guard.mark();
  guard.assert(content.title);
}

// ===========================================================================
// 6. Conditions / kill switches split
// ===========================================================================
export function renderConditionsSplitSlide(pres: pptxgen, content: ConditionsContent): void {
  const guard = new VisualGuard();
  const slide = newContentSlide(pres);
  renderSectionHeader(slide, content.sectionLabel);
  renderSlideTitle(slide, content.title);

  const top = L.contentTop + 0.15;
  const gap = 0.25;
  const colW = (CONTENT_W - gap) / 2;
  const colH = L.H - top - 0.4;

  const column = (x: number, label: string, items: string[], accent: string, marker: "num" | "x") => {
    slide.addShape(pres.ShapeType.rect, { x, y: top, w: colW, h: 0.36, fill: { color: accent }, line: { type: "none" } });
    slide.addText(label.toUpperCase(), {
      x: x + 0.14, y: top, w: colW - 0.28, h: 0.36,
      fontFace: F.face, fontSize: 9.5, bold: true, color: T.white, valign: "middle", charSpacing: 1,
    });
    slide.addShape(pres.ShapeType.rect, { x, y: top + 0.36, w: colW, h: colH - 0.36, fill: { color: T.gray50 }, line: { color: T.gray200, width: 0.5 } });
    let iy = top + 0.5;
    const rowH = Math.min(0.62, (colH - 0.5) / Math.max(items.length, 1));
    items.slice(0, 5).forEach((it, i) => {
      if (marker === "num") {
        slide.addShape(pres.ShapeType.ellipse, { x: x + 0.14, y: iy + 0.02, w: 0.24, h: 0.24, fill: { color: accent }, line: { type: "none" } });
        slide.addText(String(i + 1), { x: x + 0.14, y: iy + 0.02, w: 0.24, h: 0.24, fontFace: F.face, fontSize: 9, bold: true, color: T.white, align: "center", valign: "middle" });
      } else {
        slide.addText("✕", { x: x + 0.14, y: iy, w: 0.24, h: 0.24, fontFace: F.face, fontSize: 11, bold: true, color: accent, align: "center", valign: "middle" });
      }
      slide.addText(fitText(it, "cardBody"), {
        x: x + 0.46, y: iy, w: colW - 0.58, h: rowH,
        fontFace: F.face, fontSize: 8.5, color: T.text, valign: "top",
      });
      iy += rowH;
    });
  };

  column(L.marginX, "Conditions Precedent  (all required)", content.conditions, T.teal, "num");
  column(L.marginX + colW + gap, "Kill-Switch Triggers  (any one stops)", content.killSwitches, T.red, "x");
  guard.mark();
  guard.assert(content.title);
}

// ===========================================================================
// 7. Risk register table
// ===========================================================================
export function renderRiskTableSlide(pres: pptxgen, content: RiskContent): void {
  const guard = new VisualGuard();
  const slide = newContentSlide(pres);
  renderSectionHeader(slide, content.sectionLabel);
  renderSlideTitle(slide, content.title);

  const top = L.contentTop + 0.2;
  const colW = [2.05, 1.0, 1.0, 0.9, 4.22];
  const header = ["RISK", "TYPE", "PROBABILITY", "IMPACT", "MITIGATION"];

  const headerRow = header.map((h) => ({
    text: h,
    options: { fill: { color: T.navy }, color: T.white, bold: true, fontSize: 8, fontFace: F.face, align: "left" as const, valign: "middle" as const, margin: 3, border: { type: "solid" as const, pt: 0.5, color: T.navy } },
  }));

  const bodyRows = content.risks.slice(0, 6).map((r, i) => {
    const band = probabilityBand(r.probabilityPct);
    const zebra = i % 2 === 0 ? T.gray50 : T.white;
    const cell = (text: string, opts: Record<string, unknown> = {}) => ({
      text: fitText(text, "tableCell"),
      options: { fill: { color: zebra }, color: T.text, fontSize: 8, fontFace: F.face, valign: "middle" as const, margin: 3, border: { type: "solid" as const, pt: 0.5, color: T.gray200 }, ...opts },
    });
    return [
      cell(r.risk, { bold: true, color: T.navy }),
      cell(r.type),
      { text: r.probabilityLabel, options: { fill: { color: band.fill }, color: T.white, bold: true, fontSize: 8, fontFace: F.face, align: "center" as const, valign: "middle" as const, margin: 3, border: { type: "solid" as const, pt: 0.5, color: T.white } } },
      cell(r.impact, { align: "center" as const, bold: true }),
      cell(r.mitigation),
    ];
  });

  slide.addTable([headerRow, ...bodyRows] as never, {
    x: L.marginX, y: top, w: CONTENT_W, colW, autoPage: false,
  });
  guard.mark();
  guard.assert(content.title);
}

// ===========================================================================
// 8. 100-day timeline (three phases)
// ===========================================================================
export function renderTimelineSlide(pres: pptxgen, content: TimelineContent): void {
  const guard = new VisualGuard();
  const slide = newContentSlide(pres);
  renderSectionHeader(slide, content.sectionLabel);
  renderSlideTitle(slide, content.title);

  const top = L.contentTop + 0.2;
  addPhaseTimeline(slide, L.marginX, top, CONTENT_W, L.H - top - 0.4, content.phases.slice(0, 3), guard);
  guard.assert(content.title);
}

// ===========================================================================
// 9. Function grid 3×3 (Workstreams)
// ===========================================================================
export function renderFunctionGridSlide(pres: pptxgen, content: WorkstreamContent): void {
  const guard = new VisualGuard();
  const slide = newContentSlide(pres);
  renderSectionHeader(slide, content.sectionLabel);
  renderSlideTitle(slide, content.title);

  const accents = [T.teal, T.navyMd, T.amber];
  const cards = content.cards.slice(0, 9).map((c, i) => ({
    title: c.title, body: c.body, accent: accents[i % accents.length],
  }));
  const top = L.contentTop + 0.15;
  const cols = cards.length <= 4 ? 2 : 3;
  addCardGrid(slide, L.marginX, top, CONTENT_W, L.H - top - 0.4, cards, cols, guard);
  guard.assert(content.title);
}

// ===========================================================================
// 10. Recommendation (closing, dark)
// ===========================================================================
export function renderRecommendationSlide(pres: pptxgen, content: RecommendationContent): void {
  const slide = pres.addSlide();
  slide.background = { color: T.navy };
  slide.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: 0.55, h: L.H, fill: { color: T.teal }, line: { type: "none" } });

  slide.addText(content.sectionLabel.toUpperCase(), {
    x: 0.85, y: 0.45, w: 5.5, h: 0.26,
    fontFace: F.face, fontSize: 10, bold: true, color: T.teal, charSpacing: 3,
  });
  slide.addText(clean(content.verdict), {
    x: 0.85, y: 0.9, w: 5.5, h: 1.1,
    fontFace: F.face, fontSize: 40, bold: true, color: T.white, valign: "middle",
  });
  if (content.confidence) {
    slide.addShape(pres.ShapeType.roundRect, { x: 0.85, y: 2.05, w: 1.9, h: 0.34, fill: { color: T.teal }, line: { type: "none" }, rectRadius: 0.05 } as never);
    slide.addText(clean(content.confidence), {
      x: 0.85, y: 2.05, w: 1.9, h: 0.34,
      fontFace: F.face, fontSize: 10, bold: true, color: T.white, align: "center", valign: "middle",
    });
  }
  slide.addShape(pres.ShapeType.rect, { x: 0.85, y: 2.6, w: 5.2, h: 0.014, fill: { color: T.navyMd }, line: { type: "none" } });
  slide.addText(fitText(content.justification, "justification"), {
    x: 0.85, y: 2.78, w: 5.2, h: 1.6,
    fontFace: F.face, fontSize: 11, color: T.steelBl, valign: "top", lineSpacingMultiple: 1.2,
  });

  // right: immediate next steps
  const rx = 6.4;
  const rw = L.W - rx - 0.4;
  slide.addText("IMMEDIATE NEXT STEPS", {
    x: rx, y: 0.9, w: rw, h: 0.28,
    fontFace: F.face, fontSize: 11, bold: true, color: T.teal, charSpacing: 1,
  });
  let ny = 1.35;
  content.nextSteps.slice(0, 4).forEach((s, i) => {
    slide.addShape(pres.ShapeType.ellipse, { x: rx, y: ny, w: 0.3, h: 0.3, fill: { color: T.teal }, line: { type: "none" } });
    slide.addText(String(i + 1), { x: rx, y: ny, w: 0.3, h: 0.3, fontFace: F.face, fontSize: 11, bold: true, color: T.white, align: "center", valign: "middle" });
    slide.addText(fitText(s, "bulletPoint"), {
      x: rx + 0.42, y: ny - 0.02, w: rw - 0.42, h: 0.55,
      fontFace: F.face, fontSize: 9.5, color: T.white, valign: "top",
    });
    ny += 0.7;
  });

  // bottom: risk-adjusted value range bar
  if (content.valueRange) {
    slide.addShape(pres.ShapeType.rect, { x: 0.85, y: L.H - 0.7, w: L.W - 1.25, h: 0.42, fill: { color: T.navyMd }, line: { type: "none" } });
    slide.addText("RISK-ADJUSTED VALUE RANGE", {
      x: 1.0, y: L.H - 0.7, w: 3.0, h: 0.42,
      fontFace: F.face, fontSize: 8, bold: true, color: T.teal, charSpacing: 1, valign: "middle",
    });
    slide.addText(content.valueRange, {
      x: 4.0, y: L.H - 0.7, w: L.W - 4.4, h: 0.42,
      fontFace: F.face, fontSize: 13, bold: true, color: T.white, align: "right", valign: "middle",
    });
  }
}

// ===========================================================================
// Generic content fallback — guarantees a visual for unmapped sections.
// ===========================================================================
export function renderGenericContentSlide(pres: pptxgen, content: GenericCardContent): void {
  const guard = new VisualGuard();
  const slide = newContentSlide(pres);
  renderSectionHeader(slide, content.sectionLabel);
  renderSlideTitle(slide, content.title);

  let top = L.contentTop + 0.15;

  if (content.metrics && content.metrics.length) {
    const m = content.metrics.slice(0, 4);
    const gap = 0.15;
    const mW = (CONTENT_W - (m.length - 1) * gap) / m.length;
    m.forEach((mc, i) => addMetricCallout(slide, L.marginX + i * (mW + gap), top, mW, 1.0, mc, T.teal, guard));
    top += 1.2;
  }

  if (content.table && content.table.length) {
    const rows = content.table.slice(0, 8); // cap rows so the table never overruns
    const colCount = Math.max(...rows.map((r) => r.length));
    // Weight column widths by average content length (text columns get more room).
    const avgLen = Array.from({ length: colCount }, (_, c) => {
      const lens = rows.map((r) => (r[c] ?? "").length);
      return Math.max(4, lens.reduce((a, b) => a + b, 0) / lens.length);
    });
    const totalLen = avgLen.reduce((a, b) => a + b, 0);
    const minW = 0.7;
    const flexW = CONTENT_W - minW * colCount;
    const colW = avgLen.map((l) => minW + flexW * (l / totalLen));
    const manyRows = rows.length > 6;
    const tableData = rows.map((row, r) => row.map((cell) => ({
      text: fitText(cell, "tableCell"),
      options: {
        fill: { color: r === 0 ? T.navy : (r % 2 === 1 ? T.gray50 : T.white) },
        color: r === 0 ? T.white : T.text,
        bold: r === 0,
        fontSize: manyRows ? 7.5 : 8.5, fontFace: F.face, valign: "middle" as const, margin: 3,
        border: { type: "solid" as const, pt: 0.5, color: T.gray200 },
      },
    })));
    slide.addTable(tableData as never, { x: L.marginX, y: top, w: CONTENT_W, colW, autoPage: false });
    guard.mark();
    top += 0.5;
  } else if (content.cards && content.cards.length) {
    const cards = content.cards.slice(0, 6).map((c) => ({ title: c.title, body: c.body, accent: T.teal }));
    const cols = cards.length <= 2 ? 1 : (cards.length <= 6 ? 2 : 3);
    addCardGrid(slide, L.marginX, top, CONTENT_W, L.H - top - 0.4, cards, cols, guard);
  }

  if (content.footnote) {
    slide.addText(fitText(content.footnote, "footnote"), {
      x: L.marginX, y: L.H - 0.5, w: CONTENT_W, h: 0.22,
      fontFace: F.face, fontSize: F.footnoteSize, italic: true, color: T.muted,
    });
  }

  guard.assert(content.title);
}

// ===========================================================================
// Scorecard — dimension bars + composite callout (Deal Score).
// ===========================================================================
export interface ScoreDimension {
  name: string;
  score: number;        // 0-10
  rationale: string;
}
export interface ScorecardContent {
  sectionLabel: string;
  title: string;
  composite?: string;   // e.g. "7.25 / 10"
  verdict?: string;     // e.g. "Moderate"
  dimensions: ScoreDimension[];
}

export function renderScorecardSlide(pres: pptxgen, content: ScorecardContent): void {
  const guard = new VisualGuard();
  const slide = newContentSlide(pres);
  renderSectionHeader(slide, content.sectionLabel);
  renderSlideTitle(slide, content.title);

  const top = L.contentTop + 0.2;
  const dims = content.dimensions.slice(0, 6);

  // Left: composite callout
  const calloutW = 2.2;
  if (content.composite) {
    addMetricCallout(slide, L.marginX, top, calloutW, 1.5,
      { value: content.composite, label: "Composite Score", sub: content.verdict }, T.teal, guard);
  }

  // Right: horizontal score bars per dimension
  const bx = content.composite ? L.marginX + calloutW + 0.3 : L.marginX;
  const bw = L.W - bx - L.marginX;
  const availH = L.H - top - 0.4;
  const rowH = Math.min(0.62, availH / Math.max(dims.length, 1));
  const labelW = 1.5;
  const trackX = bx + labelW + 0.1;
  const trackW = bw - labelW - 0.6;

  dims.forEach((d, i) => {
    const y = top + i * rowH;
    const frac = Math.max(0, Math.min(1, d.score / 10));
    const bandColor = d.score >= 7.5 ? T.green : d.score >= 5 ? T.teal : T.amber;
    slide.addText(clean(d.name), {
      x: bx, y, w: labelW, h: rowH * 0.55,
      fontFace: F.face, fontSize: 8.5, bold: true, color: T.navy, valign: "middle",
    });
    // track + fill
    slide.addShape(pres.ShapeType.rect, { x: trackX, y: y + rowH * 0.12, w: trackW, h: 0.16, fill: { color: T.gray200 }, line: { type: "none" } });
    slide.addShape(pres.ShapeType.rect, { x: trackX, y: y + rowH * 0.12, w: Math.max(0.04, trackW * frac), h: 0.16, fill: { color: bandColor }, line: { type: "none" } });
    slide.addText(`${d.score}`, {
      x: trackX + trackW + 0.06, y: y + rowH * 0.02, w: 0.5, h: 0.26,
      fontFace: F.face, fontSize: 9.5, bold: true, color: bandColor, valign: "middle",
    });
    // rationale under the bar (one short line)
    slide.addText(capWords(clean(d.rationale), 14), {
      x: bx, y: y + rowH * 0.5, w: bw - 0.1, h: rowH * 0.48,
      fontFace: F.face, fontSize: 7.5, color: T.muted, valign: "top",
    });
  });
  guard.mark();
  guard.assert(content.title);
}
