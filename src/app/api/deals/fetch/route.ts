/**
 * GET /api/deals/fetch
 *
 * Returns deals filtered to whichever user "owns" the current viewer's scope.
 * Authed users → their own deals.
 * Guest sessions → admin's deals.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveDataOwner } from "@/lib/auth/data-owner";

export const runtime = "nodejs";

export async function GET() {
  const sb = await createClient();
  const owner = await resolveDataOwner(sb);
  if (!owner.ok) return NextResponse.json({ error: owner.error }, { status: owner.status });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("deals")
    .select("*")
    .eq("created_by", owner.ownerId)
    .order("deal_date", { ascending: false })
    .limit(500);

  if (error) return NextResponse.json({ error: error.message, deals: [] }, { status: 500 });
  return NextResponse.json({ deals: data ?? [] });
}
