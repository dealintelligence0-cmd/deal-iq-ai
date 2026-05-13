/**
 * Consulting-grade PPTX exporter for Deal IQ documents.
 *
 * Design principles:
 * - Preserve all generated content by paginating bullets, prose and tables.
 * - Avoid text overlap by using fixed content slots and conservative font sizes.
 * - Keep the requested Deal IQ palette: blue #007CB0, teal #0097A9, green #86BC25.
 * - Use clean consulting-style section headers, takeaways, tables and footers.
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

type ContentBlock =
  | { kind: "bullets"; items: string[] }
  | { kind: "table"; rows: string[][] }
  | { kind: "prose"; paragraphs: string[] };

const BRAND = {
  blue: "007CB0",
  teal: "0097A9",
  green: "86BC25",
  navy: "0B1F33",
  ink: "16212B",
  body: "34495E",
  muted: "6B7C8F",
  line: "D7E1E8",
  paleBlue: "E6F4F8",
  paleTeal: "E6F6F8",
  paleGreen: "F1F8E8",
  offWhite: "F7FAFC",
};

const FONT_HEAD = "Aptos Display";
const FONT_BODY = "Aptos";
const W = 13.33;
const H = 7.5;
const CONTENT_X = 0.62;
const CONTENT_W = 12.1;

export async function exportProposalToPptx(
  proposalMd: string,
  meta: DealMeta,
  citationsMd?: string,
  filename?: string,
): Promise<void> {
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = meta.clientName || "Deal IQ AI";
  pptx.company = "Deal IQ AI";
  pptx.subject = "Deal IQ generated consulting document";
  pptx.title = `${meta.buyer || "Buyer"} → ${meta.target || "Target"} — ${meta.moduleLabel ?? "Advisory"}`;

  defineMaster(pptx);

  const sections = splitIntoSections(proposalMd).filter((s) => s.heading || s.body.trim());
  addCover(pptx, meta);
  addAgenda(pptx, sections.map((s) => s.heading), meta);

  const executive = sections.find((s) => /executive summary|transaction overview|summary/i.test(s.heading));
  if (executive) addExecutiveSummary(pptx, executive.heading, executive.body, meta);

  sections.forEach((section, index) => {
    addSectionSlides(pptx, section.heading, section.body, index + 1, meta);
  });

  if (citationsMd?.trim()) addCitationSlides(pptx, citationsMd, meta);
  addClosing(pptx, meta);

  await pptx.writeFile({
    fileName: filename || `${slugify(meta.buyer)}-${slugify(meta.target)}-${slugify(meta.moduleLabel ?? "deck")}.pptx`,
  });
}

function defineMaster(pptx: pptxgen): void {
  pptx.defineSlideMaster({
    title: "DEAL_IQ_CONTENT",
    background: { color: "FFFFFF" },
    objects: [
      { rect: { x: 0, y: 0, w: W, h: 0.1, fill: { color: BRAND.blue }, line: { color: BRAND.blue } } },
      { rect: { x: 0, y: 0.1, w: 8.6, h: 0.05, fill: { color: BRAND.teal }, line: { color: BRAND.teal } } },
      { rect: { x: 0, y: 0.15, w: 5.2, h: 0.05, fill: { color: BRAND.green }, line: { color: BRAND.green } } },
      { rect: { x: CONTENT_X, y: 7.03, w: CONTENT_W, h: 0.01, fill: { color: BRAND.line }, line: { color: BRAND.line } } },
      { text: { text: "DEAL IQ AI · CONFIDENTIAL", options: { x: CONTENT_X, y: 7.13, w: 5.4, h: 0.25, fontFace: FONT_BODY, fontSize: 7.5, bold: true, color: BRAND.muted, charSpacing: 1 } } },
    ],
    slideNumber: { x: 12.25, y: 7.13, w: 0.5, h: 0.25, fontFace: FONT_BODY, fontSize: 7.5, color: BRAND.muted, align: "right" },
  });
}

function addCover(pptx: pptxgen, meta: DealMeta): void {
  const slide = pptx.addSlide();
  slide.background = { color: BRAND.navy };
  slide.addShape("rect", { x: 0, y: 0, w: W, h: H, fill: { color: BRAND.navy }, line: { color: BRAND.navy } });
  slide.addShape("rect", { x: 0, y: 0, w: W, h: 0.18, fill: { color: BRAND.blue }, line: { color: BRAND.blue } });
  slide.addShape("rect", { x: 0, y: 0.18, w: 8.6, h: 0.12, fill: { color: BRAND.teal }, line: { color: BRAND.teal } });
  slide.addShape("rect", { x: 0, y: 0.3, w: 5.2, h: 0.09, fill: { color: BRAND.green }, line: { color: BRAND.green } });
  slide.addShape("rect", { x: 8.75, y: 1.05, w: 3.95, h: 4.5, fill: { color: "FFFFFF", transparency: 92 }, line: { color: BRAND.teal, transparency: 20 } });

  slide.addText("DEAL IQ AI", { x: 0.75, y: 0.72, w: 4.8, h: 0.25, fontFace: FONT_BODY, fontSize: 10, bold: true, color: "FFFFFF", charSpacing: 5 });
  slide.addText((meta.moduleLabel ?? "M&A Advisory Proposal").toUpperCase(), { x: 0.75, y: 1.35, w: 6.6, h: 0.35, fontFace: FONT_BODY, fontSize: 11, bold: true, color: BRAND.green, charSpacing: 1.8 });
  slide.addText(`${meta.buyer || "Buyer"}\n→ ${meta.target || "Target"}`, { x: 0.75, y: 1.9, w: 7.35, h: 1.85, fontFace: FONT_HEAD, fontSize: 34, bold: true, color: "FFFFFF", fit: "shrink", breakLine: false });
  slide.addText([meta.sector, meta.geography, meta.dealSize].filter(Boolean).join("  ·  ") || "Deal intelligence document", { x: 0.78, y: 4.03, w: 7.15, h: 0.35, fontFace: FONT_BODY, fontSize: 12, color: "D7E1E8", fit: "shrink" });

  addCoverMetric(slide, 9.1, 1.4, "01", "Strategic thesis", "Why this deal matters and where value is created", BRAND.blue);
  addCoverMetric(slide, 9.1, 2.55, "02", "Execution agenda", "Workstreams, governance, risks and decisions", BRAND.teal);
  addCoverMetric(slide, 9.1, 3.7, "03", "Partner actions", "Prioritised next steps for leadership alignment", BRAND.green);

  slide.addText(`Prepared ${new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}`, { x: 0.78, y: 6.34, w: 5.2, h: 0.25, fontFace: FONT_BODY, fontSize: 9, color: "FFFFFF" });
  slide.addText("CONFIDENTIAL", { x: 0.78, y: 6.72, w: 3, h: 0.22, fontFace: FONT_BODY, fontSize: 8, bold: true, color: BRAND.green, charSpacing: 3 });
}

function addCoverMetric(slide: pptxgen.Slide, x: number, y: number, num: string, title: string, body: string, color: string): void {
  slide.addShape("roundRect", { x, y, w: 3.22, h: 0.86, rectRadius: 0.08, fill: { color: "FFFFFF", transparency: 88 }, line: { color, transparency: 5, width: 1.2 } });
  slide.addText(num, { x: x + 0.18, y: y + 0.18, w: 0.46, h: 0.28, fontFace: FONT_HEAD, fontSize: 13, bold: true, color });
  slide.addText(title, { x: x + 0.78, y: y + 0.14, w: 2.15, h: 0.22, fontFace: FONT_BODY, fontSize: 9.5, bold: true, color: "FFFFFF" });
  slide.addText(body, { x: x + 0.78, y: y + 0.42, w: 2.18, h: 0.28, fontFace: FONT_BODY, fontSize: 7.4, color: "D7E1E8", fit: "shrink" });
}

function addAgenda(pptx: pptxgen, headings: string[], meta: DealMeta): void {
  const slide = pptx.addSlide({ masterName: "DEAL_IQ_CONTENT" });
  addHeader(slide, "Contents", "How this document is structured", meta);
  const agenda = headings.slice(0, 12);
  agenda.forEach((heading, idx) => {
    const col = idx < 6 ? 0 : 1;
    const row = idx % 6;
    const x = 0.72 + col * 6.05;
    const y = 1.35 + row * 0.78;
    const color = [BRAND.blue, BRAND.teal, BRAND.green][idx % 3];
    slide.addShape("rect", { x, y: y + 0.08, w: 0.08, h: 0.45, fill: { color }, line: { color } });
    slide.addText(String(idx + 1).padStart(2, "0"), { x: x + 0.18, y, w: 0.44, h: 0.22, fontFace: FONT_HEAD, fontSize: 10, bold: true, color });
    slide.addText(cleanText(stripNumberingPrefix(heading)), { x: x + 0.72, y: y - 0.02, w: 4.7, h: 0.38, fontFace: FONT_BODY, fontSize: 12, bold: true, color: BRAND.ink, fit: "shrink" });
  });
}

function addExecutiveSummary(pptx: pptxgen, heading: string, body: string, meta: DealMeta): void {
  const slide = pptx.addSlide({ masterName: "DEAL_IQ_CONTENT" });
  addHeader(slide, stripNumberingPrefix(heading), "Executive takeaways for senior stakeholders", meta);
  const items = blockToItems(parseSectionBody(body)).slice(0, 6);
  items.forEach((item, idx) => {
    const col = idx % 2;
    const row = Math.floor(idx / 2);
    const x = 0.72 + col * 6.05;
    const y = 1.32 + row * 1.52;
    const color = [BRAND.blue, BRAND.teal, BRAND.green][idx % 3];
    slide.addShape("roundRect", { x, y, w: 5.62, h: 1.12, rectRadius: 0.08, fill: { color: idx % 2 ? BRAND.paleTeal : BRAND.paleBlue }, line: { color: BRAND.line } });
    slide.addShape("rect", { x, y, w: 0.1, h: 1.12, fill: { color }, line: { color } });
    slide.addText(`0${idx + 1}`, { x: x + 0.25, y: y + 0.15, w: 0.48, h: 0.24, fontFace: FONT_HEAD, fontSize: 12, bold: true, color });
    slide.addText(item, { x: x + 0.82, y: y + 0.14, w: 4.35, h: 0.68, fontFace: FONT_BODY, fontSize: 9.6, color: BRAND.body, bold: idx === 0, fit: "shrink", valign: "top" });
  });
}

function addSectionSlides(pptx: pptxgen, heading: string, body: string, sectionNumber: number, meta: DealMeta): void {
  const parsed = parseSectionBody(body);
  if (parsed.kind === "table") {
    paginateTable(parsed.rows).forEach((rows, pageIndex) => {
      const slide = pptx.addSlide({ masterName: "DEAL_IQ_CONTENT" });
      addHeader(slide, stripNumberingPrefix(heading), pageIndex ? `Table continued · ${metaLine(meta)}` : metaLine(meta), meta, sectionNumber, pageIndex + 1);
      drawTable(slide, rows, 1.28);
    });
    return;
  }

  const items = blockToItems(parsed);
  chunk(items, 6).forEach((pageItems, pageIndex) => {
    const slide = pptx.addSlide({ masterName: "DEAL_IQ_CONTENT" });
    addHeader(slide, stripNumberingPrefix(heading), pageIndex ? `Continued · ${metaLine(meta)}` : metaLine(meta), meta, sectionNumber, pageIndex + 1);
    drawMessageStack(slide, pageItems, 1.3);
  });
}

function addCitationSlides(pptx: pptxgen, citationsMd: string, meta: DealMeta): void {
  const lines = citationsMd.split("\n").map(cleanText).filter(Boolean);
  chunk(lines, 12).forEach((pageItems, pageIndex) => {
    const slide = pptx.addSlide({ masterName: "DEAL_IQ_CONTENT" });
    addHeader(slide, "Sources and citations", pageIndex ? "Continued" : "References used in generation", meta, undefined, pageIndex + 1);
    drawMessageStack(slide, pageItems, 1.3, true);
  });
}

function addClosing(pptx: pptxgen, meta: DealMeta): void {
  const slide = pptx.addSlide();
  slide.background = { color: BRAND.navy };
  slide.addShape("rect", { x: 0, y: 0, w: W, h: H, fill: { color: BRAND.navy }, line: { color: BRAND.navy } });
  slide.addShape("rect", { x: 0, y: 0, w: W, h: 0.18, fill: { color: BRAND.blue }, line: { color: BRAND.blue } });
  slide.addShape("rect", { x: 0, y: 0.18, w: 8.6, h: 0.12, fill: { color: BRAND.teal }, line: { color: BRAND.teal } });
  slide.addShape("rect", { x: 0, y: 0.3, w: 5.2, h: 0.09, fill: { color: BRAND.green }, line: { color: BRAND.green } });
  slide.addText("Next step: align on the decision agenda", { x: 0.8, y: 2.45, w: 11.7, h: 0.6, fontFace: FONT_HEAD, fontSize: 30, bold: true, color: "FFFFFF", align: "center" });
  slide.addText(`${meta.buyer || "Buyer"} → ${meta.target || "Target"}`, { x: 0.8, y: 3.35, w: 11.7, h: 0.35, fontFace: FONT_BODY, fontSize: 14, color: "D7E1E8", align: "center" });
  slide.addText("Deal IQ AI · Strategy · Value · Execution", { x: 0.8, y: 4.05, w: 11.7, h: 0.32, fontFace: FONT_BODY, fontSize: 10.5, bold: true, color: BRAND.green, align: "center", charSpacing: 2 });
  slide.addText("CONFIDENTIAL", { x: 0.8, y: 6.85, w: 11.7, h: 0.24, fontFace: FONT_BODY, fontSize: 8, color: "FFFFFF", align: "center", charSpacing: 4 });
}

function addHeader(slide: pptxgen.Slide, title: string, subtitle: string, meta: DealMeta, sectionNumber?: number, page?: number): void {
  if (sectionNumber !== undefined) {
    slide.addText(String(sectionNumber).padStart(2, "0"), { x: 0.62, y: 0.4, w: 0.52, h: 0.28, fontFace: FONT_HEAD, fontSize: 14, bold: true, color: BRAND.blue });
    slide.addShape("rect", { x: 1.22, y: 0.43, w: 0.02, h: 0.42, fill: { color: BRAND.line }, line: { color: BRAND.line } });
  }
  slide.addText(title, { x: sectionNumber === undefined ? 0.62 : 1.38, y: 0.34, w: sectionNumber === undefined ? 9.6 : 8.8, h: 0.38, fontFace: FONT_HEAD, fontSize: 20, bold: true, color: BRAND.ink, fit: "shrink" });
  slide.addText(subtitle || metaLine(meta), { x: sectionNumber === undefined ? 0.64 : 1.4, y: 0.82, w: 9.7, h: 0.22, fontFace: FONT_BODY, fontSize: 8.2, color: BRAND.muted, fit: "shrink" });
  slide.addShape("rect", { x: 11.12, y: 0.38, w: 0.38, h: 0.15, fill: { color: BRAND.blue }, line: { color: BRAND.blue } });
  slide.addShape("rect", { x: 11.58, y: 0.38, w: 0.38, h: 0.15, fill: { color: BRAND.teal }, line: { color: BRAND.teal } });
  slide.addShape("rect", { x: 12.04, y: 0.38, w: 0.38, h: 0.15, fill: { color: BRAND.green }, line: { color: BRAND.green } });
  if (page && page > 1) slide.addText(`Page ${page}`, { x: 11.1, y: 0.76, w: 1.3, h: 0.2, fontFace: FONT_BODY, fontSize: 8, color: BRAND.muted, align: "right" });
}

function drawMessageStack(slide: pptxgen.Slide, items: string[], yStart: number, compact = false): void {
  const slotH = compact ? 0.42 : 0.78;
  const cardH = compact ? 0.34 : 0.64;
  items.forEach((item, idx) => {
    const y = yStart + idx * slotH;
    const color = [BRAND.blue, BRAND.teal, BRAND.green][idx % 3];
    slide.addShape("roundRect", { x: CONTENT_X, y, w: CONTENT_W, h: cardH, rectRadius: 0.05, fill: { color: idx % 2 ? "FFFFFF" : BRAND.offWhite }, line: { color: BRAND.line } });
    slide.addShape("rect", { x: CONTENT_X, y, w: 0.08, h: cardH, fill: { color }, line: { color } });
    slide.addText(String(idx + 1).padStart(2, "0"), { x: CONTENT_X + 0.22, y: y + 0.12, w: 0.36, h: 0.18, fontFace: FONT_HEAD, fontSize: compact ? 7.8 : 9.2, bold: true, color });
    const [lead, rest] = splitLead(item);
    slide.addText([
      { text: lead, options: { bold: true, color: BRAND.ink } },
      { text: rest ? ` — ${rest}` : "", options: { bold: false, color: BRAND.body } },
    ], { x: CONTENT_X + 0.72, y: y + 0.08, w: 10.9, h: cardH - 0.12, fontFace: FONT_BODY, fontSize: compact ? 7.2 : 9.2, fit: "shrink", valign: "top", breakLine: false });
  });
}

function drawTable(slide: pptxgen.Slide, rows: string[][], y: number): void {
  if (!rows.length) return;
  const colCount = Math.min(Math.max(...rows.map((row) => row.length)), 7);
  const normalizedRows = rows.map((row) => Array.from({ length: colCount }, (_, idx) => cleanText(row[idx] ?? "")));
  const data = normalizedRows.map((row, rowIdx) => row.map((cell) => ({
    text: cell,
    options: {
      fontFace: FONT_BODY,
      fontSize: rowIdx === 0 ? 7.4 : 6.7,
      bold: rowIdx === 0,
      color: rowIdx === 0 ? "FFFFFF" : BRAND.body,
      fill: { color: rowIdx === 0 ? BRAND.blue : rowIdx % 2 ? "FFFFFF" : BRAND.offWhite },
      valign: "middle" as const,
      margin: 0.035,
    },
  })));
  slide.addTable(data, {
    x: CONTENT_X,
    y,
    w: CONTENT_W,
    colW: Array(colCount).fill(CONTENT_W / colCount),
    rowH: 0.43,
    border: { type: "solid", pt: 0.35, color: BRAND.line },
    fontFace: FONT_BODY,
  });
}

function parseSectionBody(body: string): ContentBlock {
  const lines = body.split("\n");
  const tableLines = lines.filter((line) => /^\s*\|.*\|\s*$/.test(line));
  if (tableLines.length >= 2) {
    const rows = tableLines
      .filter((line) => !/^\s*\|[\s\-:|]+\|\s*$/.test(line))
      .map((line) => line.trim().slice(1, -1).split("|").map(cleanText));
    if (rows.length >= 2) return { kind: "table", rows };
  }

  const nonBlank = lines.map((line) => line.trim()).filter(Boolean);
  const bulletLines = nonBlank.filter((line) => /^([-*]|\d+\.)\s+/.test(line));
  if (bulletLines.length >= Math.max(2, Math.ceil(nonBlank.length * 0.4))) {
    return { kind: "bullets", items: nonBlank.map((line) => cleanText(line.replace(/^([-*]|\d+\.)\s+/, ""))).filter(Boolean) };
  }

  const paragraphs = body.split(/\n\s*\n/).map(cleanText).filter(Boolean);
  return { kind: "prose", paragraphs: paragraphs.length ? paragraphs : [cleanText(body)] };
}

function blockToItems(block: ContentBlock): string[] {
  if (block.kind === "bullets") return block.items.flatMap((item) => splitLong(item, 210));
  if (block.kind === "table") return block.rows.slice(1).map((row) => row.join(" — ")).flatMap((item) => splitLong(item, 210));
  return block.paragraphs.flatMap((paragraph) => {
    const sentences = paragraph.split(/(?<=[.!?])\s+(?=[A-Z0-9₹$])/).map(cleanText).filter(Boolean);
    return (sentences.length ? sentences : [paragraph]).flatMap((item) => splitLong(item, 210));
  });
}

function paginateTable(rows: string[][]): string[][][] {
  if (rows.length <= 1) return [rows];
  const [header, ...body] = rows;
  return chunk(body, 9).map((page) => [header, ...page]);
}

function splitLong(text: string, max: number): string[] {
  const cleaned = cleanText(text);
  if (cleaned.length <= max) return [cleaned];
  const parts: string[] = [];
  let rest = cleaned;
  while (rest.length > max) {
    const cut = Math.max(rest.lastIndexOf(" ", max), Math.floor(max * 0.75));
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

function splitLead(text: string): [string, string] {
  const cleaned = cleanText(text);
  const match = /^(.{4,64}?)(?:\s*[:—–-]\s+)(.+)$/.exec(cleaned);
  return match ? [match[1], match[2]] : [cleaned, ""];
}

function metaLine(meta: DealMeta): string {
  return [meta.buyer && meta.target ? `${meta.buyer} → ${meta.target}` : "", meta.sector, meta.geography, meta.dealSize].filter(Boolean).join(" · ");
}

function cleanText(text: string): string {
  return text
    .replace(/\[\^?\d+\]/g, "")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out.length ? out : [[]];
}

function stripNumberingPrefix(s: string): string {
  return s.replace(/^\d+\.\s+/, "");
}

function slugify(s: string): string {
  return (s || "deal").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 42);
}
