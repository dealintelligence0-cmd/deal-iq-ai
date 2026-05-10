

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

  const existing = deal.insight_sections as Record<string, unknown> | null;
  if (!body.force && existing?.thesis && String(existing.thesis).length > 30) {
    return NextResponse.json({ ok: true, cached: true, insight_sections: existing,
      deal_takeaway: deal.deal_takeaway, targeting_recommendation: deal.targeting_recommendation,
      targeting_reason: deal.targeting_reason, confidence_level: deal.confidence_level });
  }

  const { data: settings } = await admin.from("ai_settings")
    .select("premium_provider, premium_model, premium_key_encrypted, bulk_provider, bulk_model, bulk_key_encrypted")
    .eq("user_id", user.id).maybeSingle();
  const s = settings as Record<string, unknown> | null;

  // Prefer Fast/bulk tier for deal insights — lower cost, sufficient quality
  // Fall back to Smart/premium if bulk not configured
  let apiKey: string | null = null;
  let providerKey = "bulk_key_encrypted";
  let providerCol = "bulk_provider";
  let modelCol = "bulk_model";

  const bulkCipher = s?.bulk_key_encrypted as string | undefined;
  const premiumCipher = s?.premium_key_encrypted as string | undefined;

  if (bulkCipher) {
    try { const { data: dec } = await admin.rpc("decrypt_key", { cipher: bulkCipher }); apiKey = dec as string | null; }
    catch { /* skip */ }
  }
  if (!apiKey && premiumCipher) {
    // fallback to premium
    providerCol = "premium_provider";
    modelCol = "premium_model";
    try { const { data: dec } = await admin.rpc("decrypt_key", { cipher: premiumCipher }); apiKey = dec as string | null; }
    catch { /* skip */ }
  }
  if (!apiKey) return NextResponse.json({ error: "No AI provider configured. Open Settings → AI and save a key for any tier." }, { status: 400 });

  function dedupeEntities(input: string): string[] {
    const norm = (x: string) => x.toLowerCase()
      .replace(/\b(ltd|ltdp|pty|inc|llc|sa|plc|pvt|corp|co|limited|private|public)\b\.?/g, "")
      .replace(/\s+/g, " ").trim();
    const parts = input.split(/[,;|]/).map((x) => x.trim()).filter((x) => x.length > 1);
    const seen = new Set<string>();
    return parts.filter((p) => { const k = norm(p); if (seen.has(k)) return false; seen.add(k); return true; });
  }

  const rawBuyer = (deal.buyer as string | null) ?? "Unknown buyer";
  const buyerParts = dedupeEntities(rawBuyer);
  const buyer = buyerParts.length > 1 ? buyerParts.join(", ") : rawBuyer;
  const isConsortium = buyerParts.length > 1;
  const target = (deal.target as string | null) ?? "Unknown target";
  const sector = (deal.sector as string | null) ?? "";
  const country = (deal.country as string | null) ?? "";
  const dealType = (deal.deal_type as string | null) ?? "Acquisition";
  const stake = (deal.stake_percent as number | null);
  const usdM = ((deal.normalized_value_usd as number | null) ?? 0) / 1_000_000;
  const valueRaw = (deal.value_raw as string | null) ?? "";
  const dealDate = (deal.deal_date as string | null) ?? "";
  const rawNotes = (deal.notes as string | null) ?? "";
  const heading = (deal.heading as string | null) ?? "";

  const systemPrompt = `You are an MBB Partner producing proprietary deal intelligence.

CRITICAL: Your ENTIRE response must be a single valid JSON object. Start with { and end with }. No text before or after. No markdown. No backticks. No explanation.

Schema (all fields required):
{
  "thesis": "<1 sentence — specific investment thesis for THIS deal>",
  "why_now": "<1 sentence — specific timing trigger for THIS deal>",
  "value_drivers": ["<driver 1>", "<driver 2>", "<driver 3>"],
  "risks": ["<risk 1>", "<risk 2>", "<risk 3>"],
  "tensions": "<1 sentence — core contradiction or trade-off>",
  "advisory_angle": "<1 sentence — specific advisory pitch>",
  "deal_takeaway": "<2-3 lines — why this deal matters, whether to pursue, what to do>",
  "targeting_recommendation": "HIGH",
  "targeting_reason": "<1 sentence justification>",
  "confidence_level": "HIGH"
}

RULES:
- Name SPECIFIC parties in every sentence
- BANNED: "strengthens position", "enhances capabilities", "drives growth", "best-in-class", "leverage", "value-add"
- thesis must answer WHY ${isConsortium ? `these ${buyerParts.length} bidders compete for` : `${buyer} is buying`} ${target}
- If multi-bidder: state auction dynamic and each bidder's likely angle`;

  const userPrompt = `Deal facts:
Buyer: ${isConsortium ? `Competitive auction — ${buyerParts.length} bidders: ${buyerParts.join(", ")}` : buyer}
Target: ${target}
Sector: ${sector || "N/A"}
Country: ${country || "N/A"}
Deal Type: ${dealType}
Stake: ${stake != null ? stake + "%" : "Not disclosed"}
Deal Value: ${valueRaw || (usdM > 0 ? "$" + usdM.toFixed(0) + "M" : "Unknown")}
Deal Date: ${dealDate}
${heading ? "Deal Title: " + heading : ""}
Opportunity Context: ${rawNotes.slice(0, 600)}
${isConsortium ? "IMPORTANT: COMPETITIVE AUCTION with " + buyerParts.length + " bidders. Thesis MUST cover each bidder's angle. Do NOT assume single winner." : ""}

Return ONLY valid JSON per schema above.`;

  const cfg: RouteConfig = {
    tier: providerKey === "bulk_key_encrypted" ? "fast" : "smart",
    primaryProvider: (s?.[providerCol] as ProviderId) ?? "free",
    primaryKey: apiKey,
    primaryModel: (s?.[modelCol] as string | undefined),
    blockFreeFallback: true,
  };

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  try {
    let result = await routedCall(cfg, messages, 1200);
    if (!result.text.trim().startsWith("{")) {
      const retryMessages: ChatMessage[] = [
        ...messages,
        { role: "assistant", content: result.text },
        { role: "user", content: "Return ONLY the JSON object. Start with { immediately. No explanation." },
      ];
      result = await routedCall(cfg, retryMessages, 1200);
    }

    let parsed: Record<string, unknown> = {};
    const raw = result.text.replace(/```json|```/g, "").trim();
    const firstBrace = raw.indexOf("{");
    const lastBrace = raw.lastIndexOf("}");
    const clean = firstBrace !== -1 && lastBrace !== -1 ? raw.slice(firstBrace, lastBrace + 1) : raw;
    try { parsed = JSON.parse(clean); }
    catch {
      const allBlocks = [...clean.matchAll(/\{[\s\S]*?\}/g)].map((m) => m[0]);
      for (const block of allBlocks.sort((a, b) => b.length - a.length)) {
        try { parsed = JSON.parse(block); if (parsed.thesis) break; } catch { /* next */ }
      }
    }

    if (!parsed.thesis) {
      const extract = (key: string) => {
        const m = result.text.match(new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`, "i"));
        return m ? m[1] : null;
      };
      parsed = {
        thesis: extract("thesis") ?? `${buyer} — ${target}: specific thesis pending retry`,
        why_now: extract("why_now") ?? "Timing context unavailable — retry",
        value_drivers: ["Deal-specific drivers pending — click Force refresh"],
        risks: ["Deal-specific risks pending — click Force refresh"],
        tensions: extract("tensions") ?? "—",
        advisory_angle: extract("advisory_angle") ?? "Advisory angle pending — retry",
        deal_takeaway: extract("deal_takeaway") ?? "Takeaway pending — retry",
        targeting_recommendation: "MEDIUM",
        targeting_reason: "Low confidence — AI response incomplete. Retry recommended.",
        confidence_level: "LOW",
      };
    }

    const ins = {
      thesis: parsed.thesis, why_now: parsed.why_now,
      value_drivers: parsed.value_drivers, risks: parsed.risks,
      tensions: parsed.tensions, advisory_angle: parsed.advisory_angle,
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
