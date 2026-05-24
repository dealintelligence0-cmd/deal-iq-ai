import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveWorkspace } from "@/lib/workspaces/context";
import { resolveKey } from "@/lib/ai/key-resolver";
import { resolveViewer } from "@/lib/auth/permissions";
import { computeSynergy, generateSynergyNarrative } from "@/lib/synergy/compute";
import type { ProviderId } from "@/lib/ai/providers";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const sb = await createClient();
  const viewer = await resolveViewer(sb);
  if (viewer.kind === "none") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { account_name?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.account_name) return NextResponse.json({ error: "account_name required" }, { status: 400 });

  const admin = createAdminClient();
  const ws = await getActiveWorkspace(sb);
  const { data: model } = await admin.from("synergy_models")
    .select("*").eq("workspace_id", ws.workspaceId ?? "").eq("account_name", body.account_name).maybeSingle();
  if (!model) return NextResponse.json({ error: "Model not found. Save it first." }, { status: 404 });

  const userId = viewer.kind === "guest" ? null : (viewer as any).userId;
  let resolved = await resolveKey(admin, userId ?? "00000000-0000-0000-0000-000000000000", "smart");
  if (!resolved?.apiKey) resolved = await resolveKey(admin, userId ?? "", "economic");
  if (!resolved?.apiKey) resolved = await resolveKey(admin, userId ?? "", "fast");
  if (!resolved?.apiKey || !resolved.provider) return NextResponse.json({ error: "No AI key configured" }, { status: 400 });

  const routeConfig = {
    tier: "smart" as const,
    primaryProvider: resolved.provider as ProviderId,
    primaryKey: resolved.apiKey,
    primaryModel: resolved.model ?? undefined,
    blockFreeFallback: true,
  };

  const output = computeSynergy(model as any);
  const result = await generateSynergyNarrative(routeConfig, model as any, output);

  await admin.from("synergy_models").update({
    ai_narrative: result.narrative,
    ai_provider: result.provider, ai_model: result.model,
    cost_usd: result.cost_usd, generated_at: new Date().toISOString(),
  }).eq("id", (model as any).id);

  return NextResponse.json({ ok: !result.error, narrative: result.narrative, error: result.error, cost_usd: result.cost_usd });
}
