

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

  const systemPrompt = `You are an MBB partner producing deal intelligence. Output STRICT JSON only — no preamble, no markdown.

Schema:
{
  "buyer_context": [5 deal-specific bullets, each <22 words, NO generic phrases],
  "target_context": [5 deal-specific bullets, each <22 words, NO generic phrases],
  "comparable_pattern": "2-3 sentence insight on what comparables imply for THIS deal",
  "advisory_attractiveness_why": "1-2 sentences on integration complexity + deal type + regulatory",
  "advisory_attractiveness_so_what": "1 sentence on the specific advisory revenue opportunity"
}

Rules:
- BANNED: 'strengthens position', 'enhances capabilities', 'drives growth', 'best-in-class', 'leverage'
- Each bullet must reference SPECIFIC facts (sector dynamic, deal mechanics, geography, stake structure)
- Use web research findings if provided to ground claims in real events`;

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

    // Parse JSON
    const text = result.text.replace(/```json|```/g, "").trim();
    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(text); }
    catch { return NextResponse.json({ error: "AI returned non-JSON. Try again." }, { status: 500 }); }

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
