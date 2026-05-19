

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
import { deriveSynergies, buildSynergyLevers } from "@/lib/advanced/engines/synergy_engine";
import { deriveDealRisks, buildRiskRegister } from "@/lib/advanced/engines/risk_engine";
import { validateRequiredSections } from "@/lib/advanced/validators/output_validator";
import { evaluateProposalQuality } from "@/lib/advanced/validators/quality_validator";
import { buildScenarioCases } from "@/lib/advanced/engines/scenario_engine";
import { getOrSeed, dealModelToPromptBlock, updateModel } from "@/lib/intelligence/deal-model";
import { buildComparablesBlock, pickComparablesForModel } from "@/lib/intelligence/comparables";

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
    deal_id?: string;
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
allow_free_fallback?: boolean;
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
  const allowFreeFallback =
  body.allow_free_fallback === true ||
  process.env.ALLOW_FREE_FALLBACK === "true";

  if (!PROPOSAL_PROMPTS[proposal_type]) {
    return NextResponse.json({ error: "Invalid proposal_type" }, { status: 400 });
  }

 const admin = createAdminClient();

// Resolve key via new multi-key library (with legacy ai_settings fallback)
const { resolveKey } = await import("@/lib/ai/key-resolver");
const overrideKeyId = ((body as unknown) as { key_id?: string }).key_id;
const tierForResolve = body.use_premium ? "smart" : "economic";
const resolved = await resolveKey(admin, user.id, tierForResolve, overrideKeyId);

if (!resolved.apiKey || resolved.provider === "free") {
  return NextResponse.json({
    error: "No AI provider configured. Open Settings → API Key Library and save at least one key, or mark one as the Smart/Economic default.",
  }, { status: 400 });
}

const modelOverride = ((body as unknown) as { model_override?: string }).model_override;

const cfg: RouteConfig = {
  tier: "smart",
  primaryProvider: resolved.provider as ProviderId,
  primaryKey: resolved.apiKey,
  primaryModel: modelOverride || resolved.model || undefined,
  blockFreeFallback: !allowFreeFallback,
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

  // Phase 4: pull active signals for buyer or target if they're on the watchlist
  let signalsBlock = "";
  try {
    const namesToCheck = [buyer, target].filter(Boolean) as string[];
    if (namesToCheck.length > 0) {
      const { data: watchRows } = await admin
        .from("watchlist_companies")
        .select("id, company_name")
        .eq("created_by", user.id)
        .in("company_name", namesToCheck);
      const watchIds = (watchRows ?? []).map((r) => r.id as string);
      if (watchIds.length > 0) {
        const { data: sigs } = await admin
          .from("executive_signals")
          .select("signal_type, severity, headline, evidence_quote, context, pitch_angle, watchlist_companies!inner(company_name)")
          .in("watchlist_id", watchIds)
          .eq("status", "active")
          .order("severity", { ascending: false })
          .limit(10);
        if (sigs && sigs.length > 0) {
          signalsBlock = "\n## EXECUTIVE SIGNALS (extracted from recent filings)\nUse these to ground your pitch in concrete, evidence-backed observations:\n\n" +
            sigs.map((s: any, i) => {
              const name = s.watchlist_companies?.company_name ?? "";
              return `${i + 1}. [${(s.severity ?? "medium").toUpperCase()}] ${name} — ${s.signal_type}: ${s.headline}` +
                     (s.evidence_quote ? `\n   Quote: "${s.evidence_quote}"` : "") +
                     (s.context ? `\n   Context: ${s.context}` : "") +
                     (s.pitch_angle ? `\n   Pitch angle: ${s.pitch_angle}` : "");
            }).join("\n\n") + "\n";
        }
      }
    }
  } catch (e) {
    // Non-fatal — proposals work fine without signals
    console.error("Signals injection failed:", e);
  }

  // Phase 5: pull latest bolt-on shortlist for the buyer (if exists)
  let boltOnBlock = "";
  try {
    if (buyer) {
      const { data: shortlist } = await admin
        .from("bolt_on_shortlists")
        .select("id, refreshed_at")
        .eq("created_by", user.id)
        .eq("status", "active")
        .ilike("buyer_name", buyer)
        .order("refreshed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (shortlist) {
        const { data: targets } = await admin
          .from("bolt_on_targets")
          .select("target_name, target_sector, target_geography, fit_score, strategic_rationale, status")
          .eq("shortlist_id", shortlist.id)
          .neq("status", "dismissed")
          .order("fit_score", { ascending: false })
          .limit(6);
        if (targets && targets.length > 0) {
          boltOnBlock = "\n## BUYER BOLT-ON SHORTLIST (from Phase 5 engine)\nIf relevant to the pitch, you may reference these adjacent targets the buyer should consider:\n\n" +
            targets.map((t: any, i: number) => {
              const sector = t.target_sector ?? "—";
              const geo = t.target_geography ?? "";
              return `${i + 1}. ${t.target_name} (${sector} ${geo}) — fit ${t.fit_score}/100. ${t.strategic_rationale}`;
            }).join("\n") + "\n";
        }
      }
    }
  } catch (e) {
    console.error("Bolt-on injection failed:", e);
  }

  const fullContext = dealContext + signalsBlock + boltOnBlock + buildIndustryContextBlock(sector, geography);

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
  const scenarioCases = buildScenarioCases({ synergyRunRateUsdM: 1500, costToAchieveUsdM: 470 });
  const quantifiedLevers = buildSynergyLevers({ sector, revenueUsd: Number((deal_size||"").replace(/[^0-9.]/g, "")) || undefined });
  const riskRegister = buildRiskRegister({ geography, enterpriseValueUsdM: Number((deal_size||"").replace(/[^0-9.]/g, "")) || 0, crossBorder: /cross/i.test(notes) });

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
    // Load canonical deal model — every figure in the proposal must come from this
  let dealModelBlock = "";
  if (body.deal_id) {
    const dm = await getOrSeed(supabase, {
      deal_id: body.deal_id,
      user_id: user.id,
      buyer, target, sector, geography,
      deal_size_input: deal_size,
      buyer_type,
      ownership_type,
      target_revenue_input: undefined,
      target_ebitda_input: undefined,
      buyer_revenue_input: undefined,
    });

    // First proposal run picks the comparable set and seeds it into the canonical model
    // so subsequent modules (PMI / synergy / TSA) cite the SAME deals by name.
    if (!dm.comparables_chosen || dm.comparables_chosen.length === 0) {
      const picked = pickComparablesForModel(sector, geography, 5);
      if (picked.length > 0) {
        const updated = await updateModel(supabase, body.deal_id, { comparables_chosen: picked }, "ai-proposal");
        if (updated) dm.comparables_chosen = updated.comparables_chosen;
        else dm.comparables_chosen = picked; // in-memory fallback
      }
    }
    dealModelBlock = dealModelToPromptBlock(dm);
  }

  // Real, verifiable M&A comparables — strict "do not invent" instruction.
  // Always injected (not gated on deal_id) so even ad-hoc generations get grounded comps.
  const comparablesBlock = buildComparablesBlock(sector, geography, 5);

  // Anti-AI-voice discipline. Expanded banned-phrase list and voice rules so the
  // output reads like an MBB partner memo, not a ChatGPT draft.
  const voiceDisciplineBlock = `
# VOICE DISCIPLINE — ENFORCE STRICTLY

Banned phrases (do NOT use any of these or their variants — rewrite as specific named claims):
- "leverage" / "leveraging" / "leveraged"
- "robust" / "robustness"
- "world-class" / "best-in-class" / "best-of-breed" / "industry-leading"
- "create value" / "value creation" (as a vague claim — be specific about *how*)
- "synergistic" / "synergize"
- "ecosystem" (as filler — only if naming a specific partner network)
- "drive" / "driving" as a verb for outcomes (use "deliver", "produce", "yield" with a number)
- "unlock" / "unlocking"
- "innovative" / "innovation" (as adjective — describe *what* is novel instead)
- "transform" / "transformative" / "transformation" (without naming the operating model change)
- "seamless" / "seamlessly"
- "next-generation" / "cutting-edge" / "state-of-the-art"
- "holistic" / "holistically"
- "scalable" (without naming the scaling constraint that is being removed)
- "strategic" as filler (every initiative is "strategic" — be specific)
- "actionable insights"
- "data-driven" (as a self-description — show the data instead)
- "thought leadership" / "trusted advisor"
- "go-to-market motion" (without naming the channel)
- "win-win"
- "moving forward" / "going forward"
- "deliver on the promise"
- "the journey ahead"
- "north star"
- "value accretive" (without the EPS or IRR number)

Voice rules:
1. SPECIFIC OVER GENERAL. Name products, brands, channels, customer segments, jurisdictions by name. NOT "the market" — "the US mass-market shaving channel". NOT "synergies in sales" — "joint distribution of Sun Pharma's specialty derm reps + Concert's deuruxolitinib launch team".
2. ACTIVE VOICE. "We identified three risks" — NOT "Three risks were identified". Sentences own their analysis.
3. EVERY NUMBER HAS A 'SO WHAT'. After each $ figure, state the implication in one phrase: "$340M run-rate cost synergy = ~6% EBITDA accretion to acquirer Y2".
4. NAMED ENTITIES THROUGHOUT. Use "${buyer || "the buyer"}" and "${target || "the target"}" by name — not "the buyer" / "the company" / "the target" generically.
5. NUMBERS BEFORE ADJECTIVES. "EBITDA margin expands 280bps to 18.4%" — NOT "EBITDA margin expands significantly".
6. NAMED ACCOUNTABLE OWNERS. Every workstream / risk owner is a SPECIFIC role: CFO, General Counsel, Chief Commercial Officer, Head of Integration, IMO Lead. Never "the team", "leadership", "stakeholders".
7. EVIDENCE > ASSERTION. If you claim 8% synergy is achievable, cite a comparable deal from the VERIFIED COMPARABLE TRANSACTIONS block where that level was captured.
8. NO DECORATIVE ADJECTIVES. "Strong", "compelling", "powerful", "exciting" — strip them. Replace with the underlying number or fact.
9. SHOW MATH. "$340M = 8% × $4.25B target SG&A" — derivation visible inline.
10. ONE IDEA PER SENTENCE. Long sentences with three clauses signal AI generation. Break them.

Self-check before finalising: count "leverage", "robust", "world-class", "create value", "transform", "seamless" — target = 0. Any occurrence is a defect.`;

  // === PASTE HERE ===
  const finalSystemPrompt = systemPrompt + `

# CANONICAL DEAL MODEL DISCIPLINE (CRITICAL)

The user message contains a CANONICAL DEAL MODEL block at the top. That block is the SINGLE SOURCE OF TRUTH for this deal across all modules (proposal, PMI, synergy, TSA).

Rules:
1. EVERY dollar/INR/currency figure in your output MUST match the canonical model exactly. Do not re-compute, do not round differently, do not change currencies.
2. If the canonical model lists initiatives, risks, regulatory filings, or comparables BY NAME, cite them by those exact names. Do not invent new ones.
3. If a section requires DEPTH that the canonical model does not yet provide (e.g. "List 8 cost initiatives totaling the canonical run-rate"), derive that depth — but the SUM must equal the canonical run-rate, not exceed it.
4. If you believe the canonical numbers are wrong, do NOT change them. Note the disagreement in a "Modeling Note" subsection so the partner can review and override via the Deal Model UI.
5. Currency: report in the canonical model's primary_currency. Do not switch currencies mid-document.

This rule is more important than any other formatting requirement. Coherence across modules is non-negotiable for an MBB-grade deliverable.`;

  
 const messages: ChatMessage[] = [
    // Stable across calls for the same mandate type — provider adapter applies caching where supported.
    { role: "system", stable: true, content: finalSystemPrompt
        + "\n\n=== DEAL-SPECIFIC ADVISORY RULES ===\n" + advisoryRules
        + "\n\n=== ADVISOR VERDICT FRAMEWORK ===\n" + advisorBlock
        + "\n\n" + voiceDisciplineBlock },
    { role: "user", content:
      `${dealModelBlock}

${comparablesBlock}

Generate the ${proposal_type.replace(/_/g, " ")} document. ${isAdvancedMode ? "Use mandate-specific advanced structure with analytically derived sections and explicit calculations." : "Open with the 10-section ADVISOR VERDICT, then continue with standard sections."}

MANDATORY SECTION CHECKLIST — produce ALL 14 sections in this exact order, with the minimum word count shown. Do NOT skip, merge, or summarize sections.

01. Executive Summary (120-180 words)
02. Deal Thesis — Strategic / Financial / Operational (140-200 words)
03. Deal Score — 4-row table (Market, Company, Synergy, Execution Risk inverted) with 0-10 scores and one-sentence rationale each
04. Synergy Model — 3-year table (Year 1/2/3) for Revenue Synergy, Cost Synergy, One-time Integration Cost, Net Run-rate, with confidence labels HIGH/MEDIUM/STRETCH
05. Risk Engine — 6-row table (Risk, Type, Probability %, $ Impact, Mitigation, Owner with named human role)
06. Valuation View (80-120 words) — implied EV/EBITDA, sector benchmark range, premium/discount with logic
07. Scenario Analysis — Base/Upside/Downside table with synergy capture %, IRR, multiple, probability
08. What Must Be True (4-6 bullets, each numeric)
09. Why NOT This Deal (3 explicit disconfirming arguments, 30-50 words each)
10. IC Questions (5 sharp questions the IC will ask)
11. Recommendation — Go/Conditional Go/No-Go + confidence + 60-word justification + risk-adjusted value range
12. Strategic Rationale + Market Context + Value Creation Detail (350-450 words combined; show synergy derivation as "X% of $Y base = $Z")
13. Integration Strategy + Functional Workstreams + Governance — cover Finance/HR/IT/Operations/Sales/Procurement/Legal/Tax/Cyber, each with named accountable role and Day-30/60/100 milestones (300-400 words)
14. 100-Day Plan + Why Us + Next Steps — name 2-3 prior engagements in ${sector || "the sector"} for Why Us; 100-day plan has 3-5 named workstream owners per phase (300-400 words)

Total target: 1800-2200 words. If you run short on output budget, COMPRESS sections 12-14 prose but DO NOT drop any section. Every section above must appear with its ## heading.

Mandatory executive decision block at the top:
- Go / Conditional Go / No-Go
- Conditions precedent (5-7)
- Kill-switch triggers
- Risk-adjusted value range

Non-negotiable quality bars:
1) No generic filler language.
2) Include a numeric value bridge: revenue synergy + cost synergy - one-time cost-to-achieve = net run-rate, with timeline.
3) For each major risk include probability, quantified impact, mitigation, and named owner (named human role e.g. CFO, General Counsel, Head of Integration).
4) Include jurisdiction-specific regulatory pathway and filing implications (HSR, EU Merger, CCI, CMA, MOFCOM, SEBI as applicable).
5) Show synergy derivation: every $ figure has format "[base] × [%] = $[number] [HIGH/MEDIUM/STRETCH]".
6) End with explicit recommendation: Go / Conditional Go / No-Go and conditions precedent.

Risk & Mitigation MUST include Regulatory Compliance subsection referencing each flagged filing.
Include section: ## Why NOT This Deal with 3 explicit disconfirming arguments.

## ADVANCED SYNERGY REASONING
${JSON.stringify(synergyLines, null, 2)}

## ADVANCED RISK REASONING
${JSON.stringify(riskLines, null, 2)}

## QUANTIFIED SYNERGY LEVERS
${JSON.stringify(quantifiedLevers, null, 2)}

## QUANTIFIED RISK REGISTER
${JSON.stringify(riskRegister, null, 2)}

## SCENARIO CASES
${JSON.stringify(scenarioCases, null, 2)}

${ctxBlock}
${regBlock}
${fullContext}` },
  ];

  try {
    if (premium_mode && body.research_mode === "web" && !body.research_docs) {
      return NextResponse.json({ error: "Premium Mode requires research context before generation." }, { status: 400 });
    }
    let result = await routedCall(cfg, messages, use_premium ? 10000 : 8000);

    if (isAdvancedMode) {
      const validation = validateRequiredSections(result.text, mandate_type === "carve_out" ? ["Separation Critical Path","Stranded Cost Quantification","TSA Service Catalog","Standalone Capability Gap Analysis","Day-1 Cutover Plan","Customer Continuity Plan","Regulatory & Compliance Risks (deal-specific)","Technology Separation Blueprint"] : []);
      if (!validation.ok) {
        const retryMessages: ChatMessage[] = [...messages, { role: "user", content: `Retry strictly. Missing sections: ${validation.missing.join(", ")}.` }];
        result = await routedCall(cfg, retryMessages, use_premium ? 10000 : 8000);
      }
    }
    const quality = evaluateProposalQuality(result.text);
    if (isAdvancedMode && quality.score < 70) {
      const qualityRetry: ChatMessage[] = [...messages, { role: "user", content: `Quality score ${quality.score} is below threshold. Rewrite with higher numeric density, less repetitive language, explicit owners, and jurisdiction-specific regulatory detail.` }];
      result = await routedCall(cfg, qualityRetry, use_premium ? 10000 : 8000);
    }

    if (result.provider === "free" || result.model === "rules-v1") {
      return NextResponse.json({
        error: `Proposal AI failed. Real reason: ${result.lastError ?? "unknown"}. Provider: ${cfg.primaryProvider}/${cfg.primaryModel ?? "auto"}.`,
      }, { status: 500 });
    }

    const { data: insertedRow } = await admin.from("proposals").insert({
      user_id: user.id, proposal_type, client_name, buyer, target,
      sector, geography, deal_size, notes,
      content: result.text, provider: result.provider,
      model: result.model, via_fallback: result.viaFallback,
    }).select("id").single();
    await logActivity(supabase, "proposal_generated", "proposals", undefined, { type: proposal_type });
    return NextResponse.json({
      proposalId: insertedRow?.id,
      content: result.text,
      provider: result.provider,
      model: result.model,
      viaFallback: result.viaFallback,
      qualityScore: evaluateProposalQuality(result.text).score,
      evidenceCoverage: body.research_docs ? 85 : 55,
      scenarios: scenarioCases,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
