

 
 
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
 import { getAdvancedPromptBuilder } from "@/lib/advanced/prompts";
 import { deriveSynergies } from "@/lib/advanced/engines/synergy_engine";
 import { deriveDealRisks } from "@/lib/advanced/engines/risk_engine";
 import { validateRequiredSections } from "@/lib/advanced/validators/output_validator";
 
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
QUALITY: Currency consistent. EV/EBITDA stated. Synergy derivation shown. Antitr
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
     generation_mode?: "standard" | "advanced";
     premium_mode?: boolean;
     stake_percent?: number;
     deal_type_input?: string;
     client_role?: "buyer" | "seller" | "pe" | "jv_partner";
     mandate_type?: string;
     buyer_type?: string;
     ownership_type?: string;
     integration_style?: string;
     selected_services?: Service[];
     research_docs?: string;
     research_mode?: "web" | "prompt";
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
   const generation_mode = body.generation_mode ?? "standard";
   const premium_mode = !!body.premium_mode;
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
 
 
   const advancedBuilder = getAdvancedPromptBuilder(mandate_type);
   const isAdvancedMode = generation_mode === "advanced" && !!advancedBuilder;
   const synergyLines = deriveSynergies({ sector, revenue: Number((deal_size||"").replace(/[^0-9.]/g, "")) || undefined, researchNotes: body.research_docs });
   const riskLines = deriveDealRisks({ geography, researchNotes: body.research_docs });
 
   const advisoryRules = buildAdvisoryRules({
     mandateType: mandate_type,
     buyerType: buyer_type,
     ownershipType: ownership_type,
     integrationStyle: integration_style,
     sector,
   });
 
   const systemPrompt = isAdvancedMode
     ? advancedBuilder!({ buyer, target, sector, geography, dealSize: deal_size, notes, researchInsights: body.research_docs })
     : PROPOSAL_PROMPTS[proposal_type];
 
   const messages: ChatMessage[] = [

     { role: "system", content: systemPrompt
         + "\n\n=== DEAL-SPECIFIC ADVISORY RULES ===\n" + advisoryRules
         + "\n\n=== ADVISOR VERDICT FRAMEWORK ===\n" + advisorBlock },
     { role: "user", content:

       `Generate the ${proposal_type.replace(/_/g, " ")} document. ${isAdvancedMode ? "Use mandate-specific advanced structure with analytically derived sections and explicit calculations." : "Open with the 10-section ADVISOR VERDICT, then continue with standard sections."}
 
 Non-negotiable quality bars:
 1) No generic filler language.
 2) Include a numeric value bridge: revenue synergy + cost synergy - one-time cost-to-achieve = net run-rate, with timeline.
 3) For each major risk include probability, quantified impact, mitigation, and named owner.
 4) Include jurisdiction-specific regulatory pathway and filing implications.
 5) End with explicit recommendation: Go / Conditional Go / No-Go and conditions precedent.
 
 Risk & Mitigation MUST include Regulatory Compliance subsection referencing each flagged filing.\n\n## ADVANCED SYNERGY REASONING\n${JSON.stringify(synergyLines, null, 2)}\n\n## ADVANCED RISK REASONING\n${JSON.stringify(riskLines, null, 2)}\n\n${ctxBlock}\n${regBlock}\n${fullContext}` },
   ];
 
   try {

     if (premium_mode && body.research_mode === "web" && !body.research_docs) {
       return NextResponse.json({ error: "Premium Mode requires research context before generation." }, { status: 400 });
     }
     let result = await routedCall(cfg, messages, use_premium ? 8000 : 6000);
 
     if (isAdvancedMode) {
       const validation = validateRequiredSections(result.text, mandate_type === "carve_out" ? ["Separation Critical Path","Stranded Cost Quantification","TSA Service Catalog","Standalone Capability Gap Analysis","Day-1 Cutover Plan","Customer Continuity Plan","Regulatory & Compliance Risks (deal-specific)","Technology Separation Blueprint"] : []);
       if (!validation.ok) {
         const retryMessages: ChatMessage[] = [...messages, { role: "user", content: `Retry strictly. Missing sections: ${validation.missing.join(", ")}.` }];
         result = await routedCall(cfg, retryMessages, use_premium ? 8000 : 6000);
       }
     }
 
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
