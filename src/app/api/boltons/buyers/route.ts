/**
 * GET /api/boltons/buyers
 *
 * Lists the user's active acquirers (buyers appearing in canonical_deals)
 * for use in the buyer-picker dropdown. Also includes existing profiles
 * so the UI can show which buyers already have generated bolt-on shortlists.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Buyers from active_acquirers view (already user-scoped via view definition)
  const { data: buyers, error: bErr } = await sb
    .from("active_acquirers")
    .select("*")
    .eq("created_by", user.id)
    .order("deal_count", { ascending: false })
    .limit(200);
  if (bErr) return NextResponse.json({ error: bErr.message }, { status: 500 });

  // Existing profiles
  const { data: profiles } = await sb
    .from("buyer_profiles")
    .select("id, buyer_name, total_deals, deals_last_24m, last_refreshed_at, acquisition_thesis");

  const profileByName = new Map<string, any>();
  for (const p of profiles ?? []) profileByName.set(p.buyer_name as string, p);

  // Existing shortlists
  const { data: shortlists } = await sb
    .from("bolt_on_shortlists")
    .select("id, buyer_name, total_targets, refreshed_at, status")
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

  return NextResponse.json({ buyers: enriched });
}
