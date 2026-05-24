/**
 * GET /api/boltons/buyers
 *
 * Lists the user's active acquirers (buyers appearing in canonical_deals)
 * for use in the buyer-picker dropdown. Also includes existing profiles
 * so the UI can show which buyers already have generated bolt-on shortlists.
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

  const { data: buyers, error: bErr } = await admin
    .from("active_acquirers")
    .select("*")
    .eq("created_by", owner.ownerId)
    .order("deal_count", { ascending: false })
    .limit(200);
  if (bErr) return NextResponse.json({ error: bErr.message }, { status: 500 });

  const { data: profiles } = await admin
    .from("buyer_profiles")
    .select("id, buyer_name, total_deals, deals_last_24m, last_refreshed_at, acquisition_thesis")
    .eq("created_by", owner.ownerId);

  const profileByName = new Map<string, any>();
  for (const p of profiles ?? []) profileByName.set(p.buyer_name as string, p);

  const { data: shortlists } = await admin
    .from("bolt_on_shortlists")
    .select("id, buyer_name, total_targets, refreshed_at, status")
    .eq("created_by", owner.ownerId)
    .eq("status", "active")
    .order("refreshed_at", { ascending: false });

  const shortlistByName = new Map<string, any>();
  for (const s of shortlists ?? []) {
    if (!shortlistByName.has(s.buyer_name as string)) shortlistByName.set(s.buyer_name as string, s);
  }

  const enriched = (buyers ?? []).map((b) => ({
    ...b,
    profile: profileByName.get(b.buyer_name as string) ?? null,
    latest_shortlist: shortlistByName.get(b.buyer_name as string) ?? null,
  }));

  return NextResponse.json({ buyers: enriched, isReadOnly: owner.isReadOnly });
}
