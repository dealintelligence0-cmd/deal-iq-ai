import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const sb = await createClient();
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (!error) {
      // Grant default modules if this is a new regular user
      try {
        const { data: { user } } = await sb.auth.getUser();
        if (user) {
          const admin = createAdminClient();
          const { data: u } = await admin.from("users").select("is_admin").eq("id", user.id).maybeSingle();
          if (!u?.is_admin) {
            const { data: existing } = await admin
              .from("user_module_permissions")
              .select("id")
              .eq("user_id", user.id)
              .limit(1);
            if (!existing?.length) {
              const { data: catalog } = await admin
                .from("module_catalog")
                .select("module_key, default_for_invitees");
              const payload = (catalog ?? []).map((c) => ({
                user_id: user.id,
                module_key: c.module_key as string,
                granted: c.default_for_invitees as boolean,
                granted_at: c.default_for_invitees ? new Date().toISOString() : null,
              }));
              if (payload.length) {
                await admin.from("user_module_permissions").upsert(payload, { onConflict: "user_id,module_key" });
              }
            }
          }
        }
      } catch (e) {
        console.error("Default-grant during callback failed:", e);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
