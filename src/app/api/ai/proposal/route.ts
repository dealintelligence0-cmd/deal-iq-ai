

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { routedCall, type RouteConfig } from "@/lib/ai/router";
import type { ChatMessage } from "@/lib/ai/providers";
import { buildDealContext, contextToPromptBlock, buildAdvisorVerdictPrompt, screenRegulatory, regulatoryToPromptBlock } from "@/lib/intelligence/context-engine";
import { buildIndustryContextBlock } from "@/lib/intelligence/industry";
import { normalizePrompt, buildRateLimitErrorMsg } from "@/lib/ai/utils";
import { buildAdvisoryRules } from "@/lib/ai/advisory-rules";
import { getAdvancedPromptBuilder } from "@/lib/advanced/prompts";
import { deriveSynergies } from "@/lib/advanced/engines/synergy_engine";
import { deriveDealRisks } from "@/lib/advanced/engines/risk_engine";
import { validateRequiredSections } from "@/lib/advanced/validators/output_validator";

export type ProposalType =
  | "advisory"
  | "executive_summary"
  | "board_memo"
  | "investment_teaser"
  | "integration_blueprint"
  | "hundred_day_plan";

const PROPOSAL_PROMPTS: Record<ProposalType, string> = {
  advisory: `You are an MBB senior partner. Write a consulting-grade M&A advisory proposal.

STRUCTURE:
## Executive Summary
## Strategic Rationale
## Value Creation & Synergies
## Integration Strategy
## Risk & Mitigation
## Governance
## 100-Day Plan
## Recommendation

Ensure:
- Numeric synergy logic
- Explicit risks with mitigation
- Clear recommendation`,
};

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { checkRateLimit, logActivity } = await import("@/lib/security");

  const allowed = await checkRateLimit(supabase, "ai_proposal", 20, 60);
  if (!allowed) {
    return NextResponse.json(
      { error: buildRateLimitErrorMsg(20, 60) },
      { status: 429 }
    );
  }

  const body = await req.json();

  const buyer = normalizePrompt(body.buyer ?? "", 200);
  const target = normalizePrompt(body.target ?? "", 200);
  const sector = normalizePrompt(body.sector ?? "", 100);
  const geography = normalizePrompt(body.geography ?? "", 100);
  const deal_size = normalizePrompt(body.deal_size ?? "", 50);
  const notes = normalizePrompt(body.notes ?? "", 3000);
  const proposal_type: ProposalType = body.proposal_type ?? "advisory";

  const mandate_type = body.mandate_type ?? "buy_side";
  const generation_mode = body.generation_mode ?? "standard";

  const use_premium = !!body.use_premium;
  const premium_mode = !!body.premium_mode;

  // ✅ CONFIG (FIXED)
  const cfg: RouteConfig = {
    primaryProvider: "openai",
    primaryModel: "gpt-5.3",
    apiKey: process.env.OPENAI_API_KEY,
  };

  // CONTEXT
  const ctx = buildDealContext({
    buyer,
    target,
    sector,
    geography,
    deal_size,
    notes,
  });

  const advisorBlock = buildAdvisorVerdictPrompt(ctx);
  const ctxBlock = contextToPromptBlock(ctx);

  const regFlags = screenRegulatory({
    deal_size_usd: ctx.deal_size_usd,
    geography,
    sector,
  });

  const regBlock = regulatoryToPromptBlock(regFlags);

  const fullContext =
    ctxBlock +
    "\n" +
    regBlock +
    "\n" +
    buildIndustryContextBlock(sector, geography);

  // ADVANCED
  const advancedBuilder = getAdvancedPromptBuilder(mandate_type);
  const isAdvancedMode =
    generation_mode === "advanced" && !!advancedBuilder;

  const synergyLines = deriveSynergies({
    sector,
    revenue:
      Number((deal_size || "").replace(/[^0-9.]/g, "")) || undefined,
    researchNotes: body.research_docs,
  });

  const riskLines = deriveDealRisks({
    geography,
    researchNotes: body.research_docs,
  });

  const advisoryRules = buildAdvisoryRules({
    mandateType: mandate_type,
    buyerType: body.buyer_type ?? "strategic",
    ownershipType: body.ownership_type ?? "majority",
    integrationStyle: body.integration_style ?? "functional",
    sector,
  });

  const systemPrompt = isAdvancedMode
    ? advancedBuilder!({
        buyer,
        target,
        sector,
        geography,
        dealSize: deal_size,
        notes,
        researchInsights: body.research_docs,
      })
    : PROPOSAL_PROMPTS[proposal_type];

  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        systemPrompt +
        "\n\n=== ADVISORY RULES ===\n" +
        advisoryRules +
        "\n\n=== ADVISOR VERDICT ===\n" +
        advisorBlock,
    },
    {
      role: "user",
      content: `
Generate a high-quality ${proposal_type.replace(/_/g, " ")}.

STRICT REQUIREMENTS:
- No generic text
- Include synergy calculations
- Include quantified risks
- Include regulatory pathway
- End with recommendation

## SYNERGY LOGIC
${JSON.stringify(synergyLines, null, 2)}

## RISK LOGIC
${JSON.stringify(riskLines, null, 2)}

${fullContext}
`,
    },
  ];

  try {
    if (premium_mode && body.research_mode === "web" && !body.research_docs) {
      return NextResponse.json(
        { error: "Premium Mode requires research context." },
        { status: 400 }
      );
    }

    let result = await routedCall(cfg, messages, use_premium ? 8000 : 6000);

    if (isAdvancedMode) {
      const validation = validateRequiredSections(result.text, []);

      if (!validation.ok) {
        const retryMessages: ChatMessage[] = [
          ...messages,
          {
            role: "user",
            content: `Retry. Missing: ${validation.missing.join(", ")}`,
          },
        ];

        result = await routedCall(
          cfg,
          retryMessages,
          use_premium ? 8000 : 6000
        );
      }
    }

    const admin = createAdminClient();

    await admin.from("proposals").insert({
      user_id: user.id,
      proposal_type,
      client_name: body.client_name,
      buyer,
      target,
      sector,
      geography,
      deal_size,
      notes,
      content: result.text,
      provider: result.provider,
      model: result.model,
      via_fallback: result.viaFallback,
    });

    await logActivity(
      supabase,
      "proposal_generated",
      "proposals",
      undefined,
      { type: proposal_type }
    );

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
