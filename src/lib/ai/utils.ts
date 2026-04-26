export function normalizePrompt(text: string, maxLen = 3000): string {
  if (!text) return "";
  return text.replace(/\0/g, "").replace(/\s{3,}/g, "  ").trim().slice(0, maxLen);
}

export function enforceMBBTone(prompt: string): string {
  const banned = ["in the sector", "there are risks", "synergies include cost savings", "value-add", "best-in-class", "world-class", "leverage"];
  let p = prompt;
  banned.forEach((w) => {
    p = p.replace(new RegExp(w, "gi"), "[SPECIFICS REQUIRED]");
  });
  return p;
}

export function injectDealContext(fields: {
  buyer: string; target: string; sector: string; geography: string;
  dealSize: string; dealType?: string; notes?: string;
}): string {
  return [
    fields.buyer     && `Buyer: ${fields.buyer}`,
    fields.target    && `Target: ${fields.target}`,
    fields.sector    && `Sector: ${fields.sector}`,
    fields.geography && `Geography: ${fields.geography}`,
    fields.dealSize  && `Deal Size: ${fields.dealSize}`,
    fields.dealType  && `Deal Type: ${fields.dealType}`,
    fields.notes     && `Notes: ${fields.notes}`,
  ].filter(Boolean).join("\n");
}

export function cleanMarkdownToHTML(md: string): string {
  if (!md) return "";
  let html = md
    .replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold text-slate-800 mt-5 mb-2 dark:text-slate-200">$1</h3>')
    .replace(/^## (.+)$/gm,  '<h2 class="text-lg font-bold text-slate-900 mt-6 mb-2 border-b border-slate-200 pb-1 dark:text-white dark:border-slate-700">$1</h2>')
    .replace(/^# (.+)$/gm,   '<h1 class="text-xl font-extrabold text-slate-900 mt-4 mb-3 dark:text-white">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-slate-900 dark:text-white">$1</strong>')
    .replace(/\*(.+?)\*/g,    '<em class="italic text-slate-700 dark:text-slate-300">$1</em>')
    .replace(/^- (.+)$/gm,    '<li class="ml-4 list-disc text-slate-700 dark:text-slate-300 my-0.5">$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li class="ml-4 list-decimal text-slate-700 dark:text-slate-300 my-0.5">$2</li>')
    .replace(/(<li.*<\/li>\n?)+/g, (s) => `<ul class="my-2 space-y-0.5">${s}</ul>`)
    .replace(/\n\n/g, '</p><p class="text-slate-700 leading-relaxed my-2 dark:text-slate-300">')
    .replace(/\n/g, '<br/>');
  html = '<p class="text-slate-700 leading-relaxed my-2 dark:text-slate-300">' + html + '</p>';
  html = html.replace(/<p[^>]*>\s*<\/p>/g, '');
  return html;
}

export function controlTokens(text: string, maxWords = 1800): string {
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(" ") + "\n\n[Output truncated for token efficiency. Key sections above are complete.]";
}

export function buildRateLimitErrorMsg(limit: number, window: number): string {
  return `Rate limit: ${limit} requests per ${window} seconds. Please wait before retrying.`;
}
