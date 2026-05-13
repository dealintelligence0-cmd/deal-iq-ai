/**
 * Consulting-grade PPTX exporter for Deal IQ advisory, PMI, synergy, and TSA documents.
 * It preserves the full generated markdown by paginating long prose/tables across
 * multiple slides instead of truncating overflowing text.
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

const BRAND = {
  blue: "007CB0",
  teal: "0097A9",
  green: "86BC25",
  navy: "0B1F33",
  ink: "102A43",
  body: "334E68",
  muted: "627D98",
  rule: "D9E2EC",
  paleBlue: "E6F4F8",
  paleGreen: "F1F8E8",
};

const FONT_TITLE = "Aptos Display";
const FONT_BODY = "Aptos";
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
  addExecutiveSnapshot(pptx, proposalMd, meta);

  const sections = splitIntoSections(proposalMd);
  sections.forEach((section, idx) => addPaginatedSection(pptx, section.heading, section.body, idx + 1, meta));

  if (citationsMd) addCitationsSlide(pptx, citationsMd);
  addClosingSlide(pptx, meta);

  await pptx.writeFile({ fileName: filename || `${slugify(meta.buyer)}-${slugify(meta.target)}-${slugify(meta.moduleLabel ?? "deck")}.pptx` });
}

function defineMasters(pptx: pptxgen): void {
  pptx.defineSlideMaster({
    title: "DEAL_IQ_CONTENT",
    background: { color: "FFFFFF" },
    objects: [
      { rect: { x: 0, y: 0, w: SLIDE_W, h: 0.09, fill: { color: BRAND.blue }, line: { color: BRAND.blue } } },
      { rect: { x: 0, y: 0.09, w: SLIDE_W * 0.62, h: 0.05, fill: { color: BRAND.teal }, line: { color: BRAND.teal } } },
      { rect: { x: 0, y: 0.14, w: SLIDE_W * 0.38, h: 0.05, fill: { color: BRAND.green }, line: { color: BRAND.green } } },
      { rect: { x: 0.45, y: 7.04, w: 12.43, h: 0.01, fill: { color: BRAND.rule }, line: { color: BRAND.rule } } },
      { text: { text: "DEAL IQ AI · CONFIDENTIAL", options: { x: 0.5, y: 7.13, w: 5, h: 0.25, fontFace: FONT_BODY, fontSize: 7.5, bold: true, color: BRAND.muted, charSpacing: 1 } } },
    ],
    slideNumber: { x: 12.4, y: 7.13, w: 0.5, h: 0.25, fontFace: FONT_BODY, fontSize: 7.5, color: BRAND.muted, align: "right" },
  });
}

function addTitleSlide(pptx: pptxgen, meta: DealMeta): void {
  const slide = pptx.addSlide();
  slide.background = { color: BRAND.navy };
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: SLIDE_W, h: SLIDE_H, fill: { color: BRAND.navy }, line: { color: BRAND.navy } });
  slide.addShape(pptx.ShapeType.arc, { x: 8.2, y: -1.5, w: 5.8, h: 5.8, line: { color: BRAND.teal, transparency: 25, width: 2 } });
  slide.addShape(pptx.ShapeType.arc, { x: 9.1, y: 4.6, w: 4.8, h: 4.8, line: { color: BRAND.green, transparency: 20, width: 2 } });
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 6.75, w: SLIDE_W, h: 0.22, fill: { color: BRAND.blue }, line: { color: BRAND.blue } });
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 6.97, w: SLIDE_W * 0.58, h: 0.16, fill: { color: BRAND.teal }, line: { color: BRAND.teal } });
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 7.13, w: SLIDE_W * 0.35, h: 0.12, fill: { color: BRAND.green }, line: { color: BRAND.green } });

  slide.addText("DEAL IQ AI", { x: 0.7, y: 0.52, w: 5, h: 0.3, fontFace: FONT_BODY, fontSize: 10, bold: true, color: "FFFFFF", charSpacing: 5 });
  slide.addText((meta.moduleLabel ?? "M&A Advisory").toUpperCase(), { x: 0.7, y: 1.25, w: 5.7, h: 0.35, fontFace: FONT_BODY, fontSize: 11, bold: true, color: BRAND.green, charSpacing: 2 });
  slide.addText(`${meta.buyer || "—"}\n→ ${meta.target || "—"}`, { x: 0.7, y: 1.72, w: 8.4, h: 2.25, fontFace: FONT_TITLE, fontSize: 38, bold: true, color: "FFFFFF", breakLine: false, fit: "shrink" });
  slide.addText([meta.sector, meta.geography, meta.dealSize].filter(Boolean).join("  ·  ") || "Deal intelligence workpaper", { x: 0.72, y: 4.25, w: 7.8, h: 0.35, fontFace: FONT_BODY, fontSize: 12, color: "CFE8EF" });

  addIconMetric(slide, "●", "Strategy", "Rationale and value thesis", 9.35, 1.45, BRAND.blue);
  addIconMetric(slide, "◆", "Execution", "PMI, TSA and governance", 9.35, 2.58, BRAND.teal);
  addIconMetric(slide, "▲", "Value", "Synergies, risks and next steps", 9.35, 3.71, BRAND.green);
  slide.addText(`Prepared ${new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })} · CONFIDENTIAL`, { x: 0.72, y: 6.22, w: 7, h: 0.28, fontFace: FONT_BODY, fontSize: 9, color: "D9E2EC" });
}

function addIconMetric(slide: pptxgen.Slide, icon: string, title: string, body: string, x: number, y: number, color: string): void {
  slide.addShape("roundRect", { x, y, w: 3.25, h: 0.78, fill: { color: "FFFFFF", transparency: 90 }, line: { color, transparency: 15 }, rectRadius: 0.08 });
  slide.addText(icon, { x: x + 0.16, y: y + 0.16, w: 0.32, h: 0.3, fontSize: 14, bold: true, color, fontFace: FONT_BODY });
  slide.addText(title, { x: x + 0.58, y: y + 0.12, w: 2.45, h: 0.22, fontSize: 10, bold: true, color: "FFFFFF", fontFace: FONT_BODY });
  slide.addText(body, { x: x + 0.58, y: y + 0.38, w: 2.45, h: 0.22, fontSize: 7.5, color: "D9E2EC", fontFace: FONT_BODY });
}

function addExecutiveSnapshot(pptx: pptxgen, md: string, meta: DealMeta): void {
  const slide = pptx.addSlide({ masterName: "CONTENT_MASTER" });
  addSectionHeader(slide, "Executive snapshot", "00", meta);
  const sections = splitIntoSections(md).slice(0, 6);
  sections.forEach((section, idx) => {
    const x = 0.55 + (idx % 3) * 4.18;
    const y = 1.35 + Math.floor(idx / 3) * 2.25;
    const color = [BRAND.blue, BRAND.teal, BRAND.green][idx % 3];
    slide.addShape("roundRect", { x, y, w: 3.85, h: 1.78, fill: { color: idx % 2 ? "FFFFFF" : BRAND.paleBlue }, line: { color: BRAND.rule }, rectRadius: 0.08 });
    slide.addText(["●", "◆", "▲"][idx % 3], { x: x + 0.18, y: y + 0.14, w: 0.25, h: 0.25, fontSize: 10, bold: true, color });
    slide.addText(stripNumberingPrefix(section.heading), { x: x + 0.5, y: y + 0.12, w: 3.1, h: 0.3, fontFace: FONT_BODY, fontSize: 10.5, bold: true, color: BRAND.ink, fit: "shrink" });
    slide.addText(firstSentence(section.body), { x: x + 0.2, y: y + 0.55, w: 3.45, h: 0.9, fontFace: FONT_BODY, fontSize: 8.5, color: BRAND.body, fit: "shrink", valign: "top" });
  });
}

function addPaginatedSection(pptx: pptxgen, heading: string, body: string, num: number, meta: DealMeta): void {
  const parsed = parseBody(body);
  if (parsed.kind === "table") {
    chunk(parsed.rows.slice(1), 10).forEach((rows, page) => {
      const slide = pptx.addSlide({ masterName: "CONTENT_MASTER" });
      addSectionHeader(slide, heading, String(num).padStart(2, "0"), meta, page + 1);
      renderTable(slide, [parsed.rows[0], ...rows], 1.35);
    });
    return;
  }

  const items = parsed.kind === "bullets" ? parsed.items : proseToItems(parsed.text);
  chunk(items, 9).forEach((itemsPage, page) => {
    const slide = pptx.addSlide({ masterName: "CONTENT_MASTER" });
    addSectionHeader(slide, heading, String(num).padStart(2, "0"), meta, page + 1);
    renderConsultingBullets(slide, itemsPage, 1.38);
  });
}

function addSectionHeader(slide: pptxgen.Slide, heading: string, num: string, meta: DealMeta, page?: number): void {
  slide.addText(num, { x: 0.52, y: 0.37, w: 0.58, h: 0.42, fontFace: FONT_TITLE, fontSize: 20, bold: true, color: BRAND.blue });
  slide.addText(`${stripNumberingPrefix(heading)}${page && page > 1 ? ` (${page})` : ""}`, { x: 1.15, y: 0.39, w: 9.4, h: 0.38, fontFace: FONT_TITLE, fontSize: 20, bold: true, color: BRAND.ink, fit: "shrink" });
  slide.addText([meta.buyer, meta.target, meta.sector, meta.geography].filter(Boolean).join(" · "), { x: 1.16, y: 0.82, w: 9.6, h: 0.22, fontFace: FONT_BODY, fontSize: 8, color: BRAND.muted, fit: "shrink" });
  slide.addShape("rect", { x: 11.1, y: 0.36, w: 0.38, h: 0.18, fill: { color: BRAND.blue }, line: { color: BRAND.blue } });
  slide.addShape("rect", { x: 11.55, y: 0.36, w: 0.38, h: 0.18, fill: { color: BRAND.teal }, line: { color: BRAND.teal } });
  slide.addShape("rect", { x: 12.0, y: 0.36, w: 0.38, h: 0.18, fill: { color: BRAND.green }, line: { color: BRAND.green } });
}

type Renderable =
  | { kind: "table"; rows: string[][] }
  | { kind: "bullets"; items: string[] }
  | { kind: "text"; text: string };

function parseBody(body: string): Renderable {
  const trimmed = body.trim();
  if (!trimmed) return { kind: "text", text: "No content generated." };
  const lines = trimmed.split("\n");
  const tableLines = lines.filter((l) => /^\s*\|.*\|\s*$/.test(l));
  if (tableLines.length >= 2) {
    const rows = tableLines
      .filter((l) => !/^\s*\|[\s\-:|]+\|\s*$/.test(l))
      .map((l) => l.trim().slice(1, -1).split("|").map(cleanCell));
    if (rows.length >= 2) return { kind: "table", rows };
  }
  const nonBlank = lines.filter((l) => l.trim());
  if (nonBlank.some((l) => /^\s*([-*]|\d+\.)\s+/.test(l))) {
    return { kind: "bullets", items: nonBlank.map((l) => cleanCell(l.replace(/^\s*([-*]|\d+\.)\s+/, ""))).filter(Boolean) };
  }
  return { kind: "text", text: cleanCell(trimmed) };
}

function renderConsultingBullets(slide: pptxgen.Slide, items: string[], yStart: number): void {
  items.forEach((item, idx) => {
    const y = yStart + idx * 0.58;
    const color = [BRAND.blue, BRAND.teal, BRAND.green][idx % 3];
    slide.addText(["●", "◆", "▲"][idx % 3], { x: 0.68, y: y + 0.04, w: 0.24, h: 0.25, fontSize: 9, bold: true, color });
    const [lead, rest] = splitLead(item);
    slide.addText([
      { text: lead, options: { bold: true, color: BRAND.ink } },
      { text: rest ? ` — ${rest}` : "", options: { bold: false, color: BRAND.body } },
    ], { x: 1.02, y, w: 11.3, h: 0.46, fontFace: FONT_BODY, fontSize: 10.5, fit: "shrink", valign: "top", breakLine: false });
  });
}

function renderTable(slide: pptxgen.Slide, rows: string[][], yStart: number): void {
  const colCount = Math.max(...rows.map((row) => row.length));
  const colW = Array(colCount).fill(12.1 / colCount);
  const data = rows.map((row, rowIndex) => Array.from({ length: colCount }, (_, colIndex) => ({
    text: row[colIndex] ?? "",
    options: {
      fontFace: FONT_BODY,
      fontSize: rowIndex === 0 ? 8.5 : 7.6,
      color: rowIndex === 0 ? "FFFFFF" : BRAND.body,
      bold: rowIndex === 0,
      fill: { color: rowIndex === 0 ? BRAND.blue : (rowIndex % 2 ? "FFFFFF" : "F8FBFC") },
      valign: "middle" as const,
      margin: 0.04,
    },
  })));
  slide.addTable(data, { x: 0.58, y: yStart, w: 12.1, colW, border: { type: "solid", pt: 0.35, color: BRAND.rule }, rowH: 0.42, fontFace: FONT_BODY });
}

function addCitationsSlide(pptx: pptxgen, citationsMd: string): void {
  const lines = citationsMd.split("\n").filter((line) => line.trim()).slice(0, 80);
  chunk(lines, 18).forEach((page, idx) => {
    const slide = pptx.addSlide({ masterName: "CONTENT_MASTER" });
    addSectionHeader(slide, "Sources & citations", "S", { buyer: "Sources", target: "Citations" }, idx + 1);
    renderConsultingBullets(slide, page.map(cleanCell), 1.35);
  });
}

function addClosingSlide(pptx: pptxgen, meta: DealMeta): void {
  const slide = pptx.addSlide();
  slide.background = { color: BRAND.navy };
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: SLIDE_W, h: 0.22, fill: { color: BRAND.blue }, line: { color: BRAND.blue } });
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0.22, w: SLIDE_W * 0.62, h: 0.16, fill: { color: BRAND.teal }, line: { color: BRAND.teal } });
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0.38, w: SLIDE_W * 0.38, h: 0.12, fill: { color: BRAND.green }, line: { color: BRAND.green } });
  slide.addText("From insight to action", { x: 0.7, y: 2.45, w: 11.8, h: 0.7, fontFace: FONT_TITLE, fontSize: 34, bold: true, color: "FFFFFF", align: "center" });
  slide.addText(`${meta.buyer || "—"} → ${meta.target || "—"}`, { x: 0.7, y: 3.42, w: 11.8, h: 0.45, fontFace: FONT_BODY, fontSize: 16, color: "D9E2EC", align: "center" });
  slide.addText("Deal IQ AI · Strategy · Value · Execution", { x: 0.7, y: 4.12, w: 11.8, h: 0.35, fontFace: FONT_BODY, fontSize: 11, bold: true, color: BRAND.green, align: "center", charSpacing: 2 });
  slide.addText("CONFIDENTIAL", { x: 0.7, y: 6.95, w: 11.8, h: 0.24, fontFace: FONT_BODY, fontSize: 8, color: "FFFFFF", align: "center", charSpacing: 4 });
}

function proseToItems(text: string): string[] {
  return text.split(/(?<=[.!?])\s+(?=[A-Z0-9])/).flatMap((sentence) => wrapText(sentence, 180)).filter(Boolean);
}

function wrapText(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > max) {
    const cut = Math.max(remaining.lastIndexOf(" ", max), max);
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

function splitLead(text: string): [string, string] {
  const cleaned = cleanCell(text);
  const match = /^([^:—-]{3,58})\s*[:—-]\s*(.+)$/.exec(cleaned);
  return match ? [match[1], match[2]] : [cleaned, ""];
}

function cleanCell(text: string): string {
  return text.replace(/\[\^?\d+\]/g, "").replace(/\*\*/g, "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function firstSentence(text: string): string {
  return cleanCell(text).split(/(?<=[.!?])\s+/)[0]?.slice(0, 240) || "Section generated for this deal.";
}

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result.length ? result : [[]];
}

function slugify(s: string): string {
  return (s || "deal").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

function stripNumberingPrefix(s: string): string {
  return s.replace(/^\d+\.\s+/, "");
}

