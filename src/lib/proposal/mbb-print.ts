/**
 * Shared MBB-grade HTML print template.
 *
 * Used by the Proposal, PMI, Synergy, and TSA pages to render a consistent,
 * consulting-grade document in a new browser window, which the user then prints
 * (or saves as PDF) via the native browser dialog.
 *
 * This is PURELY a visual wrapper around the content already produced by the
 * AI pipeline. The markdown is rendered with `renderVisualProposal` exactly as
 * elsewhere — section ordering, prompts, and AI behaviour are untouched.
 */

import { renderVisualProposal, renderCitations } from "@/lib/proposal/visual-renderer";

export type PrintMeta = {
  /** Document type shown on the cover and running header — e.g. "M&A Advisory Proposal". */
  moduleLabel: string;
  /** Buyer / acquirer / client (top line of cover deal title). */
  buyer?: string;
  /** Target / seller / counter-party (second line of cover deal title). */
  target?: string;
  sector?: string;
  geography?: string;
  dealSize?: string;
  /** "Prepared for" line on cover. */
  clientName?: string;
};

/**
 * Open an MBB-grade printable document in a new tab and trigger the system
 * print dialog. The user can then save as PDF via the dialog.
 *
 * Safe to call client-side only.
 */
export function openMbbPrintWindow(opts: {
  contentMarkdown: string;
  citationsMarkdown?: string;
  meta: PrintMeta;
}): void {
  const { contentMarkdown, citationsMarkdown, meta } = opts;
  if (typeof window === "undefined") return;
  const win = window.open("", "_blank");
  if (!win) return;

  const today = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  const dealTitle = [meta.target, meta.buyer].filter(Boolean).join(" · ");
  const meta1 = [meta.sector, meta.geography, meta.dealSize].filter(Boolean).join("  ·  ");

  // The renderVisualProposal output already carries inline styles. We add a
  // print-only CSS layer to handle covers, page breaks, running header/footer.
  const body = renderVisualProposal(contentMarkdown);
  const cites = citationsMarkdown ? renderCitations(citationsMarkdown) : "";

  const html = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"/>
<title>${escapeHtml(meta.moduleLabel)} — ${escapeHtml(dealTitle || "Deal IQ AI")}</title>
<style>
@page { size: A4; margin: 18mm 14mm 22mm 14mm; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
  color: #2A3340;
  background: #ffffff;
  font-size: 11.5px;
  line-height: 1.55;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

/* === Cover page ============================================== */
.cover {
  position: relative;
  height: 250mm;
  background: linear-gradient(135deg, #051C2C 0%, #0A2540 60%, #0F7C8C 100%);
  color: #ffffff;
  padding: 24mm 18mm 18mm;
  page-break-after: always;
  overflow: hidden;
}
.cover::before {
  content: "";
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 88% 12%, rgba(0,169,224,0.30) 0, transparent 35%),
    radial-gradient(circle at 12% 92%, rgba(0,179,136,0.22) 0, transparent 38%);
  pointer-events: none;
}
.cover-brand {
  display: flex; justify-content: space-between; align-items: flex-start;
  position: relative;
}
.cover-brand .marker {
  display: inline-flex; align-items: center; gap: 8px;
  font-size: 10px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase;
  color: #00A9E0;
}
.cover-brand .marker::before {
  content: ""; width: 18px; height: 2px; background: #00A9E0; display: inline-block;
}
.cover-brand .ts {
  font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: rgba(255,255,255,0.7);
}
.cover-confidential {
  margin-top: 60mm;
  font-size: 11px; font-weight: 700; letter-spacing: 4px; text-transform: uppercase;
  color: #00A9E0;
  position: relative;
}
.cover-title {
  margin-top: 6mm;
  font-size: 42px; font-weight: 800; line-height: 1.05; color: #ffffff;
  max-width: 90%;
  position: relative;
}
.cover-sub {
  margin-top: 18mm;
  font-size: 16px; font-weight: 700; color: #00A9E0; letter-spacing: 0.6px;
  text-transform: uppercase;
  position: relative;
}
.cover-meta {
  margin-top: 6mm;
  font-size: 12.5px; color: rgba(255,255,255,0.9);
  position: relative;
}
.cover-footer {
  position: absolute; left: 18mm; right: 18mm; bottom: 14mm;
  display: flex; justify-content: space-between; align-items: flex-end;
  border-top: 1px solid rgba(255,255,255,0.25);
  padding-top: 10px;
  font-size: 10px; color: rgba(255,255,255,0.75);
}
.cover-footer .prep { color: #ffffff; font-weight: 700; letter-spacing: 0.5px; }
.cover-strip { position: absolute; left: 0; right: 0; bottom: 0; height: 6mm; background: #00A9E0; }
.cover-strip::after { content: ""; display: block; height: 100%; width: 40%; background: #00B388; }

/* === Section running header / TOC marker ===================== */
.exec-toc {
  page-break-after: always;
  padding: 6mm 4mm 0;
}
.exec-toc h2 {
  font-size: 14px; font-weight: 800; color: #051C2C;
  letter-spacing: 0.4px; text-transform: uppercase;
  border-bottom: 2px solid #051C2C; padding-bottom: 8px;
  position: relative;
}
.exec-toc h2::after {
  content: ""; position: absolute; left: 0; bottom: -2px;
  width: 80px; height: 2px; background: #00A9E0;
}
.exec-toc ol {
  list-style: none; margin: 12px 0 0; padding: 0;
  columns: 2; column-gap: 20mm;
}
.exec-toc li {
  font-size: 11.5px; color: #2A3340;
  border-bottom: 1px dotted #D7DEE3;
  padding: 6px 0;
  display: flex; gap: 10px; align-items: baseline;
  break-inside: avoid;
}
.exec-toc li .n {
  font-family: Arial, monospace; font-weight: 700; font-size: 10px;
  background: #051C2C; color: #fff; padding: 2px 6px; border-radius: 2px;
  letter-spacing: 1px; min-width: 22px; text-align: center;
}

/* === Main content ============================================ */
.doc-wrap { padding: 4mm 4mm 8mm; }

section {
  page-break-inside: avoid;
}

/* === Disclaimer page ========================================= */
.notice {
  page-break-before: always;
  padding: 8mm 6mm 0;
}
.notice h1 {
  font-size: 18px; font-weight: 800; color: #051C2C;
  border-bottom: 2px solid #051C2C; padding-bottom: 8px; margin: 0 0 14px;
  position: relative;
}
.notice h1::after {
  content: ""; position: absolute; left: 0; bottom: -2px;
  width: 80px; height: 2px; background: #00A9E0;
}
.notice p, .notice li { font-size: 11px; color: #2A3340; line-height: 1.65; }
.notice ul { padding-left: 18px; }
.notice .copyright { margin-top: 24px; color: #5C6773; font-size: 10px; }

/* === Running footer ========================================== */
.run-foot {
  position: fixed; left: 14mm; right: 14mm; bottom: 8mm;
  display: flex; justify-content: space-between; align-items: center;
  font-size: 8.5px; color: #5C6773;
  border-top: 1px solid #D7DEE3; padding-top: 4px;
}
.run-foot .brand { color: #051C2C; font-weight: 700; letter-spacing: 1px; }
.run-foot .conf { letter-spacing: 2px; text-transform: uppercase; color: #0F7C8C; font-weight: 700; }

@media print {
  .no-print { display: none !important; }
}
</style>
</head>
<body>

<!-- ============================= COVER ============================= -->
<section class="cover">
  <div class="cover-brand">
    <div class="marker">Deal IQ AI · Executive Briefing</div>
    <div class="ts">${escapeHtml(today)}</div>
  </div>

  <div class="cover-confidential">Confidential · Working Draft</div>
  <div class="cover-title">${escapeHtml(meta.buyer || "—")}<br/>${meta.target ? `<span style="color:#00A9E0">→</span> ${escapeHtml(meta.target)}` : ""}</div>
  <div class="cover-sub">${escapeHtml(meta.moduleLabel)}</div>
  ${meta1 ? `<div class="cover-meta">${escapeHtml(meta1)}</div>` : ""}

  <div class="cover-footer">
    <div>
      <div class="prep">${escapeHtml(meta.clientName ? `Prepared for ${meta.clientName}` : "Prepared by Deal IQ AI")}</div>
      <div>Intelligence · Advisory · Execution</div>
    </div>
    <div>This document is confidential and for the named recipient only.</div>
  </div>
  <div class="cover-strip"></div>
</section>

<!-- ============================ CONTENT ============================ -->
<div class="doc-wrap">
  ${body}
  ${cites}
</div>

<!-- =========================== DISCLAIMER ========================== -->
<div class="notice">
  <h1>Important notice</h1>
  <p>This document was generated using AI-assisted analysis. Before relying on any portion of this content, please review the limitations below.</p>
  <ul>
    <li>AI-generated insights may be incomplete, inaccurate, or rely on outdated public information.</li>
    <li>The platform is provided on an &ldquo;as is&rdquo; basis without warranties, express or implied.</li>
    <li>The platform owner accepts no liability for decisions, outcomes, or losses arising from use of, or reliance on, this analysis.</li>
    <li>Use of the platform and its outputs is at the user&apos;s sole risk.</li>
    <li>Independent professional diligence is required before any financial, legal, regulatory, or investment decision.</li>
  </ul>
  <p class="copyright">© ${new Date().getFullYear()} Deal IQ AI · All rights reserved. Unauthorised replication or commercial use is prohibited.</p>
</div>

<!-- ========================= RUNNING FOOTER ======================== -->
<div class="run-foot">
  <span class="brand">Deal IQ AI</span>
  <span>${escapeHtml(meta.moduleLabel)}</span>
  <span class="conf">Confidential</span>
</div>

</body></html>`;

  win.document.open();
  win.document.write(html);
  win.document.close();
  win.onload = () => setTimeout(() => { win.focus(); win.print(); }, 350);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
