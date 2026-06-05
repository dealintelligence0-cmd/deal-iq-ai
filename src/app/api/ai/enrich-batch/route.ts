

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { deal_ids: string[]; chunk_size?: number };
  const ids = Array.isArray(body.deal_ids) ? body.deal_ids : [];
  if (ids.length === 0) return NextResponse.json({ error: "deal_ids required" }, { status: 400 });
  const chunk = Math.max(20, Math.min(50, body.chunk_size ?? 25));

  const results: Array<{ total: number; succeeded: number }> = [];
  for (let i = 0; i < ids.length; i += chunk) {
    const res = await fetch(new URL("/api/ai/enrich", req.url), {
      method: "POST",
      headers: { "content-type": "application/json", cookie: req.headers.get("cookie") ?? "" },
      body: JSON.stringify({ deal_ids: ids.slice(i, i + chunk) }),
    });
    const json = await res.json();
    if (!res.ok) return NextResponse.json({ error: json.error ?? "chunk failed", chunkStart: i }, { status: res.status });
    results.push({ total: json.total ?? 0, succeeded: json.succeeded ?? 0 });
  }

  // SECURITY: scope the cleanup to the caller's OWN deals. Previously this
  // deleted every tenant's deals older than the cutoff via the service-role
  // client (cross-tenant data loss triggerable by any authenticated user).
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  await admin.from("deals").delete().eq("created_by", user.id).lt("deal_date", cutoff);

  const total = results.reduce((a, b) => a + b.total, 0);
  const succeeded = results.reduce((a, b) => a + b.succeeded, 0);
  return NextResponse.json({ chunks: results.length, total, succeeded, chunk_size: chunk });
}
