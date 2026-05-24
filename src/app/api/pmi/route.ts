/**
 * GET    /api/pmi?account=X   → playbook + tasks + checklist
 * GET    /api/pmi              → list playbooks
 * POST   /api/pmi              → create new playbook { account_name, buyer_name?, sector?, geography? }
 * PATCH  /api/pmi/task         → update task { id, progress_pct? title? start_week? end_week? }
 * PATCH  /api/pmi/checklist    → update checklist { id, done?, notes? }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveWorkspace } from "@/lib/workspaces/context";
import { resolveKey } from "@/lib/ai/key-resolver";
import { resolveViewer } from "@/lib/auth/permissions";
import { generatePMI, defaultPMI } from "@/lib/pmi/generate";
import type { ProviderId } from "@/lib/ai/providers";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function GET(req: NextRequest) {
  const sb = await createClient();
  const viewer = await resolveViewer(sb);
  if (viewer.kind === "none") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const url = new URL(req.url);
  const account = url.searchParams.get("account");
  const ws = await getActiveWorkspace(sb);

  if (account) {
    const { data: pb } = await admin.from("pmi_playbooks")
      .select("*").eq("workspace_id", ws.workspaceId ?? "").eq("account_name", account).maybeSingle();
    if (!pb) return NextResponse.json({ playbook: null, tasks: [], checklist: [] });
    const [tasksR, checkR] = await Promise.all([
      admin.from("pmi_tasks").select("*").eq("playbook_id", (pb as any).id).order("sort_order").order("start_week"),
      admin.from("pmi_checklist").select("*").eq("playbook_id", (pb as any).id).order("phase").order("sort_order"),
    ]);
    return NextResponse.json({ playbook: pb, tasks: tasksR.data ?? [], checklist: checkR.data ?? [] });
  }

  const { data } = await admin.from("pmi_playbooks")
    .select("id, account_name, buyer_name, total_weeks, current_week, updated_at, generated_at")
    .eq("workspace_id", ws.workspaceId ?? "").order("updated_at", { ascending: false });
  return NextResponse.json({ playbooks: data ?? [] });
}

export async function POST(req: NextRequest) {
  const sb = await createClient();
  const viewer = await resolveViewer(sb);
  if (viewer.kind === "none") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { account_name?: string; buyer_name?: string; sector?: string; geography?: string; use_ai?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.account_name?.trim()) return NextResponse.json({ error: "account_name required" }, { status: 400 });

  const admin = createAdminClient();
  const ws = await getActiveWorkspace(sb);
  const userId = viewer.kind === "guest" ? null : (viewer as any).userId;

  // Check existing
  const { data: existing } = await admin.from("pmi_playbooks")
    .select("id").eq("workspace_id", ws.workspaceId ?? "").eq("account_name", body.account_name).maybeSingle();
  if (existing) return NextResponse.json({ error: "Playbook already exists for this account. Open it from the list." }, { status: 409 });

  // Generate plan (AI or default)
  let plan: { tasks: any[]; checklist: any[]; cost_usd?: number; provider?: string | null; model?: string | null; error?: string | null };
  if (body.use_ai) {
    let resolved = await resolveKey(admin, userId ?? "00000000-0000-0000-0000-000000000000", "smart");
    if (!resolved?.apiKey) resolved = await resolveKey(admin, userId ?? "", "economic");
    if (!resolved?.apiKey || !resolved.provider) {
      plan = { ...defaultPMI() };
    } else {
      const routeConfig = {
        tier: "smart" as const,
        primaryProvider: resolved.provider as ProviderId,
        primaryKey: resolved.apiKey,
        primaryModel: resolved.model ?? undefined,
        blockFreeFallback: true,
      };
      plan = await generatePMI(routeConfig, body.account_name, body.buyer_name ?? null, body.sector ?? null, body.geography ?? null);
    }
  } else {
    plan = { ...defaultPMI() };
  }

  // Insert playbook
  const { data: pb, error: pbErr } = await admin.from("pmi_playbooks").insert({
    workspace_id: ws.workspaceId, created_by: userId,
    account_name: body.account_name, buyer_name: body.buyer_name ?? null,
    generated_at: new Date().toISOString(),
  }).select().single();
  if (pbErr) return NextResponse.json({ error: pbErr.message }, { status: 500 });

  // Insert tasks + checklist
  const tasksWithMeta = plan.tasks.map((t, i) => ({ ...t, playbook_id: (pb as any).id, sort_order: i, progress_pct: 0 }));
  const checkWithMeta = plan.checklist.map((c, i) => ({ ...c, playbook_id: (pb as any).id, sort_order: i, done: false }));
  if (tasksWithMeta.length) await admin.from("pmi_tasks").insert(tasksWithMeta);
  if (checkWithMeta.length) await admin.from("pmi_checklist").insert(checkWithMeta);

  return NextResponse.json({ ok: true, playbook: pb, tasks_count: tasksWithMeta.length, checklist_count: checkWithMeta.length, ai_error: plan.error });
}
