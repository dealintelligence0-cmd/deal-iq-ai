



/**
 * Server-side, dependency-free PDF builder for Deal IQ AI.
 *
 * The /api/deals/export?format=pdf route uses this to emit a one-shot PDF
 * from a markdown string. This file is a PURE PRESENTATION UPGRADE: we add
 * a premium cover band, deep navy header, teal accent rule, and a running
 * footer. No content logic changed — input markdown is rendered as-is.
 *
 * Implementation notes:
 * - Hand-rolled PDF 1.4 (no native deps) so it runs on serverless runtimes.
 * - Colours match `mbb/theme.ts`: navy #051C2C, teal #00A9E0, green #00B388.
 */

// Colour helpers — PDF "g r b" values 0..1
const NAVY  = "0.020 0.110 0.173"; // #051C2C
const TEAL  = "0.000 0.663 0.878"; // #00A9E0
const GREEN = "0.000 0.702 0.533"; // #00B388
const INK   = "0.043 0.145 0.271"; // #0B2545
const MUTED = "0.360 0.404 0.451"; // #5C6773

function escapePdf(text: string): string {
  // PDF strings can't contain unescaped ( ) \ — also strip control chars
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    // Latin-1 only — replace any non-printable / non-Latin-1 chars
    // eslint-disable-next-line no-control-regex
    .replace(/[^\x20-\x7E\u00A0-\u00FF]/g, "·");
}

type Line = { kind: "h1" | "h2" | "p" | "blank"; text: string };

function classifyAndStrip(markdown: string): Line[] {
  // Remove markdown table separator rows; keep the rest of the text
  const cleaned = markdown
    .replace(/^\|\s*-[-| :]+\|$/gm, "")
    .split(/\n/);

  return cleaned.map((raw): Line => {
    const t = raw.replace(/\|/g, "  ").trim();
    if (!t) return { kind: "blank", text: "" };
    if (/^#\s+/.test(t))  return { kind: "h1", text: t.replace(/^#\s+/, "").trim() };
    if (/^##\s+/.test(t)) return { kind: "h2", text: t.replace(/^##\s+\d*\.?\s*/, "").trim() };
    if (/^###\s+/.test(t)) return { kind: "h2", text: t.replace(/^###\s+/, "").trim() };
    // strip remaining markdown noise but keep words
    const plain = t.replace(/[*_`>]/g, "").replace(/\s+/g, " ").trim();
    return { kind: "p", text: plain };
  });
}

function wrapLine(line: string, width = 92): string[] {
  if (!line) return [""];
  const words = line.split(/\s+/);
  const out: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > width) {
      if (cur) out.push(cur);
      cur = w;
    } else {
      cur = (cur + " " + w).trim();
    }
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * Build a branded PDF from a markdown string.
 * The first page carries the premium cover header. Subsequent pages get a
 * compact running header.
 */
export function buildSimplePdf(markdown: string, title = "Deal IQ Export"): Buffer {
  // Tokenise once
  const lines = classifyAndStrip(markdown);

  // Pre-wrap so we can paginate
  type PageItem =
    | { kind: "h1" | "h2" | "p"; text: string }
    | { kind: "blank" };
  const items: PageItem[] = [];
  for (const ln of lines) {
    if (ln.kind === "blank") { items.push({ kind: "blank" }); continue; }
    const wraps = wrapLine(ln.text, ln.kind === "h2" ? 80 : 95);
    wraps.forEach((w) => items.push({ kind: ln.kind, text: w }));
  }

  // Page geometry
  const PAGE_W = 612, PAGE_H = 792;
  const MARGIN_L = 54, MARGIN_R = 54;
  const CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R;
  const PAGE_TOP_FIRST = 660;   // below cover band
  const PAGE_TOP_REST  = 730;   // below running header
  const LINE_BODY = 13;
  const LINE_H2 = 18;
  const LINE_H1 = 24;
  const PAGE_BOTTOM = 70;

  // Group items into pages
  const pages: PageItem[][] = [];
  let cur: PageItem[] = [];
  let curY = PAGE_TOP_FIRST;
  const advance = (kind: PageItem["kind"]) => {
    return kind === "h1" ? LINE_H1 : kind === "h2" ? LINE_H2 : kind === "blank" ? 6 : LINE_BODY;
  };
  for (const it of items) {
    const adv = advance(it.kind);
    if (curY - adv < PAGE_BOTTOM) {
      pages.push(cur);
      cur = [];
      curY = PAGE_TOP_REST;
    }
    cur.push(it);
    curY -= adv;
  }
  if (cur.length) pages.push(cur);
  if (pages.length === 0) pages.push([{ kind: "p", text: "No content." }]);

  // Build PDF objects
  const objects: string[] = [];
  const add = (body: string) => { objects.push(body); return objects.length; };

  const fontReg = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const fontBold = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");

  // Build each page
  const pageContentObjs: number[] = [];
  pages.forEach((page, pageIdx) => {
    const firstPage = pageIdx === 0;
    const ops: string[] = [];

    // === Decorations ===
    if (firstPage) {
      // Top cover band — navy
      ops.push(`q ${NAVY} rg 0 ${PAGE_H - 110} ${PAGE_W} 110 re f Q`);
      // Teal stripe
      ops.push(`q ${TEAL} rg 0 ${PAGE_H - 118} ${PAGE_W} 8 re f Q`);
      // Green sliver
      ops.push(`q ${GREEN} rg 0 ${PAGE_H - 118} ${Math.floor(PAGE_W * 0.4)} 8 re f Q`);
      // Cover title — white on navy
      ops.push("BT");
      ops.push(`/F2 9 Tf ${TEAL} rg ${MARGIN_L} ${PAGE_H - 40} Td (DEAL IQ AI  ·  EXECUTIVE BRIEFING) Tj`);
      ops.push(`/F2 22 Tf 1 1 1 rg 0 -26 Td (${escapePdf(title)}) Tj`);
      ops.push(`/F1 10 Tf 0.83 0.91 0.94 rg 0 -22 Td (Confidential — Working Draft  ·  ${escapePdf(new Date().toLocaleDateString())}) Tj`);
      ops.push("ET");
    } else {
      // Compact running header — navy line + teal accent + brand mark
      ops.push(`q ${NAVY} rg 0 ${PAGE_H - 36} ${PAGE_W} 4 re f Q`);
      ops.push(`q ${TEAL} rg 0 ${PAGE_H - 36} ${Math.floor(PAGE_W * 0.25)} 4 re f Q`);
      ops.push("BT");
      ops.push(`/F2 8 Tf ${NAVY} rg ${MARGIN_L} ${PAGE_H - 26} Td (DEAL IQ AI) Tj`);
      ops.push(`/F1 8 Tf ${MUTED} rg 0 0 Td`);
      ops.push("ET");
      // Title centred
      ops.push("BT");
      ops.push(`/F1 8 Tf ${MUTED} rg ${PAGE_W - MARGIN_R - 180} ${PAGE_H - 26} Td (${escapePdf(title)}) Tj`);
      ops.push("ET");
    }

    // === Body content ===
    let y = firstPage ? PAGE_TOP_FIRST : PAGE_TOP_REST;
    ops.push("BT");
    page.forEach((it) => {
      if (it.kind === "blank") { y -= 6; return; }
      const adv = advance(it.kind);
      y -= 0; // we're already moved by the previous Td
      if (it.kind === "h1") {
        // Navy heading on light surface band
        ops.push("ET");
        // Teal underline rectangle
        ops.push(`q ${TEAL} rg ${MARGIN_L} ${y - 4} 36 2 re f Q`);
        ops.push("BT");
        ops.push(`/F2 16 Tf ${INK} rg ${MARGIN_L} ${y} Td (${escapePdf(it.text)}) Tj`);
        ops.push(`/F1 ${LINE_BODY} Tf 0 -${adv} Td`); // reset font for next line baseline
        y -= adv;
      } else if (it.kind === "h2") {
        // Section heading
        ops.push(`/F2 12 Tf ${NAVY} rg ${MARGIN_L} ${y} Td (${escapePdf(it.text)}) Tj`);
        ops.push(`/F1 ${LINE_BODY} Tf 0 -${adv} Td`);
        y -= adv;
      } else {
        ops.push(`/F1 10 Tf 0.165 0.200 0.251 rg ${MARGIN_L} ${y} Td (${escapePdf(it.text)}) Tj`);
        ops.push(`0 -${adv} Td`);
        y -= adv;
      }
    });
    ops.push("ET");

    // === Footer ===
    // Hairline
    ops.push(`q 0.843 0.871 0.890 rg ${MARGIN_L} 50 ${CONTENT_W} 0.5 re f Q`);
    ops.push("BT");
    ops.push(`/F2 7 Tf ${NAVY} rg ${MARGIN_L} 38 Td (DEAL IQ AI) Tj`);
    ops.push(`/F1 7 Tf ${MUTED} rg 80 0 Td (Intelligence  ·  Advisory  ·  Execution) Tj`);
    ops.push(`/F2 7 Tf ${TEAL} rg 300 0 Td (CONFIDENTIAL) Tj`);
    ops.push(`/F1 7 Tf ${MUTED} rg 80 0 Td (Page ${pageIdx + 1} of ${pages.length}) Tj`);
    ops.push("ET");

    const stream = ops.join("\n");
    const contentObj = add(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
    pageContentObjs.push(contentObj);
  });

  // Pages tree + catalog
  // We need to know the pages-object ref before page objects (they reference parent),
  // so we forward-reference then patch — simpler: compute index now.
  const pagesObjIndex = objects.length + pages.length + 1;
  const pageObjRefs: number[] = pages.map((_, i) => {
    const contentRef = pageContentObjs[i];
    return add(`<< /Type /Page /Parent ${pagesObjIndex} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${fontReg} 0 R /F2 ${fontBold} 0 R >> >> /Contents ${contentRef} 0 R >>`);
  });
  const pagesObj = add(`<< /Type /Pages /Kids [${pageObjRefs.map((r) => `${r} 0 R`).join(" ")}] /Count ${pageObjRefs.length} >>`);
  const catalogObj = add(`<< /Type /Catalog /Pages ${pagesObj} 0 R >>`);

  // Assemble
  let pdf = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets: number[] = [0];
  objects.forEach((body, idx) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${idx + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogObj} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "binary");
}
