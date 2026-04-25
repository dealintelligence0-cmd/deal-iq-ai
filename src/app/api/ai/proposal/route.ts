import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { routedCall, type RouteConfig } from "@/lib/ai/router";
import type { ChatMessage, ProviderId } from "@/lib/ai/providers";
import { classifyDeal, generateServices, expandService, expandCustomService, type Service, type DealInput } from "@/lib/intelligence/deal-classifier";
import { buildDealContext, contextToPromptBlock, buildAdvisorVerdictPrompt } from "@/lib/intelligence/context-engine";
export type ProposalType =
  | "advisory" | "executive_summary" | "board_memo"
  | "investment_teaser" | "integration_blueprint" | "hundred_day_plan";

const PROPOSAL_PROMPTS: Record<ProposalType, string> = {
  advisory: `You are an MBB senior partner. Write a consulting-grade M&A advisory proposal that a CEO or PE Investment Committee would accept verbatim.

CRITICAL RULES:
1. If "LIVE WEB RESEARCH" appears in the user message, you MUST cite specific facts from it using [1], [2], [3] markers throughout the proposal.
2. Reference the buyer's recent activity, target's actual metrics, and current sector dynamics — NEVER use generic phrases like "in the sector" if specifics are available.
3. If "INSIDER INSIGHTS" appears, weave them into Strategic Rationale and Why This Deal Matters sections.
4. Use specific dollar figures from the deal facts. Compute synergies as ~10% of deal value (revenue) + ~13% (cost).

STRUCTURE (use exact ## H2 headings, in order):
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

In Risk & Mitigation: list 6 risks, each as "**Risk Title** — Mitigation: ...".
In Functional Workstreams: cover Finance, HR, IT, Operations, Sales, Procurement, Legal, Tax, Cyber — each as "**[Function]:** key actions".
In Value Creation: include "$XM revenue + $YM cost = $ZM total" line.

Length: 1500-2000 words. Use Markdown. Be specific, numeric, and authoritative.`,
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
  if (!allowed) return NextResponse.json({ error: "Rate limit: 10 proposals/min" }, { status: 429 });

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
    selected_services?: Service[];
    research_docs?: string;
  };
  const { proposal_type, client_name, buyer, target, sector, geography, deal_size, notes, use_premium } = body;

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

  const cfg: RouteConfig = {
    tier: use_premium ? "smart" : "fast",
    primaryProvider: (s?.[col_provider] as ProviderId) ?? "free",
    primaryKey: apiKey,
    primaryModel: s?.[col_model] as string | undefined,
  };

 // Build deal intelligence
  const dealInput: DealInput = {
    buyer, target, sector, country: geography,
    deal_type: body.deal_type_input ?? null,
    stake_percent: body.stake_percent ?? null,
    normalized_value_usd: null,
    notes,
  };
  const classification = classifyDeal(dealInput);

  // Services — use provided or auto-generate core set
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
- Buyer / Acquirer: ${buyer}
- Target Company: ${target}
- Sector: ${sector || "N/A"}
- Geography: ${geography || "N/A"}
- Deal Size: ${deal_size || "N/A"}
- Stake: ${body.stake_percent ? body.stake_percent + "%" : "N/A"}
- Notes: ${notes || "None"}

## DEAL CLASSIFICATION (use this verbatim)
- Category: ${classification.category}
- Control: ${classification.control}
- Buyer Type: ${classification.buyerType}
- Strategic Intent: ${classification.intent}
- Integration Approach: ${classification.integrationNeed}
- Decision Makers: ${classification.decisionMakers.join(", ")}

## MANDATORY RISKS TO ADDRESS
${classification.keyRisks.map((r) => `- ${r}`).join("\n")}

## MANDATORY WORKSTREAMS
${classification.mandatoryWorkstreams.map((w) => `- ${w}`).join("\n")}

## SERVICES TO EMBED IN PROPOSAL (use these in the Services section)
${servicesBlock}

${body.research_docs ? `\n## ADDITIONAL RESEARCH / ANALYST NOTES\n${body.research_docs.slice(0, 4000)}\n` : ""}
`;

 // Build machine-derived context (used by every prompt)
  const ctx = buildDealContext({
    buyer, target, sector, geography, deal_size,
    stake_percent: body.stake_percent,
    deal_type_input: body.deal_type_input,
    client_role: body.client_role,
    notes,
  });

  const advisorBlock = buildAdvisorVerdictPrompt(ctx);
  const ctxBlock = contextToPromptBlock(ctx);

  const messages: ChatMessage[] = [
    { role: "system", content: PROPOSAL_PROMPTS[proposal_type]
        + "\n\nADDITIONAL RULES:\n- Use consistent currency throughout.\n- State EV/EBITDA multiple if computable.\n- Banned generic phrases: 'market is growing', 'there are risks', 'synergies include cost savings', 'leverage', 'value-add', 'best-in-class'.\n- EVERY claim must cite a number (%, $, or months).\n- Use cause→effect reasoning.\n- Write to the decision-maker (CEO / IC / Board / PE Partner) implied by client_role.\n\n"
        + advisorBlock },
    { role: "user", content:
      `Using the structured DEAL CONTEXT, classification, services, and any research/insights below, generate the ${proposal_type.replace(/_/g, " ")} document. Open the document with the 5-section ADVISOR VERDICT (Investment Thesis, Top 3 Risks Quantified, Top 3 Synergies With Impact, Key Unknowns, Recommendation), then continue with the standard sections.\n\n${ctxBlock}\n${dealContext}` },
  ];

  try {
    const result = await routedCall(cfg, messages, use_premium ? 6000 : 3500);

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
