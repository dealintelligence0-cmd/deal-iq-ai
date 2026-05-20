import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const invite = searchParams.get("invite");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const sb = await createClient();
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (!error) {
      // If invite token present, stamp the new user + grant defaults
      if (invite) {
        const { data: { user } } = await sb.auth.getUser();
        if (user) {
          try {
            const admin = createAdminClient();
            const { data: inviteRow } = await admin
              .from("admin_invite_links")
              .select("id, is_active")
              .eq("token", invite)
              .maybeSingle();
            if (inviteRow?.is_active) {
              const { data: userRow } = await admin
                .from("users")
                .select("is_admin, signed_up_via_invite_id")
                .eq("id", user.id)
                .maybeSingle();
              if (userRow && !userRow.is_admin && !userRow.signed_up_via_invite_id) {
                await admin.from("users")
                  .update({ signed_up_via_invite_id: inviteRow.id })
                  .eq("id", user.id);
                // Grant defaults from catalogue
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
              }
            }
          } catch (e) {
            console.error("Invite-stamp failed:", e);
          }
        }
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
