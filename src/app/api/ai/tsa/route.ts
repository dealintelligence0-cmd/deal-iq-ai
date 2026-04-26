import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { routedCall, type RouteConfig } from "@/lib/ai/router";
import type { ChatMessage, ProviderId } from "@/lib/ai/providers";
import { buildIndustryContextBlock } from "@/lib/intelligence/industry";
import { normalizePrompt, injectDealContext } from "@/lib/ai/utils";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { checkRateLimit } = await import("@/lib/security");
  const allowed = await checkRateLimit(supabase, "ai_tsa", 10, 60);
  if (!allowed) return NextResponse.json({ error: "Rate limit: 10 requests per minute" }, { status: 429 });

  const body = await req.json() as {
    seller?: string; buyer?: string; sector?: string;
    deal_size?: string; geography?: string; close_date?: string;
    functions?: string[]; duration?: string;
    pricing_basis?: string; constraints?: string;
  };

  const {
    seller = "", buyer = "", sector = "", deal_size = "",
    geography = "", close_date = "", functions = [],
    duration = "12", pricing_basis = "cost_plus_10", constraints = "",
  } = body;

  const industryCtx = buildIndustryContextBlock(sector, geography);
  const dealCtx = injectDealContext({
    buyer, target: seller, sector, geography,
    dealSize: deal_size, notes: normalizePrompt(constraints, 500),
  });
  const fnList = Array.isArray(functions) ? functions.join(", ") : String(functions);
  const fnCount = Array.isArray(functions) ? functions.length : 0;
  const complexity = fnCount >= 7 ? "Complex" : fnCount >= 4 ? "Standard" : "Simple";

  // Build route config
  const admin = createAdminClient();
  const { data: settings } = await admin
    .from("ai_settings")
    .select("premium_provider, premium_model, premium_key_encrypted, bulk_provider, bulk_model, bulk_key_encrypted")
    .eq("user_id", user.id)
    .maybeSingle();

  let apiKey: string | null = null;
  const cipher = (settings?.premium_key_encrypted ?? settings?.bulk_key_encrypted) as string | undefined;
  if (cipher) {
    try {
      const { data: dec } = await admin.rpc("decrypt_key", { cipher });
      apiKey = dec as string | null;
    } catch { /* fallback to free */ }
  }

  if (!apiKey || !settings?.premium_provider) {
    return NextResponse.json({
      error: "TSA Generator requires a Smart-tier AI key. Save one in Settings → AI Providers (Anthropic, OpenAI, or Gemini recommended).",
    }, { status: 400 });
  }

  const cfg: RouteConfig = {
    tier: "smart",
    primaryProvider: ((settings?.premium_provider ?? settings?.bulk_provider) as ProviderId) ?? "free",
    primaryKey: apiKey,
    primaryModel: (settings?.premium_model ?? settings?.bulk_model) as string | undefined,
  };
  // Pull live web research if a search key exists
  let researchBlock = "";
  try {
    const { data: provData } = await admin
      .from("ai_settings")
      .select("research_provider, tavily_key_encrypted, brave_key_encrypted, serper_key_encrypted")
      .eq("user_id", user.id)
      .maybeSingle();

    const provider = (provData?.research_provider ?? "tavily") as "tavily" | "brave" | "serper";
    const cipherCol = provider === "brave" ? "brave_key_encrypted"
                    : provider === "serper" ? "serper_key_encrypted"
                    : "tavily_key_encrypted";
    const searchCipher = provData?.[cipherCol] as string | null | undefined;

    if (searchCipher) {
      const { data: dec } = await admin.rpc("decrypt_key", { cipher: searchCipher });
      const searchKey = dec as string;
      const { researchDeal, briefToPromptBlock } = await import("@/lib/research/web-research");
      const brief = await researchDeal(buyer, seller, sector, geography, searchKey);
      researchBlock = briefToPromptBlock(brief);
      void provider;
    }
  } catch { /* research is optional */ }

  const systemPrompt = `You are an MBB carve-out specialist designing a Transitional Service Agreement (TSA) framework.

RULES:
1. Service catalog MUST cover every selected function with specific service descriptions — not generic bullets.
2. Pricing: cost-plus 5% = allocated fully-loaded cost + margin; cost-plus 10% = higher margin; market rate = industry benchmarks.
   All prices MUST be computed from deal_size: IT ~0.3%/mo, Finance ~0.15%/mo, HR ~0.1%/mo, Legal ~0.08%/mo, others ~0.05–0.12%/mo of deal value.
3. Exit milestones must be a critical path — show sequence and dependencies.
4. Governance section must include specific SLA breach consequences (not vague).
5. No generic phrases. Every recommendation actionable.
TSA complexity: ${complexity} (${fnCount} functions, ${duration} months).

MANDATORY OUTPUT STRUCTURE:

## TSA Executive Summary
Scope, total estimated cost, duration, top 3 exit dependencies, overall complexity rating.

## Service Catalog
For EACH selected function, one table row:
| Service | Description | Provider Obligations | Recipient Obligations | SLA | Pricing Basis | Est. Monthly Cost | Duration (months) |
Compute monthly cost from deal_size. Show total per function.

## Pricing Summary
Table: Function | Monthly ($K) | Duration (mo) | Total ($K) | % of Deal Value
Grand total TSA cost. Benchmark: "MBB benchmark: 1–3% of deal value for 12-month TSA."

## Exit Milestone Critical Path
Ordered table:
| Sequence | Workstream | Exit Trigger | Target Month | Owner | Predecessor | Risk if Delayed |
Show the 3 most complex exits in detail.

## Governance & SLA Framework
- Escalation: Service issue → TSA Manager (48h) → Joint SteerCo (5 days) → CEO escalation (10 days)
- SLA breach remedy: 5% monthly service credit per breach, up to 25% cap
- Pricing dispute: 30-day cure → independent accountant → binding arbitration
- Change control: any scope change requires 15-day written notice and joint approval

## TSA Risks & Mitigation
Table: Risk | Probability | $ Impact | Mitigation | Owner
Min 5 risks. Include: seller motivation to exit early, IT migration delays, stranded costs, pricing disputes, dependency chain failures.

## Negotiation Strategy for Buyer
5 specific negotiating positions with commercial rationale.
Format: "Position: [X] — Rationale: [Y] — Fallback: [Z]"

OUTPUT QUALITY CONTROL:
- Total length 700-1000 words
- Every service must include specific SLA metric (e.g., "99.5% uptime, 4hr response time")
- Every monthly cost must be computed from deal_size (no placeholder ranges)
- Every exit dependency must name a specific predecessor service
- For cross-border deals: explicit data residency + regulatory regime per jurisdiction
- Stranded cost risk quantified in $ for each function`;
  
  const userPrompt = [
    dealCtx,
    industryCtx,
    researchBlock,
    `Selected TSA functions: ${fnList}`,
    `Target duration: ${duration} months`,
    `Pricing basis: ${pricing_basis}`,
    `Close date: ${close_date}`,
    researchBlock ? "[USE RESEARCH] Cite live findings using [1], [2] markers — reference seller's actual operational footprint and buyer's capability gaps." : "",
  ].filter(Boolean).join("\n");

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  try {
    const result = await routedCall(cfg, messages, 5000);
    return NextResponse.json({
      content: result.text,
      provider: result.provider,
      model: result.model,
      viaFallback: result.viaFallback,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
