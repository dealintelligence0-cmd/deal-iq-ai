import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { routedCall, type RouteConfig } from "@/lib/ai/router";
import type { ChatMessage, ProviderId } from "@/lib/ai/providers";

export type ProposalType =
  | "advisory" | "executive_summary" | "board_memo"
  | "investment_teaser" | "integration_blueprint" | "hundred_day_plan";

const PROPOSAL_PROMPTS: Record<ProposalType, string> = {
  advisory: `You are a senior M&A advisory partner at a top-tier investment bank. Write a professional M&A Advisory Proposal using this structure:
1. Executive Summary
2. Transaction Overview
3. Strategic Rationale
4. Our Advisory Approach
5. Indicative Timeline
6. Team & Credentials
7. Fee Proposal
8. Next Steps

Use formal consulting language. Be specific. Write ~600-800 words. Use Markdown headings.`,

  executive_summary: `You are a managing director writing an Executive Summary memo. Structure:
1. Transaction Overview
2. Key Deal Highlights
3. Strategic Value Creation
4. Risk Considerations
5. Recommendation

Write ~400-500 words. Concise, board-ready language. Use Markdown headings.`,

  board_memo: `You are a CFO preparing a Board Memo for a transaction. Structure:
1. Purpose of This Memo
2. Transaction Details
3. Strategic Fit
4. Financial Impact Assessment
5. Key Risks & Mitigants
6. Regulatory Considerations
7. Board Resolution Sought

Write ~500-700 words. Formal tone. Use Markdown headings.`,

  investment_teaser: `You are an M&A banker writing a confidential Investment Teaser. Structure:
1. Transaction Headline
2. Business Overview
3. Key Investment Highlights
4. Financial Snapshot
5. Growth Opportunities
6. Transaction Structure
7. Contact & Process

Write ~400-500 words. Marketing tone, highlighting value. Use Markdown headings.`,

  integration_blueprint: `You are an integration specialist writing a Post-Merger Integration Blueprint. Structure:
1. Integration Vision & Goals
2. Integration Office Setup
3. Day 1 Priorities
4. Workstream Breakdown (HR, IT, Finance, Ops, Culture)
5. Synergy Capture Plan
6. Communication Strategy
7. Risk & Issue Management
8. Governance Model

Write ~600-800 words. Operational, detailed. Use Markdown headings.`,

  hundred_day_plan: `You are a strategy consultant writing a 100-Day Post-Merger Action Plan. Structure:
1. Objective of the 100-Day Plan
2. Phase 1: Stabilise (Days 1-30)
3. Phase 2: Integrate (Days 31-60)
4. Phase 3: Accelerate (Days 61-100)
5. Quick Wins Checklist
6. Success Metrics & KPIs
7. Stakeholder Communication Plan

Write ~600-800 words. Action-oriented, specific tasks. Use Markdown headings.`,
};

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const {
    proposal_type, client_name, buyer, target, sector,
    geography, deal_size, notes, use_premium,
  } = await req.json() as {
    proposal_type: ProposalType;
    client_name: string; buyer: string; target: string;
    sector: string; geography: string; deal_size: string;
    notes: string; use_premium?: boolean;
  };

  if (!PROPOSAL_PROMPTS[proposal_type]) {
    return NextResponse.json({ error: "Invalid proposal_type" }, { status: 400 });
  }

  const admin = createAdminClient();

  const col_key = use_premium ? "premium_key_encrypted" : "bulk_key_encrypted";
  const col_provider = use_premium ? "premium_provider" : "bulk_provider";
  const col_model = use_premium ? "premium_model" : "bulk_model";

  const { data: settings } = await admin
    .from("ai_settings")
    .select(`${col_provider}, ${col_model}, ${col_key}`)
    .eq("user_id", user.id)
    .maybeSingle();

  let apiKey: string | null = null;
  const s = settings as Record<string, unknown> | null;
  const cipher = s?.[col_key] as string | undefined;
  if (cipher) {
    try {
      const { data: dec } = await admin.rpc("decrypt_key", { cipher });
      apiKey = dec as string | null;
    } catch { /* fallback */ }
  }

  const cfg: RouteConfig = {
    tier: use_premium ? "smart" : "fast",
    primaryProvider: (s?.[col_provider] as ProviderId) ?? "free",
    primaryKey: apiKey,
    primaryModel: s?.[col_model] as string | undefined,
  };

  const dealContext = [
    client_name && `Client / Advisory House: ${client_name}`,
    buyer      && `Buyer / Acquirer: ${buyer}`,
    target     && `Target Company: ${target}`,
    sector     && `Sector: ${sector}`,
    geography  && `Geography: ${geography}`,
    deal_size  && `Deal Size: ${deal_size}`,
    notes      && `Additional Context: ${notes}`,
  ].filter(Boolean).join("\n");

  const messages: ChatMessage[] = [
    { role: "system", content: PROPOSAL_PROMPTS[proposal_type] },
    { role: "user", content: `Generate the document for this transaction:\n\n${dealContext}` },
  ];

  try {
    const result = await routedCall(cfg, messages, 2000);

    await admin.from("proposals").insert({
      user_id: user.id, proposal_type, client_name, buyer, target,
      sector, geography, deal_size, notes,
      content: result.text, provider: result.provider,
      model: result.model, via_fallback: result.viaFallback,
    });

    return NextResponse.json({
      content: result.text,
      provider: result.provider,
      model: result.model,
      viaFallback: result.viaFallback,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
