

/**
 * Consulting-grade PPTX exporter for Deal IQ advisory, PMI, synergy, and TSA documents.
 * Completely redesigned to match McKinsey-style aesthetic: crisp layouts, deep blues,
 * robust table parsing, and seamless pagination for overflowing text.
 */

import pptxgen from "pptxgenjs";
import { splitIntoSections } from "@/lib/proposal/visual-renderer";

export type DealMeta = {
  buyer: string;
  target: string;
  sector?: string;
  geography?: string;
  dealSize?: string;
  clientName?: string;
  moduleLabel?: string;
};

// McKinsey-inspired Consulting Palette
const BRAND = {
  blue: "051C2C", // McKinsey Navy
  teal: "00A9E0", // Vibrant structural blue
  green: "78BE20", // Accent green
  navy: "020D1A", // Darker background
  ink: "101820",  // Main text
  body: "333F48", // Body text
  muted: "68717A",// Subtle
  rule: "D1D5DB", // Lines
  paleBlue: "F0F7FA",
  paleGreen: "F4F9F1",
};

const FONT_TITLE = "Arial"; // Extremely stable cross-platform font
const FONT_BODY = "Arial";
const SLIDE_W = 13.33;
const SLIDE_H = 7.5;

export async function exportProposalToPptx(
  proposalMd: string,
  meta: DealMeta,
  citationsMd?: string,
  filename?: string,
): Promise<void> {
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  pptx.title = `${meta.buyer} → ${meta.target} — ${meta.moduleLabel ?? "Advisory"}`;
  pptx.author = meta.clientName || "Deal IQ AI";
  pptx.company = "Deal IQ AI";
  pptx.subject = "Consulting-grade generated deal document";

  defineMasters(pptx);
  addTitleSlide(pptx, meta);

  const sections = splitIntoSections(proposalMd);
  sections.forEach((section) => addPaginatedSection(pptx, section.heading, section.body, meta));

  if (citationsMd) addCitationsSlide(pptx, citationsMd, meta);
  addClosingSlide(pptx, meta);

  await pptx.writeFile({ fileName: filename || `${slugify(meta.buyer)}-${slugify(meta.target)}-${slugify(meta.moduleLabel ?? "deck")}.pptx` });
}

function defineMasters(pptx: pptxgen): void {
  pptx.defineSlideMaster({
    title: "CONTENT_MASTER",
    background: { color: "FFFFFF" },
    objects: [
      { rect: { x: 0, y: 0, w: SLIDE_W, h: 0.15, fill: { color: BRAND.blue } } },
      { rect: { x: 0.5, y: 7.0, w: SLIDE_W - 1, h: 0.01, fill: { color: BRAND.rule } } },
      { text: { text: "CONFIDENTIAL · DEAL IQ AI", options: { x: 0.5, y: 7.05, w: 6, h: 0.3, fontFace: FONT_BODY, fontSize: 8, color: BRAND.muted } } },
    ],
    slideNumber: { x: 12.0, y: 7.05, w: 1, h: 0.3, fontFace: FONT_BODY, fontSize: 8, color: BRAND.muted, align: "right" },
  });
}

function addTitleSlide(pptx: pptxgen, meta: DealMeta): void {
  const slide = pptx.addSlide();
  slide.background = { color: BRAND.blue };
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 6.8, w: SLIDE_W, h: 0.7, fill: { color: "FFFFFF" } });
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 6.6, w: SLIDE_W * 0.4, h: 0.2, fill: { color: BRAND.teal } });

  slide.addText("CONFIDENTIAL WORKING DRAFT", { x: 0.8, y: 0.8, w: 10, h: 0.3, fontFace: FONT_BODY, fontSize: 12, bold: true, color: "FFFFFF", charSpacing: 2 });
  slide.addText(`${meta.buyer || "—"}\nAcquisition of ${meta.target || "—"}`, { x: 0.8, y: 2.0, w: 11.5, h: 2.5, fontFace: FONT_TITLE, fontSize: 44, bold: true, color: "FFFFFF", breakLine: true, valign: "top" });
  slide.addText(`${(meta.moduleLabel ?? "Strategic Advisory Report").toUpperCase()}`, { x: 0.8, y: 4.8, w: 10, h: 0.4, fontFace: FONT_BODY, fontSize: 18, color: BRAND.teal, bold: true });
  slide.addText(`${[meta.sector, meta.geography, meta.dealSize].filter(Boolean).join("  |  ")}`, { x: 0.8, y: 5.3, w: 10, h: 0.3, fontFace: FONT_BODY, fontSize: 14, color: "FFFFFF" });
  slide.addText(`Prepared by ${meta.clientName || "Deal IQ AI"}`, { x: 0.8, y: 7.0, w: 5, h: 0.3, fontFace: FONT_BODY, fontSize: 11, color: BRAND.muted, bold: true });
  slide.addText(`${new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}`, { x: 10.5, y: 7.0, w: 2, h: 0.3, fontFace: FONT_BODY, fontSize: 11, color: BRAND.muted, align: "right" });
}

function addSectionHeader(slide: pptxgen.Slide, heading: string, meta: DealMeta, subtitle?: string): void {
  slide.addText(stripNumberingPrefix(heading).toUpperCase(), { x: 0.5, y: 0.35, w: 11, h: 0.5, fontFace: FONT_TITLE, fontSize: 24, bold: true, color: BRAND.blue });
  slide.addText(subtitle || `${meta.buyer || "Buyer"} / ${meta.target || "Target"}`, { x: 0.5, y: 0.85, w: 11, h: 0.3, fontFace: FONT_BODY, fontSize: 12, color: BRAND.muted });
}

type ContentBlock = { type: "text", content: string } | { type: "table", rows: string[][] };

function extractBlocks(md: string): ContentBlock[] {
  const lines = md.split('\n');
  const blocks: ContentBlock[] = [];
  let currentText: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('|') && line.endsWith('|')) {
      if (currentText.length > 0) {
        blocks.push({ type: "text", content: currentText.join('\n') });
        currentText = [];
      }
      const tableRows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
        const rowLine = lines[i].trim();
        if (!/^\|[\s\-:|]+\|$/.test(rowLine)) {
          // Do not strip `**` here! We need them for bold parsing
          tableRows.push(rowLine.slice(1, -1).split('|').map(c => c.trim().replace(/_/g, '')));
        }
        i++;
      }
      i--;
      blocks.push({ type: "table", rows: tableRows });
    } else {
      currentText.push(lines[i]);
    }
  }
  if (currentText.length > 0) {
    blocks.push({ type: "text", content: currentText.join('\n') });
  }
  return blocks;
}

function parseFormattedText(text: string) {
  const parts = text.split(/(\*\*.*?\*\*)/g).filter(Boolean);
  return parts.map(part => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return { text: part.slice(2, -2), options: { bold: true, color: BRAND.ink } };
    }
    return { text: part, options: { bold: false, color: BRAND.body } };
  });
}

function estimateHeight(text: string, fontSize: number): number {
  const charsPerLine = 130;
  const lines = Math.ceil(text.length / charsPerLine) + (text.split('\n').length - 1);
  return Math.max(0.4, lines * 0.22);
}

function addPaginatedSection(pptx: pptxgen, heading: string, body: string, meta: DealMeta): void {
  const blocks = extractBlocks(body);
  let currentSlide = pptx.addSlide({ masterName: "CONTENT_MASTER" });
  let yPos = 1.4;
  let pageNum = 1;

  addSectionHeader(currentSlide, heading, meta);

  for (const block of blocks) {
    if (block.type === "text") {
      const items = block.content.split(/\n(?:\s*\n)+|\n(?=[-*\d])/).map(i => i.trim()).filter(i => i.length > 0);

      for (const item of items) {
        const estH = estimateHeight(item, 11);
        if (yPos + estH > 6.8) {
          currentSlide = pptx.addSlide({ masterName: "CONTENT_MASTER" });
          pageNum++;
          addSectionHeader(currentSlide, heading, meta, `(continued)`);
          yPos = 1.4;
        }

        const textClean = item.replace(/^[-*]\s*/, '').replace(/^\d+\.\s*/, '');

        // Consulting square marker
        currentSlide.addShape(pptx.ShapeType.rect, { x: 0.5, y: yPos + 0.08, w: 0.06, h: 0.06, fill: { color: BRAND.teal } });

        currentSlide.addText(parseFormattedText(textClean), {
          x: 0.7, y: yPos, w: 12.0, h: estH,
          fontFace: FONT_BODY, fontSize: 11, valign: "top", wrap: true
        });

        yPos += estH + 0.15;
      }
    } else if (block.type === "table") {
      if (yPos > 4.5) {
        currentSlide = pptx.addSlide({ masterName: "CONTENT_MASTER" });
        pageNum++;
        addSectionHeader(currentSlide, heading, meta, `(continued)`);
        yPos = 1.4;
      }

      const colCount = Math.max(...block.rows.map(r => r.length));
      const colW = Array(colCount).fill(12.33 / colCount);

      const tableData = block.rows.map((row, rIdx) => row.map(cell => ({
        text: parseFormattedText(cell),
        options: {
          fill: { color: rIdx === 0 ? BRAND.blue : (rIdx % 2 === 0 ? BRAND.paleBlue : "FFFFFF") },
          color: rIdx === 0 ? "FFFFFF" : BRAND.ink,
          bold: rIdx === 0,
          fontSize: rIdx === 0 ? 11 : 10,
          border: { type: "solid", pt: 1, color: "FFFFFF" },
          margin: 0.1,
          valign: "middle" as const,
        }
      })));

      currentSlide.addTable(tableData as any, {
        x: 0.5, y: yPos, w: 12.33, colW,
        autoPage: true, autoPageLineWeight: 0, newSlideStartY: 1.4
      });

      yPos = 8.0; // Force a new slide for anything following a table block
    }
  }
}

function addCitationsSlide(pptx: pptxgen, citationsMd: string, meta: DealMeta): void {
  const lines = citationsMd.split("\n").filter(l => /^\[\d+\]/.test(l.trim())).slice(0, 80);
  if (!lines.length) return;
  addPaginatedSection(pptx, "Sources & Citations", lines.join('\n\n'), meta);
}

function addClosingSlide(pptx: pptxgen, meta: DealMeta): void {
  const slide = pptx.addSlide();
  slide.background = { color: BRAND.navy };
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: SLIDE_W, h: 0.22, fill: { color: BRAND.blue } });
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0.22, w: SLIDE_W * 0.62, h: 0.16, fill: { color: BRAND.teal } });
  
  slide.addText("From insight to action", { x: 0.7, y: 2.45, w: 11.8, h: 0.7, fontFace: FONT_TITLE, fontSize: 34, bold: true, color: "FFFFFF", align: "center" });
  slide.addText(`${meta.buyer || "—"} → ${meta.target || "—"}`, { x: 0.7, y: 3.42, w: 11.8, h: 0.45, fontFace: FONT_BODY, fontSize: 16, color: "D9E2EC", align: "center" });
  slide.addText("Deal IQ AI · Strategy · Value · Execution", { x: 0.7, y: 4.12, w: 11.8, h: 0.35, fontFace: FONT_BODY, fontSize: 11, bold: true, color: BRAND.green, align: "center", charSpacing: 2 });
  slide.addText("CONFIDENTIAL", { x: 0.7, y: 6.95, w: 11.8, h: 0.24, fontFace: FONT_BODY, fontSize: 8, color: "FFFFFF", align: "center", charSpacing: 4 });
}

function slugify(s: string): string {
  return (s || "deal").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

function stripNumberingPrefix(s: string): string {
  return s.replace(/^\d+\.\s+/, "");
}
