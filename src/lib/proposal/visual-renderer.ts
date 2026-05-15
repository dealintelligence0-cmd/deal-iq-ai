

/**
 * Deal IQ AI — Visual proposal renderer (MBB / Big4 consulting style).
 *
 * IMPORTANT — DO NOT CHANGE CONTENT BEHAVIOUR:
 * - Section ordering is preserved (split on `## `, render in order).
 * - All markdown is passed through unchanged; this file only styles it.
 * - Same public API used by callers:
 *     renderVisualProposal, renderCitations,
 *     splitIntoSections, renderSectionBody, replaceSection,
 *     type ProposalSection
 */

import { classifyHeading, inlineSvgIcon, type SectionKind } from "./mbb/section-classifier";

// MBB CSS colours (mirrors mbb/theme.ts — inlined so the HTML works even
// when injected into a page without the CSS-vars stylesheet).
const C = {
  navy:    "#051C2C",
  ink:     "#0B2545",
  teal:    "#00A9E0",
  tealDk:  "#0F7C8C",
  tealPl:  "#E6F6FB",
  blue:    "#2251FF",
  bluePl:  "#EAF0FF",
  green:   "#00B388",
  greenPl: "#E6F7F1",
  body:    "#2A3340",
  muted:   "#5C6773",
  rule:    "#D7DEE3",
  surface: "#F5F8FA",
  warn:    "#C77700",
  warnPl:  "#FFF4DC",
  risk:    "#B5121B",
  riskPl:  "#FCE8EA",
};

// ===========================================================================
// Inline markdown (bold, italic, code, citation refs)
// ===========================================================================
function renderInline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, `<strong style="color:${C.ink};font-weight:700">$1</strong>`)
    .replace(/\*(.+?)\*/g, `<em style="color:${C.body};font-style:italic">$1</em>`)
    .replace(
      /\[(\d+)\]/g,
      `<sup style="margin-left:1px;color:${C.teal};font-weight:700;font-size:10px;cursor:help">[$1]</sup>`,
    )
    .replace(
      /`(.+?)`/g,
      `<code style="background:${C.surface};color:${C.ink};padding:1px 6px;border-radius:3px;font-family:Consolas,monospace;font-size:11px">$1</code>`,
    );
}

// ===========================================================================
// Tables (markdown → consulting table with navy header + alt rows)
// ===========================================================================

/**
 * Try to detect "smushed" inline pipe tables — when an AI writes a table all on
 * one line without newlines (e.g. "| A | B | | --- | --- | | 1 | 2 |").
 * Returns the reflowed markdown text with proper newlines so the regular
 * extractTable below can pick it up.
 */
function reflowInlineTables(text: string): string {
  return text.replace(/(\|[^\n]*\|)/g, (match) => {
    // Only reflow if this is one long pipe-segmented line with separator markers
    if (!match.includes("|") || match.length < 30) return match;
    if (!/\|\s*-{2,}\s*\|/.test(match)) return match;     // must contain |--- | divider
    const cells = match.split(/\s*\|\s*/).filter((c) => c !== "");
    if (cells.length < 6) return match;
    // Determine the number of columns by locating the first separator cell
    const sepIdx = cells.findIndex((c) => /^-{2,}$/.test(c.trim()));
    if (sepIdx < 2) return match;
    const cols = sepIdx;
    // Re-emit as proper rows
    const rows: string[] = [];
    for (let i = 0; i < cells.length; i += cols) {
      const row = cells.slice(i, i + cols);
      if (row.length === cols) rows.push("| " + row.join(" | ") + " |");
    }
    return "\n" + rows.join("\n") + "\n";
  });
}

function extractAllTables(text: string): { tablesHtml: string[]; remainder: string } {
  text = reflowInlineTables(text);
  const tablesHtml: string[] = [];
  const remainderLines: string[] = [];

  const lines = text.split("\n");
  let i = 0;
  while (i < lines.length) {
    const l = lines[i].trim();
    if (l.startsWith("|") && l.endsWith("|")) {
      // capture contiguous pipe-block
      const block: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|") && lines[i].trim().endsWith("|")) {
        block.push(lines[i]);
        i++;
      }
      // build the table HTML for this block
      const rows = block
        .filter((l2) => !/^\|[\s\-:|]+\|$/.test(l2.trim()))
        .map((l2) => l2.trim().slice(1, -1).split("|").map((c) => c.trim()));
      if (rows.length >= 1) {
        const [head, ...body] = rows;
        const ths = head.map(
          (h) => `<th style="background:${C.navy};color:#fff;text-align:left;padding:8px 10px;font-size:11px;font-weight:700;letter-spacing:0.3px;text-transform:uppercase;border-right:1px solid rgba(255,255,255,0.12)">${renderInline(h)}</th>`,
        ).join("");
        const trs = body.map((row, k) => {
          const bg = k % 2 === 0 ? C.tealPl : "#ffffff";
          const tds = row.map(
            (c) => `<td style="padding:7px 10px;border-bottom:1px solid ${C.rule};font-size:11.5px;color:${C.body};vertical-align:top">${renderInline(c)}</td>`,
          ).join("");
          return `<tr style="background:${bg}">${tds}</tr>`;
        }).join("");
        tablesHtml.push(`
<div style="margin:14px 0;border:1px solid ${C.rule};border-radius:4px;overflow:hidden">
  <table style="width:100%;border-collapse:collapse;table-layout:auto">
    <thead><tr>${ths}</tr></thead>
    <tbody>${trs}</tbody>
  </table>
</div>`);
      }
    } else {
      remainderLines.push(lines[i]);
      i++;
    }
  }
  return { tablesHtml, remainder: remainderLines.join("\n") };
}

function extractTable(text: string): { tableHtml: string; remainder: string } {
  const { tablesHtml, remainder } = extractAllTables(text);
  return { tableHtml: tablesHtml.join(""), remainder };
}

// ===========================================================================
// Specialty visuals
// ===========================================================================

function renderSynergyKpiBlock(text: string): string {
  const m = /\$\s*([\d.,]+\s*[BMK])\s*revenue[^$]{0,40}\$\s*([\d.,]+\s*[BMK])\s*cost[^$]{0,40}\$\s*([\d.,]+\s*[BMK])/i.exec(text);
  if (!m) return "";
  const [, rev, cost, total] = m;
  const card = (label: string, value: string, accent: string, pale: string) => `
    <div style="flex:1;border:1px solid ${C.rule};border-top:3px solid ${accent};background:${pale};padding:14px 16px;border-radius:2px">
      <div style="font-size:10px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:${C.muted}">${label}</div>
      <div style="font-size:26px;font-weight:700;color:${C.ink};margin-top:6px;font-family:Arial,sans-serif">${value.trim()}</div>
    </div>`;
  return `
<div style="display:flex;gap:10px;margin:14px 0">
  ${card("Revenue synergies", rev, C.green, C.greenPl)}
  ${card("Cost synergies", cost, C.teal, C.tealPl)}
  ${card("Total value at stake", total, C.blue, C.bluePl)}
</div>`;
}

function render100DayTimeline(): string {
  const step = (label: string, sub: string, color: string) => `
    <div style="flex:1;text-align:center;position:relative">
      <div style="width:32px;height:32px;border-radius:50%;background:#fff;border:3px solid ${color};margin:0 auto 8px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:${color}">●</div>
      <div style="font-size:11px;font-weight:700;color:${C.ink};letter-spacing:0.3px">${label}</div>
      <div style="font-size:10.5px;color:${C.muted};margin-top:2px">${sub}</div>
    </div>`;
  return `
<div style="margin:16px 0;padding:18px 16px;background:${C.surface};border:1px solid ${C.rule};border-radius:3px">
  <div style="font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${C.tealDk};margin-bottom:14px">100-day roadmap</div>
  <div style="position:relative">
    <div style="position:absolute;top:16px;left:5%;right:5%;height:2px;background:linear-gradient(90deg,${C.teal},${C.blue},${C.green})"></div>
    <div style="position:relative;display:flex;gap:8px">
      ${step("Days 1-30", "Stabilise · IMO · Day-1", C.teal)}
      ${step("Days 31-60", "Integrate · Org · GTM", C.blue)}
      ${step("Days 61-100", "Accelerate · Validate", C.green)}
    </div>
  </div>
</div>`;
}

function renderRiskGrid(items: string[]): string {
  const cleaned = items
    .map((s) => s.replace(/^[-*]\s*/, "").trim())
    .filter((s) => s.length > 8);
  if (cleaned.length < 2) return "";
  const cards = cleaned.slice(0, 9).map((line) => {
    const m = /^(.+?)\s*[—\-:]\s*(.+)$/.exec(line);
    const title = m ? m[1].replace(/^\W+/, "").trim() : line.slice(0, 80);
    const body = m ? m[2].trim() : "";
    return `
<div style="border:1px solid ${C.rule};border-left:3px solid ${C.risk};background:#fff;padding:10px 12px;border-radius:2px">
  <div style="font-size:11.5px;font-weight:700;color:${C.ink};margin-bottom:4px">${renderInline(title)}</div>
  ${body ? `<div style="font-size:11px;color:${C.body};line-height:1.5">${renderInline(body)}</div>` : ""}
</div>`;
  }).join("");
  return `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px;margin:14px 0">${cards}</div>`;
}

function renderWorkstreamGrid(text: string): string {
  const matches = Array.from(text.matchAll(/\*\*([^*:\n]+):\*\*\s*([^\n*]+)/g));
  if (matches.length < 3) return "";
  const palette = [C.teal, C.blue, C.green, C.tealDk, C.navy];
  const cards = matches.slice(0, 12).map((m, i) => {
    const accent = palette[i % palette.length];
    return `
<div style="border:1px solid ${C.rule};border-top:3px solid ${accent};background:#fff;padding:12px 14px;border-radius:2px">
  <div style="font-size:11px;font-weight:700;color:${C.ink};letter-spacing:0.2px">${renderInline(m[1].trim())}</div>
  <div style="font-size:11px;color:${C.body};margin-top:6px;line-height:1.55">${renderInline(m[2].trim())}</div>
</div>`;
  }).join("");
  return `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin:14px 0">${cards}</div>`;
}

function maybeRenderKpiStrip(text: string, kind: SectionKind): string {
  if (!["exec_summary", "thesis", "score", "valuation"].includes(kind)) return "";
  const pairs = Array.from(text.matchAll(/\*\*([^*\n:]{2,40}):\*\*\s*([^\n*]{1,40})/g)).slice(0, 4);
  if (pairs.length < 2) return "";
  const metricLike = pairs.filter((p) => /[\d$%]/.test(p[2]) && p[2].length < 32);
  if (metricLike.length < 2) return "";
  const palette = [C.teal, C.blue, C.green, C.tealDk];
  const cards = metricLike.map((m, i) => {
    const accent = palette[i % palette.length];
    return `
<div style="flex:1;min-width:140px;border:1px solid ${C.rule};border-top:3px solid ${accent};background:#fff;padding:12px 14px;border-radius:2px">
  <div style="font-size:9.5px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:${C.muted}">${m[1].trim()}</div>
  <div style="font-size:20px;font-weight:700;color:${C.ink};margin-top:4px;line-height:1.1">${m[2].trim()}</div>
</div>`;
  }).join("");
  return `<div style="display:flex;flex-wrap:wrap;gap:10px;margin:12px 0">${cards}</div>`;
}

// ===========================================================================
// Paragraph / list rendering
// ===========================================================================
function renderParagraphBlock(p: string): string {
  p = p.trim();
  if (!p) return "";

  // Defensive: if the paragraph is a stranded pipe row (left over from an
  // unparseable inline table fragment), drop it rather than render raw pipes.
  const lines = p.split("\n");
  const pipeOnly = lines.every((l) => {
    const t = l.trim();
    return t === "" || (t.startsWith("|") && t.endsWith("|"));
  });
  if (pipeOnly && p.includes("|")) return "";
  if (/^\|[\s\-:|]+\|$/.test(p)) return "";
  if (/^[-*]\s/.test(p)) {
    const items = p.split(/\n[-*]\s/).map((l) => l.replace(/^[-*]\s/, "").trim()).filter(Boolean);
    const lis = items.map((i) => `
<li style="margin:4px 0;padding-left:6px;color:${C.body};line-height:1.6">
  <span style="color:${C.teal};font-weight:700;margin-right:6px">▪</span>${renderInline(i)}
</li>`).join("");
    return `<ul style="margin:8px 0 10px 4px;padding:0;list-style:none;font-size:12px">${lis}</ul>`;
  }
  if (/^\d+\.\s/.test(p)) {
    const items = p.split(/\n\d+\.\s/).map((l) => l.replace(/^\d+\.\s/, "").trim()).filter(Boolean);
    const lis = items.map((i, idx) => `
<li style="margin:5px 0;display:flex;gap:10px;align-items:flex-start;color:${C.body};line-height:1.6">
  <span style="flex:0 0 22px;height:22px;border-radius:50%;background:${C.bluePl};color:${C.blue};font-size:10px;font-weight:700;display:inline-flex;align-items:center;justify-content:center">${idx + 1}</span>
  <span style="flex:1">${renderInline(i)}</span>
</li>`).join("");
    return `<ol style="margin:8px 0 10px 0;padding:0;list-style:none;font-size:12px">${lis}</ol>`;
  }
  if (/^###\s/.test(p)) {
    return `<h4 style="margin:14px 0 6px;font-size:12.5px;font-weight:700;color:${C.tealDk};letter-spacing:0.2px">${renderInline(p.replace(/^###\s+/, ""))}</h4>`;
  }
  if (/^>\s/.test(p)) {
    const body = p.replace(/^>\s?/gm, "").trim();
    return `
<div style="margin:12px 0;border-left:4px solid ${C.teal};background:${C.tealPl};padding:12px 16px;border-radius:0 3px 3px 0">
  <div style="font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${C.tealDk};margin-bottom:4px">Key takeaway</div>
  <div style="font-size:12.5px;color:${C.ink};line-height:1.55;font-style:italic">${renderInline(body)}</div>
</div>`;
  }
  return `<p style="margin:8px 0;font-size:12px;line-height:1.65;color:${C.body}">${renderInline(p)}</p>`;
}

// ===========================================================================
// Section header — MBB-style numbered chip + icon + teal underline
// ===========================================================================
function renderSectionHeader(num: string, heading: string, kind: SectionKind): string {
  const icon = inlineSvgIcon(kind, 18, C.teal);
  return `
<div style="margin:24px 0 12px;border-bottom:2px solid ${C.navy};padding-bottom:10px;position:relative">
  <div style="display:flex;align-items:center;gap:12px">
    <div style="flex:0 0 auto;background:${C.navy};color:#fff;padding:5px 10px;border-radius:2px;font-family:Arial,monospace;font-size:11px;font-weight:700;letter-spacing:1px">${num}</div>
    <div style="flex:0 0 auto;width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;background:${C.tealPl};border-radius:50%">${icon}</div>
    <h2 style="margin:0;font-size:16px;font-weight:700;color:${C.ink};letter-spacing:-0.1px;flex:1">${renderInline(heading)}</h2>
  </div>
  <div style="position:absolute;left:0;bottom:-2px;width:120px;height:2px;background:${C.teal}"></div>
</div>`;
}

// ===========================================================================
// Public: renderVisualProposal
// ===========================================================================
export function renderVisualProposal(md: string): string {
  const blocks = md.split(/^## /m).filter(Boolean);
  const sections: string[] = [];

  blocks.forEach((block, idx) => {
    const lines = block.split("\n");
    let heading = lines[0].trim();
    const body = lines.slice(1).join("\n").trim();

    const inlineNumMatch = /^(\d+)\.\s+/.exec(heading);
    const num = inlineNumMatch ? inlineNumMatch[1].padStart(2, "0") : String(idx + 1).padStart(2, "0");
    if (inlineNumMatch) heading = heading.replace(/^\d+\.\s+/, "");

    const kind = classifyHeading(heading);
    const header = renderSectionHeader(num, heading, kind);

    let bodyHtml = "";
    let consumedAsGrid = false;

    if (kind === "risk") {
      const items = body.split(/\n\n+/).filter((p) => p.trim().length > 12);
      const grid = renderRiskGrid(items);
      if (grid) { bodyHtml += grid; consumedAsGrid = true; }
    }
    if (kind === "workstream") {
      const grid = renderWorkstreamGrid(body);
      if (grid) { bodyHtml += grid; consumedAsGrid = true; }
    }

    if (!consumedAsGrid) {
      const { tableHtml, remainder } = extractTable(body);

      bodyHtml += maybeRenderKpiStrip(remainder || body, kind);

      if (kind === "synergy") {
        bodyHtml += renderSynergyKpiBlock(remainder || body);
      }

      const proseSource = remainder || body;
      const paragraphs = proseSource
        .split(/\n\n+/)
        .map((p) => renderParagraphBlock(p))
        .join("");
      bodyHtml += paragraphs;

      if (tableHtml) bodyHtml += tableHtml;

      if (kind === "hundred_day") bodyHtml += render100DayTimeline();
    }

    sections.push(`
<section style="margin-bottom:18px;page-break-inside:avoid">
  ${header}
  <div style="padding-left:2px">${bodyHtml}</div>
</section>`);
  });

  return `<div style="font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;color:${C.body};max-width:100%">${sections.join("")}</div>`;
}

// ===========================================================================
// Public: renderCitations
// ===========================================================================
export function renderCitations(citationsMd: string): string {
  const lines = citationsMd.split("\n").filter((l) => /^\[\d+\]/.test(l.trim()));
  if (!lines.length) return "";
  const items = lines.map((line) => {
    const m = /^\[(\d+)\]\s*(.+?)(?:\s*[—–-]\s*(https?:\/\/\S+))?$/.exec(line.trim());
    if (!m) return "";
    const [, n, title, url] = m;
    return `<li style="font-size:10.5px;color:${C.body};margin:3px 0;line-height:1.5">
  <span style="font-family:Arial,monospace;font-weight:700;color:${C.teal};margin-right:6px">[${n}]</span>
  ${url ? `<a href="${url}" target="_blank" style="color:${C.body};text-decoration:none;border-bottom:1px dotted ${C.teal}">${title}</a>` : title}
</li>`;
  }).filter(Boolean).join("");

  return `
<aside style="margin-top:24px;border:1px solid ${C.rule};border-top:3px solid ${C.teal};background:${C.surface};padding:14px 18px;border-radius:2px">
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
    <div style="width:18px;height:18px">${inlineSvgIcon("sources", 18, C.teal)}</div>
    <div style="font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${C.tealDk}">Sources &amp; citations</div>
  </div>
  <ol style="margin:0;padding:0;list-style:none">${items}</ol>
</aside>`;
}

// ===========================================================================
// Public: section helpers (unchanged behaviour, identical API)
// ===========================================================================
export type ProposalSection = {
  heading: string;
  rawHeading: string;
  body: string;
  index: number;
};

export function splitIntoSections(md: string): ProposalSection[] {
  if (!md) return [];
  const blocks = md.split(/^## /m).filter(Boolean);
  return blocks.map((block, idx) => {
    const lines = block.split("\n");
    const rawHeading = lines[0].trim();
    const heading = rawHeading.replace(/^\d+\.\s+/, "").trim();
    const body = lines.slice(1).join("\n").trim();
    return { heading, rawHeading, body, index: idx };
  });
}

export function renderSectionBody(heading: string, body: string): string {
  return renderVisualProposal(`## ${heading}\n${body}`);
}

export function replaceSection(fullMd: string, heading: string, newBody: string): string {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `(^|\\n)##\\s+((?:\\d+\\.\\s+)?${escaped})\\s*\\n([\\s\\S]*?)(?=\\n##\\s+|$)`,
    "i",
  );
  if (!re.test(fullMd)) return fullMd;
  return fullMd.replace(re, (_, leading, headingMatch) => {
    return `${leading || "\n"}## ${headingMatch}\n${newBody.trim()}\n`;
  });
}
