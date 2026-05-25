

/**
 * POST /api/ai/tsa
 *
 * Generates a TSA / Carve-Out Rationale from the interactive service catalog.
 * Mirrors the structure of /api/ai/synergy and /api/ai/pmi.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveKey } from "@/lib/ai/key-resolver";
import { routedCall } from "@/lib/ai/router";
import type { ProviderId } from "@/lib/ai/providers";

export const runtime = "nodejs";
export const maxDuration = 120;

type ServiceLine = {
  category: string;
  title: string;
  sla: string;
  duration_months: number;
  monthly_cost_k: number;
  line_cost_k: number;
};

const SYSTEM_PROMPT = `You are an MBB-grade carve-out transition partner producing a board-ready TSA rationale memo.

You will receive:
  - Deal context (buyer, target, sector, geography, size)
  - Carve-out entities (target special entity, selling parent group, acquiring buyer group)
  - Interactive TSA service catalog with category, SLA baseline, duration, cost
  - Total billing tally with admin overhead
  - Optional partner notes

Produce a comprehensive carve-out rationale in markdown with these sections:

# Carve-Out Rationale — {Target}

## 1. Executive Summary
One paragraph: scope of the carve-out, why a TSA is needed, top-line budget, expected transition window.

## 2. Carve-Out Entities & Boundary
- Target special entity being separated
- Selling parent's residual obligations
- Acquiring buyer's intake commitments
- Legal boundary risks

## 3. Service Catalog Rationale (Function-by-Function)
For each service line, explain in 2-3 sentences:
- Why this service must continue post-close (not just "because they need IT")
- Why the chosen duration is correct (cite specific risk if shorter; cite cost overrun risk if longer)
- Which side benefits more (parent vs buyer) — informs negotiation leverage
- SLA enforcement mechanism

## 4. Billing Methodology
- Direct-billed cost basis (cost-plus vs market rate vs fixed)
- Admin overhead percentage rationale
- True-up mechanics for over/underuse
- Currency / tax treatment if cross-border

## 5. Exit Triggers & Off-Ramps
- Earliest sensible termination dates per service
- Step-down pricing for partial discontinuation
- Hold-back conditions
- What happens if either party breaches

## 6. Risk Register (Top 5)
1-5: Specific risks with mitigation. E.g. "If Zendesk tenant separation slips past Month 9, customer-facing SLAs degrade — mitigate with parallel-run + 2-week buffer fee."

## 7. Negotiation Posture
- Where to be firm (e.g. data security SLAs)
- Where to trade (e.g. extend cheap IT services to win cheaper finance services)
- Walk-away conditions

Use the actual numbers from the catalog. Be specific. No fluff words. Output ONLY the markdown, no preamble or postamble.`;

export async function POST(req: NextRequest) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const {
    buyer, target, sector, geography, deal_size, deal_id,
    carve_target, parent_group, buyer_group,
    services = [], admin_overhead_pct, total_budget_k, direct_billed_k, overhead_k, active_services,
    notes, tier = "premium", model_override,
  } = body as {
    buyer?: string; target?: string; sector?: string; geography?: string;
    deal_size?: string; deal_id?: string;
    carve_target?: string; parent_group?: string; buyer_group?: string;
    services?: ServiceLine[]; admin_overhead_pct?: number;
    total_budget_k?: number; direct_billed_k?: number; overhead_k?: number; active_services?: number;
    notes?: string; tier?: "premium" | "economic"; model_override?: string;
  };

  // Resolve AI key via the same path as synergy/pmi
  const admin = createAdminClient();
  let resolved = await resolveKey(admin, user.id, tier === "premium" ? "smart" : "economic");
  if (!resolved?.apiKey) resolved = await resolveKey(admin, user.id, "economic");
  if (!resolved?.apiKey) resolved = await resolveKey(admin, user.id, "fast");
  if (!resolved?.apiKey || !resolved.provider) {
    return NextResponse.json({ error: "No AI key configured. Open Settings → API Key Library to add one." }, { status: 400 });
  }

  const routeConfig = {
    tier: (tier === "premium" ? "smart" : "economic") as "smart" | "economic",
    primaryProvider: resolved.provider as ProviderId,
    primaryKey: resolved.apiKey,
    primaryModel: model_override ?? resolved.model ?? undefined,
    blockFreeFallback: true,
  };

  // Build user prompt with all interactive catalog data
  const serviceBlock = services.length === 0
    ? "(no services configured)"
    : services.map((s, i) =>
        `${i + 1}. [${s.category}] ${s.title}
   SLA Baseline: ${s.sla}
   Duration: ${s.duration_months} months
   Monthly cost: $${s.monthly_cost_k}K
   Line total: $${s.line_cost_k}K`
      ).join("\n\n");

  const userPrompt = `DEAL CONTEXT
=============
Buyer: ${buyer || "—"}
Target: ${target || "—"}
Sector: ${sector || "—"}
Geography: ${geography || "—"}
Deal size: ${deal_size || "—"}

CARVE-OUT ENTITIES
==================
Target special entity: ${carve_target || "—"}
Selling parent group: ${parent_group || "—"}
Acquiring buyer group: ${buyer_group || "—"}

INTERACTIVE TSA CATALOG
=======================
${serviceBlock}

BILLING TALLY
=============
Direct-billed services: $${direct_billed_k ?? 0}K
Admin overhead (${admin_overhead_pct ?? 10}%): $${overhead_k ?? 0}K
Total TSA budget: $${total_budget_k ?? 0}K
Active services: ${active_services ?? services.filter((s) => s.duration_months > 0).length}

${notes ? `PARTNER NOTES\n=============\n${notes}\n` : ""}
Generate the full carve-out rationale memo in markdown.`;

  try {
    const res = await routedCall(routeConfig, [
      { role: "system", content: SYSTEM_PROMPT, stable: true },
      { role: "user", content: userPrompt },
    ], 3500);

    const cost = ((res.inputTokens / 1000) * 0.0015) + ((res.outputTokens / 1000) * 0.006);

    if (res.model === "rules-v1" || res.text.startsWith("[rule-based]")) {
      return NextResponse.json({
        error: `AI fell through to rules-v1 (provider ${res.provider} failed). Verify your ${tier} tier key in Settings → API Key Library.`,
      }, { status: 502 });
    }

    const content = res.text.trim();
    if (!content || content.length < 100) {
      return NextResponse.json({ error: "AI returned an empty or trivial response. Try again or switch tier in Settings." }, { status: 502 });
    }

    // Save to history
    await admin.from("ai_outputs").insert({
      user_id: user.id,
      module: "tsa",
      buyer: buyer ?? null,
      target: target ?? null,
      sector: sector ?? null,
      deal_size: deal_size ?? null,
      deal_id: deal_id ?? null,
      tier,
      provider: res.provider,
      model: res.model,
      cost_estimate_usd: Math.round(cost * 10000) / 10000,
      content,
    });

// =====================================================================
// PHASE 3 — Cognition spine hook (TSA). Non-blocking, additive.
// =====================================================================
try {
  const { extractTsaSidecar } = await import("@/lib/cognition/extract-tsa");
  const { reviseAssumption } = await import("@/lib/cognition/orchestrator");

  const fnCountValue = Array.isArray(services)
    ? services.length
    : 0;

  const durationValue =
    typeof admin_overhead_pct === "number"
      ? admin_overhead_pct
      : 12;

  const sidecar = extractTsaSidecar(
    content,
    durationValue,
    fnCountValue
  );

  const baseTriggerMeta = {
    module: "tsa",
    provider: res.provider,
    model: res.model,
    requested_duration_months: durationValue,
  };

  if (sidecar.total_duration_months !== null) {
    await reviseAssumption({
      workspaceId: null,
      dealId: deal_id ?? null,
      key: "tsa.total_duration_months",
      valueNumeric: sidecar.total_duration_months,
      unit: "months",
      confidence: 0.8,
      source: "ai",
      triggeredBy: "ai_run",
      triggerMeta: baseTriggerMeta,
      reason: "TSA transition duration from AI framework",
    });
  }

  if (sidecar.total_budget_k !== null) {
    await reviseAssumption({
      workspaceId: null,
      dealId: deal_id ?? null,
      key: "tsa.total_budget_k",
      valueNumeric: sidecar.total_budget_k,
      unit: "USD_k",
      currency: "USD",
      confidence: 0.65,
      source: "ai",
      triggeredBy: "ai_run",
      triggerMeta: baseTriggerMeta,
      reason: "TSA total budget extracted from AI framework",
    });
  }
} catch (cogErr) {
  console.error("[cognition] TSA spine hook failed (non-fatal):", cogErr);
}
// =====================================================================

  if (sidecar.total_duration_months !== null) {
    await reviseAssumption({
      workspaceId: null,
      dealId: body.deal_id ?? null,
      key: "tsa.total_duration_months",
      valueNumeric: sidecar.total_duration_months,
      unit: "months",
      confidence: 0.8,
      source: "ai",
      triggeredBy: "ai_run",
      triggerMeta: baseTriggerMeta,
      reason: "TSA transition duration from AI framework",
    });
  }
  if (sidecar.total_budget_k !== null) {
    await reviseAssumption({
      workspaceId: null,
      dealId: body.deal_id ?? null,
      key: "tsa.total_budget_k",
      valueNumeric: sidecar.total_budget_k,
      unit: "USD_k",
      currency: "USD",
      confidence: 0.65,
      source: "ai",
      triggeredBy: "ai_run",
      triggerMeta: baseTriggerMeta,
      reason: "TSA total budget extracted from AI framework",
    });
  }
} catch (cogErr) {
  console.error("[cognition] TSA spine hook failed (non-fatal):", cogErr);
}
// =====================================================================
    return NextResponse.json({
      content,
      provider: res.provider,
      model: res.model,
      cost_usd: cost,
    });
  } catch (e: any) {
    return NextResponse.json({
      error: e?.message ?? "AI generation failed. Check provider status and key validity.",
    }, { status: 500 });
  }
}
