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
