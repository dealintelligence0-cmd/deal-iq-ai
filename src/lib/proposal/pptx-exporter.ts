

/**
 * Branded PPTX exporter for Deal IQ proposals.
 *
 * Takes a proposal markdown blob (the same `content` field the proposal page
 * displays) plus deal metadata, and produces a Big4-style PowerPoint deck:
 *
 *   1. Title slide — buyer → target, sector, date, "CONFIDENTIAL"
 *   2. One slide per ## section, with the section heading as the slide title
 *      and the body rendered as bullets / tables / paragraphs.
 *   3. Sources slide if citations were supplied.
 *
 * Runs client-side (pptxgenjs has a browser build that emits a Blob) so we
 * don't need an export API route or server-side rendering. The downside is the
 * partner's browser does the work — fine for a 10-20 slide deck.
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
};

// Deal IQ brand palette (kept in sync with Tailwind config)
const BRAND = {
  primary: "4F46E5",      // indigo-600
  primaryDark: "3730A3",  // indigo-800
  accent: "8B5CF6",       // violet-500
  ink: "0F172A",          // slate-900
  body: "334155",         // slate-700
  muted: "64748B",        // slate-500
  rule: "E2E8F0",         // slate-200
  bgTint: "EEF2FF",       // indigo-50
};

const FONT_TITLE = "Calibri";
const FONT_BODY = "Calibri";

/**
 * Top-level entry point. Builds and triggers download of the PPTX.
 */
export async function exportProposalToPptx(
  proposalMd: string,
  meta: DealMeta,
  citationsMd?: string,
  filename?: string,
): Promise<void> {
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";  // 13.33 x 7.5"
  pptx.title = `${meta.buyer} → ${meta.target} — Advisory Proposal`;
  pptx.author = meta.clientName || "Deal IQ AI";
  pptx.company = "Deal IQ AI";

  defineMasters(pptx);

  addTitleSlide(pptx, meta);

  const sections = splitIntoSections(proposalMd);
  sections.forEach((s, idx) => {
    addSectionSlide(pptx, s.heading, s.body, idx + 1, sections.length, meta);
  });

  if (citationsMd) {
    addCitationsSlide(pptx, citationsMd, meta);
  }

  addClosingSlide(pptx, meta);

  const safeName = filename || `${slugify(meta.buyer)}-${slugify(meta.target)}-proposal.pptx`;
  await pptx.writeFile({ fileName: safeName });
}

// ---------------------------------------------------------------------------
// Slide masters — shared header/footer across content slides
// ---------------------------------------------------------------------------
function defineMasters(pptx: pptxgen): void {
  pptx.defineSlideMaster({
    title: "CONTENT_MASTER",
    background: { color: "FFFFFF" },
    objects: [
      // Top brand bar
      { rect: { x: 0, y: 0, w: 13.33, h: 0.08, fill: { color: BRAND.primary } } },
      // Footer rule
      { rect: { x: 0.5, y: 7.05, w: 12.33, h: 0.01, fill: { color: BRAND.rule } } },
      // Deal IQ AI footer mark
      { text: {
          text: "DEAL IQ AI · CONFIDENTIAL",
          options: {
            x: 0.5, y: 7.12, w: 6, h: 0.3,
            fontFace: FONT_BODY, fontSize: 8, color: BRAND.muted, bold: true,
          },
      } },
    ],
    slideNumber: {
      x: 12.6, y: 7.12, w: 0.5, h: 0.3,
      fontFace: FONT_BODY, fontSize: 8, color: BRAND.muted, align: "right",
    },
  });
}

// ---------------------------------------------------------------------------
// Title slide
// ---------------------------------------------------------------------------
function addTitleSlide(pptx: pptxgen, meta: DealMeta): void {
  const slide = pptx.addSlide();
  slide.background = { color: BRAND.primaryDark };

  // Accent diagonal band
  slide.addShape("rect", {
    x: 0, y: 5.5, w: 13.33, h: 2,
    fill: { color: BRAND.primary },
    line: { type: "none" },
  });

  slide.addText("DEAL IQ AI", {
    x: 0.7, y: 0.5, w: 12, h: 0.4,
    fontFace: FONT_TITLE, fontSize: 11, bold: true, color: "FFFFFF",
    charSpacing: 8,
  });

  slide.addText(`${meta.buyer || "—"}\n→ ${meta.target || "—"}`, {
    x: 0.7, y: 1.6, w: 12, h: 2.5,
    fontFace: FONT_TITLE, fontSize: 44, bold: true, color: "FFFFFF",
    valign: "top", lineSpacingMultiple: 0.95,
  });

  slide.addText("M&A ADVISORY PROPOSAL", {
    x: 0.7, y: 4.6, w: 12, h: 0.5,
    fontFace: FONT_TITLE, fontSize: 14, bold: true, color: "C7D2FE",
    charSpacing: 6,
  });

  const metaLine = [
    meta.sector,
    meta.geography,
    meta.dealSize,
  ].filter(Boolean).join("  ·  ");

  if (metaLine) {
    slide.addText(metaLine, {
      x: 0.7, y: 5.15, w: 12, h: 0.4,
      fontFace: FONT_BODY, fontSize: 13, color: "E0E7FF",
    });
  }

  slide.addText(
    `Prepared ${new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}`,
    {
      x: 0.7, y: 5.9, w: 12, h: 0.4,
      fontFace: FONT_BODY, fontSize: 12, color: "FFFFFF",
    },
  );

  if (meta.clientName) {
    slide.addText(`Prepared for: ${meta.clientName}`, {
      x: 0.7, y: 6.4, w: 12, h: 0.4,
      fontFace: FONT_BODY, fontSize: 12, color: "FFFFFF",
    });
  }

  slide.addText("CONFIDENTIAL", {
    x: 0.7, y: 7.0, w: 12, h: 0.3,
    fontFace: FONT_BODY, fontSize: 9, bold: true, color: "C7D2FE",
    charSpacing: 4,
  });
}

// ---------------------------------------------------------------------------
// Content slide — one per ## section
// ---------------------------------------------------------------------------
function addSectionSlide(
  pptx: pptxgen,
  heading: string,
  body: string,
  num: number,
  _total: number,
  meta: DealMeta,
): void {
  const slide = pptx.addSlide({ masterName: "CONTENT_MASTER" });

  // Section number chip + title
  slide.addText(String(num).padStart(2, "0"), {
    x: 0.5, y: 0.35, w: 0.7, h: 0.5,
    fontFace: FONT_TITLE, fontSize: 24, bold: true, color: BRAND.primary,
  });
  slide.addText(stripNumberingPrefix(heading), {
    x: 1.2, y: 0.4, w: 11.6, h: 0.55,
    fontFace: FONT_TITLE, fontSize: 22, bold: true, color: BRAND.ink,
  });
  slide.addShape("rect", {
    x: 0.5, y: 0.97, w: 12.33, h: 0.02,
    fill: { color: BRAND.rule }, line: { type: "none" },
  });

  // Deal-meta chip line
  const chips = [meta.buyer, meta.target, meta.sector, meta.dealSize].filter(Boolean);
  if (chips.length) {
    let chipX = 0.5;
    chips.forEach((c) => {
      const w = Math.min(2.5, Math.max(1.0, (c?.length ?? 0) * 0.085 + 0.3));
      slide.addText(c ?? "", {
        x: chipX, y: 1.1, w, h: 0.3,
        fontFace: FONT_BODY, fontSize: 9, color: BRAND.primaryDark,
        fill: { color: BRAND.bgTint }, align: "center", valign: "middle",
        rectRadius: 0.05,
      });
      chipX += w + 0.1;
    });
  }

  // Body content — render the markdown body intelligently
  const renderable = parseBody(body);
  const contentY = 1.55;

  if (renderable.kind === "table") {
    renderTable(slide, renderable.rows, contentY);
  } else if (renderable.kind === "bullets") {
    renderBullets(slide, renderable.items, contentY);
  } else {
    renderProse(slide, renderable.text, contentY);
  }
}

// ---------------------------------------------------------------------------
// Body parsing — decide whether the section is best shown as a table,
// a bullet list, or prose, then return a normalized shape.
// ---------------------------------------------------------------------------
type Renderable =
  | { kind: "table"; rows: string[][] }
  | { kind: "bullets"; items: { text: string; bold?: boolean }[] }
  | { kind: "text"; text: string };

function parseBody(body: string): Renderable {
  const trimmed = body.trim();
  if (!trimmed) return { kind: "text", text: "(no content)" };

  // Markdown table detection: at least 2 lines starting and ending with |
  const lines = trimmed.split("\n");
  const tableLines = lines.filter((l) => /^\s*\|.*\|\s*$/.test(l));
  if (tableLines.length >= 2) {
    const rows = tableLines
      .filter((l) => !/^\s*\|[\s\-:|]+\|\s*$/.test(l))  // skip |---|---| separator
      .map((l) => l.trim().slice(1, -1).split("|").map((c) => c.trim()));
    if (rows.length >= 2 && rows[0].length >= 2) {
      return { kind: "table", rows };
    }
  }

  // Bullet list detection: every non-empty line starts with - or *
  const nonBlank = lines.filter((l) => l.trim().length > 0);
  if (nonBlank.length >= 3 && nonBlank.every((l) => /^\s*[-*]\s+/.test(l) || /^\s*\d+\.\s+/.test(l))) {
    const items = nonBlank.map((l) => {
      const cleaned = l.replace(/^\s*[-*]\s+/, "").replace(/^\s*\d+\.\s+/, "");
      // Detect leading bold "**Key:** rest"
      const boldMatch = /^\*\*([^*]+)\*\*\s*[:—-]?\s*(.*)$/.exec(cleaned);
      if (boldMatch) {
        return { text: `${boldMatch[1]}: ${boldMatch[2]}`, bold: true };
      }
      return { text: cleaned };
    });
    return { kind: "bullets", items };
  }

  // Mixed prose — split bullets out of long paragraphs
  // Simple heuristic: if there are any bullet-prefixed lines, treat as bullets;
  // otherwise show as prose paragraphs.
  if (nonBlank.some((l) => /^\s*[-*]\s+/.test(l))) {
    const items: { text: string; bold?: boolean }[] = [];
    for (const l of nonBlank) {
      if (/^\s*[-*]\s+/.test(l)) {
        items.push({ text: l.replace(/^\s*[-*]\s+/, "").replace(/\*\*/g, "") });
      } else if (l.trim().length > 0) {
        items.push({ text: l.trim().replace(/\*\*/g, ""), bold: true });
      }
    }
    return { kind: "bullets", items };
  }

  return { kind: "text", text: trimmed.replace(/\*\*/g, "") };
}

function renderTable(slide: pptxgen.Slide, rows: string[][], yStart: number): void {
  if (rows.length === 0) return;
  const cols = rows[0].length;
  const colW = (12.33 / cols);
  const tableData = rows.map((row, ri) =>
    row.map((cell) => ({
      text: cell.replace(/\*\*/g, ""),
      options: {
        fontFace: FONT_BODY,
        fontSize: ri === 0 ? 10 : 9,
        color: ri === 0 ? "FFFFFF" : BRAND.body,
        bold: ri === 0,
        fill: { color: ri === 0 ? BRAND.primary : (ri % 2 === 0 ? "F8FAFC" : "FFFFFF") },
        valign: "middle" as const,
      },
    })),
  );

  slide.addTable(tableData, {
    x: 0.5, y: yStart, w: 12.33,
    colW: Array(cols).fill(colW),
    border: { type: "solid", pt: 0.5, color: BRAND.rule },
    rowH: 0.35,
    fontFace: FONT_BODY,
  });
}

function renderBullets(slide: pptxgen.Slide, items: { text: string; bold?: boolean }[], yStart: number): void {
  // Cap bullets per slide to avoid overflow; if more, summarize.
  const capped = items.slice(0, 14);
  const overflow = items.length - capped.length;

  const textRuns = capped.map((item) => ({
    text: item.text,
    options: {
      fontFace: FONT_BODY,
      fontSize: capped.length > 10 ? 11 : 13,
      color: BRAND.body,
      bold: item.bold,
      bullet: { type: "bullet" as const, code: "25A0" },  // small square
      paraSpaceBefore: 4,
    },
  }));

  if (overflow > 0) {
    textRuns.push({
      text: `… +${overflow} more items (see full document)`,
      options: {
        fontFace: FONT_BODY, fontSize: 10, color: BRAND.muted,
        bold: false, bullet: { type: "bullet" as const, code: "25A0" },
        paraSpaceBefore: 6,
      },
    });
  }

  slide.addText(textRuns, {
    x: 0.5, y: yStart, w: 12.33, h: 7.0 - yStart - 0.5,
    valign: "top",
  });
}

function renderProse(slide: pptxgen.Slide, text: string, yStart: number): void {
  // Split into paragraphs and render with breathing room
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  const runs = paragraphs.map((p, i) => ({
    text: p.replace(/\n/g, " ").trim(),
    options: {
      fontFace: FONT_BODY,
      fontSize: paragraphs.length > 4 ? 11 : 13,
      color: BRAND.body,
      paraSpaceBefore: i === 0 ? 0 : 8,
    },
  }));
  slide.addText(runs, {
    x: 0.5, y: yStart, w: 12.33, h: 7.0 - yStart - 0.5,
    valign: "top",
  });
}

// ---------------------------------------------------------------------------
// Sources slide
// ---------------------------------------------------------------------------
function addCitationsSlide(pptx: pptxgen, citationsMd: string, _meta: DealMeta): void {
  const slide = pptx.addSlide({ masterName: "CONTENT_MASTER" });
  slide.addText("Sources & Citations", {
    x: 0.5, y: 0.4, w: 12.33, h: 0.6,
    fontFace: FONT_TITLE, fontSize: 22, bold: true, color: BRAND.ink,
  });
  slide.addShape("rect", {
    x: 0.5, y: 0.97, w: 12.33, h: 0.02,
    fill: { color: BRAND.rule }, line: { type: "none" },
  });

  const lines = citationsMd.split("\n").filter((l) => /^\[\d+\]/.test(l.trim()));
  const items = lines.slice(0, 30).map((line) => {
    const m = /^\[(\d+)\]\s*(.+?)(?:\s*[—–-]\s*(https?:\/\/\S+))?$/.exec(line.trim());
    if (!m) return null;
    const [, n, title, url] = m;
    return {
      text: `[${n}] ${title}${url ? "  " + url : ""}`,
      options: {
        fontFace: FONT_BODY, fontSize: 10, color: BRAND.body,
        paraSpaceBefore: 4,
      },
    };
  }).filter((x): x is NonNullable<typeof x> => x !== null);

  if (items.length === 0) {
    slide.addText("(No citations captured)", {
      x: 0.5, y: 1.5, w: 12.33, h: 0.5,
      fontFace: FONT_BODY, fontSize: 12, color: BRAND.muted, italic: true,
    });
    return;
  }

  slide.addText(items, {
    x: 0.5, y: 1.3, w: 12.33, h: 5.5, valign: "top",
  });
}

// ---------------------------------------------------------------------------
// Closing / "Why Us" emphasis slide
// ---------------------------------------------------------------------------
function addClosingSlide(pptx: pptxgen, meta: DealMeta): void {
  const slide = pptx.addSlide();
  slide.background = { color: BRAND.primaryDark };

  slide.addText("READY TO ADVISE ON YOUR M&A AGENDA", {
    x: 0.7, y: 2.5, w: 12, h: 0.5,
    fontFace: FONT_TITLE, fontSize: 12, bold: true, color: "C7D2FE",
    charSpacing: 6,
  });

  slide.addText(`${meta.buyer || "—"} → ${meta.target || "—"}`, {
    x: 0.7, y: 3.2, w: 12, h: 1.2,
    fontFace: FONT_TITLE, fontSize: 36, bold: true, color: "FFFFFF",
  });

  slide.addText("Deal IQ AI · Intelligence · Advisory · Execution", {
    x: 0.7, y: 5.5, w: 12, h: 0.5,
    fontFace: FONT_BODY, fontSize: 14, color: "E0E7FF",
  });

  slide.addText("CONFIDENTIAL", {
    x: 0.7, y: 7.0, w: 12, h: 0.3,
    fontFace: FONT_BODY, fontSize: 9, bold: true, color: "C7D2FE",
    charSpacing: 4,
  });
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
function slugify(s: string): string {
  return (s || "deal")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

function stripNumberingPrefix(s: string): string {
  return s.replace(/^\d+\.\s+/, "");
}
