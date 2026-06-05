/**
 * GET    /api/synergy?account=X    → load model + compute output
 * PUT    /api/synergy               → upsert model (no AI call, instant save)
 * POST   /api/synergy/narrative     → run AI to generate the math narrative
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveWorkspace } from "@/lib/workspaces/context";
import { resolveViewer } from "@/lib/auth/permissions";
import { computeSynergy, type SynergyModel } from "@/lib/synergy/compute";

export const runtime = "nodejs";

const DEFAULTS: Omit<SynergyModel, "account_name" | "buyer_name"> = {
  target_revenue_m: 150, target_ebitda_m: 20, wacc_pct: 10, one_time_cost_m: 20,
  cost_hq_ga_m: 7, cost_it_infra_m: 4, cost_procurement_m: 5, cost_facilities_m: 3, cost_other_m: 0,
  rev_cross_sell_m: 9, rev_price_opt_m: 3, rev_territory_m: 5, rev_bundling_m: 2, rev_other_m: 0,
  realize_y1_pct: 25, realize_y2_pct: 50, realize_y3_pct: 80, realize_y4_pct: 95, realize_y5_pct: 100,
};

export async function GET(req: NextRequest) {
  const sb = await createClient();
  const viewer = await resolveViewer(sb);
  if (viewer.kind === "none") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const url = new URL(req.url);
  const account = url.searchParams.get("account");
  const ws = await getActiveWorkspace(sb);

  if (account) {
    const { data } = await admin.from("synergy_models")
      .select("*").eq("workspace_id", ws.workspaceId ?? "").eq("account_name", account).maybeSingle();
    const model: SynergyModel = data ? data as any : { account_name: account, buyer_name: null, ...DEFAULTS };
    const output = computeSynergy(model);
    return NextResponse.json({ model, output, exists: Boolean(data) });
  }

  // List
  const { data } = await admin.from("synergy_models")
    .select("id, account_name, buyer_name, target_revenue_m, target_ebitda_m, total_cost_synergies_m, total_rev_synergies_m, updated_at, generated_at")
    .eq("workspace_id", ws.workspaceId ?? "")
    .order("updated_at", { ascending: false });
  return NextResponse.json({ models: data ?? [] });
}

export async function PUT(req: NextRequest) {
  const sb = await createClient();
  const viewer = await resolveViewer(sb);
  // Read-only viewers (guests) may not save synergy models.
  if (viewer.kind !== "admin" && viewer.kind !== "user") {
    return NextResponse.json({ error: "Read-only access" }, { status: 403 });
  }
  let body: Partial<SynergyModel>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.account_name) return NextResponse.json({ error: "account_name required" }, { status: 400 });

  const admin = createAdminClient();
  const ws = await getActiveWorkspace(sb);
  // Require edit rights in the active workspace before writing.
  if (!ws.workspaceId || (ws.role !== "owner" && ws.role !== "editor")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const payload = { ...DEFAULTS, ...body, workspace_id: ws.workspaceId, created_by: viewer.userId, updated_at: new Date().toISOString() };

  const { data, error } = await admin.from("synergy_models")
    .upsert(payload, { onConflict: "workspace_id,account_name" }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const output = computeSynergy(data as any);
  return NextResponse.json({ model: data, output });
}
