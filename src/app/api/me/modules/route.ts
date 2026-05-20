/**
 * GET /api/me/modules
 *
 * Returns the current viewer's module access map + identity kind.
 * Drives sidebar filtering.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveViewer, getViewerModules } from "@/lib/auth/permissions";

export const runtime = "nodejs";

export async function GET() {
  const sb = await createClient();
  const viewer = await resolveViewer(sb);
  const modules = await getViewerModules(sb, viewer);
  return NextResponse.json({
    modules,
    is_admin: viewer.kind === "admin",
    is_guest: viewer.kind === "guest",
    viewer_kind: viewer.kind,
  });
}
