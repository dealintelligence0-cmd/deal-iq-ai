/**
 * POST /api/critique/sharpen
 *
 * Body: { critique_id: string }
 *
 * Regenerates the proposal addressing every weakness identified in the critique.
 * Saves the sharpened version into pitch_critiques.sharpened_summary.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveKey } from "@/lib/ai/key-resolver";
import { sharpenProposal, type CritiqueResult } from "@/lib/critique/critique";
import type { ProviderId } from "@/lib/ai/providers";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { critique_id?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.critique_id) return NextResponse.json({ error: "critique_id required" }, { status: 400 });

  const { data: critiqueRow, error: ce } = await sb
    .from("pitch_critiques").select("*").eq("id", body.critique_id).single();
  if (ce || !critiqueRow) return NextResponse.json({ error: "Critique not found" }, { status: 404 });

  if (critiqueRow.sharpened_summary) {
    return NextResponse.json({ ok: true, cached: true, sharpened: critiqueRow.sharpened_summary });
  }

  const { data: proposal } = await sb
    .from("proposals").select("content, client_name, buyer, target, sector").eq("id", critiqueRow.proposal_id).single();
  if (!proposal) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });

  const admin = createAdminClient();
  let resolved = await resolveKey(admin, user.id, "smart");
  if (!resolved?.apiKey) resolved = await resolveKey(admin, user.id, "economic");
  if (!resolved?.apiKey) resolved = await resolveKey(admin, user.id, "fast");
  if (!resolved?.apiKey) return NextResponse.json({ error: "No AI key configured. Add one in Settings → API Key Library." }, { status: 400 });

  const routeCfg = {
    tier: "smart" as const,
    primaryProvider: resolved.provider as ProviderId,
    primaryKey: resolved.apiKey, primaryModel: resolved.model ?? undefined,
  };

  // Reconstruct CritiqueResult shape from the stored row
  const result: CritiqueResult = {
    personas: (critiqueRow.personas_json as CritiqueResult["personas"]) ?? [],
    overall_credibility: critiqueRow.credibility_score ?? 50,
    overall_differentiation: critiqueRow.differentiation_score ?? 50,
    overall_executive_relevance: critiqueRow.executive_relevance_score ?? 50,
    overall_strategic_sharpness: critiqueRow.strategic_sharpness_score ?? 50,
    overall_score: critiqueRow.overall_score ?? 50,
    top_warnings: (critiqueRow.top_warnings as string[] ?? []).map((s) => {
      const m = s.match(/^(HIGH|MEDIUM|LOW)\s*·\s*(.+?):\s*(.+)$/);
      return m ? { persona: m[2], severity: m[1].toLowerCase(), text: m[3] }
               : { persona: "Critic", severity: "medium", text: s };
    }),
    top_strengths: (critiqueRow.top_strengths as string[] ?? []).map((s) => {
      const m = s.match(/^(.+?):\s*(.+)$/);
      return m ? { persona: m[1], text: m[2] } : { persona: "Critic", text: s };
    }),
    cost_usd: 0, provider: resolved.provider as ProviderId, model: resolved.model ?? "",
  };

  try {
    const out = await sharpenProposal(routeCfg, {
      content: proposal.content ?? "",
      client_name: proposal.client_name ?? "—",
      buyer: proposal.buyer ?? undefined, target: proposal.target ?? undefined, sector: proposal.sector ?? undefined,
    }, result);

    await sb.from("pitch_critiques").update({
      sharpened_summary: out.sharpened,
      cost_usd: (critiqueRow.cost_usd ?? 0) + out.cost_usd,
    }).eq("id", body.critique_id);

    return NextResponse.json({ ok: true, cached: false, sharpened: out.sharpened });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Sharpen failed" }, { status: 500 });
  }
}
