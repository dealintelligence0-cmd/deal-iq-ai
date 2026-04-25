import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { researchDeal, aiTextToBrief, fillPromptTemplate, DEFAULT_RESEARCH_PROMPT } from "@/lib/research/web-research";
import { routedCall, type RouteConfig } from "@/lib/ai/router";
import type { ChatMessage, ProviderId } from "@/lib/ai/providers";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { checkRateLimit } = await import("@/lib/security");
  const allowed = await checkRateLimit(supabase, "research", 5, 60);
  if (!allowed) return NextResponse.json({ error: "Rate limit: 5 researches/min" }, { status: 429 });

  const body = await req.json() as {
    deal_id?: string; buyer: string; target: string;
    sector: string; geography: string; deal_size?: string;
    force?: boolean;
    mode?: "web" | "prompt";
    custom_prompt?: string;
  };
  const mode = body.mode ?? "web";

  const admin = createAdminClient();

  // Check 24-hr cache
  if (!body.force && body.deal_id) {
    const { data: cached } = await admin
      .from("research_briefs")
      .select("brief_json,created_at")
      .eq("user_id", user.id)
      .eq("deal_id", body.deal_id)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (cached) return NextResponse.json({ brief: cached.brief_json, cached: true });
  }

  // ─── PROMPT-BASED MODE ───
  if (mode === "prompt") {
    const { data: aiSettings } = await admin
      .from("ai_settings")
      .select("premium_provider, premium_model, premium_key_encrypted, bulk_provider, bulk_model, bulk_key_encrypted")
      .eq("user_id", user.id)
      .maybeSingle();

    let aiKey: string | null = null;
    const cipher = (aiSettings?.premium_key_encrypted ?? aiSettings?.bulk_key_encrypted) as string | undefined;
    if (cipher) {
      try {
        const { data: dec } = await admin.rpc("decrypt_key", { cipher });
        aiKey = dec as string;
      } catch { /* fallback to free */ }
    }

    const cfg: RouteConfig = {
      tier: "smart",
      primaryProvider: ((aiSettings?.premium_provider ?? aiSettings?.bulk_provider) as ProviderId) ?? "free",
      primaryKey: aiKey,
      primaryModel: (aiSettings?.premium_model ?? aiSettings?.bulk_model) as string | undefined,
    };

    const filled = fillPromptTemplate(
      body.custom_prompt || DEFAULT_RESEARCH_PROMPT,
      { buyer: body.buyer, target: body.target, sector: body.sector, geography: body.geography, deal_size: body.deal_size ?? "" }
    );

    const messages: ChatMessage[] = [
      { role: "system", content: "You are a senior M&A research analyst. Be specific, numeric, candid." },
      { role: "user", content: filled },
    ];

    try {
      const result = await routedCall(cfg, messages, 2500);
      const brief = aiTextToBrief(result.text);
      await admin.from("research_briefs").insert({
        user_id: user.id, deal_id: body.deal_id ?? null,
        buyer: body.buyer, target: body.target,
        sector: body.sector, geography: body.geography,
        brief_json: brief, source_provider: `prompt:${result.provider}`,
      });
      return NextResponse.json({ brief, cached: false, mode: "prompt" });
    } catch (e) {
      return NextResponse.json({ error: "Prompt research failed: " + String(e) }, { status: 500 });
    }
  }

  // ─── WEB-SEARCH MODE (Tavily/Brave/Serper) ───
  // Fetch Tavily key
  const { data: settings } = await admin
    .from("ai_settings")
    .select("tavily_key_encrypted")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!settings?.tavily_key_encrypted) {
    return NextResponse.json({ error: "No Tavily API key. Save one in Settings." }, { status: 400 });
  }

  let tavilyKey = "";
  try {
    const { data: dec } = await admin.rpc("decrypt_key", { cipher: settings.tavily_key_encrypted });
    tavilyKey = dec as string;
  } catch {
    return NextResponse.json({ error: "Failed to decrypt key" }, { status: 500 });
  }

  try {
    const brief = await researchDeal(body.buyer, body.target, body.sector, body.geography, tavilyKey);

    await admin.from("research_briefs").insert({
      user_id: user.id, deal_id: body.deal_id ?? null,
      buyer: body.buyer, target: body.target,
      sector: body.sector, geography: body.geography,
      brief_json: brief, source_provider: "tavily",
    });

    return NextResponse.json({ brief, cached: false });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
