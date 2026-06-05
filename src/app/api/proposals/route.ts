/**
 * GET /api/proposals
 *
 * Returns the proposal history for whichever user "owns" the current viewer's
 * scope:
 *   - Authed users → their own proposals.
 *   - Guest sessions → the admin's proposals (read-only advisory history).
 *
 * Guests have no Supabase auth session, so the client-side anon query in the
 * proposals page returns nothing for them under RLS. This server route uses
 * resolveDataOwner + the admin client so a guest can read (and download) the
 * advisory proposal history, per the guest-access model.
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
    .from("proposals")
    .select("id,proposal_type,buyer,target,content,provider,model,created_at")
    .eq("user_id", owner.ownerId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message, proposals: [] }, { status: 500 });
  return NextResponse.json({ proposals: data ?? [] });
}
