/**
 * POST /api/auth/invite-signup
 *
 * Called after Supabase auth signup. Validates the invite token, then
 * stamps the user record with signed_up_via_invite_id, which the trigger
 * uses to auto-grant the default modules.
 *
 * Body: { token: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Must be signed in" }, { status: 401 });

  let body: { token?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.token) return NextResponse.json({ error: "token required" }, { status: 400 });

  // Use admin client to verify the token and stamp the user
  // (because RLS on admin_invite_links only allows admin to read)
  const admin = createAdminClient();
  const { data: invite } = await admin
    .from("admin_invite_links")
    .select("id, is_active")
    .eq("token", body.token)
    .maybeSingle();

  if (!invite || !invite.is_active) {
    return NextResponse.json({
      error: "Invite link is invalid or has been deactivated. Ask the admin for a fresh link.",
    }, { status: 400 });
  }

  // Stamp the new user — the AFTER INSERT trigger will run when the user is created
  // by the auth signup flow. But if the user already exists (e.g. they re-clicked
  // the link), update the row + manually trigger the default-grant insert.
  const { data: userRow } = await admin
    .from("users")
    .select("id, signed_up_via_invite_id, is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (!userRow) {
    return NextResponse.json({ error: "User record not yet provisioned. Retry in a moment." }, { status: 425 });
  }
  if (userRow.is_admin) {
    return NextResponse.json({ ok: true, note: "Admin user — full access" });
  }
  if (userRow.signed_up_via_invite_id) {
    return NextResponse.json({ ok: true, note: "Already provisioned via invite" });
  }

  // Stamp
  await admin.from("users").update({ signed_up_via_invite_id: invite.id }).eq("id", user.id);
  // The trigger will fire on UPDATE too? No — trigger is AFTER INSERT only.
  // Manually grant defaults here:
  const { data: catalog } = await admin
    .from("module_catalog")
    .select("module_key, default_for_invitees");
  const payload = (catalog ?? []).map((c) => ({
    user_id: user.id,
    module_key: c.module_key as string,
    granted: c.default_for_invitees as boolean,
    granted_at: c.default_for_invitees ? new Date().toISOString() : null,
  }));
  if (payload.length > 0) {
    await admin.from("user_module_permissions").upsert(payload, { onConflict: "user_id,module_key" });
  }
  // Bump signup_count
  await admin.from("admin_invite_links").update({
    signup_count: ((invite as any).signup_count ?? 0) + 1,
  }).eq("id", invite.id);

  return NextResponse.json({ ok: true, granted_modules: payload.filter((p) => p.granted).length });
}
