/**
 * GET    /api/workspaces        → list workspaces I belong to + active one
 * POST   /api/workspaces        → switch active workspace { workspace_id }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listMyWorkspaces, getActiveWorkspace, WORKSPACE_COOKIE } from "@/lib/workspaces/context";

export const runtime = "nodejs";

export async function GET() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [workspaces, active] = await Promise.all([
    listMyWorkspaces(sb),
    getActiveWorkspace(sb),
  ]);
  return NextResponse.json({ workspaces, active });
}

export async function POST(req: NextRequest) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { workspace_id?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.workspace_id) return NextResponse.json({ error: "workspace_id required" }, { status: 400 });

  // Verify user is a member
  const list = await listMyWorkspaces(sb);
  const allowed = list.some((w) => w.id === body.workspace_id);
  if (!allowed) return NextResponse.json({ error: "Not a member of that workspace" }, { status: 403 });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(WORKSPACE_COOKIE, body.workspace_id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });
  return res;
}
