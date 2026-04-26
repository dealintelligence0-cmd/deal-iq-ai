import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { routedCall, type RouteConfig } from "@/lib/ai/router";
import type { ChatMessage, ProviderId } from "@/lib/ai/providers";
import { buildIndustryContextBlock, getSynergyBenchmark } from "@/lib/intelligence/industry";
import { normalizePrompt, injectDealContext } from "@/lib/ai/utils";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { checkRateLimit } = await import("@/lib/security");
  const allowed = await checkRateLimit(supabase, "ai_synergy", 15, 60);
  if (!allowed) return NextResponse.json({ error: "Rate limit: 15 requests per minute" }, { status: 429 });

  const body = await req.json() as {
    buyer?: string; target?: string; sector?: string; geography?: string;
    deal_size?: string; target_revenue?: string; target_ebitda?: string;
    buyer_revenue?: string; ambition?: string; notes?: string;
  };

  const {
    buyer = "", target = "", sector = "", geography = "",
    deal_size = "", target_revenue = "", target_ebitda = "",
    buyer_revenue = "", ambition = "base", notes = "",
  } = body;

  const bench = getSynergyBenchmark(sector);
  const industryCtx = buildIndustryContextBlock(sector, geography);
  const dealCtx = injectDealContext({
    buyer, target, sector, geography,
    dealSize: deal_size, notes: normalizePrompt(notes, 1000),
  });
  // Build route config (Smart tier — synergy modelling needs reasoning)
  const admin = createAdminClient();

// Pull live web research if user has a search key
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
      const brief = await researchDeal(buyer, target, sector, geography, searchKey);
      void provider;
      researchBlock = briefToPromptBlock(brief);
    }
  } catch { /* research is optional — proceed without */ }
  
  const ambitionMult = ambition === "aggressive" ? 1.0 : ambition === "conservative" ? 0.5 : 0.72;
  const costPct = ((bench.costLow + bench.costHigh) / 2 * ambitionMult * 100).toFixed(1);
  const revPct = ((bench.revLow + bench.revHigh) / 2 * ambitionMult * 100).toFixed(1);
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
      error: "Synergy Engine requires a Smart-tier AI key. Save one in Settings → AI Providers (Anthropic, OpenAI, or Gemini recommended).",
    }, { status: 400 });
  }
  const cfg: RouteConfig = {
    tier: "smart",
    primaryProvider: ((settings?.premium_provider ?? settings?.bulk_provider) as ProviderId) ?? "free",
    primaryKey: apiKey,
    primaryModel: (settings?.premium_model ?? settings?.bulk_model) as string | undefined,
  };

  const systemPrompt = `You are an MBB integration partner producing a detailed synergy model.

ABSOLUTE RULES:
1. ALL $ values must be computed from the deal_size provided — never state ranges without computing deal-specific values.
2. Industry context MUST drive specific initiatives — no generic G&A bullets if sector is SaaS; focus on ARR, cloud cost, GTM.
3. Benchmarks section MUST cite 2-3 real named comparable transactions with deal sizes and synergy multiples.
4. Confidence levels: High = proven in comparable deals, Medium = achievable with execution, Low = aspirational/dependent.
5. No banned phrases: "industry-leading", "best-in-class", "leverage synergies", "value-add".

MANDATORY OUTPUT STRUCTURE (exact ## headings):

## Synergy Executive Summary
One paragraph: total gross synergy, net of integration costs, implied synergy/EV%, payback period (months), overall confidence (High/Medium/Low). State the sector and deal-specific rationale in one sentence.

## Cost Synergies — $[X]M Total
Table: Initiative | Category | Annual Run-Rate ($M) | Y1 | Y2 | Y3 | Confidence | Primary Owner
MINIMUM 10 initiatives — must be sector-specific (no generic G&A bullets).
For SaaS/Tech: focus on cloud cost, ARR consolidation, engineering rationalization, GTM model merge.
For Healthcare/Life Sciences: focus on procurement/GPO leverage, R&D portfolio, regulatory pathway, payer mix.
For Manufacturing: focus on plant footprint, procurement scale, SKU rationalization, logistics network.
Categories: G&A | Procurement | Technology | Footprint | Headcount | Operations | Other
Y1/Y2/Y3 values must follow 30/70/100 realisation curve.
Amounts computed from deal_size × ${costPct}% midpoint.

## Revenue Synergies — $[X]M Total
Table: Initiative | Mechanism | Y1 | Y2 | Y3 | Confidence | Key Dependency
MINIMUM 6 initiatives covering: cross-sell, pricing optimisation, geographic expansion, product bundling, new product co-development, channel attach. Realisation curve: 20/60/100.
Sector logic: SaaS → cross-sell/NRR/pricing; FS → AUM/branch; Healthcare → procurement/referral.
Amounts: deal_size × ${revPct}% midpoint.

## Integration Costs (One-Time) — ($[X]M)
Table: Category | Amount ($M) | Timing | Rationale
Cover: Severance/restructuring, Technology migration, Facilities, Professional fees, Communications & retention.
Total integration cost ≈ 4% of deal_size.

## Net Synergy Waterfall
Year | Gross Cost Syn | Gross Rev Syn | Integration Costs | Net Synergy | Cumulative
Show Y1 / Y2 / Y3 / Steady State.
Show NPV of net synergies at 10% discount rate.
Show break-even month.

## Synergy Realisation Risks
Table: Risk | Category | Probability | $ Impact ($M) | Mitigation
MINIMUM 4 risks. Categories: Execution | Market | Regulatory | Talent | Technology.

## Sector Benchmarks
Compare synergy/EV% to 3 NAMED comparable transactions in same sector (real deals from 2021-2025).
Format: "Deal A/B (Year): $XB — X% synergy/EV capture".

OUTPUT QUALITY CONTROL:
- Total length 800-1200 words
- All $ values must be computed from deal_size — no generic % ranges
- Each comparable transaction must be a real named deal (2021-2025) with actual deal value
- No truncation — every section must be complete
- No repetition between sections`;

  const userPrompt = [
    dealCtx,
    industryCtx,
    researchBlock,
    `Synergy ambition: ${ambition}`,
    target_revenue ? `Target Revenue: ${target_revenue}` : "",
    target_ebitda ? `Target EBITDA: ${target_ebitda}` : "",
    buyer_revenue ? `Buyer Revenue: ${buyer_revenue}` : "",
    researchBlock ? "[USE RESEARCH] Cite specific findings from LIVE WEB RESEARCH using [1], [2] markers throughout. Reference buyer's recent activity, target's actual metrics, and current sector dynamics — never use generic phrases when specifics are available." : "",
  ].filter(Boolean).join("\n");

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  try {
    const result = await routedCall(cfg, messages, 6000);
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
