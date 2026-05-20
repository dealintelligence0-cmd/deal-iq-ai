/**
 * GET /api/me/modules
 *
 * Returns the current user's module access map + is_admin flag.
 * Used by the sidebar to filter nav items in real-time.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserModules, isUserAdmin } from "@/lib/auth/permissions";

export const runtime = "nodejs";

export async function GET() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ modules: {}, is_admin: false });

  const [modules, admin] = await Promise.all([
    getUserModules(sb, user.id),
    isUserAdmin(sb, user.id),
  ]);
  return NextResponse.json({ modules, is_admin: admin });
}
