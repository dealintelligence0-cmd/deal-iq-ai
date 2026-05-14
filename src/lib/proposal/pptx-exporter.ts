

/**
 * Deal IQ AI — Consulting-grade PPTX exporter (MBB / Big4 visual wrapper).
 *
 * IMPORTANT: This is a PRESENTATION-LAYER rewrite only.
 * - We do NOT change which sections appear, or in what order.
 * - We do NOT change AI prompts, generation behaviour, or content.
 * - The same `splitIntoSections(...)` from visual-renderer is used so this
 *   exporter sees exactly the same section list the on-screen renderer sees.
 *
 * Visual language: McKinsey-style — deep navy cover, teal accents, blue chart
 * series, green for value/upside callouts. Cards, KPI tiles, banded dividers,
 * action-title headers, sidebar narrative.
 */

import pptxgen from "pptxgenjs";
import { splitIntoSections } from "@/lib/proposal/visual-renderer";
import { classifyHeading, type SectionKind } from "@/lib/proposal/mbb/section-classifier";
import { MBB, FONT, SLIDE, BRAND } from "@/lib/proposal/mbb/theme";

export type DealMeta = {
  buyer: string;
  target: string;
  sector?: string;
  geography?: string;
  dealSize?: string;
  clientName?: string;
  moduleLabel?: string;
};

// ===========================================================================
// Public entry
// ===========================================================================
export async function exportProposalToPptx(
  proposalMd: string,
  meta: DealMeta,
  citationsMd?: string,
  filename?: string,
): Promise<void> {
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  pptx.title = `${meta.buyer} → ${meta.target} — ${meta.moduleLabel ?? "Advisory"}`;
  pptx.author = meta.clientName || BRAND.name;
  pptx.company = BRAND.name;
  pptx.subject = "Consulting-grade generated deal document";

  defineMasters(pptx);

  // 1) Cover
  addCoverSlide(pptx, meta);

  // 2) Agenda / contents
  const sections = splitIntoSections(proposalMd);
  if (sections.length > 1) addAgendaSlide(pptx, sections.map((s) => s.heading), meta);

  // 3) For each section: divider + paginated content
  sections.forEach((section, idx) => {
    const num = String(idx + 1).padStart(2, "0");
    const kind = classifyHeading(section.heading);
    addSectionDivider(pptx, num, section.heading, kind, meta);
    addPaginatedContent(pptx, section.heading, section.body, kind, meta);
  });

  // 4) Sources
  if (citationsMd) addCitationsSlide(pptx, citationsMd, meta);

  // 5) Back cover
  addClosingSlide(pptx, meta);

  await pptx.writeFile({
    fileName: filename ||
      `${slugify(meta.buyer)}-${slugify(meta.target)}-${slugify(meta.moduleLabel ?? "deck")}.pptx`,
  });
}

// ===========================================================================
// Masters
// ===========================================================================
function defineMasters(pptx: pptxgen): void {
  // CONTENT_MASTER — clean white background with top navy band + teal accent
  pptx.defineSlideMaster({
    title: "CONTENT_MASTER",
    background: { color: MBB.white },
    objects: [
      // Top navy rule
      { rect: { x: 0, y: 0, w: SLIDE.W, h: 0.08, fill: { color: MBB.navy }, line: { color: MBB.navy } } },
      // Teal accent square in top-left
      { rect: { x: 0, y: 0, w: 0.22, h: 0.22, fill: { color: MBB.teal }, line: { color: MBB.teal } } },
      // Brand wordmark top-right
      {
        text: {
          text: BRAND.name.toUpperCase(),
          options: { x: SLIDE.W - 2.3, y: 0.18, w: 2.0, h: 0.22, fontFace: FONT.body, fontSize: 8, bold: true, color: MBB.navy, charSpacing: 3, align: "right" },
        },
      },
      // Bottom hairline
      { rect: { x: SLIDE.marginX, y: 7.05, w: SLIDE.W - 2 * SLIDE.marginX, h: 0.008, fill: { color: MBB.rule }, line: { color: MBB.rule } } },
      // Footer left — confidential
      { text: { text: BRAND.confidential, options: { x: SLIDE.marginX, y: 7.12, w: 5, h: 0.22, fontFace: FONT.body, fontSize: 8, color: MBB.tealDark, bold: true, charSpacing: 2 } } },
      // Footer center — brand tagline
      { text: { text: BRAND.tagline, options: { x: 4.5, y: 7.12, w: 4.5, h: 0.22, fontFace: FONT.body, fontSize: 8, color: MBB.muted, align: "center" } } },
    ],
    slideNumber: {
      x: SLIDE.W - SLIDE.marginX - 0.6, y: 7.12, w: 0.6, h: 0.22,
      fontFace: FONT.body, fontSize: 8, color: MBB.tealDark, align: "right", bold: true,
    },
  });

  // DIVIDER_MASTER — full-bleed navy/teal section dividers
  pptx.defineSlideMaster({
    title: "DIVIDER_MASTER",
    background: { color: MBB.navy },
    objects: [
      // Teal vertical bar on right edge
      { rect: { x: SLIDE.W - 0.6, y: 0, w: 0.6, h: SLIDE.H, fill: { color: MBB.teal }, line: { color: MBB.teal } } },
      // Green sliver
      { rect: { x: SLIDE.W - 0.6, y: 0, w: 0.6, h: 1.8, fill: { color: MBB.green }, line: { color: MBB.green } } },
      // Brand wordmark
      { text: { text: BRAND.name.toUpperCase(), options: { x: 0.6, y: 0.5, w: 5, h: 0.3, fontFace: FONT.body, fontSize: 9, bold: true, color: MBB.teal, charSpacing: 4 } } },
    ],
  });
}

// ===========================================================================
// Cover slide
// ===========================================================================
function addCoverSlide(pptx: pptxgen, meta: DealMeta): void {
  const slide = pptx.addSlide();
  slide.background = { color: MBB.navy };

  // Decorative gradient overlay shapes
  slide.addShape(pptx.ShapeType.rect, {
    x: SLIDE.W * 0.55, y: 0, w: SLIDE.W * 0.45, h: SLIDE.H * 0.45,
    fill: { type: "solid", color: MBB.blueDeep, transparency: 30 } as any,
    line: { color: MBB.blueDeep, width: 0 },
  });
  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: SLIDE.H * 0.7, w: SLIDE.W, h: SLIDE.H * 0.3,
    fill: { type: "solid", color: MBB.tealDark, transparency: 65 } as any,
    line: { color: MBB.tealDark, width: 0 },
  });

  // Top teal marker bar
  slide.addShape(pptx.ShapeType.rect, { x: 0.7, y: 0.7, w: 0.4, h: 0.04, fill: { color: MBB.teal }, line: { color: MBB.teal } });
  slide.addText("DEAL IQ AI  ·  EXECUTIVE BRIEFING", {
    x: 1.2, y: 0.55, w: 8, h: 0.35,
    fontFace: FONT.body, fontSize: 10, bold: true, color: MBB.teal, charSpacing: 4,
  });

  // Top right timestamp
  slide.addText(new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }), {
    x: SLIDE.W - 4, y: 0.55, w: 3.5, h: 0.35,
    fontFace: FONT.body, fontSize: 10, color: "FFFFFF", align: "right", charSpacing: 1.5,
  });

  // Confidential marker
  slide.addText("CONFIDENTIAL · WORKING DRAFT", {
    x: 0.7, y: 2.6, w: 11, h: 0.35,
    fontFace: FONT.body, fontSize: 11, bold: true, color: MBB.teal, charSpacing: 5,
  });

  // Big title — buyer
  slide.addText(meta.buyer || "—", {
    x: 0.7, y: 3.05, w: 12, h: 0.95,
    fontFace: FONT.display, fontSize: 44, bold: true, color: "FFFFFF",
  });

  // Arrow + target
  if (meta.target) {
    slide.addText([
      { text: "→ ", options: { color: MBB.teal, bold: true } as any },
      { text: meta.target, options: { color: "FFFFFF", bold: true } as any },
    ], {
      x: 0.7, y: 3.95, w: 12, h: 0.85,
      fontFace: FONT.display, fontSize: 38,
    });
  }

  // Module label
  slide.addText((meta.moduleLabel ?? "Strategic Advisory Report").toUpperCase(), {
    x: 0.7, y: 5.0, w: 12, h: 0.4,
    fontFace: FONT.body, fontSize: 16, bold: true, color: MBB.teal, charSpacing: 3,
  });

  // Sub-meta line
  const subMeta = [meta.sector, meta.geography, meta.dealSize].filter(Boolean).join("   ·   ");
  if (subMeta) {
    slide.addText(subMeta, {
      x: 0.7, y: 5.45, w: 12, h: 0.35,
      fontFace: FONT.body, fontSize: 13, color: "D9E5EE",
    });
  }

  // Bottom footer — hairline + prepared by + date
  slide.addShape(pptx.ShapeType.rect, { x: 0.7, y: 6.5, w: 12, h: 0.01, fill: { color: "FFFFFF" }, line: { color: "FFFFFF" } });
  slide.addText(`Prepared by ${meta.clientName || BRAND.name}`, {
    x: 0.7, y: 6.6, w: 6, h: 0.3,
    fontFace: FONT.body, fontSize: 11, bold: true, color: "FFFFFF",
  });
  slide.addText(BRAND.tagline, {
    x: 0.7, y: 6.88, w: 6, h: 0.25,
    fontFace: FONT.body, fontSize: 9, color: "B7CEDC", charSpacing: 1.5,
  });
  slide.addText("Confidential — for the named recipient only", {
    x: 6.5, y: 6.88, w: 6.2, h: 0.25,
    fontFace: FONT.body, fontSize: 9, color: "B7CEDC", align: "right",
  });

  // Bottom teal/green strip
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: SLIDE.H - 0.2, w: SLIDE.W, h: 0.2, fill: { color: MBB.teal }, line: { color: MBB.teal } });
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: SLIDE.H - 0.2, w: SLIDE.W * 0.4, h: 0.2, fill: { color: MBB.green }, line: { color: MBB.green } });
}

// ===========================================================================
// Agenda / contents slide
// ===========================================================================
function addAgendaSlide(pptx: pptxgen, headings: string[], meta: DealMeta): void {
  const slide = pptx.addSlide({ masterName: "CONTENT_MASTER" });
  drawHeaderTitle(slide, "Agenda", `Contents of this ${meta.moduleLabel ?? "document"}`);

  const cleanHeads = headings.map((h) => h.replace(/^\d+\.\s*/, "").trim());
  const half = Math.ceil(cleanHeads.length / 2);
  const colA = cleanHeads.slice(0, half);
  const colB = cleanHeads.slice(half);

  const drawCol = (items: string[], xOff: number) => {
    let y = 1.5;
    items.forEach((h, i) => {
      const num = String(xOff === 0.5 ? i + 1 : i + 1 + half).padStart(2, "0");
      // Numbered chip
      slide.addShape(pptx.ShapeType.rect, {
        x: xOff, y, w: 0.45, h: 0.32, fill: { color: MBB.navy }, line: { color: MBB.navy },
      });
      slide.addText(num, {
        x: xOff, y, w: 0.45, h: 0.32,
        fontFace: FONT.body, fontSize: 11, bold: true, color: "FFFFFF", align: "center", valign: "middle",
      });
      // Heading text
      slide.addText(h, {
        x: xOff + 0.55, y, w: 5.4, h: 0.32,
        fontFace: FONT.body, fontSize: 13, color: MBB.ink, valign: "middle", bold: true,
      });
      // Dotted rule
      slide.addShape(pptx.ShapeType.line, {
        x: xOff + 0.55, y: y + 0.4, w: 5.4, h: 0,
        line: { color: MBB.rule, width: 0.5, dashType: "sysDot" },
      });
      y += 0.55;
    });
  };
  drawCol(colA, 0.5);
  if (colB.length) drawCol(colB, 6.7);
}

// ===========================================================================
// Section divider slide
// ===========================================================================
function addSectionDivider(pptx: pptxgen, num: string, heading: string, _kind: SectionKind, meta: DealMeta): void {
  const slide = pptx.addSlide({ masterName: "DIVIDER_MASTER" });

  // Huge number tile (left)
  slide.addText(num, {
    x: 0.6, y: 2.5, w: 4.5, h: 2.5,
    fontFace: FONT.display, fontSize: 180, bold: true, color: MBB.teal, valign: "middle",
  });

  // Section label
  slide.addText("SECTION", {
    x: 5.0, y: 2.55, w: 7, h: 0.3,
    fontFace: FONT.body, fontSize: 10, bold: true, color: MBB.teal, charSpacing: 5,
  });

  // Section title
  slide.addText(stripNumberingPrefix(heading), {
    x: 5.0, y: 2.85, w: 7.5, h: 1.6,
    fontFace: FONT.display, fontSize: 36, bold: true, color: "FFFFFF", valign: "top",
  });

  // Deal context line
  const ctx = [meta.buyer, meta.target].filter(Boolean).join(" → ");
  if (ctx) {
    slide.addText(ctx, {
      x: 5.0, y: 4.6, w: 7, h: 0.35,
      fontFace: FONT.body, fontSize: 13, color: "B7CEDC", italic: true,
    });
  }

  // Bottom rule on left
  slide.addShape(pptx.ShapeType.rect, { x: 5.0, y: 4.5, w: 2.0, h: 0.04, fill: { color: MBB.teal }, line: { color: MBB.teal } });
}

// ===========================================================================
// Content slides — header + sidebar + paginated body
// ===========================================================================

type ContentBlock =
  | { type: "text"; content: string }
  | { type: "h3"; text: string }
  | { type: "table"; rows: string[][] };

function extractBlocks(md: string): ContentBlock[] {
  const lines = md.split("\n");
  const blocks: ContentBlock[] = [];
  let currentText: string[] = [];

  const flushText = () => {
    if (currentText.length > 0) {
      const joined = currentText.join("\n").trim();
      if (joined) blocks.push({ type: "text", content: joined });
      currentText = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // markdown table
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      flushText();
      const tableRows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|") && lines[i].trim().endsWith("|")) {
        const rowLine = lines[i].trim();
        if (!/^\|[\s\-:|]+\|$/.test(rowLine)) {
          tableRows.push(rowLine.slice(1, -1).split("|").map((c) => c.trim()));
        }
        i++;
      }
      i--;
      blocks.push({ type: "table", rows: tableRows });
      continue;
    }

    // ### subhead
    if (/^###\s+/.test(trimmed)) {
      flushText();
      blocks.push({ type: "h3", text: trimmed.replace(/^###\s+/, "") });
      continue;
    }

    currentText.push(line);
  }
  flushText();
  return blocks;
}

function parseFormattedText(text: string) {
  const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g).filter(Boolean);
  return parts.map((part) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return { text: part.slice(2, -2), options: { bold: true, color: MBB.ink } };
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return { text: part.slice(1, -1), options: { fontFace: FONT.mono, color: MBB.tealDark } };
    }
    return { text: part, options: { bold: false, color: MBB.body } };
  });
}

function estimateBlockHeight(text: string, kind: "text" | "h3"): number {
  const charsPerLine = 95;
  const lines = Math.max(1, Math.ceil(text.length / charsPerLine) + (text.split("\n").length - 1));
  if (kind === "h3") return Math.max(0.35, lines * 0.28);
  return Math.max(0.32, lines * 0.22);
}

function addContentHeader(slide: pptxgen.Slide, heading: string, kind: SectionKind, meta: DealMeta, suffix?: string): void {
  // Number chip — we don't know the section number here, so we use a kind label
  const labelMap: Partial<Record<SectionKind, string>> = {
    exec_summary: "EXEC SUMMARY", thesis: "DEAL THESIS", score: "DEAL SCORE",
    synergy: "VALUE CREATION", valuation: "VALUATION", scenario: "SCENARIO",
    risk: "RISK", regulatory: "REGULATORY", must_be_true: "MUST BE TRUE",
    contrarian: "CONTRARIAN", ic_questions: "IC QUESTIONS", recommendation: "RECOMMENDATION",
    market: "MARKET", integration: "INTEGRATION", day1: "DAY 1",
    hundred_day: "100-DAY PLAN", workstream: "WORKSTREAMS", governance: "GOVERNANCE",
    why_us: "WHY US", next_steps: "NEXT STEPS", services: "SERVICES",
    engagement: "ENGAGEMENT", transaction: "TRANSACTION", tsa: "TSA",
    diligence: "DILIGENCE", sources: "SOURCES",
  };
  const tag = labelMap[kind] ?? "INSIGHT";

  // Top-left teal chip
  slide.addShape(pptx_rect, { x: SLIDE.marginX, y: 0.35, w: 1.4, h: 0.22, fill: { color: MBB.teal }, line: { color: MBB.teal } });
  slide.addText(tag, {
    x: SLIDE.marginX, y: 0.35, w: 1.4, h: 0.22,
    fontFace: FONT.body, fontSize: 8.5, bold: true, color: "FFFFFF", align: "center", valign: "middle", charSpacing: 2,
  });

  // Section title (left-aligned, large)
  slide.addText(stripNumberingPrefix(heading), {
    x: SLIDE.marginX, y: 0.6, w: SLIDE.contentW, h: 0.5,
    fontFace: FONT.display, fontSize: 22, bold: true, color: MBB.navy,
  });

  // Subtitle
  const subParts = [meta.buyer, meta.target].filter(Boolean).join(" → ");
  const sub = suffix ? `${subParts}  ·  ${suffix}` : subParts || (meta.moduleLabel ?? "");
  if (sub) {
    slide.addText(sub, {
      x: SLIDE.marginX, y: 1.05, w: SLIDE.contentW, h: 0.25,
      fontFace: FONT.body, fontSize: 11, color: MBB.muted, italic: true,
    });
  }

  // Teal underline
  slide.addShape(pptx_rect, { x: SLIDE.marginX, y: 1.35, w: 1.2, h: 0.03, fill: { color: MBB.teal }, line: { color: MBB.teal } });
}

// Stand-in to satisfy types — pptx is in module scope when called below
let pptx_rect: any = null;

function addPaginatedContent(pptx: pptxgen, heading: string, body: string, kind: SectionKind, meta: DealMeta): void {
  pptx_rect = pptx.ShapeType.rect;
  const blocks = extractBlocks(body);

  let slide = pptx.addSlide({ masterName: "CONTENT_MASTER" });
  addContentHeader(slide, heading, kind, meta);

  // Specialty hero visuals at the top of FIRST content slide
  let yPos = 1.55;

  // 1) Risk → render risk cards grid, replace prose for first page
  if (kind === "risk") {
    const items = body
      .split(/\n\n+/)
      .map((s) => s.replace(/^[-*]\s*/, "").trim())
      .filter((s) => s.length > 12);
    if (items.length >= 2) {
      drawRiskGrid(pptx, slide, items, yPos);
      return;
    }
  }

  // 2) Workstream → grid of functional area cards
  if (kind === "workstream") {
    const matches = Array.from(body.matchAll(/\*\*([^*:\n]+):\*\*\s*([^\n*]+)/g));
    if (matches.length >= 3) {
      drawWorkstreamGrid(pptx, slide, matches.map((m) => ({ title: m[1].trim(), body: m[2].trim() })), yPos);
      return;
    }
  }

  // 3) Synergy hero card-strip
  if (kind === "synergy") {
    const m = /\$\s*([\d.,]+\s*[BMK])\s*revenue[^$]{0,40}\$\s*([\d.,]+\s*[BMK])\s*cost[^$]{0,40}\$\s*([\d.,]+\s*[BMK])/i.exec(body);
    if (m) {
      drawSynergyKpiStrip(pptx, slide, m[1], m[2], m[3], yPos);
      yPos += 1.55;
    }
  }

  // 4) KPI strip for exec_summary / thesis / score / valuation
  if (["exec_summary", "thesis", "score", "valuation"].includes(kind)) {
    const pairs = Array.from(body.matchAll(/\*\*([^*\n:]{2,40}):\*\*\s*([^\n*]{1,40})/g))
      .filter((p) => /[\d$%]/.test(p[2]) && p[2].length < 32)
      .slice(0, 4);
    if (pairs.length >= 2) {
      drawKpiStrip(pptx, slide, pairs.map((p) => ({ label: p[1].trim(), value: p[2].trim() })), yPos);
      yPos += 1.15;
    }
  }

  // Paginated prose / tables
  for (const block of blocks) {
    if (block.type === "text") {
      const items = block.content.split(/\n(?:\s*\n)+|\n(?=[-*\d])/).map((i) => i.trim()).filter((i) => i.length > 0);
      for (const item of items) {
        const estH = estimateBlockHeight(item, "text");
        if (yPos + estH > SLIDE.contentBottom) {
          slide = pptx.addSlide({ masterName: "CONTENT_MASTER" });
          addContentHeader(slide, heading, kind, meta, "continued");
          yPos = 1.55;
        }
        drawTextBullet(slide, item, yPos, kind);
        yPos += estH + 0.14;
      }
    } else if (block.type === "h3") {
      const estH = estimateBlockHeight(block.text, "h3");
      if (yPos + estH > SLIDE.contentBottom - 0.4) {
        slide = pptx.addSlide({ masterName: "CONTENT_MASTER" });
        addContentHeader(slide, heading, kind, meta, "continued");
        yPos = 1.55;
      }
      drawSubhead(slide, block.text, yPos);
      yPos += estH + 0.08;
    } else if (block.type === "table") {
      // Always start tables high enough; if not, force a new slide
      if (yPos > 4.0) {
        slide = pptx.addSlide({ masterName: "CONTENT_MASTER" });
        addContentHeader(slide, heading, kind, meta, "continued");
        yPos = 1.55;
      }
      drawTable(pptx, slide, block.rows, yPos);
      // Tables paginate via pptxgen autoPage; conservatively force next item to a new slide
      yPos = SLIDE.contentBottom + 1;
    }
  }

  // 100-day timeline tail visual
  if (kind === "hundred_day") {
    if (yPos > 5.3) {
      slide = pptx.addSlide({ masterName: "CONTENT_MASTER" });
      addContentHeader(slide, heading, kind, meta, "continued");
      yPos = 1.55;
    }
    draw100DayTimeline(pptx, slide, yPos);
  }
}

// ===========================================================================
// Drawing primitives
// ===========================================================================

function drawHeaderTitle(slide: pptxgen.Slide, title: string, subtitle?: string): void {
  // Teal chip
  slide.addShape(pptx_rect || "rect", { x: SLIDE.marginX, y: 0.35, w: 1.4, h: 0.22, fill: { color: MBB.teal }, line: { color: MBB.teal } });
  slide.addText("DEAL IQ AI", {
    x: SLIDE.marginX, y: 0.35, w: 1.4, h: 0.22,
    fontFace: FONT.body, fontSize: 8.5, bold: true, color: "FFFFFF", align: "center", valign: "middle", charSpacing: 2,
  });
  slide.addText(title, {
    x: SLIDE.marginX, y: 0.6, w: SLIDE.contentW, h: 0.5,
    fontFace: FONT.display, fontSize: 22, bold: true, color: MBB.navy,
  });
  if (subtitle) {
    slide.addText(subtitle, {
      x: SLIDE.marginX, y: 1.05, w: SLIDE.contentW, h: 0.25,
      fontFace: FONT.body, fontSize: 11, color: MBB.muted, italic: true,
    });
  }
  slide.addShape(pptx_rect || "rect", { x: SLIDE.marginX, y: 1.35, w: 1.2, h: 0.03, fill: { color: MBB.teal }, line: { color: MBB.teal } });
}

function drawTextBullet(slide: pptxgen.Slide, item: string, y: number, kind: SectionKind): void {
  const clean = item.replace(/^[-*]\s*/, "").replace(/^\d+\.\s*/, "");
  const accent = kindAccent(kind);
  // Square marker
  slide.addShape(pptx_rect, {
    x: SLIDE.marginX, y: y + 0.07, w: 0.08, h: 0.08,
    fill: { color: accent }, line: { color: accent },
  });
  slide.addText(parseFormattedText(clean), {
    x: SLIDE.marginX + 0.2, y, w: SLIDE.contentW - 0.2, h: estimateBlockHeight(item, "text"),
    fontFace: FONT.body, fontSize: 11.5, valign: "top", color: MBB.body,
    paraSpaceAfter: 2,
  });
}

function drawSubhead(slide: pptxgen.Slide, text: string, y: number): void {
  slide.addText(text, {
    x: SLIDE.marginX, y, w: SLIDE.contentW, h: 0.32,
    fontFace: FONT.body, fontSize: 13, bold: true, color: MBB.tealDark,
  });
  slide.addShape(pptx_rect, { x: SLIDE.marginX, y: y + 0.32, w: 0.5, h: 0.02, fill: { color: MBB.teal }, line: { color: MBB.teal } });
}

function drawTable(pptx: pptxgen, slide: pptxgen.Slide, rows: string[][], y: number): void {
  if (rows.length === 0) return;
  const colCount = Math.max(...rows.map((r) => r.length));
  const colW = Array(colCount).fill(SLIDE.contentW / colCount);

  const tableData = rows.map((row, rIdx) => row.map((cell) => ({
    text: parseFormattedText(cell),
    options: {
      fill: { color: rIdx === 0 ? MBB.navy : (rIdx % 2 === 1 ? MBB.tealPale : MBB.white) },
      color: rIdx === 0 ? "FFFFFF" : MBB.body,
      bold: rIdx === 0,
      fontSize: rIdx === 0 ? 10.5 : 10,
      fontFace: FONT.body,
      border: { type: "solid", pt: 0.5, color: rIdx === 0 ? MBB.navy : MBB.rule },
      margin: 0.08,
      valign: "middle" as const,
      align: rIdx === 0 ? "left" as const : undefined,
    },
  })));

  slide.addTable(tableData as any, {
    x: SLIDE.marginX, y, w: SLIDE.contentW, colW,
    autoPage: true, autoPageLineWeight: 0, newSlideStartY: 1.55,
  });
}

function drawSynergyKpiStrip(pptx: pptxgen, slide: pptxgen.Slide, rev: string, cost: string, total: string, y: number): void {
  const total_w = SLIDE.contentW;
  const gap = 0.12;
  const cardW = (total_w - 2 * gap) / 3;

  const card = (label: string, value: string, accent: string, pale: string, idx: number) => {
    const x = SLIDE.marginX + idx * (cardW + gap);
    // Top accent bar
    slide.addShape(pptx.ShapeType.rect, { x, y, w: cardW, h: 0.08, fill: { color: accent }, line: { color: accent } });
    // Card body
    slide.addShape(pptx.ShapeType.rect, { x, y: y + 0.08, w: cardW, h: 1.25, fill: { color: pale }, line: { color: MBB.rule, width: 0.5 } });
    // Label
    slide.addText(label, {
      x: x + 0.12, y: y + 0.18, w: cardW - 0.24, h: 0.28,
      fontFace: FONT.body, fontSize: 9.5, bold: true, color: MBB.muted, charSpacing: 2, valign: "top",
    });
    // Value
    slide.addText(value.trim(), {
      x: x + 0.12, y: y + 0.5, w: cardW - 0.24, h: 0.8,
      fontFace: FONT.display, fontSize: 30, bold: true, color: MBB.ink, valign: "middle",
    });
  };
  card("REVENUE SYNERGIES", rev, MBB.green, MBB.greenPale, 0);
  card("COST SYNERGIES",    cost, MBB.teal,  MBB.tealPale,  1);
  card("TOTAL VALUE",       total, MBB.blue, MBB.bluePale,  2);
}

function drawKpiStrip(pptx: pptxgen, slide: pptxgen.Slide, items: Array<{ label: string; value: string }>, y: number): void {
  const total_w = SLIDE.contentW;
  const n = items.length;
  const gap = 0.1;
  const cardW = (total_w - (n - 1) * gap) / n;
  const palette = [MBB.teal, MBB.blue, MBB.green, MBB.tealDark];
  items.forEach((it, i) => {
    const x = SLIDE.marginX + i * (cardW + gap);
    const accent = palette[i % palette.length];
    slide.addShape(pptx.ShapeType.rect, { x, y, w: cardW, h: 0.06, fill: { color: accent }, line: { color: accent } });
    slide.addShape(pptx.ShapeType.rect, { x, y: y + 0.06, w: cardW, h: 0.95, fill: { color: MBB.white }, line: { color: MBB.rule, width: 0.5 } });
    slide.addText(it.label.toUpperCase(), {
      x: x + 0.1, y: y + 0.12, w: cardW - 0.2, h: 0.25,
      fontFace: FONT.body, fontSize: 8.5, bold: true, color: MBB.muted, charSpacing: 1.5,
    });
    slide.addText(it.value, {
      x: x + 0.1, y: y + 0.36, w: cardW - 0.2, h: 0.6,
      fontFace: FONT.display, fontSize: 22, bold: true, color: MBB.ink, valign: "middle",
    });
  });
}

function drawRiskGrid(pptx: pptxgen, slide: pptxgen.Slide, items: string[], yStart: number): void {
  // Up to 6 cards, 3 cols × 2 rows
  const cards = items.slice(0, 6);
  const cols = 3;
  const rows = Math.ceil(cards.length / cols);
  const gap = 0.18;
  const cardW = (SLIDE.contentW - (cols - 1) * gap) / cols;
  const availH = SLIDE.contentBottom - yStart;
  const cardH = Math.min(1.85, (availH - (rows - 1) * gap) / rows);

  cards.forEach((line, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = SLIDE.marginX + col * (cardW + gap);
    const y = yStart + row * (cardH + gap);
    // Left red rule
    slide.addShape(pptx.ShapeType.rect, { x, y, w: 0.07, h: cardH, fill: { color: MBB.risk }, line: { color: MBB.risk } });
    slide.addShape(pptx.ShapeType.rect, { x: x + 0.07, y, w: cardW - 0.07, h: cardH, fill: { color: MBB.white }, line: { color: MBB.rule, width: 0.5 } });

    const m = /^(.+?)\s*[—\-:]\s*(.+)$/.exec(line);
    const title = m ? m[1].replace(/^\W+/, "").trim() : line.slice(0, 80);
    const body = m ? m[2].trim() : "";

    slide.addText(title, {
      x: x + 0.18, y: y + 0.08, w: cardW - 0.28, h: 0.4,
      fontFace: FONT.body, fontSize: 11.5, bold: true, color: MBB.ink, valign: "top",
    });
    if (body) {
      slide.addText(parseFormattedText(body), {
        x: x + 0.18, y: y + 0.48, w: cardW - 0.28, h: cardH - 0.52,
        fontFace: FONT.body, fontSize: 9.5, color: MBB.body, valign: "top",
      });
    }
  });
}

function drawWorkstreamGrid(pptx: pptxgen, slide: pptxgen.Slide, items: Array<{ title: string; body: string }>, yStart: number): void {
  const cards = items.slice(0, 8);
  const cols = cards.length <= 4 ? 2 : (cards.length <= 6 ? 3 : 4);
  const rows = Math.ceil(cards.length / cols);
  const gap = 0.16;
  const cardW = (SLIDE.contentW - (cols - 1) * gap) / cols;
  const availH = SLIDE.contentBottom - yStart;
  const cardH = Math.min(2.0, (availH - (rows - 1) * gap) / rows);
  const palette = [MBB.teal, MBB.blue, MBB.green, MBB.tealDark, MBB.navy];

  cards.forEach((it, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = SLIDE.marginX + col * (cardW + gap);
    const y = yStart + row * (cardH + gap);
    const accent = palette[i % palette.length];
    slide.addShape(pptx.ShapeType.rect, { x, y, w: cardW, h: 0.06, fill: { color: accent }, line: { color: accent } });
    slide.addShape(pptx.ShapeType.rect, { x, y: y + 0.06, w: cardW, h: cardH - 0.06, fill: { color: MBB.white }, line: { color: MBB.rule, width: 0.5 } });

    slide.addText(it.title, {
      x: x + 0.14, y: y + 0.16, w: cardW - 0.28, h: 0.32,
      fontFace: FONT.body, fontSize: 11.5, bold: true, color: MBB.ink, valign: "top",
    });
    slide.addText(parseFormattedText(it.body), {
      x: x + 0.14, y: y + 0.52, w: cardW - 0.28, h: cardH - 0.58,
      fontFace: FONT.body, fontSize: 9.5, color: MBB.body, valign: "top",
    });
  });
}

function draw100DayTimeline(pptx: pptxgen, slide: pptxgen.Slide, y: number): void {
  const x0 = SLIDE.marginX;
  const w = SLIDE.contentW;
  // Surface panel
  slide.addShape(pptx.ShapeType.rect, { x: x0, y, w, h: 1.25, fill: { color: MBB.surface }, line: { color: MBB.rule, width: 0.5 } });
  slide.addText("100-DAY ROADMAP", {
    x: x0 + 0.18, y: y + 0.12, w: 5, h: 0.25,
    fontFace: FONT.body, fontSize: 9.5, bold: true, color: MBB.tealDark, charSpacing: 2,
  });
  // Track line
  slide.addShape(pptx.ShapeType.line, {
    x: x0 + 0.8, y: y + 0.75, w: w - 1.6, h: 0,
    line: { color: MBB.teal, width: 2 },
  });
  // Three milestones
  const stops = [
    { label: "Days 1-30", sub: "Stabilise · IMO · Day-1", color: MBB.teal },
    { label: "Days 31-60", sub: "Integrate · Org · GTM", color: MBB.blue },
    { label: "Days 61-100", sub: "Accelerate · Validate", color: MBB.green },
  ];
  stops.forEach((s, i) => {
    const cx = x0 + 0.8 + ((w - 1.6) / 2) * i;
    // Circle
    slide.addShape(pptx.ShapeType.ellipse, { x: cx - 0.15, y: y + 0.6, w: 0.3, h: 0.3, fill: { color: MBB.white }, line: { color: s.color, width: 2.5 } });
    // Label
    slide.addText(s.label, {
      x: cx - 1.4, y: y + 0.95, w: 2.8, h: 0.22,
      fontFace: FONT.body, fontSize: 10, bold: true, color: MBB.ink, align: "center",
    });
    slide.addText(s.sub, {
      x: cx - 1.4, y: y + 1.13, w: 2.8, h: 0.22,
      fontFace: FONT.body, fontSize: 9, color: MBB.muted, align: "center",
    });
  });
}

// ===========================================================================
// Citations & closing
// ===========================================================================
function addCitationsSlide(pptx: pptxgen, citationsMd: string, meta: DealMeta): void {
  const lines = citationsMd.split("\n").filter((l) => /^\[\d+\]/.test(l.trim())).slice(0, 80);
  if (!lines.length) return;

  let slide = pptx.addSlide({ masterName: "CONTENT_MASTER" });
  addContentHeader(slide, "Sources & Citations", "sources", meta);
  let y = 1.55;

  for (const line of lines) {
    if (y > SLIDE.contentBottom - 0.3) {
      slide = pptx.addSlide({ masterName: "CONTENT_MASTER" });
      addContentHeader(slide, "Sources & Citations", "sources", meta, "continued");
      y = 1.55;
    }
    const m = /^\[(\d+)\]\s*(.+)$/.exec(line.trim());
    if (!m) continue;
    const [, n, rest] = m;
    // Number chip
    slide.addShape(pptx_rect, { x: SLIDE.marginX, y, w: 0.42, h: 0.26, fill: { color: MBB.tealPale }, line: { color: MBB.teal, width: 0.5 } });
    slide.addText(`[${n}]`, {
      x: SLIDE.marginX, y, w: 0.42, h: 0.26,
      fontFace: FONT.body, fontSize: 9, bold: true, color: MBB.tealDark, align: "center", valign: "middle",
    });
    slide.addText(rest, {
      x: SLIDE.marginX + 0.55, y, w: SLIDE.contentW - 0.55, h: 0.32,
      fontFace: FONT.body, fontSize: 10, color: MBB.body, valign: "top",
    });
    y += 0.34;
  }
}

function addClosingSlide(pptx: pptxgen, meta: DealMeta): void {
  const slide = pptx.addSlide();
  slide.background = { color: MBB.navyDeep };

  // Top thin teal/green bars
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: SLIDE.W, h: 0.22, fill: { color: MBB.navy }, line: { color: MBB.navy } });
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0.22, w: SLIDE.W * 0.62, h: 0.16, fill: { color: MBB.teal }, line: { color: MBB.teal } });
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0.22, w: SLIDE.W * 0.25, h: 0.16, fill: { color: MBB.green }, line: { color: MBB.green } });

  // Big closing line
  slide.addText("From insight to action.", {
    x: 0.7, y: 2.6, w: 11.8, h: 0.9,
    fontFace: FONT.display, fontSize: 44, bold: true, color: "FFFFFF", align: "center",
  });
  // Deal context
  slide.addText(`${meta.buyer || "—"}  →  ${meta.target || "—"}`, {
    x: 0.7, y: 3.55, w: 11.8, h: 0.45,
    fontFace: FONT.body, fontSize: 18, color: MBB.teal, align: "center", italic: true,
  });
  // Tagline
  slide.addText("Deal IQ AI  ·  Strategy  ·  Value  ·  Execution", {
    x: 0.7, y: 4.3, w: 11.8, h: 0.4,
    fontFace: FONT.body, fontSize: 12, bold: true, color: MBB.green, align: "center", charSpacing: 4,
  });

  // Bottom rule + confidential
  slide.addShape(pptx.ShapeType.line, { x: 4.5, y: 6.6, w: 4.3, h: 0, line: { color: "FFFFFF", width: 0.5 } });
  slide.addText("CONFIDENTIAL", {
    x: 0.7, y: 6.75, w: 11.8, h: 0.24,
    fontFace: FONT.body, fontSize: 9, color: "FFFFFF", align: "center", charSpacing: 5,
  });
  slide.addText(new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }), {
    x: 0.7, y: 7.0, w: 11.8, h: 0.22,
    fontFace: FONT.body, fontSize: 9, color: "B7CEDC", align: "center",
  });
}

// ===========================================================================
// Helpers
// ===========================================================================
function kindAccent(kind: SectionKind): string {
  switch (kind) {
    case "risk":
    case "contrarian":     return MBB.risk;
    case "synergy":
    case "valuation":
    case "recommendation": return MBB.green;
    case "regulatory":     return MBB.warn;
    case "hundred_day":
    case "day1":
    case "integration":    return MBB.blue;
    default:               return MBB.teal;
  }
}

function slugify(s: string): string {
  return (s || "deal").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

function stripNumberingPrefix(s: string): string {
  return s.replace(/^\d+\.\s+/, "");
}
