

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { routedCall, type RouteConfig } from "@/lib/ai/router";
import type { ChatMessage, ProviderId } from "@/lib/ai/providers";
import { getSemanticCache, setSemanticCache } from "@/lib/ai/semantic-cache";
import { buildIndustryContextBlock, getSynergyBenchmark } from "@/lib/intelligence/industry";
import { normalizePrompt, injectDealContext } from "@/lib/ai/utils";
import { estimateCost } from "@/lib/ai/cost-estimator";
import { buildAdvisoryRules } from "@/lib/ai/advisory-rules";
import { buildSynergyLevers } from "@/lib/advanced/engines/synergy_engine";
import { getOrSeed, dealModelToPromptBlock, updateModel } from "@/lib/intelligence/deal-model";
import { reviseAssumption } from "@/lib/cognition/orchestrator";
import { getActiveWorkspace } from "@/lib/workspaces/context";
import { COGNITION_KEYS } from "@/lib/cognition/keys";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { checkRateLimit } = await import("@/lib/security");
  const allowed = await checkRateLimit(supabase, "ai_synergy", 15, 60);
  if (!allowed) return NextResponse.json({ error: "Rate limit: 15 requests per minute" }, { status: 429 });

 const body = await req.json() as {
    deal_id?: string;
    buyer?: string; target?: string; sector?: string; geography?: string;
    deal_size?: string; target_revenue?: string; target_ebitda?: string;
    buyer_revenue?: string; ambition?: string; notes?: string;
    tier?: "premium" | "economic" | "offline";
    mandate_type?: string;
    buyer_type?: string;
    ownership_type?: string;
    integration_style?: string;
  };
  const tier = body.tier ?? "premium";

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
  const ws = await getActiveWorkspace(supabase);

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
// Resolve API key via new multi-key library (with legacy ai_settings fallback)
  const { resolveKey } = await import("@/lib/ai/key-resolver");
  const overrideKeyId = ((body as unknown) as { key_id?: string }).key_id;
  const resolved = await resolveKey(admin, user.id, tier === "economic" ? "economic" : "smart", overrideKeyId);

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
    blockFreeFallback: true,
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

  const advisoryRules = buildAdvisoryRules({
    mandateType: body.mandate_type,
    buyerType: body.buyer_type,
    ownershipType: body.ownership_type,
    integrationStyle: body.integration_style,
    sector,
  });
  const synergyLevers = buildSynergyLevers({ sector, revenueUsd: Number((deal_size||"").replace(/[^0-9.]/g, "")) || undefined });

// Load or seed the canonical Deal Model. Every module reads from this single source of truth.
  let dealModelBlock = "";
  if (body.deal_id) {
    const dm = await getOrSeed(supabase, {
      deal_id: body.deal_id,
      user_id: user.id,
      buyer, target, sector, geography,
      deal_size_input: deal_size,
      buyer_type: body.buyer_type,
      ownership_type: body.ownership_type,
      target_revenue_input: target_revenue,
      target_ebitda_input: target_ebitda,
      buyer_revenue_input: buyer_revenue,
    });
    dealModelBlock = dealModelToPromptBlock(dm);
  }


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
  const userPrompt = [
    dealModelBlock,    // CANONICAL MODEL FIRST — model anchors every figure here
    dealCtx,
    industryCtx,
    researchBlock,
    `Synergy ambition: ${ambition}`,
    target_revenue ? `Target Revenue: ${target_revenue}` : "",
    target_ebitda ? `Target EBITDA: ${target_ebitda}` : "",
    buyer_revenue ? `Buyer Revenue: ${buyer_revenue}` : "",
    researchBlock ? "[USE RESEARCH] Cite specific findings from LIVE WEB RESEARCH using [1], [2] markers throughout." : "",
    `Analytical lever inputs (use these as percentage ranges; the run-rate dollar amounts MUST come from the CANONICAL DEAL MODEL above): ${JSON.stringify(synergyLevers)}`,
    `\n## SYNERGY MODULE OUTPUT REQUIREMENTS\n- Use the EXACT cost & revenue synergy figures from CANONICAL DEAL MODEL above.\n- If the model has empty cost_initiatives / rev_initiatives, derive 6-10 line items that SUM to the canonical run-rate (not exceed it).\n- Each initiative line: name, category, basis (e.g. "8% of $X SG&A overlap"), Y1/Y2/Y3 amounts, confidence, owner.\n- Currency throughout: ${body.deal_size?.match(/INR|₹/i) ? "INR" : body.deal_size?.match(/EUR|€/i) ? "EUR" : "USD"}.`,
  ].filter(Boolean).join("\n");

  const messages: ChatMessage[] = [
     // Stable across calls for the same mandate type — provider adapter applies caching where supported.
    { role: "system", stable: true, content: finalSystemPrompt + "\n\n=== DEAL-SPECIFIC RULES ===\n" + advisoryRules },
    { role: "user", content: userPrompt },
  ];

  const cached = getSemanticCache({ userId: user.id, module: "synergy", messages, salt: `${cfg.primaryProvider}:${cfg.primaryModel ?? "auto"}` });
  if (cached) {
    return NextResponse.json({
      content: cached.content,
      provider: cached.provider ?? cfg.primaryProvider,
      model: cached.model ?? cfg.primaryModel,
      cached: true,
      semanticSimilarity: Number(cached.similarity.toFixed(3)),
    });
  }

  try {
    // Groq free-tier TPM safety: swap to a smaller model if the prompt exceeds Llama 3.3 70B's 12K token cap
  const estimatedTokens = messages.reduce((acc, m) => acc + Math.ceil(m.content.length / 4), 0);
  if (cfg.primaryProvider === "groq" && estimatedTokens > 11000 && cfg.primaryModel?.includes("70b")) {
    cfg.primaryModel = "llama-3.1-8b-instant";
  }
    const result = await routedCall(cfg, messages, 6000);
    if (result.provider === "free" || result.model === "rules-v1") {
      return NextResponse.json({
        error: `AI provider call failed. Real reason: ${result.lastError ?? "unknown"}. Provider attempted: ${cfg.primaryProvider} / ${cfg.primaryModel ?? "auto"}. Open Settings → Test This Key to diagnose.`,
      }, { status: 500 });
    }

    setSemanticCache({ userId: user.id, module: "synergy", messages, content: result.text, provider: result.provider, model: result.model, salt: `${cfg.primaryProvider}:${cfg.primaryModel ?? "auto"}` });

    // Save to history
    const inputTokens = result.inputTokens ?? 0;
    const outputTokens = result.outputTokens ?? 0;
    const { cost } = estimateCost(result.provider, inputTokens, outputTokens);

    await admin.from("ai_outputs").insert({
      user_id: user.id,
      module: "synergy",
      buyer, target, sector, geography, deal_size,
      tier, provider: result.provider, model: result.model,
      input_tokens: inputTokens, output_tokens: outputTokens, cost_estimate_usd: cost,
      content: result.text,
      meta: { ambition, target_revenue, target_ebitda, buyer_revenue },
    });

   // =====================================================================
// PHASE 2 — Cognition spine hook (additive, non-blocking)
// =====================================================================
// Extract a small JSON sidecar from the markdown (zero extra AI tokens).
// Write the extracted values into cognition_assumptions so other modules
// (PMI, TSA, Valuation) can read them and react via propagation rules.
// Failures here never block the original Synergy response.
try {
  const { extractSynergySidecar } = await import("@/lib/cognition/extract-synergy");
  const { reviseAssumption } = await import("@/lib/cognition/orchestrator");

  const sidecar = extractSynergySidecar(result.text);
  console.info("[cognition][extractor][synergy]", sidecar);
  const dealId = body.deal_id ?? null;
  const workspaceId = ws.workspaceId ?? null;
  const baseTriggerMeta = {
    ai_module: "synergy",
    provider: result.provider,
    model: result.model,
    extracted_confidence: sidecar.confidence,
  };

  // Only write fields we successfully extracted
  if (sidecar.cost_run_rate_m !== null) {
    await reviseAssumption({
      workspaceId, dealId,
      key: COGNITION_KEYS.synergy.costRunRateM,
      valueNumeric: sidecar.cost_run_rate_m,
      unit: "USD_m", currency: "USD",
      confidence: 0.7,
      source: "ai",
      triggeredBy: "ai_run",
      triggerMeta: baseTriggerMeta,
      reason: "Extracted from AI synergy memo",
    });
  }
  if (sidecar.revenue_run_rate_m !== null) {
    await reviseAssumption({
      workspaceId, dealId,
      key: COGNITION_KEYS.synergy.revenueRunRateM,
      valueNumeric: sidecar.revenue_run_rate_m,
      unit: "USD_m", currency: "USD",
      confidence: 0.65,
      source: "ai",
      triggeredBy: "ai_run",
      triggerMeta: baseTriggerMeta,
      reason: "Extracted from AI synergy memo",
    });
  }
  if (sidecar.total_run_rate_m !== null) {
    await reviseAssumption({
      workspaceId, dealId,
      key: COGNITION_KEYS.synergy.totalRunRateM,
      valueNumeric: sidecar.total_run_rate_m,
      unit: "USD_m", currency: "USD",
      confidence: 0.7,
      source: "ai",
      triggeredBy: "ai_run",
      triggerMeta: baseTriggerMeta,
      reason: "Extracted from AI synergy memo",
    });
  }
  if (sidecar.payback_months !== null) {
    await reviseAssumption({
      workspaceId, dealId,
      key: COGNITION_KEYS.synergy.paybackMonths,
      valueNumeric: sidecar.payback_months,
      unit: "months",
      confidence: 0.6,
      source: "ai",
      triggeredBy: "ai_run",
      triggerMeta: baseTriggerMeta,
      reason: "Extracted from AI synergy memo",
    });
  }
  if (sidecar.cost_run_rate_m === null) {
    const targetRevMatch = parseFloat(body.target_revenue || "0");
    const costRunRate = Math.max(0, targetRevMatch * 0.035);
    // Only write a heuristic when we have a real, positive estimate. Writing 0
    // would look like a deliberate "zero synergies" call and spuriously fire the
    // valuation re-anchor propagation rule.
    if (costRunRate > 0) {
    await reviseAssumption({
      workspaceId: ws.workspaceId ?? null,
      dealId: body.deal_id ?? null,
      key: COGNITION_KEYS.synergy.costRunRateM,
      valueNumeric: costRunRate,
      unit: "USD_m",
      currency: "USD",
      confidence: 0.7,
      source: "ai",
      sourceRunId: null,
      triggeredBy: "ai_run",
      triggerMeta: {
        intent: "evaluate_synergy",
        provider: result.provider,
        model: result.model,
        fallback_heuristic: true,
      },
      reason: "Fallback heuristic synergy run-rate (extractor had null)",
    });
    }
  }
} catch (cogErr) {
  console.error("[cognition] synergy spine hook failed:", cogErr);
}

// ===============================================================
   // Best-effort: parse initiative tables out of the markdown and persist to the canonical model.
    // If parsing fails, the canonical numbers from getOrSeed remain untouched — the proposal still gets the right totals.
    if (body.deal_id) {
      try {
        const parsedCost = parseInitiativeTable(result.text, /Cost Synergies/i);
        const parsedRev = parseInitiativeTable(result.text, /Revenue Synergies/i);
        if (parsedCost.length || parsedRev.length) {
          await updateModel(supabase, body.deal_id, {
            ...(parsedCost.length ? { cost_initiatives: parsedCost } : {}),
            ...(parsedRev.length ? { rev_initiatives: parsedRev } : {}),
          }, "ai-synergy");
        }
      } catch { /* parsing best-effort */ }
    }

    return NextResponse.json({
      content: result.text,
      provider: result.provider,
      model: result.model,
      viaFallback: result.viaFallback,
      tokens: { input: inputTokens, output: outputTokens, cost },
      dealModelUpdated: !!body.deal_id,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
function parseInitiativeTable(markdown: string, sectionHeading: RegExp): Array<{name: string; category: string; basis: string; amount_y1: number; amount_y2: number; amount_y3: number; runrate: number; confidence: "HIGH"|"MEDIUM"|"STRETCH"; owner: string}> {
  // Split by ## headings, find the section
  const sections = markdown.split(/^##\s+/m);
  const target = sections.find((s) => sectionHeading.test(s.split("\n")[0]));
  if (!target) return [];

  // Look for markdown table rows: | x | y | z |
  const rows = target.split("\n").filter((l) => /^\s*\|/.test(l) && !/^\s*\|\s*-/.test(l));
  if (rows.length < 2) return [];

  // Skip header row
  const out: Array<{name: string; category: string; basis: string; amount_y1: number; amount_y2: number; amount_y3: number; runrate: number; confidence: "HIGH"|"MEDIUM"|"STRETCH"; owner: string}> = [];
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i].split("|").map((c) => c.trim()).filter((c) => c.length > 0);
    if (cells.length < 4) continue;
    const num = (s: string) => {
      const m = s.match(/(\d+(?:\.\d+)?)\s*(M|B|K)?/i);
      if (!m) return 0;
      const v = parseFloat(m[1]);
      const suffix = (m[2] || "").toUpperCase();
      return suffix === "B" ? v * 1e9 : suffix === "M" ? v * 1e6 : suffix === "K" ? v * 1e3 : v;
    };
    const conf = /HIGH/i.test(rows[i]) ? "HIGH" : /STRETCH/i.test(rows[i]) ? "STRETCH" : "MEDIUM";
    out.push({
      name: cells[0] || "Unnamed",
      category: cells[1] || "general",
      basis: cells[2] || "",
      amount_y1: num(cells[3] || "0"),
      amount_y2: num(cells[4] || "0"),
      amount_y3: num(cells[5] || "0"),
      runrate: num(cells[5] || cells[3] || "0"),
      confidence: conf,
      owner: cells[cells.length - 1] || "TBD",
    });
  }
  return out;
}
}
