const ICONS: Record<string, string> = {
  "Executive Summary": "ߓ",
  "Deal Context": "ߎ",
  "Why This Deal Matters": "ߎ",
  "Strategic Rationale": "ߧ",
  "Market": "ߌ",
  "Industry": "ߌ",
  "Value Creation": "ߒ",
  "Synergy": "ߒ",
  "Integration": "ߔ",
  "Separation": "✂️",
  "Day-1": "ߚ",
  "100-Day": "ߓ",
  "Risk": "⚠️",
  "Workstream": "⚙️",
  "Governance": "ߏ️",
  "Why Us": "✨",
  "Next Steps": "➡️",
  "Services": "ߛ️",
  "Engagement": "ߤ",
  "Transaction": "ߒ",
};

function pickIcon(heading: string): string {
  const h = heading.toLowerCase();
  for (const [key, icon] of Object.entries(ICONS)) {
    if (h.includes(key.toLowerCase())) return icon;
  }
  return "▸";
}

function renderTable(text: string): string {
  // Detect markdown table: lines starting with |
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const tableLines = lines.filter((l) => l.startsWith("|") && l.endsWith("|"));
  if (tableLines.length < 2) return "";

  const rows = tableLines
    .filter((l) => !/^\|[\s\-:|]+\|$/.test(l)) // skip separator |---|---|
    .map((l) => l.slice(1, -1).split("|").map((c) => c.trim()));

  if (rows.length < 2) return "";
  const [head, ...body] = rows;

  return `
<div class="my-4 overflow-x-auto">
  <table class="w-full border-collapse text-[12px]">
    <thead>
      <tr class="border-b-2 border-indigo-200 bg-indigo-50">
        ${head.map((h) => `<th class="px-3 py-2 text-left font-semibold text-indigo-900">${renderInline(h)}</th>`).join("")}
      </tr>
    </thead>
    <tbody>
      ${body.map((row) => `<tr class="border-b border-slate-100 hover:bg-slate-50">${row.map((c) => `<td class="px-3 py-2 text-slate-700">${renderInline(c)}</td>`).join("")}</tr>`).join("")}
    </tbody>
  </table>
</div>`;
}

function extractTable(text: string): { tableHtml: string; remainder: string } {
  const lines = text.split("\n");
  let start = -1, end = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith("|") && lines[i].trim().endsWith("|")) {
      if (start === -1) start = i;
      end = i;
    } else if (start !== -1 && lines[i].trim() === "") {
      // empty line after table — stop
      if (i > end) break;
    } else if (start !== -1 && !lines[i].trim().startsWith("|")) {
      break;
    }
  }
  if (start === -1) return { tableHtml: "", remainder: text };
  const tableText = lines.slice(start, end + 1).join("\n");
  const remainder = [...lines.slice(0, start), ...lines.slice(end + 1)].join("\n");
  return { tableHtml: renderTable(tableText), remainder };
}
function renderInline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-slate-900">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em class="italic text-slate-700">$1</em>')
    .replace(/\[(\d+)\]/g, '<sup class="ml-0.5 cursor-help text-[10px] font-bold text-indigo-600">[$1]</sup>')
    .replace(/`(.+?)`/g, '<code class="rounded bg-slate-100 px-1 py-0.5 text-[11px] font-mono text-slate-800">$1</code>');
}

function renderSynergyBlock(text: string): string {
  // Detect "$X revenue + $Y cost = $Z total"
  const m = /\$\s*([\d.,]+\s*[BMK])\s*revenue.{0,20}\$\s*([\d.,]+\s*[BMK])\s*cost.{0,20}\$\s*([\d.,]+\s*[BMK])/i.exec(text);
  if (!m) return "";
  const [, rev, cost, total] = m;
  return `
<div class="my-4 grid grid-cols-3 gap-3">
  <div class="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-emerald-100 p-3 text-center">
    <p class="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Revenue Synergies</p>
    <p class="mt-1 text-2xl font-bold text-emerald-900">${rev.trim()}</p>
  </div>
  <div class="rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100 p-3 text-center">
    <p class="text-[10px] font-bold uppercase tracking-wider text-blue-700">Cost Synergies</p>
    <p class="mt-1 text-2xl font-bold text-blue-900">${cost.trim()}</p>
  </div>
  <div class="rounded-xl border border-indigo-300 bg-gradient-to-br from-indigo-100 to-purple-100 p-3 text-center">
    <p class="text-[10px] font-bold uppercase tracking-wider text-indigo-700">Total Value</p>
    <p class="mt-1 text-2xl font-bold text-indigo-900">${total.trim()}</p>
  </div>
</div>`;
}

function renderTimeline(): string {
  return `
<div class="my-4 rounded-xl border border-slate-200 bg-white p-4">
  <p class="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">100-Day Roadmap</p>
  <div class="relative">
    <div class="absolute top-3 left-0 right-0 h-0.5 bg-gradient-to-r from-indigo-200 via-purple-200 to-emerald-200"></div>
    <div class="relative grid grid-cols-3 gap-2">
      <div class="text-center"><div class="mx-auto h-6 w-6 rounded-full border-2 border-indigo-500 bg-white"></div><p class="mt-2 text-[10px] font-bold text-indigo-700">Days 1-30</p><p class="text-[10px] text-slate-600">Stabilise · IMO · Day-1</p></div>
      <div class="text-center"><div class="mx-auto h-6 w-6 rounded-full border-2 border-purple-500 bg-white"></div><p class="mt-2 text-[10px] font-bold text-purple-700">Days 31-60</p><p class="text-[10px] text-slate-600">Integrate · Org · GTM</p></div>
      <div class="text-center"><div class="mx-auto h-6 w-6 rounded-full border-2 border-emerald-500 bg-white"></div><p class="mt-2 text-[10px] font-bold text-emerald-700">Days 61-100</p><p class="text-[10px] text-slate-600">Accelerate · Validate</p></div>
    </div>
  </div>
</div>`;
}

function renderRiskGrid(items: string[]): string {
  if (items.length < 2) return "";
  const cards = items.map((line) => {
    const m = /^(.+?)\s*[—\-:]\s*(.+)$/.exec(line);
    const title = m ? m[1].trim().replace(/^\W+/, "") : line.slice(0, 60);
    const body = m ? m[2].trim() : "";
    return `<div class="rounded-lg border border-amber-200 bg-amber-50 p-3"><p class="text-[11px] font-bold text-amber-900">⚠ ${renderInline(title)}</p>${body ? `<p class="mt-1 text-[11px] text-slate-700">${renderInline(body)}</p>` : ""}</div>`;
  }).join("");
  return `<div class="my-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">${cards}</div>`;
}

function renderWorkstreamGrid(text: string): string {
  // Match patterns like "**Finance:** description"
  const matches = Array.from(text.matchAll(/\*\*([^*:]+):\*\*\s*([^\n*]+)/g));
  if (matches.length < 3) return "";
  const cards = matches.map((m) => {
    return `<div class="rounded-lg border border-slate-200 bg-white p-3"><p class="text-[11px] font-bold text-indigo-700">${m[1].trim()}</p><p class="mt-1 text-[11px] leading-relaxed text-slate-600">${m[2].trim()}</p></div>`;
  }).join("");
  return `<div class="my-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">${cards}</div>`;
}

export function renderVisualProposal(md: string): string {
  // Split by H2 headings
  const blocks = md.split(/^## /m).filter(Boolean);
  const sections: string[] = [];

  blocks.forEach((block, idx) => {
    const lines = block.split("\n");
    const heading = lines[0].trim();
    const body = lines.slice(1).join("\n").trim();
    const icon = pickIcon(heading);
    const num = String(idx + 1).padStart(2, "0");

    let bodyHtml = "";

    // Detect risk section
    if (/risk/i.test(heading)) {
      const riskItems = body.split(/\n\n+/).filter((p) => /[⚠*]/.test(p) || p.length > 30);
      const grid = renderRiskGrid(riskItems);
      if (grid) {
        bodyHtml = grid;
      }
    }

    // Detect workstream section
    if (/workstream|functional/i.test(heading)) {
      const grid = renderWorkstreamGrid(body);
      if (grid) bodyHtml = grid;
    }

    // Extract any markdown tables first
    const { tableHtml, remainder } = extractTable(body);
    if (tableHtml) {
      bodyHtml += tableHtml;
      // Use the leftover (non-table) content for paragraph rendering below
      // by overwriting body
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (block as any) = remainder;
    }
    // Default: render paragraphs and bullets
    if (!bodyHtml) {
      const synergyVisual = /synergy|value creation/i.test(heading) ? renderSynergyBlock(body) : "";
      const timeline = /100-day/i.test(heading) ? renderTimeline() : "";

      const paragraphs = (remainder || body).split(/\n\n+/).map((p) => {
        p = p.trim();
        if (!p) return "";
        if (/^[-*]\s/.test(p)) {
          const items = p.split(/\n[-*]\s/).map((l) => l.replace(/^[-*]\s/, "").trim()).filter(Boolean);
          return `<ul class="my-2 ml-4 list-disc space-y-1 text-[13px] leading-relaxed text-slate-700">${items.map((i) => `<li>${renderInline(i)}</li>`).join("")}</ul>`;
        }
        if (/^\d+\.\s/.test(p)) {
          const items = p.split(/\n\d+\.\s/).map((l) => l.replace(/^\d+\.\s/, "").trim()).filter(Boolean);
          return `<ol class="my-2 ml-4 list-decimal space-y-1 text-[13px] leading-relaxed text-slate-700">${items.map((i) => `<li>${renderInline(i)}</li>`).join("")}</ol>`;
        }
        if (/^### /.test(p)) {
          return `<h4 class="mt-3 text-[13px] font-bold text-slate-800">${renderInline(p.replace(/^### /, ""))}</h4>`;
        }
        return `<p class="my-2 text-[13px] leading-relaxed text-slate-700">${renderInline(p)}</p>`;
      }).join("");

      bodyHtml = synergyVisual + paragraphs + timeline;
    }

    sections.push(`
<section class="mb-6">
  <div class="mb-3 flex items-center gap-2 border-b border-slate-200 pb-2">
    <span class="text-[10px] font-mono font-bold text-indigo-500">${num}</span>
    <span class="text-lg">${icon}</span>
    <h2 class="text-base font-bold text-slate-900">${heading}</h2>
  </div>
  <div>${bodyHtml}</div>
</section>`);
  });

  return sections.join("");
}

export function renderCitations(citationsMd: string): string {
  // Detect block of [n] Source — URL lines
  const lines = citationsMd.split("\n").filter((l) => /^\[\d+\]/.test(l.trim()));
  if (!lines.length) return "";
  const items = lines.map((line) => {
    const m = /^\[(\d+)\]\s*(.+?)(?:\s*[—–-]\s*(https?:\/\/\S+))?$/.exec(line.trim());
    if (!m) return "";
    const [, n, title, url] = m;
    return `<li class="text-[10px] text-slate-600"><span class="font-mono font-bold text-indigo-600">[${n}]</span> ${url ? `<a href="${url}" target="_blank" class="text-slate-700 hover:text-indigo-600 hover:underline">${title}</a>` : title}</li>`;
  }).filter(Boolean).join("");
  return `<aside class="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-4"><p class="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">ߓ Sources & Citations</p><ol class="space-y-1">${items}</ol></aside>`;
}
