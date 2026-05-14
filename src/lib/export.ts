

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
export async function exportPptx(deals: Deal[], title = "Deal Pipeline"): Promise<void> {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = MBB.name;
  pptx.company = MBB.name;
  pptx.title = title;

  const total = deals.reduce((s, d) => s + (d.normalized_value_usd ?? 0), 0);
  const live = deals.filter((d) => d.status === "live" || d.status === "announced").length;

  // ── Slide 1: Cover (navy with teal/green strips)
  const s1 = pptx.addSlide();
  s1.background = { color: MBB.navy };
  s1.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.18, fill: { color: MBB.teal }, line: { color: MBB.teal } });
  s1.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33 * 0.4, h: 0.18, fill: { color: MBB.green }, line: { color: MBB.green } });
  s1.addText("DEAL IQ AI  ·  PIPELINE REPORT", {
    x: 0.6, y: 0.5, w: 12, h: 0.4,
    fontSize: 10, color: MBB.teal, bold: true, fontFace: "Arial", charSpacing: 4,
  });
  s1.addText(title, {
    x: 0.6, y: 2.4, w: 12, h: 1.6,
    fontSize: 48, color: "FFFFFF", bold: true, fontFace: "Arial",
  });
  s1.addText(MBB.tagline, {
    x: 0.6, y: 4.1, w: 12, h: 0.5,
    fontSize: 16, color: MBB.teal, fontFace: "Arial",
  });
  s1.addText(`${new Date().toLocaleDateString()}  ·  CONFIDENTIAL`, {
    x: 0.6, y: 6.8, w: 12, h: 0.3,
    fontSize: 10, color: "B7CEDC", fontFace: "Arial", charSpacing: 2,
  });
  s1.addShape(pptx.ShapeType.rect, { x: 0, y: 7.3, w: 13.33, h: 0.2, fill: { color: MBB.teal }, line: { color: MBB.teal } });

  // ── Slide 2: KPI overview with cards + sector chart
  const s2 = pptx.addSlide();
  // Top thin navy bar
  s2.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.08, fill: { color: MBB.navy }, line: { color: MBB.navy } });
  s2.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.22, h: 0.22, fill: { color: MBB.teal }, line: { color: MBB.teal } });
  s2.addText("Executive Overview", {
    x: 0.5, y: 0.4, w: 12, h: 0.6,
    fontSize: 26, bold: true, color: MBB.navy, fontFace: "Arial",
  });
  s2.addShape(pptx.ShapeType.rect, { x: 0.5, y: 1.0, w: 1.2, h: 0.04, fill: { color: MBB.teal }, line: { color: MBB.teal } });

  const stats = [
    { label: "TOTAL DEALS", value: String(deals.length), accent: MBB.teal },
    { label: "TOTAL VALUE", value: formatUsdShort(total), accent: MBB.blue },
    { label: "ACTIVE / LIVE", value: String(live), accent: MBB.green },
    { label: "AVG DEAL SIZE", value: deals.length ? formatUsdShort(total / deals.length) : "—", accent: MBB.tealDark },
  ];
  stats.forEach((st, i) => {
    const x = 0.5 + i * 3.1;
    s2.addShape(pptx.ShapeType.rect, { x, y: 1.35, w: 2.9, h: 0.06, fill: { color: st.accent }, line: { color: st.accent } });
    s2.addShape(pptx.ShapeType.rect, { x, y: 1.41, w: 2.9, h: 1.45, fill: { color: "FFFFFF" }, line: { color: MBB.rule, width: 0.5 } });
    s2.addText(st.label, {
      x: x + 0.18, y: 1.5, w: 2.6, h: 0.25,
      fontSize: 9, color: MBB.muted, bold: true, charSpacing: 2,
    });
    s2.addText(st.value, {
      x: x + 0.18, y: 1.8, w: 2.6, h: 0.9,
      fontSize: 26, color: MBB.ink, bold: true, fontFace: "Arial",
    });
  });

  // Top sectors chart
  const sectorMap = new Map<string, number>();
  deals.forEach((d) => {
    const k = d.sector ?? "Unknown";
    sectorMap.set(k, (sectorMap.get(k) ?? 0) + (d.normalized_value_usd ?? 0));
  });
  const topSectors = Array.from(sectorMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);

  if (topSectors.length > 0) {
    s2.addText("Top Sectors by Deal Value ($M)", {
      x: 0.5, y: 3.05, w: 12, h: 0.3,
      fontSize: 11, bold: true, color: MBB.tealDark, fontFace: "Arial", charSpacing: 1,
    });
    s2.addChart(pptx.ChartType.bar, [{
      name: "Value ($M)",
      labels: topSectors.map((x) => x[0]),
      values: topSectors.map((x) => Math.round(x[1] / 1e6)),
    }], {
      x: 0.5, y: 3.4, w: 12, h: 3.6,
      chartColors: [MBB.teal, MBB.blue, MBB.green, MBB.tealDark, MBB.navy],
      showLegend: false,
      catAxisLabelFontSize: 10, valAxisLabelFontSize: 10,
      catAxisLabelColor: MBB.body, valAxisLabelColor: MBB.body,
    });
  }

  // ── Slide 3: Top 15 table
  const s3 = pptx.addSlide();
  s3.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.08, fill: { color: MBB.navy }, line: { color: MBB.navy } });
  s3.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.22, h: 0.22, fill: { color: MBB.teal }, line: { color: MBB.teal } });
  s3.addText("Top 15 Deals by Value", {
    x: 0.5, y: 0.4, w: 12, h: 0.6,
    fontSize: 26, bold: true, color: MBB.navy, fontFace: "Arial",
  });
  s3.addShape(pptx.ShapeType.rect, { x: 0.5, y: 1.0, w: 1.2, h: 0.04, fill: { color: MBB.teal }, line: { color: MBB.teal } });

  const top15 = [...deals]
    .filter((d) => d.normalized_value_usd)
    .sort((a, b) => (b.normalized_value_usd ?? 0) - (a.normalized_value_usd ?? 0))
    .slice(0, 15);

  const headerCell = (text: string, alignR = false) => ({
    text,
    options: { bold: true, color: "FFFFFF", fill: { color: MBB.navy }, fontSize: 10, fontFace: "Arial", align: (alignR ? "right" : "left") as any, valign: "middle" as const, margin: 0.08 },
  });
  const tblRows = [
    [
      headerCell("Date"),
      headerCell("Buyer"),
      headerCell("Target"),
      headerCell("Sector"),
      headerCell("Value", true),
    ],
    ...top15.map((d, i) => [
      { text: d.deal_date ?? "—", options: { fontSize: 10, fill: { color: i % 2 === 0 ? MBB.tealPale : "FFFFFF" }, color: MBB.body, margin: 0.08 } },
      { text: d.buyer ?? "—", options: { fontSize: 10, bold: true, fill: { color: i % 2 === 0 ? MBB.tealPale : "FFFFFF" }, color: MBB.ink, margin: 0.08 } },
      { text: d.target ?? "—", options: { fontSize: 10, fill: { color: i % 2 === 0 ? MBB.tealPale : "FFFFFF" }, color: MBB.body, margin: 0.08 } },
      { text: d.sector ?? "—", options: { fontSize: 10, fill: { color: i % 2 === 0 ? MBB.tealPale : "FFFFFF" }, color: MBB.body, margin: 0.08 } },
      { text: formatDealValueForExport(d), options: { fontSize: 10, align: "right" as const, fill: { color: i % 2 === 0 ? MBB.tealPale : "FFFFFF" }, color: MBB.ink, margin: 0.08 } },
    ]),
  ];
  s3.addTable(tblRows as never, {
    x: 0.5, y: 1.3, w: 12.33,
    fontFace: "Arial",
    border: { type: "solid", pt: 0.5, color: MBB.rule },
    colW: [1.5, 3, 3, 2.5, 2.33],
  });

  // ── Slide 4: Closing
  const s4 = pptx.addSlide();
  s4.background = { color: MBB.navyDeep };
  s4.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.22, fill: { color: MBB.navy }, line: { color: MBB.navy } });
  s4.addShape(pptx.ShapeType.rect, { x: 0, y: 0.22, w: 13.33 * 0.62, h: 0.16, fill: { color: MBB.teal }, line: { color: MBB.teal } });
  s4.addShape(pptx.ShapeType.rect, { x: 0, y: 0.22, w: 13.33 * 0.25, h: 0.16, fill: { color: MBB.green }, line: { color: MBB.green } });
  s4.addText("Thank you.", {
    x: 0.5, y: 2.8, w: 12, h: 1.2,
    fontSize: 54, bold: true, color: "FFFFFF", align: "center", fontFace: "Arial",
  });
  s4.addText(MBB.name + "  ·  " + MBB.tagline, {
    x: 0.5, y: 4.1, w: 12, h: 0.5,
    fontSize: 14, color: MBB.teal, align: "center", fontFace: "Arial",
  });
  s4.addText("CONFIDENTIAL  ·  " + new Date().toLocaleDateString(), {
    x: 0.5, y: 6.8, w: 12, h: 0.3,
    fontSize: 9, color: "B7CEDC", align: "center", fontFace: "Arial", charSpacing: 4,
  });

  await pptx.writeFile({ fileName: `deal-iq-pipeline-${today()}.pptx` });
}
