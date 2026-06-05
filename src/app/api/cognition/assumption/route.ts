

/**
 * GET  /api/cognition/assumption?workspace_id=&deal_id=&key=
 *      → { value, confidence, source, lastRevisedAt }
 *      If not found, returns 404 (caller can fall back to a module default).
 *
 * PUT  /api/cognition/assumption
 *      body: { workspace_id, deal_id, key, value, unit?, currency?, confidence?, reason? }
 *      Writes assumption + revision; fires propagation rules; returns the saved row
 *      AND any downstream revisions that fired.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { reviseAssumption, getAssumption } from "@/lib/cognition/orchestrator";
import { userCanAccessCognitionScope } from "@/lib/auth/workspace-access";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const workspaceId = url.searchParams.get("workspace_id");
  const dealId = url.searchParams.get("deal_id");
  const key = url.searchParams.get("key");

  if (!key) return NextResponse.json({ error: "key is required" }, { status: 400 });

  // SECURITY: the orchestrator reads via the service-role client, so verify the
  // caller actually owns the requested workspace/deal scope.
  if (!(await userCanAccessCognitionScope(user.id, workspaceId, dealId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const a = await getAssumption(workspaceId || null, dealId || null, key);
  if (!a) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({
    key: a.key,
    value: a.value_numeric ?? a.value_text ?? a.value_json,
    valueNumeric: a.value_numeric,
    valueText: a.value_text,
    valueJson: a.value_json,
    unit: a.unit,
    currency: a.currency,
    confidence: a.confidence,
    source: a.source,
    lastRevisedAt: a.last_revised_at,
    revisionCount: a.revision_count,
  });
}

export async function PUT(req: NextRequest) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  if (!body.key) return NextResponse.json({ error: "key is required" }, { status: 400 });

  // SECURITY: verify the caller owns the workspace/deal scope before writing.
  if (!(await userCanAccessCognitionScope(user.id, body.workspace_id ?? null, body.deal_id ?? null, { write: true }))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Normalize value: caller can pass either { value: 42 } or { valueNumeric/valueText/valueJson }
  let valueNumeric: number | null = body.valueNumeric ?? null;
  let valueText: string | null = body.valueText ?? null;
  let valueJson: any = body.valueJson ?? null;
  if (body.value !== undefined && valueNumeric === null && valueText === null && valueJson === null) {
    if (typeof body.value === "number") valueNumeric = body.value;
    else if (typeof body.value === "string") valueText = body.value;
    else valueJson = body.value;
  }

  try {
    const { assumption, revision, propagatedRevisions } = await reviseAssumption({
      workspaceId: body.workspace_id ?? null,
      dealId: body.deal_id ?? null,
      key: body.key,
      valueNumeric, valueText, valueJson,
      unit: body.unit,
      currency: body.currency,
      confidence: body.confidence,
      source: body.source ?? "user",
      sourceRunId: body.source_run_id ?? null,
      triggeredBy: body.triggered_by ?? "user_edit",
      triggerMeta: body.trigger_meta ?? { user_id: user.id },
      reason: body.reason,
    });

    return NextResponse.json({
      assumption,
      revision,
      propagatedRevisions,
      noChange: revision === null,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Write failed" }, { status: 500 });
  }
}
