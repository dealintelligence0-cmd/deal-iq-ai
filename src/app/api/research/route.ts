import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { researchDeal } from "@/lib/research/web-research";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { checkRateLimit } = await import("@/lib/security");
  const allowed = await checkRateLimit(supabase, "research", 5, 60);
  if (!allowed) return NextResponse.json({ error: "Rate limit: 5 researches/min" }, { status: 429 });

  const body = await req.json() as {
    deal_id?: string; buyer: string; target: string;
    sector: string; geography: string; force?: boolean;
  };

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
