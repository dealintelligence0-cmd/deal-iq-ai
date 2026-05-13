

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { routedCall, type RouteConfig } from "@/lib/ai/router";
import type { ChatMessage, ProviderId } from "@/lib/ai/providers";
import { normalizePrompt, buildRateLimitErrorMsg } from "@/lib/ai/utils";
import { getOrSeed, dealModelToPromptBlock } from "@/lib/intelligence/deal-model";
import { buildComparablesBlock } from "@/lib/intelligence/comparables";

/**
 * POST /api/ai/proposal/regenerate-section
 *
 * Regenerates a single ## heading section of an existing proposal,
 * preserving the rest of the document and the canonical deal model.
 *
 * Body: {
 *   deal_id?: string,
 *   buyer: string, target: string, sector: string, geography: string, deal_size: string,
 *   full_content: string,        // the current proposal markdown
 *   section_heading: string,     // e.g. "Why NOT This Deal" (without the ## prefix)
 *   user_instructions?: string,  // optional partner-supplied steering for the regen
 *   tier?: "premium" | "economic",
 *   key_id?: string,
 *   model_override?: string,
 * }
 *
 * Returns: { section_heading, new_section_markdown, full_content_updated, provider, model }
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { checkRateLimit } = await import("@/lib/security");
  const allowed = await checkRateLimit(supabase, "ai_section_regen", 30, 60);
  if (!allowed) return NextResponse.json({ error: buildRateLimitErrorMsg(30, 60) }, { status: 429 });

  const body = await req.json() as {
    deal_id?: string;
    buyer?: string; target?: string; sector?: string; geography?: string; deal_size?: string;
    full_content?: string;
    section_heading?: string;
    user_instructions?: string;
    tier?: "premium" | "economic";
    key_id?: string;
    model_override?: string;
  };

  const buyer = normalizePrompt(body.buyer ?? "", 200);
  const target = normalizePrompt(body.target ?? "", 200);
  const sector = normalizePrompt(body.sector ?? "", 100);
  const geography = normalizePrompt(body.geography ?? "", 100);
  const deal_size = normalizePrompt(body.deal_size ?? "", 50);
  const full = body.full_content ?? "";
  const heading = (body.section_heading ?? "").trim();
  const instructions = normalizePrompt(body.user_instructions ?? "", 1500);
  const tier = body.tier ?? "premium";

  if (!full) return NextResponse.json({ error: "full_content is required" }, { status: 400 });
  if (!heading) return NextResponse.json({ error: "section_heading is required" }, { status: 400 });

  // Locate the section in the markdown. We allow optional "N." numbering before the heading.
  const sectionRegex = new RegExp(
    `(^|\\n)##\\s+(?:\\d+\\.\\s+)?${escapeRegex(heading)}\\s*\\n([\\s\\S]*?)(?=\\n##\\s+|$)`,
    "i",
  );
  const match = full.match(sectionRegex);
  if (!match) {
    return NextResponse.json({
      error: `Section "${heading}" not found in document. Make sure the heading begins with "## " and matches exactly.`,
    }, { status: 400 });
  }
  const existingSectionBody = match[2].trim();

  // Pull surrounding sections for context (the 1 before + 1 after, capped at 1500 chars each).
  const allSections = full.split(/\n##\s+/).filter(Boolean);
  let prevContext = "";
  let nextContext = "";
  for (let i = 0; i < allSections.length; i++) {
    const lines = allSections[i].split("\n");
    const h = lines[0].replace(/^\d+\.\s+/, "").trim();
    if (h.toLowerCase() === heading.toLowerCase()) {
      if (i > 0) prevContext = "## " + allSections[i - 1].slice(0, 1500);
      if (i < allSections.length - 1) nextContext = "## " + allSections[i + 1].slice(0, 1500);
      break;
    }
  }

  // Resolve API key via the same multi-key library every other AI route uses.
  const admin = createAdminClient();
  const { resolveKey } = await import("@/lib/ai/key-resolver");
  const resolved = await resolveKey(admin, user.id, tier === "economic" ? "economic" : "smart", body.key_id);

  if (!resolved.apiKey || resolved.provider === "free") {
    return NextResponse.json({
      error: "No AI provider configured. Open Settings → API Key Library and save a key.",
    }, { status: 400 });
  }

  const cfg: RouteConfig = {
    tier: "smart",
    primaryProvider: resolved.provider as ProviderId,
    primaryKey: resolved.apiKey,
    primaryModel: body.model_override || resolved.model || undefined,
    blockFreeFallback: true,
  };

  // Load the canonical deal model so the regenerated section stays coherent with the rest.
  let dealModelBlock = "";
  if (body.deal_id) {
    try {
      const dm = await getOrSeed(supabase, {
        deal_id: body.deal_id,
        user_id: user.id,
        buyer, target, sector, geography,
        deal_size_input: deal_size,
      });
      dealModelBlock = dealModelToPromptBlock(dm);
    } catch { /* non-fatal — section regen still works without deal model */ }
  }

  const comparablesBlock = buildComparablesBlock(sector, geography, 5);

  const systemPrompt = `You are an MBB senior partner regenerating ONE section of an existing M&A advisory proposal.

CRITICAL RULES:
1. Output ONLY the new content for the requested section. Do NOT include the "## ${heading}" heading itself — that stays. Do NOT regenerate any other section.
2. Keep currency, deal totals, and named entities (buyer / target / comparables / regulators) identical to the canonical deal model and surrounding sections. Inconsistency across sections will be rejected.
3. The new section must FIT INTO the surrounding document — same voice, same level of specificity, same currency, same named acquirer/target.
4. Follow the partner's instructions if any are provided. If no instructions, produce a cleaner, more numerically-dense version of the existing content.
5. NEVER use these phrases: leverage, robust, world-class, best-in-class, create value, transform, seamless, innovative (as adjective), drive (as outcome verb), unlock, holistic, scalable (without naming the constraint), strategic (as filler), actionable, data-driven (as self-description). Replace each with the underlying specific.
6. Active voice. Numbered claims. Named owners (CFO, General Counsel, Head of Integration — never "the team"). Each $ figure followed by its "so what".
7. Length: roughly match the existing section's word count unless the partner instructions call for shorter or longer.`;

  const userMessage = `# DEAL CONTEXT
Buyer: ${buyer}
Target: ${target}
Sector: ${sector}
Geography: ${geography}
Deal size: ${deal_size}

${dealModelBlock}

${comparablesBlock}

# DOCUMENT POSITION

Previous section (DO NOT REWRITE — for context only):
${prevContext || "(none — this is the first section)"}

--- CURRENT SECTION TO REGENERATE ---
## ${heading}
${existingSectionBody}
--- END CURRENT SECTION ---

Next section (DO NOT REWRITE — for context only):
${nextContext || "(none — this is the last section)"}

# PARTNER INSTRUCTIONS
${instructions || "(none — produce a tighter, more specific, more numerically-grounded version that flows from the previous section into the next)"}

# YOUR TASK
Output the new content of the section ABOVE (between --- markers). Do not include the "## ${heading}" heading line — only the body. Do not output any other section. Do not add a preamble or explanation. Output the body directly.`;

  const messages: ChatMessage[] = [
    { role: "system", stable: true, content: systemPrompt },
    { role: "user", content: userMessage },
  ];

  try {
    // Same Groq TPM guard as the other AI routes
    const estimatedTokens = messages.reduce((acc, m) => acc + Math.ceil(m.content.length / 4), 0);
    if (cfg.primaryProvider === "groq" && estimatedTokens > 11000 && cfg.primaryModel?.includes("70b")) {
      cfg.primaryModel = "llama-3.1-8b-instant";
    }

    const result = await routedCall(cfg, messages, 2500);
    if (result.provider === "free" || result.model === "rules-v1") {
      return NextResponse.json({
        error: `Section regeneration failed. Provider: ${cfg.primaryProvider}/${cfg.primaryModel ?? "auto"}.`,
      }, { status: 500 });
    }

    // Strip any leading heading the model accidentally produced, plus stray ``` fences.
    let newBody = result.text.trim()
      .replace(new RegExp(`^##\\s+(?:\\d+\\.\\s+)?${escapeRegex(heading)}\\s*\\n+`, "i"), "")
      .replace(/^```(?:markdown|md)?\s*\n?/, "")
      .replace(/\n?```\s*$/, "")
      .trim();

    // Splice the new body back into the full document, preserving the heading line.
    const updated = full.replace(sectionRegex, (whole, leading) => {
      // Preserve the exact original heading line (with numbering if any)
      const headingLineMatch = whole.match(/^\n?##\s+[^\n]+/);
      const headingLine = headingLineMatch ? headingLineMatch[0].replace(/^\n/, "") : `## ${heading}`;
      return `${leading || "\n"}${headingLine}\n${newBody}\n`;
    });

    return NextResponse.json({
      section_heading: heading,
      new_section_markdown: newBody,
      full_content_updated: updated,
      provider: result.provider,
      model: result.model,
      viaFallback: result.viaFallback,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
