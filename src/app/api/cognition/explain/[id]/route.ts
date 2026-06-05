

/**
 * GET /api/cognition/explain/[id]
 *
 * Generates (or retrieves cached) one-paragraph executive explanation
 * for a single revision: "why did this assumption change, what does it mean".
 *
 * Cached for 7 days. Repeat opens within that window cost zero tokens.
 *
 * Free-tier friendly:
 *  - No background generation
 *  - Only runs when user explicitly requests an explanation
 *  - Cache hits are pure DB reads
 *  - Uses the smart-tier AI key already configured (resolved per existing pattern)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runAiWithMemory } from "@/lib/cognition/ai-memory";
import { userCanAccessCognitionScope } from "@/lib/auth/workspace-access";
import { labelForKey } from "@/lib/cognition/keys";
import { routedCall, type RouteConfig } from "@/lib/ai/router";
import type { ProviderId } from "@/lib/ai/providers";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: revisionId } = await params;
  const admin = createAdminClient();

  // 1. Load the revision + parent assumption
  const { data: rev, error: revErr } = await admin
    .from("cognition_revisions")
    .select("id, key, before_value, after_value, before_confidence, after_confidence, triggered_by, trigger_meta, reason, revised_at, deal_id, workspace_id")
    .eq("id", revisionId)
    .maybeSingle();

  if (revErr || !rev) {
    return NextResponse.json({ error: "Revision not found" }, { status: 404 });
  }

  // SECURITY: only explain revisions in a scope the caller owns (this runs a
  // paid AI call and reads another tenant's revision otherwise).
  if (!(await userCanAccessCognitionScope(user.id, rev.workspace_id, rev.deal_id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 2. Build a tiny context snapshot — what does the explainer need to know
  const contextSnapshot = {
    key: rev.key,
    before: rev.before_value,
    after: rev.after_value,
    before_confidence: rev.before_confidence,
    after_confidence: rev.after_confidence,
    triggered_by: rev.triggered_by,
    trigger_meta: rev.trigger_meta,
    reason: rev.reason,
  };

  // 3. Resolve smart-tier AI key (same path as other AI routes)
  const { resolveKey } = await import("@/lib/ai/key-resolver");
  let resolved = await resolveKey(admin, user.id, "smart");
  if (!resolved?.apiKey) resolved = await resolveKey(admin, user.id, "economic");
  if (!resolved?.apiKey || !resolved.provider) {
    return NextResponse.json({ error: "No AI key configured" }, { status: 400 });
  }

  // 4. Run through memory wrapper — 7-day TTL on the cache
  try {
    const result = await runAiWithMemory({
      intent: "explain_revision",
      workspaceId: rev.workspace_id,
      dealId: rev.deal_id,
      userId: user.id,
      contextSnapshot,
      prompt: buildExplanationPrompt(rev),
      ttlHours: 24 * 7,
      call: async ({ prompt }) => {
        const cfg: RouteConfig = {
          tier: "smart",
          primaryProvider: resolved!.provider as ProviderId,
          primaryKey: resolved!.apiKey!,
          primaryModel: resolved!.model ?? undefined,
          blockFreeFallback: true,
        };
        const r = await routedCall(cfg, [
          { role: "system", stable: true, content: SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ], 400);
        const inputTokens = r.inputTokens ?? 0;
        const outputTokens = r.outputTokens ?? 0;
        const costUsd = (inputTokens / 1000) * 0.001 + (outputTokens / 1000) * 0.003;
        return {
          text: r.text,
          events: [],
          provider: r.provider,
          model: r.model,
          inputTokens,
          outputTokens,
          costUsd,
          confidence: 0.7,
        };
      },
    });

    return NextResponse.json({
      revisionId,
      key: rev.key,
      explanation: result.responseText,
      fromCache: result.fromCache,
      costUsd: result.costUsd,
      provider: result.provider,
      model: result.model,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Explanation failed" }, { status: 500 });
  }
}

const SYSTEM_PROMPT = `You are an M&A partner-level intelligence assistant explaining one change in the deal model to a deal team.

Answer four things, in this order, in 3-4 sentences of flowing prose (no bullets, no headers):
1. Why this matters to the deal (the strategic significance, not just the number).
2. The valuation or integration impact of the change.
3. If it was triggered upstream, the cause in one clause.
4. The single most useful next action to consider.

Rules:
- Use the specific numbers from the data.
- Speak in business terms only — never reference system keys, fields, "assumptions", "revisions", or "propagation".
- No filler words ("essentially", "fundamentally", "leveraging", "robust", "synergistic").
- Tone: factual, concise, partner-friendly.`;

function buildExplanationPrompt(rev: any): string {
  const label = labelForKey(rev.key);
  return `A driver in the deal model just changed.

Driver: ${label}
Before: ${JSON.stringify(rev.before_value)} (confidence ${rev.before_confidence ?? "n/a"})
After:  ${JSON.stringify(rev.after_value)} (confidence ${rev.after_confidence ?? "n/a"})
Triggered by: ${rev.triggered_by}
Reason logged: ${rev.reason ?? "(none)"}
Trigger metadata: ${JSON.stringify(rev.trigger_meta ?? {})}

Explain why this matters, the valuation/integration impact, the upstream cause if any, and the recommended next action.`;
}
