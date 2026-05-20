/**
 * POST /api/auth/grant-defaults
 *
 * Called immediately after a regular user signup. Grants the default modules
 * from module_catalog. Idempotent — safe to call multiple times.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createAdminClient();
  // Skip if admin
  const { data: u } = await admin.from("users").select("is_admin").eq("id", user.id).maybeSingle();
  if (u?.is_admin) return NextResponse.json({ ok: true, note: "Admin — skipped" });

  const { data: catalog } = await admin
    .from("module_catalog")
    .select("module_key, default_for_invitees");
  if (!catalog?.length) return NextResponse.json({ ok: true, granted: 0 });

  const payload = catalog.map((c) => ({
    user_id: user.id,
    module_key: c.module_key as string,
    granted: c.default_for_invitees as boolean,
    granted_at: c.default_for_invitees ? new Date().toISOString() : null,
  }));
  await admin.from("user_module_permissions").upsert(payload, { onConflict: "user_id,module_key" });

  return NextResponse.json({ ok: true, granted: payload.filter((p) => p.granted).length });
}
