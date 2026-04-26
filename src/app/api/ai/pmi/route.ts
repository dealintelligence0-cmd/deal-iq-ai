import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { routedCall, type RouteConfig } from "@/lib/ai/router";
import type { ChatMessage, ProviderId } from "@/lib/ai/providers";
import { buildIndustryContextBlock, getSynergyBenchmark, matchSector } from "@/lib/intelligence/industry";
import { normalizePrompt, injectDealContext } from "@/lib/ai/utils";
import { estimateCost } from "@/lib/ai/cost-estimator";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { checkRateLimit } = await import("@/lib/security");
  const allowed = await checkRateLimit(supabase, "ai_pmi", 10, 60);
  if (!allowed) return NextResponse.json({ error: "Rate limit: 10 requests per minute" }, { status: 429 });

 const body = await req.json() as {
    buyer?: string; target?: string; sector?: string; geography?: string;
    deal_size?: string; synergy_ambition?: string; key_risks?: string;
    public_private?: string; listed?: string; known_issues?: string;
    tsa_needed?: boolean; cross_border?: boolean; notes?: string;
    output_mode?: string;
    tier?: "premium" | "economic" | "offline";
  };
  const tier = body.tier ?? "premium";

  const {
    buyer = "", target = "", sector = "", geography = "",
    deal_size = "", synergy_ambition = "medium", key_risks = "",
    public_private = "private", listed = "unlisted", known_issues = "",
    tsa_needed = false, cross_border = false, notes = "",
  } = body;

  const matchedSector = matchSector(sector);
  const bench = getSynergyBenchmark(sector);
  const industryCtx = buildIndustryContextBlock(sector, geography);
  const dealCtx = injectDealContext({
    buyer, target, sector, geography,
    dealSize: deal_size, notes: normalizePrompt(notes, 1000),
  });

const admin = createAdminClient();
  const { data: settings } = await admin
    .from("ai_settings")
    .select("premium_provider, premium_model, premium_key_encrypted, economic_provider, economic_model, economic_key_encrypted, bulk_provider, bulk_model, bulk_key_encrypted")
    .eq("user_id", user.id)
    .maybeSingle();

  const provCol = tier === "economic" ? "economic_provider" : "premium_provider";
  const modelCol = tier === "economic" ? "economic_model" : "premium_model";
  const keyCol = tier === "economic" ? "economic_key_encrypted" : "premium_key_encrypted";

  const s = settings as Record<string, unknown> | null;
  let apiKey: string | null = null;
  const cipher = (s?.[keyCol] ?? s?.bulk_key_encrypted) as string | undefined;
  if (cipher) {
    try {
      const { data: dec } = await admin.rpc("decrypt_key", { cipher });
      apiKey = dec as string | null;
    } catch { /* fallback */ }
  }

  const selectedProv = (s?.[provCol] ?? s?.bulk_provider) as string | null | undefined;
  if (!apiKey || !selectedProv || selectedProv === "free") {
    return NextResponse.json({
      error: `${tier === "economic" ? "Economic" : "Smart"}-tier AI provider not configured. Open Settings, save an API key for ${tier} tier.`,
    }, { status: 400 });
  }

  const cfg: RouteConfig = {
    tier: "smart",
    primaryProvider: (selectedProv as ProviderId) ?? "free",
    primaryKey: apiKey,
    primaryModel: (s?.[modelCol] ?? s?.bulk_model) as string | undefined,
  };
  // Sector-specific functional emphasis (prevents generic output)
  const sectorFunctions: Record<string, string[]> = {
    "Technology, Media & Telecom": ["Product & Engineering", "Cloud & Infra", "GTM & Sales", "Customer Success", "Data & Analytics", "Talent (engineering retention)"],
    "Financial Services": ["Risk & Compliance", "Core Platform / IT", "Treasury & Capital", "Branch / Channel", "Customer Onboarding", "Regulatory Reporting"],
    "Life Sciences & Healthcare": ["R&D Portfolio", "Regulatory Affairs", "Clinical Operations", "Manufacturing & Supply", "Quality (QMS)", "Commercial / Payer"],
    "Industrials & Manufacturing": ["Plant Footprint", "Procurement & Supply Chain", "Operations / Lean", "EHS", "Engineering / NPI", "Logistics"],
    "Consumer": ["Brand & Marketing", "Store / Channel", "Supply Chain & Inventory", "Pricing & Promotion", "Digital / E-comm", "Category Management"],
    "Energy & Resources": ["Asset Operations", "HSE", "Capex Portfolio", "Trading & Hedging", "Supply Chain", "Workforce / Contractors"],
    "Government & Public Sector": ["Procurement (GovCon)", "Compliance & Audit", "Service Delivery", "IT Modernization", "Workforce", "Stakeholder Mgmt"],
  };
  const fns = sectorFunctions[matchedSector] || sectorFunctions["Technology, Media & Telecom"];

  const systemPrompt = `You are an MBB Post-Merger Integration partner. You are NOT writing a sales pitch. You are NOT writing a deal proposal. You are writing the EXECUTION PLAYBOOK that the IMO Lead will follow Day 1 onward.

DIFFERENTIATION FROM PROPOSAL DOCUMENTS:
- A proposal asks "should we do this deal?" — YOUR job is "now that we've signed, HOW do we execute?"
- Skip strategic rationale, deal thesis, "why us" sections — those belong in proposals.
- Every section must be EXECUTION-FOCUSED with named owners, dates, and measurable outcomes.

ABSOLUTE RULES:
1. NO generic phrases. Every plan item must reference ${matchedSector}-specific operations: ${fns.join(", ")}.
2. Functional plans must be tailored: a SaaS PMI focuses on engineering org, ARR retention, GTM rationalization — NOT on plant footprint or procurement category management.
3. Cross-function dependencies must be explicitly mapped (e.g., "HR cannot announce org structure until Finance completes payroll integration → blocks Day 31").
4. KPI tree must link every workstream to a $ synergy outcome from the synergy benchmark range (cost: ${Math.round(bench.costLow*100)}–${Math.round(bench.costHigh*100)}% of EV; rev: ${Math.round(bench.revLow*100)}–${Math.round(bench.revHigh*100)}% of EV).
5. ${cross_border ? "CROSS-BORDER: include data residency, multi-jurisdiction labor consultation, FX hedging, transfer pricing as explicit workstreams." : ""}
6. ${tsa_needed ? "TSA REQUIRED: include TSA exit milestones in the dependency map; standalone capability ramp must be tracked weekly." : ""}
7. ${listed === "listed" ? "Target is LISTED: add disclosure cadence + market reaction management to communications workstream." : ""}

MANDATORY OUTPUT STRUCTURE — exact ## headings, in this order:

## Integration Strategy & Operating Model
- Integration philosophy (full absorption / best-of-both / hold-separate / standalone) — pick one with rationale
- Target operating model: org structure, decision rights, reporting lines (not generic — specific to ${matchedSector})
- Day-1 governance: IMO charter, SteerCo composition, escalation paths

## Functional Integration Plans
For EACH function below, provide a 4-row mini-table (Workstream Lead | Day-1 Priorities | 30-Day Milestone | 100-Day Outcome):
${fns.map((f, i) => `${i+1}. ${f}`).join("\n")}

## Cross-Function Dependency Map
Table: Predecessor | Successor | Dependency Type | Critical Path? | Slack (days)
MINIMUM 8 dependencies. Show which workstreams cannot start until others complete.

## Day-0 / Day-1 / 100-Day Plan (Execution-Grade)
Three sub-tables with date-anchored deliverables:
### Day 0 (Sign to Close)
| Action | Owner | Deadline | Output |

### Day 1 (Close)
| Action | Owner | Hour | Output |

### Days 2-100
| Wave (Days) | Action | Owner | KPI |
Cover Days 1-30 (Stabilize) / 31-60 (Integrate) / 61-100 (Accelerate) — minimum 4 actions per wave.

## KPI Tree (Synergy → Workstream → Metric)
Hierarchical table linking every $ synergy commitment to a specific workstream metric and weekly tracking owner.
Format: Synergy Bucket → Workstream → Leading Indicator → Lagging Indicator → Owner → Weekly Target

## Risk Register & Mitigation
Table: Risk | Workstream | Probability (%) | $ Impact | Early Warning Signal | Mitigation Owner | Trigger Action
MINIMUM 8 risks — sector-specific, not generic. Include known issue: "${known_issues || "none flagged"}".

## IMO Operating Cadence
- Daily standup (Days 1-30): who, when, format
- Weekly workstream reviews: tracker, escalation triggers
- Bi-weekly SteerCo: agenda, materials, decisions
- Monthly Board update: KPI dashboard, synergy capture vs plan

QUALITY CONTROL:
- Total length 1200-1800 words
- Every owner is a specific role (not "the team")
- Every milestone has a date or day-number
- Zero generic strategy filler
- Output should be directly executable by an IMO PMO`;

  const userPrompt = [
    dealCtx,
    industryCtx,
    `Synergy ambition: ${synergy_ambition}`,
    `Public/Private: ${public_private} · ${listed}`,
    `Cross-border: ${cross_border ? "YES" : "NO"} · TSA needed: ${tsa_needed ? "YES" : "NO"}`,
    key_risks ? `Client-flagged risks: ${key_risks}` : "",
    known_issues ? `Known issues: ${known_issues}` : "",
  ].filter(Boolean).join("\n");

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  try {
    const result = await routedCall(cfg, messages, 6000);
   if (result.provider === "free" || result.model === "rules-v1") {
      return NextResponse.json({
        error: `PMI AI failed. Real reason: ${result.lastError ?? "unknown"}. Provider: ${cfg.primaryProvider}/${cfg.primaryModel ?? "auto"}.`,
      }, { status: 500 });
    }

    const inputTokens = result.inputTokens ?? 0;
    const outputTokens = result.outputTokens ?? 0;
    const { cost } = estimateCost(result.provider, inputTokens, outputTokens);

    await admin.from("ai_outputs").insert({
      user_id: user.id,
      module: "pmi",
      buyer, target, sector, geography, deal_size,
      tier, provider: result.provider, model: result.model,
      input_tokens: inputTokens, output_tokens: outputTokens, cost_estimate_usd: cost,
      content: result.text,
      meta: {
        synergy_ambition, public_private, listed,
        tsa_needed, cross_border, output_mode: body.output_mode ?? "narrative",
        key_risks, known_issues,
      },
    });

    return NextResponse.json({
      content: result.text,
      provider: result.provider,
      model: result.model,
      viaFallback: result.viaFallback,
      tokens: { input: inputTokens, output: outputTokens, cost },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
