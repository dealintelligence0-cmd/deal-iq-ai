

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { routedCall, type RouteConfig } from "@/lib/ai/router";
import type { ChatMessage, ProviderId } from "@/lib/ai/providers";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { deal_id: string; force?: boolean };
  if (!body.deal_id) return NextResponse.json({ error: "deal_id required" }, { status: 400 });

  const admin = createAdminClient();
  const { data: deal } = await admin.from("deals").select("*").eq("id", body.deal_id).maybeSingle();
  if (!deal) return NextResponse.json({ error: "Deal not found" }, { status: 404 });

  // Cache check — skip if insight_sections already populated and not forced
  const existing = deal.insight_sections as Record<string, unknown> | null;
  if (!body.force && existing?.thesis && String(existing.thesis).length > 30) {
    return NextResponse.json({ ok: true, cached: true, insight_sections: existing,
      deal_takeaway: deal.deal_takeaway, targeting_recommendation: deal.targeting_recommendation,
      targeting_reason: deal.targeting_reason, confidence_level: deal.confidence_level });
  }

  // Get smart-tier AI
  const { data: settings } = await admin.from("ai_settings")
    .select("premium_provider, premium_model, premium_key_encrypted")
    .eq("user_id", user.id).maybeSingle();
  const s = settings as Record<string, unknown> | null;

  let apiKey: string | null = null;
  const cipher = s?.premium_key_encrypted as string | undefined;
  if (cipher) {
    try { const { data: dec } = await admin.rpc("decrypt_key", { cipher }); apiKey = dec as string | null; }
    catch { /* skip */ }
  }
  if (!apiKey) return NextResponse.json({ error: "No Smart-tier provider in Settings." }, { status: 400 });

  const buyer = (deal.buyer as string | null) ?? "Unknown buyer";
  const target = (deal.target as string | null) ?? "Unknown target";
  const sector = (deal.sector as string | null) ?? "";
  const country = (deal.country as string | null) ?? "";
  const dealType = (deal.deal_type as string | null) ?? "Acquisition";
  const stake = (deal.stake_percent as number | null);
  const usdM = ((deal.normalized_value_usd as number | null) ?? 0) / 1_000_000;
  const notes = (deal.notes as string | null) ?? "";
  const valueRaw = (deal.value_raw as string | null) ?? "";
  const dealDate = (deal.deal_date as string | null) ?? "";

  const systemPrompt = `You are an MBB Partner producing proprietary deal intelligence. Output STRICT JSON only — no preamble, no markdown fences.

Schema (all fields required):
{
  "thesis": "<1 sentence — specific investment thesis for THIS deal, names buyer+target, states real strategic logic>",
  "why_now": "<1 sentence — specific timing trigger for THIS deal>",
  "value_drivers": ["<driver 1 specific to this deal>", "<driver 2>", "<driver 3>"],
  "risks": ["<risk 1 specific to this deal>", "<risk 2>", "<risk 3>"],
  "tensions": "<1 sentence — the core contradiction or trade-off in this deal>",
  "advisory_angle": "<1 sentence — specific advisory pitch for this deal type, sector, and structure>",
  "deal_takeaway": "<2-3 lines — why this deal matters, whether to pursue, what to do>",
  "targeting_recommendation": "HIGH" | "MEDIUM" | "LOW",
  "targeting_reason": "<1 sentence justification for recommendation>",
  "confidence_level": "HIGH" | "MEDIUM" | "LOW"
}

CRITICAL RULES:
- Every sentence must name SPECIFIC parties (${buyer}, ${target}) or deal facts
- BANNED: "strengthens position", "enhances capabilities", "drives growth", "best-in-class", "leverage", "value-add"
- Each risk and value_driver must be unique and deal-specific
- If stake < 50%: thesis must mention governance-only / limited integration
- If sector is regulated (pharma/finance/energy): risks must include regulatory clearance
- thesis must NOT be generic — it must answer WHY ${buyer} SPECIFICALLY is buying ${target}`;

  const userPrompt = `Deal facts:
Buyer: ${buyer}
Target: ${target}  
Sector: ${sector}
Country: ${country}
Deal Type: ${dealType}
Stake: ${stake != null ? stake + "%" : "Not disclosed"}
Deal Value: ${valueRaw || (usdM > 0 ? "$" + usdM.toFixed(0) + "M" : "Unknown")}
Deal Date: ${dealDate}
Context: ${notes.slice(0, 500)}

Generate specific, non-generic JSON per schema.`;

  const cfg: RouteConfig = {
    tier: "smart",
    primaryProvider: (s?.premium_provider as ProviderId) ?? "free",
    primaryKey: apiKey,
    primaryModel: (s?.premium_model as string | undefined),
    blockFreeFallback: true,
  };

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  try {
    const result = await routedCall(cfg, messages, 1200);

    // Parse JSON
    let parsed: Record<string, unknown> = {};
    const clean = result.text.replace(/```json|```/g, "").trim();
    try { parsed = JSON.parse(clean); }
    catch {
      const m = clean.match(/\{[\s\S]*\}/);
      if (m) try { parsed = JSON.parse(m[0]); } catch { /* ignore */ }
    }

    if (!parsed.thesis) return NextResponse.json({ error: "AI returned invalid JSON. Try again." }, { status: 500 });

    const ins = {
      thesis: parsed.thesis,
      why_now: parsed.why_now,
      value_drivers: parsed.value_drivers,
      risks: parsed.risks,
      tensions: parsed.tensions,
      advisory_angle: parsed.advisory_angle,
    };

    await admin.from("deals").update({
      insight_sections: ins,
      deal_takeaway: parsed.deal_takeaway,
      targeting_recommendation: parsed.targeting_recommendation,
      targeting_reason: parsed.targeting_reason,
      confidence_level: parsed.confidence_level,
    }).eq("id", body.deal_id);

    return NextResponse.json({ ok: true, cached: false, insight_sections: ins,
      deal_takeaway: parsed.deal_takeaway,
      targeting_recommendation: parsed.targeting_recommendation,
      targeting_reason: parsed.targeting_reason,
      confidence_level: parsed.confidence_level });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
