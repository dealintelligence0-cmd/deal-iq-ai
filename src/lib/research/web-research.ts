export type ResearchBrief = {
  buyer_profile: string;
  target_profile: string;
  sector_signals: string;
  comparables: string;
  live_risks: string;
  citations: { title: string; url: string; snippet: string }[];
  generated_at: string;
};

type TavilyResult = { title: string; url: string; content: string };

async function tavilySearch(query: string, apiKey: string, maxResults = 4): Promise<TavilyResult[]> {
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey, query, max_results: maxResults,
        search_depth: "basic", include_answer: false,
      }),
    });
    if (!res.ok) return [];
    const j = await res.json();
    return (j.results ?? []).map((r: { title?: string; url?: string; content?: string }) => ({
      title: r.title ?? "",
      url: r.url ?? "",
      content: r.content ?? "",
    }));
  } catch {
    return [];
  }
}

function summarize(results: TavilyResult[], maxChars = 800): string {
  if (!results.length) return "No public sources found.";
  return results
    .map((r) => `• ${r.title}: ${r.content.slice(0, 250)}`)
    .join("\n")
    .slice(0, maxChars);
}

export async function researchDeal(
  buyer: string, target: string, sector: string, geography: string,
  tavilyKey: string
): Promise<ResearchBrief> {
  const queries = {
    buyer: `${buyer} recent acquisitions strategy ${new Date().getFullYear()}`,
    target: `${target} company overview revenue news`,
    sector: `${sector} M&A trends ${geography} 2026`,
    comparables: `${sector} acquisition ${geography} comparable deals recent`,
    risks: `${sector} regulatory antitrust ${geography} 2026`,
  };

  const [buyerR, targetR, sectorR, compR, riskR] = await Promise.all([
    tavilySearch(queries.buyer, tavilyKey, 3),
    tavilySearch(queries.target, tavilyKey, 3),
    tavilySearch(queries.sector, tavilyKey, 3),
    tavilySearch(queries.comparables, tavilyKey, 3),
    tavilySearch(queries.risks, tavilyKey, 2),
  ]);

  const all = [...buyerR, ...targetR, ...sectorR, ...compR, ...riskR];
  const seen = new Set<string>();
  const citations = all
    .filter((r) => r.url && !seen.has(r.url) && (seen.add(r.url), true))
    .slice(0, 12)
    .map((r) => ({ title: r.title, url: r.url, snippet: r.content.slice(0, 180) }));

  return {
    buyer_profile: summarize(buyerR),
    target_profile: summarize(targetR),
    sector_signals: summarize(sectorR),
    comparables: summarize(compR),
    live_risks: summarize(riskR),
    citations,
    generated_at: new Date().toISOString(),
  };
}

export function briefToPromptBlock(b: ResearchBrief): string {
  return `
## LIVE WEB RESEARCH (use this verbatim — cite sources)

### Buyer Profile
${b.buyer_profile}

### Target Profile
${b.target_profile}

### Sector Signals
${b.sector_signals}

### Recent Comparables
${b.comparables}

### Live Risks & Regulatory
${b.live_risks}

### Sources (cite by [n] in proposal)
${b.citations.map((c, i) => `[${i + 1}] ${c.title} — ${c.url}`).join("\n")}
`;
}
// ─── Prompt-based research (uses your existing LLM) ───────────────

export const DEFAULT_RESEARCH_PROMPT = `Generate consulting-grade research for this M&A deal:
Buyer: {{buyer}}
Target: {{target}}
Sector: {{sector}}
Geography: {{geography}}
Deal Size: {{deal_size}}

Cover these 5 areas. Be specific, numeric where possible, and avoid generic phrases.

1. SECTOR TRENDS: 3-5 bullet points on current dynamics, growth drivers, regulatory shifts.
2. BUYER PROFILE: Strategy, recent acquisitions, financial position, M&A track record.
3. TARGET PROFILE: Business model, revenue scale, competitive position, leadership.
4. DEAL RATIONALE & SYNERGIES: Strategic logic, revenue + cost synergy estimates, integration thesis.
5. RISKS: Regulatory, integration, market, talent — with mitigation hooks.

Use your training knowledge. Be candid about what you're confident on vs estimating. Output as 5 clearly headed sections, ~1000 words total.`;

export function fillPromptTemplate(
  template: string,
  vars: { buyer: string; target: string; sector: string; geography: string; deal_size: string }
): string {
  return template
    .replace(/\{\{buyer\}\}/g, vars.buyer || "(unspecified)")
    .replace(/\{\{target\}\}/g, vars.target || "(unspecified)")
    .replace(/\{\{sector\}\}/g, vars.sector || "(unspecified)")
    .replace(/\{\{geography\}\}/g, vars.geography || "(unspecified)")
    .replace(/\{\{deal_size\}\}/g, vars.deal_size || "(unspecified)");
}

export function aiTextToBrief(text: string): ResearchBrief {
  // Split LLM response into 5 sections by heading match
  const sec = (re: RegExp): string => {
    const m = re.exec(text);
    if (!m) return "";
    const start = m.index + m[0].length;
    const next = /^(?:#{1,3}\s|\d+\.\s|[A-Z][A-Z\s&]{8,}:?$)/m.exec(text.slice(start));
    return text.slice(start, next ? start + next.index : start + 1500).trim();
  };

  return {
    buyer_profile:    sec(/(?:^|\n)\s*(?:#{1,3}\s*)?(?:\d+\.\s*)?(?:BUYER PROFILE|Buyer Profile|Buyer)/i)    || text.slice(0, 600),
    target_profile:   sec(/(?:^|\n)\s*(?:#{1,3}\s*)?(?:\d+\.\s*)?(?:TARGET PROFILE|Target Profile|Target)/i),
    sector_signals:   sec(/(?:^|\n)\s*(?:#{1,3}\s*)?(?:\d+\.\s*)?(?:SECTOR TRENDS|Sector|Industry)/i),
    comparables:      sec(/(?:^|\n)\s*(?:#{1,3}\s*)?(?:\d+\.\s*)?(?:DEAL RATIONALE|Synergies|Rationale)/i),
    live_risks:       sec(/(?:^|\n)\s*(?:#{1,3}\s*)?(?:\d+\.\s*)?(?:RISKS|Risk)/i),
    citations:        [{ title: "AI prompt-based research (no live sources)", url: "", snippet: "Generated from LLM training data — not live web." }],
    generated_at:     new Date().toISOString(),
  };
}
