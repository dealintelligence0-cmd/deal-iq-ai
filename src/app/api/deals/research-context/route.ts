

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { routedCall, type RouteConfig } from "@/lib/ai/router";
import type { ChatMessage, ProviderId } from "@/lib/ai/providers";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { deal_id, buyer, target, sector, country, deal_type, stake_percent } = await req.json();
  if (!deal_id) return NextResponse.json({ error: "deal_id required" }, { status: 400 });

  const admin = createAdminClient();

  // Cache check
  const { data: cached } = await admin.from("deals").select("ai_enrichment, ai_enriched_at").eq("id", deal_id).maybeSingle();
  if (cached?.ai_enrichment && cached.ai_enriched_at) {
    const age = Date.now() - new Date(cached.ai_enriched_at).getTime();
    if (age < 7 * 24 * 60 * 60 * 1000) {
      return NextResponse.json({ ok: true, cached: true, ...cached.ai_enrichment });
    }
  }

  // Get user's Smart-tier provider
  const { data: settings } = await admin.from("ai_settings")
    .select("premium_provider, premium_model, premium_key_encrypted, tavily_key_encrypted")
    .eq("user_id", user.id).maybeSingle();

  const s = settings as Record<string, unknown> | null;
  const cipher = s?.premium_key_encrypted as string | undefined;
  let apiKey: string | null = null;
  if (cipher) {
    try {
      const { data: dec } = await admin.rpc("decrypt_key", { cipher });
      apiKey = dec as string | null;
    } catch { /* skip */ }
  }
  if (!apiKey) return NextResponse.json({ error: "No Smart-tier AI provider configured. Open Settings." }, { status: 400 });

  // Optional Tavily research
  let webResearch = "";
  const tavilyCipher = s?.tavily_key_encrypted as string | undefined;
  if (tavilyCipher) {
    try {
      const { data: dec } = await admin.rpc("decrypt_key", { cipher: tavilyCipher });
      const tavilyKey = dec as string | null;
      if (tavilyKey) {
        const queries = [
          `${buyer} M&A acquisition strategy 2024 2025`,
          `${target} business news funding products 2024 2025`,
        ];
        for (const q of queries) {
          try {
            const r = await fetch("https://api.tavily.com/search", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ api_key: tavilyKey, query: q, max_results: 3, search_depth: "basic" }),
            });
            if (r.ok) {
              const j = await r.json();
              const snippets = (j.results || []).slice(0, 3).map((x: { content?: string; title?: string }) => `[${x.title}] ${x.content?.slice(0, 200)}`).join("\n");
              webResearch += `\n--- ${q} ---\n${snippets}\n`;
            }
          } catch { /* continue */ }
        }
      }
    } catch { /* skip */ }
  }

  const systemPrompt = `You are an MBB Partner producing deal intelligence for an Investment Committee. Output STRICT JSON only — no preamble, no markdown.

Schema:
{
  "buyer_context": [5 implication-driven bullets, each <25 words],
  "target_context": [5 implication-driven bullets, each <25 words],
  "comparable_pattern": "2-3 sentences with strategic inference",
  "advisory_attractiveness_why": "1-2 sentences with specific drivers",
  "advisory_attractiveness_so_what": "1 sentence with named advisory revenue opportunity"
}

CRITICAL — IMPLICATION OVER DESCRIPTION:
- BAD: "Buyer has 27 acquisitions"
- GOOD: "27 prior deals = mature M&A function; expect formal RFP process; lead with PMI track record"
- BAD: "Target is in Gartner Magic Quadrant"
- GOOD: "Gartner Leader status = premium pricing power; buyer paying for category leadership = 25-35% control premium expected"

Every bullet MUST start with a fact, then state IMPLICATION using "→" or "; expect/suggests/indicates":
- "Infosys 27 prior deals → mature M&A function; expect competitive RFP, advisor selected on sector creds"
- "DataRobot last raised at $6.3B (2021) → likely down-round acquisition; goodwill impairment risk on day 1"
- "Stake 30% (minority) → governance-only role; advisory window narrow (DD + structuring), no PMI work"

BANNED PHRASES: "strengthens position", "enhances capabilities", "drives growth", "best-in-class", "leverage", "value-add", "industry-leading", "robust"

Use web research findings (if provided) as the FACT side of each "fact → implication" pair. Never report a fact without its strategic implication.`;

  const userPrompt = `Deal: ${buyer} ${deal_type ?? "acquires"} ${target}
Sector: ${sector ?? "N/A"}
Country: ${country ?? "N/A"}
Stake: ${stake_percent ?? "N/A"}%
Type: ${deal_type ?? "Acquisition"}
${webResearch ? `\nWEB RESEARCH:\n${webResearch}` : ""}

Return JSON per schema.`;

  const cfg: RouteConfig = {
    tier: "smart",
    primaryProvider: (s?.premium_provider as ProviderId) ?? "free",
    primaryKey: apiKey,
    primaryModel: (s?.premium_model as string | undefined),
    blockFreeFallback: true,
  };

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  try {
    const result = await routedCall(cfg, messages, 2000);
    if (result.provider === "free") {
      return NextResponse.json({ error: `AI failed: ${result.lastError ?? "unknown"}` }, { status: 500 });
    }

   // Parse JSON with fallback extraction
    const text = result.text.replace(/```json|```/g, "").trim();
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(text);
    } catch {
      // Fallback: extract first {...} block
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try { parsed = JSON.parse(jsonMatch[0]); }
        catch { /* still failed */ }
      }
      // Last-resort: regex-extract sections from raw text
      if (Object.keys(parsed).length === 0) {
        const extractList = (label: string): string[] => {
          const re = new RegExp(`${label}[":\\s\\[]*([^\\[\\]]+)`, "i");
          const m = text.match(re);
          if (!m) return [];
          return m[1].split(/[",\n]/).map((s) => s.trim().replace(/^[-•*]\s*/, "")).filter((s) => s.length > 8).slice(0, 5);
        };
        parsed = {
          buyer_context: extractList("buyer_context"),
          target_context: extractList("target_context"),
          comparable_pattern: (text.match(/comparable[_\s]?pattern[":\s]*"([^"]+)"/i)?.[1]) || "Pattern unavailable — AI output malformed.",
          advisory_attractiveness_why: (text.match(/advisory_attractiveness_why[":\s]*"([^"]+)"/i)?.[1]) || "—",
          advisory_attractiveness_so_what: (text.match(/advisory_attractiveness_so_what[":\s]*"([^"]+)"/i)?.[1]) || "—",
        };
      }
    }

    // Save to ai_enrichment
    await admin.from("deals").update({
      ai_enrichment: parsed,
      ai_enriched_at: new Date().toISOString(),
    }).eq("id", deal_id);

    return NextResponse.json({ ok: true, cached: false, ...parsed });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
