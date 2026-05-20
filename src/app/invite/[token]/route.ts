/**
 * GET /invite/[token]
 *
 * Validates the invite token against active link. If valid, sets the
 * deal_iq_guest cookie and redirects to /dashboard. No signup, no login.
 *
 * If invalid → /login?error=invite_expired
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { GUEST_COOKIE_NAME } from "@/lib/supabase/middleware";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ token: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  const { origin } = new URL(req.url);

  if (!token) return NextResponse.redirect(`${origin}/login?error=missing_invite`);

  const admin = createAdminClient();
  const { data: invite } = await admin
    .from("admin_invite_links")
    .select("id, is_active, signup_count")
    .eq("token", token)
    .maybeSingle();

  if (!invite || !invite.is_active) {
    return NextResponse.redirect(`${origin}/login?error=invite_expired`);
  }

  // Increment use count
  await admin.from("admin_invite_links")
    .update({ signup_count: (invite as any).signup_count + 1 })
    .eq("id", invite.id);

  // Set the guest cookie and redirect to /dashboard
  const res = NextResponse.redirect(`${origin}/dashboard`);
  res.cookies.set(GUEST_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return res;
}
