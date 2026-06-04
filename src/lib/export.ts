

import Papa from "papaparse";
import type { Deal } from "@/lib/analytics";
import { formatUsdShort } from "@/lib/analytics";

/**
 * Deal pipeline export utilities (CSV / JSON / PDF / PPTX).
 *
 * VISUAL UPGRADE ONLY: this file was retuned to the MBB / Big4 colour language
 * (navy / teal / blue / green) to match the rest of the application. The data
 * shape, fields exported, and overall workflow are unchanged.
 */

// Match mbb/theme.ts (without the `#` so it can flow into pptxgenjs)
const MBB = {
  name: "Deal IQ AI",
  tagline: "Intelligence · Advisory · Execution",
  navy:    "051C2C",
  navyDeep:"020D1A",
  teal:    "00A9E0",
  tealDark:"0F7C8C",
  tealPale:"E6F6FB",
  blue:    "2251FF",
  bluePale:"EAF0FF",
  green:   "00B388",
  greenPale:"E6F7F1",
  ink:     "0B2545",
  body:    "2A3340",
  muted:   "5C6773",
  rule:    "D7DEE3",
  surface: "F5F8FA",
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function trigger(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ============================== CSV ==============================
export function exportCsv(deals: Deal[]): void {
  const rows = deals.map((d) => ({
    date: d.deal_date ?? "",
    buyer: d.buyer ?? "",
    target: d.target ?? "",
    sector: d.sector ?? "",
    country: d.country ?? "",
    deal_type: d.deal_type ?? "",
    stake_pct: d.stake_percent ?? "",
    value_usd: d.normalized_value_usd ?? "",
    value_raw: d.value_raw ?? "",
    status: d.status ?? "",
  }));
  const csv = Papa.unparse(rows);
  trigger(new Blob([csv], { type: "text/csv" }), `deal-iq-export-${today()}.csv`);
}

// ============================== JSON =============================
export function exportJson(deals: Deal[]): void {
  const payload = {
    exported_by: MBB.name,
    exported_at: new Date().toISOString(),
    count: deals.length,
    deals,
  };
  trigger(
    new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
    `deal-iq-export-${today()}.json`,
  );
}

export function formatDealValueForExport(d: Deal): string {
  const parts = [
    d.deal_value_inr_range ? `INR ${d.deal_value_inr_range}` : "",
    d.value_raw || "",
    d.normalized_value_usd ? formatUsdShort(d.normalized_value_usd) : "",
  ].filter(Boolean);
  return parts[0] || "—";
}

// ====================== Server-PDF (route call) =====================
export async function exportPdfServer(deals: Deal[], title = "Deal Pipeline Report"): Promise<void> {
  const total = deals.reduce((s, d) => s + (d.normalized_value_usd ?? 0), 0);
  const table = deals.slice(0, 100).map((d, index) =>
    `${index + 1}. ${d.buyer ?? "—"} → ${d.target ?? "—"} | ${d.country ?? "—"} | ${d.sector ?? "—"} | ${formatDealValueForExport(d)} | ${d.status ?? "—"}`,
  ).join("\n");
  const content = `# ${title}\n\nDeals: ${deals.length}\nTotal value: ${formatUsdShort(total)}\nGenerated: ${new Date().toLocaleString()}\n\n## Deal Table\n${table || "No deals"}`;
  const res = await fetch("/api/deals/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ format: "pdf", proposalData: { content, title } }),
  });
  if (!res.ok) throw new Error(await res.text());
  trigger(await res.blob(), `deal-iq-pipeline-${today()}.pdf`);
}

// ====================== Print-to-PDF fallback ======================
export function exportPdf(deals: Deal[], title = "Deal Pipeline Report"): void {
  const win = window.open("", "_blank");
  if (!win) return;
  const total = deals.reduce((s, d) => s + (d.normalized_value_usd ?? 0), 0);
  const live = deals.filter((d) => d.status === "live" || d.status === "announced").length;
  const rows = deals
    .map(
      (d) => `<tr>
        <td>${d.deal_date ?? "—"}</td>
        <td><strong>${d.buyer ?? "—"}</strong></td>
        <td>${d.target ?? "—"}</td>
        <td>${d.sector ?? "—"}</td>
        <td>${d.country ?? "—"}</td>
        <td style="text-align:right">${d.normalized_value_usd ? formatUsdShort(d.normalized_value_usd) : "—"}</td>
        <td style="text-transform:capitalize">${d.status ?? "—"}</td>
      </tr>`,
    )
    .join("");

  win.document.write(`<!DOCTYPE html><html><head><title>${title}</title>
<style>
@page { size: A4; margin: 18mm 14mm 22mm; }
* { box-sizing: border-box; }
body{font-family:Arial,"Helvetica Neue",Helvetica,sans-serif;max-width:1100px;margin:0 auto;padding:0 24px;color:#${MBB.body};-webkit-print-color-adjust:exact;print-color-adjust:exact}
.brand-band{background:#${MBB.navy};color:#fff;padding:18px 24px;margin:0 -24px 0;display:flex;justify-content:space-between;align-items:center;border-bottom:6px solid #${MBB.teal}}
.brand-band .name{font-size:12px;font-weight:700;letter-spacing:4px;text-transform:uppercase;color:#${MBB.teal}}
.brand-band .tag{font-size:10px;color:#cbd6dd;margin-top:2px;letter-spacing:1px}
.brand-band .ts{font-size:10px;letter-spacing:1.5px;color:#cbd6dd}
.brand-band .ts strong{color:#fff;display:block;font-size:11px;letter-spacing:2px;margin-top:2px}
h1{font-size:24px;font-weight:800;margin:18px 0 4px;color:#${MBB.navy};letter-spacing:-0.2px}
h1::after{content:"";display:block;width:80px;height:3px;background:#${MBB.teal};margin-top:6px}
.meta{font-size:11px;color:#${MBB.muted};margin-top:8px}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:20px 0}
.stat{background:#fff;border:1px solid #${MBB.rule};border-top:3px solid #${MBB.teal};border-radius:3px;padding:12px 14px}
.stat:nth-child(2){border-top-color:#${MBB.blue}}
.stat:nth-child(3){border-top-color:#${MBB.green}}
.stat .l{font-size:9.5px;color:#${MBB.muted};text-transform:uppercase;letter-spacing:1.5px;font-weight:700}
.stat .v{font-size:22px;font-weight:800;color:#${MBB.ink};margin-top:4px}
table{width:100%;border-collapse:collapse;margin-top:16px;font-size:11px}
thead th{background:#${MBB.navy};color:#fff;text-align:left;padding:8px 10px;font-size:10px;text-transform:uppercase;letter-spacing:1px;font-weight:700;border-right:1px solid rgba(255,255,255,0.12)}
tbody tr:nth-child(odd){background:#${MBB.tealPale}}
td{padding:7px 10px;border-bottom:1px solid #${MBB.rule};color:#${MBB.body};vertical-align:top}
.footer{margin-top:24px;padding:12px 0 0;border-top:1px solid #${MBB.rule};font-size:9px;color:#${MBB.muted};display:flex;justify-content:space-between}
.footer .conf{color:#${MBB.tealDark};font-weight:700;letter-spacing:2px}
@media print{body{margin:0}.brand-band{margin:0 -24px}}
</style></head><body>
<div class="brand-band">
  <div><div class="name">${MBB.name}</div><div class="tag">${MBB.tagline}</div></div>
  <div class="ts">${new Date().toLocaleDateString()}<strong>CONFIDENTIAL</strong></div>
</div>
<h1>${title}</h1>
<div class="meta">${deals.length} transactions  ·  Total value ${formatUsdShort(total)}  ·  ${live} live / announced</div>
<div class="stats">
  <div class="stat"><div class="l">Deals</div><div class="v">${deals.length}</div></div>
  <div class="stat"><div class="l">Total Value</div><div class="v">${formatUsdShort(total)}</div></div>
  <div class="stat"><div class="l">Avg Deal Size</div><div class="v">${deals.length ? formatUsdShort(total / deals.length) : "—"}</div></div>
</div>
<table>
<thead><tr><th>Date</th><th>Buyer</th><th>Target</th><th>Sector</th><th>Country</th><th style="text-align:right">Value</th><th>Status</th></tr></thead>
<tbody>${rows || '<tr><td colspan="7" style="text-align:center;color:#94a3b8;padding:40px">No deals</td></tr>'}</tbody>
</table>
<div class="footer">
  <span>Generated by ${MBB.name}  ·  ${new Date().toLocaleString()}</span>
  <span class="conf">CONFIDENTIAL</span>
</div>
</body></html>`);
  win.document.close();
  setTimeout(() => win.print(), 300);
}

// ============================== PPTX =============================
// Consulting-grade pipeline deck — same design system (deck-tokens) and 16:9
// canvas as every other PPTX the platform generates, for a single visual bar.
export async function exportPptx(deals: Deal[], title = "Deal Pipeline"): Promise<void> {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const { DECK_TOKENS: DT, DECK_FONTS: DF } = await import("@/lib/proposal/deck-tokens");
  const TPL = await import("@/lib/proposal/deck-templates");

  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "DECK_16x9", width: 10.0, height: 5.625 });
  pptx.layout = "DECK_16x9";
  pptx.author = MBB.name;
  pptx.company = MBB.name;
  pptx.title = title;

  const W = 10.0, H = 5.625, mX = 0.38, cW = W - 2 * mX;
  const total = deals.reduce((s, d) => s + (d.normalized_value_usd ?? 0), 0);
  const live = deals.filter((d) => d.status === "live" || d.status === "announced").length;
  const avg = deals.length ? total / deals.length : 0;

  // ── Slide 1: Cover (shared consulting cover) ──────────────────────────────
  TPL.renderCoverSlide(pptx as never, {
    docLabel: "Portfolio Pipeline Report",
    buyer: title,
    target: undefined,
    subtitle: `${deals.length} deals  ·  ${formatUsdShort(total)} aggregate value`,
    metrics: [
      { value: String(deals.length), label: "Total Deals" },
      { value: formatUsdShort(total), label: "Aggregate Value" },
      { value: String(live), label: "Live / Announced" },
    ],
    preparedBy: `Prepared by ${MBB.name}  ·  ${new Date().toLocaleDateString(undefined, { year: "numeric", month: "long" })}  ·  Confidential`,
  });

  // ── Slide 2: Executive overview — callouts + native sector chart ──────────
  const s2 = pptx.addSlide();
  s2.background = { color: DT.white };
  s2.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: 0.05, fill: { color: DT.navy } });
  s2.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.18, h: 0.16, fill: { color: DT.teal } });
  TPL.renderSectionHeader(s2 as never, "Executive Overview");
  TPL.renderSlideTitle(s2 as never, `${formatUsdShort(total)} across ${deals.length} deals — ${live} live`);

  const stats = [
    { value: String(deals.length), label: "Total Deals" },
    { value: formatUsdShort(total), label: "Total Value" },
    { value: String(live), label: "Active / Live" },
    { value: formatUsdShort(avg), label: "Avg Deal Size" },
  ];
  const gap = 0.15, mw = (cW - 3 * gap) / 4;
  stats.forEach((st, i) => TPL.addMetricCallout(s2 as never, mX + i * (mw + gap), 1.25, mw, 1.0, st, DT.teal));

  const sectorMap = new Map<string, number>();
  deals.forEach((d) => { const k = d.sector ?? "Unknown"; sectorMap.set(k, (sectorMap.get(k) ?? 0) + (d.normalized_value_usd ?? 0)); });
  const topSectors = Array.from(sectorMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);
  if (topSectors.length) {
    s2.addText("TOP SECTORS BY DEAL VALUE ($M)", {
      x: mX, y: 2.45, w: cW, h: 0.22, fontFace: DF.face, fontSize: 8.5, bold: true, color: DT.muted, charSpacing: 1,
    });
    s2.addChart(pptx.ChartType.bar, [{
      name: "Value ($M)", labels: topSectors.map((x) => x[0]), values: topSectors.map((x) => Math.round(x[1] / 1e6)),
    }], {
      x: mX, y: 2.7, w: cW, h: 2.45, barDir: "col",
      chartColors: [DT.teal, DT.navyMd, DT.amber, DT.green, DT.gray400, DT.navy],
      showLegend: false, showValue: false,
      catAxisLabelFontFace: DF.face, catAxisLabelFontSize: 8,
      valAxisLabelFontFace: DF.face, valAxisLabelFontSize: 7, valGridLine: { style: "none" },
    } as never);
  }

  // ── Slide 3: Top deals table ──────────────────────────────────────────────
  const s3 = pptx.addSlide();
  s3.background = { color: DT.white };
  s3.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: 0.05, fill: { color: DT.navy } });
  s3.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.18, h: 0.16, fill: { color: DT.teal } });
  TPL.renderSectionHeader(s3 as never, "Pipeline Detail");
  const top15 = [...deals].filter((d) => d.normalized_value_usd).sort((a, b) => (b.normalized_value_usd ?? 0) - (a.normalized_value_usd ?? 0)).slice(0, 12);
  TPL.renderSlideTitle(s3 as never, `Top ${top15.length} deals by value`);

  const hdr = (t: string, r = false) => ({ text: t, options: { bold: true, color: DT.white, fill: { color: DT.navy }, fontSize: 8.5, fontFace: DF.face, align: (r ? "right" : "left") as "right" | "left", valign: "middle" as const, margin: 3, border: { type: "solid" as const, pt: 0.5, color: DT.navy } } });
  const rows = [
    [hdr("Date"), hdr("Buyer"), hdr("Target"), hdr("Sector"), hdr("Value", true)],
    ...top15.map((d, i) => {
      const bg = i % 2 === 0 ? DT.gray50 : DT.white;
      const c = (t: string, b = false, r = false, ink = false) => ({ text: t, options: { fontSize: 8, fontFace: DF.face, bold: b, fill: { color: bg }, color: ink ? DT.navy : DT.text, align: (r ? "right" : "left") as "right" | "left", valign: "middle" as const, margin: 3, border: { type: "solid" as const, pt: 0.5, color: DT.gray200 } } });
      return [c(d.deal_date ?? "—"), c(d.buyer ?? "—", true, false, true), c(d.target ?? "—"), c(d.sector ?? "—"), c(formatDealValueForExport(d), true, true, true)];
    }),
  ];
  s3.addTable(rows as never, { x: mX, y: 1.3, w: cW, colW: [1.1, 2.7, 2.7, 1.84, 0.9], autoPage: false });

  // ── Slide 4: Closing (dark) ───────────────────────────────────────────────
  const s4 = pptx.addSlide();
  s4.background = { color: DT.navy };
  s4.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.55, h: H, fill: { color: DT.teal } });
  s4.addText("Deal IQ AI", { x: 0.85, y: 2.0, w: W - 1.2, h: 0.9, fontFace: DF.face, fontSize: 34, bold: true, color: DT.white, valign: "middle" });
  s4.addText(MBB.tagline, { x: 0.85, y: 2.95, w: W - 1.2, h: 0.4, fontFace: DF.face, fontSize: 13, color: DT.teal });
  s4.addText(`CONFIDENTIAL  ·  ${new Date().toLocaleDateString()}`, { x: 0.85, y: H - 0.4, w: W - 1.2, h: 0.25, fontFace: DF.face, fontSize: 8, color: DT.steelBl, charSpacing: 2 });

  await pptx.writeFile({ fileName: `deal-iq-pipeline-${today()}.pptx` });
}
