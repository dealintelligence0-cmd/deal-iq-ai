/**
 * POST /api/critique
 *
 * Body: { proposal_id: string, persona_ids?: string[], tier?: "smart"|"economic"|"fast" }
 *
 * Runs all (or selected) critique personas against a proposal. Saves the
 * result in pitch_critiques and returns it.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveKey } from "@/lib/ai/key-resolver";
import { resolveDataOwner } from "@/lib/auth/data-owner";
import { critiquePitch } from "@/lib/critique/critique";
import type { ProviderId } from "@/lib/ai/providers";
import crypto from "node:crypto";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { proposal_id?: string; persona_ids?: string[]; tier?: "smart"|"economic"|"fast" };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.proposal_id) return NextResponse.json({ error: "proposal_id required" }, { status: 400 });

  const { data: proposal, error: pe } = await sb
    .from("proposals")
    .select("id, content, client_name, buyer, target, sector, geography, proposal_type")
    .eq("id", body.proposal_id)
    .single();
  if (pe || !proposal) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });

  // Hash proposal so re-critiques on the same version are cache-able
  const proposalHash = crypto.createHash("sha1").update(proposal.content ?? "").digest("hex").slice(0, 16);
  const { data: cached } = await sb
    .from("pitch_critiques")
    .select("*")
    .eq("proposal_id", proposal.id)
    .eq("proposal_hash", proposalHash)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (cached) {
    return NextResponse.json({ ok: true, cached: true, critique: cached });
  }

  // Resolve key — try smart, then economic, then fast
  const requestedTier = body.tier ?? "smart";
  const admin = createAdminClient();
  let resolved = await resolveKey(admin, user.id, requestedTier);
  let actualTier = requestedTier;
  if (!resolved?.apiKey) { resolved = await resolveKey(admin, user.id, "economic"); actualTier = "economic"; }
  if (!resolved?.apiKey) { resolved = await resolveKey(admin, user.id, "fast"); actualTier = "fast"; }
  if (!resolved?.apiKey || !resolved.provider) {
    return NextResponse.json({
      error: "No AI key configured. Add one in Settings → API Key Library (any tier works).",
    }, { status: 400 });
  }

  const routeCfg = {
    tier: actualTier, primaryProvider: resolved.provider as ProviderId,
    primaryKey: resolved.apiKey, primaryModel: resolved.model ?? undefined,
  };

  let result;
  try {
    result = await critiquePitch(sb, routeCfg, {
      id: proposal.id, content: proposal.content ?? "",
      client_name: proposal.client_name ?? "—",
      buyer: proposal.buyer ?? undefined, target: proposal.target ?? undefined,
      sector: proposal.sector ?? undefined, geography: proposal.geography ?? undefined,
      proposal_type: proposal.proposal_type ?? undefined,
    }, body.persona_ids);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Critique failed" }, { status: 500 });
  }

  const { data: saved, error: se } = await sb.from("pitch_critiques").insert({
    proposal_id: proposal.id,
    created_by: user.id,
    credibility_score:         result.overall_credibility,
    differentiation_score:     result.overall_differentiation,
    executive_relevance_score: result.overall_executive_relevance,
    strategic_sharpness_score: result.overall_strategic_sharpness,
    overall_score:             result.overall_score,
    personas_json: result.personas as unknown as object,
    top_warnings:  result.top_warnings.map((w) => `${w.severity.toUpperCase()} · ${w.persona}: ${w.text}`),
    top_strengths: result.top_strengths.map((s) => `${s.persona}: ${s.text}`),
    proposal_hash: proposalHash,
    ai_provider: result.provider,
    ai_model: result.model,
    cost_usd: result.cost_usd,
  }).select().single();

  if (se) return NextResponse.json({ error: "Save failed: " + se.message }, { status: 500 });
  return NextResponse.json({ ok: true, cached: false, critique: saved });
}

export async function GET(req: NextRequest) {
  const sb = await createClient();
  const owner = await resolveDataOwner(sb);
  if (!owner.ok) return NextResponse.json({ error: owner.error }, { status: owner.status });

  const proposalId = new URL(req.url).searchParams.get("proposal_id");
  if (!proposalId) return NextResponse.json({ error: "proposal_id required" }, { status: 400 });

  const admin = createAdminClient();
  const { data } = await admin
    .from("pitch_critiques")
    .select("*")
    .eq("proposal_id", proposalId)
    .eq("created_by", owner.ownerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return NextResponse.json({ critique: data });
}
