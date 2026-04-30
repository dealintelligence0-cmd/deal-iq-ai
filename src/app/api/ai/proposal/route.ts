

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { routedCall, type RouteConfig } from "@/lib/ai/router";
import type { ChatMessage, ProviderId } from "@/lib/ai/providers";
import { classifyDeal, generateServices, expandService, expandCustomService, type Service, type DealInput } from "@/lib/intelligence/deal-classifier";
import { buildDealContext, contextToPromptBlock, buildAdvisorVerdictPrompt, screenRegulatory, regulatoryToPromptBlock } from "@/lib/intelligence/context-engine";
import { buildIndustryContextBlock } from "@/lib/intelligence/industry";
import { normalizePrompt, buildRateLimitErrorMsg } from "@/lib/ai/utils";
import { buildAdvisoryRules } from "@/lib/ai/advisory-rules";

export type ProposalType =
  | "advisory" | "executive_summary" | "board_memo"
  | "investment_teaser" | "integration_blueprint" | "hundred_day_plan";

const PROPOSAL_PROMPTS: Record<ProposalType, string> = {
  advisory: `You are an MBB senior partner. Write a consulting-grade M&A advisory proposal that a CEO or PE Investment Committee would accept verbatim.

CRITICAL: If "LIVE WEB RESEARCH" appears, cite via [1], [2] markers. If "INSIDER INSIGHTS" appears, weave into Strategic Rationale.

STRUCTURE (exact ## headings):
## Executive Summary
## Why This Deal Matters
## Strategic Rationale
## Market & Industry Context
## Value Creation & Synergies
## Integration / Separation Strategy
## Risk & Mitigation
## Functional Workstreams
## Governance Model
## 100-Day Plan
## Why Us
## Next Steps

In Risk & Mitigation: 6 risks as "**Risk** — Mitigation: ..." with probability + $ impact + owner.
In Functional Workstreams: cover Finance, HR, IT, Operations, Sales, Procurement, Legal, Tax, Cyber.
In Value Creation: include "$XM revenue + $YM cost = $ZM total" with derivation.

Length: 1500-2000 words. Markdown. Specific, numeric, authoritative.

QUALITY: Currency consistent. EV/EBITDA stated. Synergy derivation shown. Antitrust jurisdictions named. 1+ comparable transaction cited. No buzzwords.`,

  executive_summary: `You are a senior MD writing a board-ready executive summary. Be precise, numbers-driven, no fluff.
## Transaction Overview
## Strategic Rationale
## Value Creation Thesis
## Key Risks & Mitigants
## Recommendation & Next Steps
500-700 words. Use Markdown.`,

  board_memo: `You are a CFO writing a formal board memo for transaction approval.
## Purpose
## Transaction Details
## Strategic Fit
## Financial Impact
## Key Risks & Mitigants
## Regulatory & Approvals
## Board Resolution Sought
600-800 words. Formal tone.`,

  investment_teaser: `You are a confidential investment teaser. Marketing tone, value-forward.
## Transaction Opportunity
## Business Overview
## Investment Highlights
## Financial Snapshot
## Growth Opportunities
## Transaction Structure
## Process & Contact
500-700 words.`,

  integration_blueprint: `You are an integration specialist writing a post-merger integration blueprint.
## Integration Vision
## IMO Setup & Governance
## Day-1 Priorities
## Workstream Architecture
## Synergy Capture Plan
## Communication Strategy
## Risk Management
1000-1400 words. Operationally specific.`,

  hundred_day_plan: `You are a strategy consultant writing a 100-day post-close action plan.
## Objective
## Days 1-30: Stabilize
## Days 31-60: Integrate
## Days 61-100: Accelerate
## Quick Wins Checklist
## Success Metrics
## Stakeholder Communication
900-1200 words. Action-oriented.`,
};

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { checkRateLimit, logActivity } = await import("@/lib/security");
  const allowed = await checkRateLimit(supabase, "ai_proposal", 20, 60);
  if (!allowed) return NextResponse.json({ error: buildRateLimitErrorMsg(20, 60) }, { status: 429 });

  const body = await req.json() as {
    proposal_type: ProposalType;
    client_name: string;
    buyer: string;
    target: string;
    sector: string;
    geography: string;
    deal_size: string;
    notes: string;
    use_premium?: boolean;
    stake_percent?: number;
    deal_type_input?: string;
    client_role?: "buyer" | "seller" | "pe" | "jv_partner";
    mandate_type?: string;
    buyer_type?: string;
    ownership_type?: string;
    integration_style?: string;
    selected_services?: Service[];
    research_docs?: string;
  };

  const buyer = normalizePrompt(body.buyer ?? "", 200);
  const target = normalizePrompt(body.target ?? "", 200);
  const mandate_type = body.mandate_type ?? "buy_side";
  const buyer_type = body.buyer_type ?? "strategic";
  const ownership_type = body.ownership_type ?? "majority";
  const integration_style = body.integration_style ?? "functional";
  const sector = normalizePrompt(body.sector ?? "", 100);
  const geography = normalizePrompt(body.geography ?? "", 100);
  const client_name = normalizePrompt(body.client_name ?? "", 200);
  const deal_size = normalizePrompt(body.deal_size ?? "", 50);
  const proposal_type = body.proposal_type;
  const use_premium = !!body.use_premium;
  const notes = normalizePrompt(body.notes ?? "", 3000);

  if (!PROPOSAL_PROMPTS[proposal_type]) {
    return NextResponse.json({ error: "Invalid proposal_type" }, { status: 400 });
  }

  const admin = createAdminClient();
  const col_key = use_premium ? "premium_key_encrypted" : "bulk_key_encrypted";
  const col_provider = use_premium ? "premium_provider" : "bulk_provider";
  const col_model = use_premium ? "premium_model" : "bulk_model";

  const { data: settings } = await admin
    .from("ai_settings")
    .select(`${col_provider}, ${col_model}, ${col_key}`)
    .eq("user_id", user.id)
    .maybeSingle();

  let apiKey: string | null = null;
  const s = settings as Record<string, unknown> | null;
  const cipher = s?.[col_key] as string | undefined;
  if (cipher) {
    try {
      const { data: dec } = await admin.rpc("decrypt_key", { cipher });
      apiKey = dec as string | null;
    } catch { /* fallback */ }
  }

  const selectedProv = s?.[col_provider] as string | null | undefined;
  if (!apiKey || !selectedProv || selectedProv === "free") {
    return NextResponse.json({
      error: `${use_premium ? "Smart" : "Fast"}-tier AI provider not configured. Open Settings, save a key for ${use_premium ? "Smart" : "Fast"} tier, click Auto-detect.`,
    }, { status: 400 });
  }

  const cfg: RouteConfig = {
    tier: use_premium ? "smart" : "fast",
    primaryProvider: (selectedProv as ProviderId) ?? "free",
    primaryKey: apiKey,
    primaryModel: s?.[col_model] as string | undefined,
    blockFreeFallback: true,
  };

  const dealInput: DealInput = {
    buyer, target, sector, country: geography,
    deal_type: body.deal_type_input ?? null,
    stake_percent: body.stake_percent ?? null,
    normalized_value_usd: null,
    notes,
  };
  const classification = classifyDeal(dealInput);

  let services: Service[] = body.selected_services?.filter((s) => s.selected) ?? [];
  if (services.length === 0) {
    services = generateServices(classification, dealInput)
      .filter((s) => s.selected)
      .map((s) => s.type === "custom" ? expandCustomService(s.name, classification, dealInput) : expandService(s, classification, dealInput));
  } else {
    services = services.map((s) => s.type === "custom" ? expandCustomService(s.name, classification, dealInput) : expandService(s, classification, dealInput));
  }

  const servicesBlock = services.map((s, i) => `
### Service ${i + 1}: ${s.name}
- **Objective:** ${s.objective}
- **Scope:** ${(s.scope ?? []).join("; ")}
- **Key Activities:** ${(s.activities ?? []).join("; ")}
- **Deliverables:** ${(s.deliverables ?? []).join("; ")}
- **Value Impact:** ${s.valueImpact}`).join("\n");

  const dealContext = `
## DEAL FACTS
- Client / Advisory House: ${client_name || "N/A"}
- Client Role: ${body.client_role ?? "buyer"}
- Mandate Type: ${mandate_type}
- Buyer Type: ${buyer_type}
- Ownership Type: ${ownership_type}
- Integration Style: ${integration_style}
- Buyer / Acquirer: ${buyer}
- Target Company: ${target}
- Sector: ${sector || "N/A"}
- Geography: ${geography || "N/A"}
- Deal Size: ${deal_size || "N/A"}
- Stake: ${body.stake_percent ? body.stake_percent + "%" : "N/A"}
- Notes: ${notes || "None"}

## DEAL CLASSIFICATION
- Category: ${classification.category}
- Control: ${classification.control}
- Buyer Type: ${classification.buyerType}
- Strategic Intent: ${classification.intent}
- Integration Approach: ${classification.integrationNeed}

## MANDATORY RISKS
${classification.keyRisks.map((r) => `- ${r}`).join("\n")}

## MANDATORY WORKSTREAMS
${classification.mandatoryWorkstreams.map((w) => `- ${w}`).join("\n")}

## SERVICES
${servicesBlock}

${body.research_docs ? `\n## RESEARCH NOTES\n${body.research_docs.slice(0, 4000)}\n` : ""}
`;

  const fullContext = dealContext + buildIndustryContextBlock(sector, geography);

  const ctx = buildDealContext({
    buyer, target, sector, geography, deal_size,
    stake_percent: body.stake_percent,
    deal_type_input: body.deal_type_input,
    client_role: body.client_role,
    notes,
  });

  const advisorBlock = buildAdvisorVerdictPrompt(ctx);
  const ctxBlock = contextToPromptBlock(ctx);
  const regFlags = screenRegulatory({ deal_size_usd: ctx.deal_size_usd, geography, sector });
  const regBlock = regulatoryToPromptBlock(regFlags);

  const advisoryRules = buildAdvisoryRules({
    mandateType: mandate_type,
    buyerType: buyer_type,
    ownershipType: ownership_type,
    integrationStyle: integration_style,
    sector,
  });

  const messages: ChatMessage[] = [
    { role: "system", content: PROPOSAL_PROMPTS[proposal_type]
        + "\n\n=== DEAL-SPECIFIC ADVISORY RULES ===\n" + advisoryRules
        + "\n\n=== ADVISOR VERDICT FRAMEWORK ===\n" + advisorBlock },
    { role: "user", content:
      `Generate the ${proposal_type.replace(/_/g, " ")} document. Open with the 10-section ADVISOR VERDICT, then continue with standard sections. Risk & Mitigation MUST include Regulatory Compliance subsection referencing each flagged filing.\n\n${ctxBlock}\n${regBlock}\n${fullContext}` },
  ];

  try {
    const result = await routedCall(cfg, messages, use_premium ? 8000 : 6000);

    if (result.provider === "free" || result.model === "rules-v1") {
      return NextResponse.json({
        error: `Proposal AI failed. Real reason: ${result.lastError ?? "unknown"}. Provider: ${cfg.primaryProvider}/${cfg.primaryModel ?? "auto"}.`,
      }, { status: 500 });
    }

    await admin.from("proposals").insert({
      user_id: user.id, proposal_type, client_name, buyer, target,
      sector, geography, deal_size, notes,
      content: result.text, provider: result.provider,
      model: result.model, via_fallback: result.viaFallback,
    });
    await logActivity(supabase, "proposal_generated", "proposals", undefined, { type: proposal_type });
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
