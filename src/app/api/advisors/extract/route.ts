import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveKey } from "@/lib/ai/key-resolver";
import { runAdvisorExtraction } from "@/lib/advisors/extract";
import type { ProviderId } from "@/lib/ai/providers";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { max_deals?: number; force_refresh?: boolean };
  try { body = await req.json(); } catch { body = {}; }

  const admin = createAdminClient();
  let resolved = await resolveKey(admin, user.id, "smart");
  if (!resolved?.apiKey) resolved = await resolveKey(admin, user.id, "economic");
  if (!resolved?.apiKey) resolved = await resolveKey(admin, user.id, "fast");
  if (!resolved?.apiKey || !resolved.provider) {
    return NextResponse.json({ error: "No AI key configured" }, { status: 400 });
  }

  const routeConfig = {
    tier: "smart" as const,
    primaryProvider: resolved.provider as ProviderId,
    primaryKey: resolved.apiKey,
    primaryModel: resolved.model ?? undefined,
    blockFreeFallback: true,
  };

  try {
    const result = await runAdvisorExtraction(sb, {
      userId: user.id,
      routeConfig,
      maxDeals: body.max_deals ?? 25,
      forceRefresh: body.force_refresh ?? false,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Extraction failed" }, { status: 500 });
  }
}
