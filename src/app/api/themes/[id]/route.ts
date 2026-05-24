/**
 * GET /api/themes/[id]
 *
 * Returns full theme detail + paginated member deals.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveDataOwner } from "@/lib/auth/data-owner";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const sb = await createClient();
  const owner = await resolveDataOwner(sb);
  if (!owner.ok) return NextResponse.json({ error: owner.error }, { status: owner.status });

  const admin = createAdminClient();
  const { data: theme, error } = await admin
    .from("themes")
    .select("*")
    .eq("id", id)
    .eq("created_by", owner.ownerId)
    .single();
  if (error || !theme) return NextResponse.json({ error: "Theme not found" }, { status: 404 });

  const { data: memberships } = await admin
    .from("theme_deals")
    .select("similarity, canonical_id, canonical_deals!inner(id, heading, buyer, target, dominant_sector, dominant_geography, deal_type, deal_status, intelligence_size, deal_date)")
    .eq("theme_id", id)
    .order("similarity", { ascending: false })
    .limit(100);

  return NextResponse.json({
    theme,
    members: (memberships ?? []).map((m: any) => ({
      ...m.canonical_deals,
      similarity: m.similarity,
    })),
  });
}
