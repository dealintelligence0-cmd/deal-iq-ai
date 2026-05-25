

/**
 * GET /api/cognition/revisions?workspace_id=&deal_id=&key=&since=&limit=
 *
 * Returns recent revisions for the requested scope.
 * Used by the UI to show:
 *   - "what changed" indicators next to module values
 *   - revision history panels
 *   - the executive brief's "since last viewed" digest
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listRevisions } from "@/lib/cognition/orchestrator";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const workspaceId = url.searchParams.get("workspace_id");
  const dealId = url.searchParams.get("deal_id");
  const key = url.searchParams.get("key") ?? undefined;
  const sinceIso = url.searchParams.get("since") ?? undefined;
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20", 10), 100);

  const revisions = await listRevisions({
    workspaceId: workspaceId !== null ? workspaceId : undefined,
    dealId: dealId !== null ? dealId : undefined,
    key,
    sinceIso,
    limit,
  });

  return NextResponse.json({ revisions, count: revisions.length });
}
