/**
 * GET  /api/narratives          → list narratives for current viewer
 * GET  /api/narratives?account=X → fetch single by account name
 * POST /api/narratives          → generate (or regenerate) for { account_name }
 *
 * Supports both authed users (workspace-scoped) and guest sessions (invite-scoped).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveKey } from "@/lib/ai/key-resolver";
import { resolveViewer } from "@/lib/auth/permissions";
import { getActiveWorkspace } from "@/lib/workspaces/context";
import { generateNarrative, type NarrativeInputs } from "@/lib/narratives/generate";
import type { ProviderId } from "@/lib/ai/providers";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Build the scope filter for the current viewer (workspace_id for authed + guest session). */
function viewerScope(viewer: { kind: string; userId?: string }, workspaceId: string | null): { col: string; value: string } | null {
  if (workspaceId) return { col: "workspace_id", value: workspaceId };
  if (viewer.kind === "user" || viewer.kind === "admin") {
    return { col: "created_by", value: (viewer as any).userId };
  }
  return null;
}

export async function GET(req: NextRequest) {
  const sb = await createClient();
  const viewer = await resolveViewer(sb);
  if (viewer.kind === "none") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const url = new URL(req.url);
  const account = url.searchParams.get("account");
  const ws = await getActiveWorkspace(sb);
  const scope = viewerScope(viewer, ws.workspaceId);

  if (account) {
    let q = admin.from("account_narratives")
      .select("*")
      .eq("account_name", account)
      .eq("status", "active");
    if (scope) q = q.eq(scope.col, scope.value);
    else if (viewer.kind === "user" || viewer.kind === "admin") {
      // No workspace → scope by created_by
      q = q.eq("created_by", viewer.userId!);
    }
    const { data } = await q.maybeSingle();
    return NextResponse.json({ narrative: data ?? null });
  }

  let q = admin.from("account_narratives")
    .select("id, account_name, exec_summary, signals_referenced, themes_referenced, boltons_referenced, advisors_referenced, deals_referenced, generated_at, ai_provider, ai_model")
    .eq("status", "active")
    .order("generated_at", { ascending: false });
  if (scope) q = q.eq(scope.col, scope.value);
  else if (viewer.kind === "user" || viewer.kind === "admin") {
    q = q.eq("created_by", viewer.userId!);
  }
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message, narratives: [] }, { status: 500 });
  return NextResponse.json({ narratives: data ?? [] });
}

export async function POST(req: NextRequest) {
  const sb = await createClient();
  const viewer = await resolveViewer(sb);
  if (viewer.kind === "none") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { account_name?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.account_name?.trim()) return NextResponse.json({ error: "account_name required" }, { status: 400 });

  const account = body.account_name.trim();
  const ws = await getActiveWorkspace(sb);
  const adminClient = createAdminClient();

  // Identify whose AI keys to use:
  //   - admin/user: their own user_id
  //   - guest: admin's user_id (guests share the admin's AI keys)
  let keyOwnerId: string;
  if (viewer.kind === "admin" || viewer.kind === "user") {
    keyOwnerId = viewer.userId!;
  } else {
    // Guest — find the system admin and use their keys
    const { data: adminUser } = await adminClient
      .from("users").select("id").eq("is_admin", true).limit(1).maybeSingle();
    if (!adminUser) return NextResponse.json({ error: "No admin configured" }, { status: 500 });
    keyOwnerId = adminUser.id as string;
  }

  let resolved = await resolveKey(adminClient, keyOwnerId, "smart");
  if (!resolved?.apiKey) resolved = await resolveKey(adminClient, keyOwnerId, "economic");
  if (!resolved?.apiKey) resolved = await resolveKey(adminClient, keyOwnerId, "fast");
  if (!resolved?.apiKey || !resolved.provider) {
    return NextResponse.json({ error: "No AI key configured" }, { status: 400 });
  }
  const routeConfig = {
    tier: "smart" as const,
    primaryProvider: resolved.provider as ProviderId,
    primaryKey: resolved.apiKey,
    primaryModel: resolved.model ?? undefined,
    blockFreeFallback: true,
  };

  // Collect inputs. For guests, scope to admin user's data; for users, scope to themselves.
  const dataOwnerId = keyOwnerId;

  const deals = await adminClient.from("canonical_deals")
    .select("buyer, target, dominant_sector, dominant_geography, intelligence_size, heading, deal_date")
    .eq("created_by", dataOwnerId)
    .is("superseded_by", null).eq("is_digest", false).eq("needs_review", false)
    .or(`buyer.ilike.${account},target.ilike.${account}`)
    .order("deal_date", { ascending: false, nullsFirst: false })
    .limit(8);

  const signals = await adminClient.from("executive_signals")
    .select("signal_type, severity, headline, evidence_quote, context, watchlist_companies!inner(company_name)")
    .eq("created_by", dataOwnerId)
    .eq("status", "active")
    .ilike("watchlist_companies.company_name", account)
    .order("created_at", { ascending: false })
    .limit(8);

  const themes = await adminClient.from("themes")
    .select("display_name, strategic_summary, sectors, active_buyers")
    .eq("created_by", dataOwnerId)
    .eq("status", "active");

  const relevantThemes = (themes.data ?? []).filter((t: any) =>
    Array.isArray(t.active_buyers) && t.active_buyers.some((b: string) => b?.toLowerCase().includes(account.toLowerCase()))
  ).slice(0, 4);

  const boltonShortlist = await adminClient.from("bolt_on_shortlists")
    .select("id, refreshed_at")
    .eq("created_by", dataOwnerId)
    .eq("status", "active")
    .ilike("buyer_name", account)
    .order("refreshed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let boltons: NarrativeInputs["boltons"] = [];
  if (boltonShortlist.data) {
    const { data: targets } = await adminClient.from("bolt_on_targets")
      .select("target_name, target_sector, fit_score, strategic_rationale")
      .eq("shortlist_id", (boltonShortlist.data as any).id)
      .neq("status", "dismissed")
      .order("fit_score", { ascending: false })
      .limit(6);
    boltons = (targets ?? []).map((t: any) => ({
      target: t.target_name, sector: t.target_sector,
      fit: t.fit_score, rationale: t.strategic_rationale,
    }));
  }

  const advisors = await adminClient.from("deal_advisors")
    .select("role, side, advisor_registry!inner(display_name, tier), canonical_deals!inner(buyer, target)")
    .eq("created_by", dataOwnerId);
  const relevantAdvisors = (advisors.data ?? []).filter((a: any) => {
    const d = a.canonical_deals;
    return d && ((d.buyer ?? "").toLowerCase() === account.toLowerCase()
              || (d.target ?? "").toLowerCase() === account.toLowerCase());
  }).slice(0, 6).map((a: any) => ({
    advisor: a.advisor_registry.display_name,
    tier: a.advisor_registry.tier,
    role: a.role, side: a.side,
  }));

  const input: NarrativeInputs = {
    account_name: account,
    deals: (deals.data ?? []).map((d: any) => ({
      buyer: d.buyer, target: d.target,
      sector: d.dominant_sector, geo: d.dominant_geography,
      size: d.intelligence_size, heading: d.heading,
      date: d.deal_date,
    })),
    signals: (signals.data ?? []).map((s: any) => ({
      type: s.signal_type, severity: s.severity, headline: s.headline,
      quote: s.evidence_quote, context: s.context,
    })),
    themes: relevantThemes.map((t: any) => ({
      name: t.display_name, summary: t.strategic_summary, sectors: t.sectors ?? [],
    })),
    boltons,
    advisors: relevantAdvisors,
  };

  const result = await generateNarrative(routeConfig, input);

  // Decide scope: workspace for authed, invite for guest
  const isGuest = viewer.kind === "guest";
  const payload: Record<string, unknown> = {
    account_name: account,
    exec_summary: result.exec_summary,
    strategic_situation: result.strategic_situation,
    signal_summary: result.signal_summary,
    theme_relevance: result.theme_relevance,
    bolt_on_summary: result.bolt_on_summary,
    advisor_landscape: result.advisor_landscape,
    pitch_angle: result.pitch_angle,
    recommended_next_steps: result.recommended_next_steps,
    signals_referenced: input.signals.length,
    themes_referenced: input.themes.length,
    boltons_referenced: input.boltons.length,
    advisors_referenced: input.advisors.length,
    deals_referenced: input.deals.length,
    ai_provider: result.provider,
    ai_model: result.model,
    cost_usd: result.cost_usd,
    generated_at: new Date().toISOString(),
    status: "active",
  };
  if (isGuest) {
    // Guests use their virtual session workspace
    payload.workspace_id = ws.workspaceId;
    payload.created_by = null;
    payload.invite_id = null;
  } else {
    // Regular users: workspace_id if in a shared workspace, else null
    payload.workspace_id = ws.workspaceId;
    payload.created_by = (viewer as any).userId;
    payload.invite_id = null;
  }

  // Always use workspace_id scope (works for both guests + authed users)
  const { data: saved, error: upErr } = await adminClient
    .from("account_narratives")
    .upsert(payload, { onConflict: "workspace_id,account_name" })
    .select()
    .single();

  if (upErr) {
    return NextResponse.json({ error: `Narrative save failed: ${upErr.message}`, ai_error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    ok: !result.error,
    narrative: saved,
    counts: {
      deals: input.deals.length, signals: input.signals.length,
      themes: input.themes.length, boltons: input.boltons.length,
      advisors: input.advisors.length,
    },
    cost_usd: result.cost_usd,
    error: result.error,
  });
}
