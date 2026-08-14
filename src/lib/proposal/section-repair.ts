// src/lib/proposal/section-repair.ts
//
// PHASE 7B — targeted section repair.
//
// When validateRequiredSections() rejects a generated proposal, the previous behaviour
// resent the ENTIRE prompt and regenerated the whole document. Telemetry measured that
// path at ~9,636 input tokens and ~104s per occurrence, firing on 63% of generations.
//
// This module repairs instead of regenerating: it asks only for the sections that are
// missing, with only the context those sections need, and splices them into the document
// that already passed everything else. Successful sections are never touched, and the
// SAME validator still gates the result — the quality bar is unchanged, only the cost of
// meeting it changes.
//
// The caller keeps the original full retry as a fallback, so the worst case is exactly
// today's behaviour and the best case avoids it entirely.

import type { ChatMessage } from "@/lib/ai/providers";

// validateRequiredSections reports the value bridge as a content requirement rather than
// a heading. It is repaired as its own short section so the splice stays uniform.
export const VALUE_BRIDGE_MARKER = "Value Bridge";

export function isValueBridgeItem(item: string): boolean {
  return item.startsWith(VALUE_BRIDGE_MARKER);
}

/** Headings already present, so the repair cannot duplicate them. */
export function existingHeadings(markdown: string): string[] {
  return [...markdown.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].trim());
}

/**
 * A repair reply carries only the missing sections, so the reservation is sized to those
 * rather than to a whole document. Generous per section; still a fraction of a full pass.
 */
export function repairMaxTokens(missing: string[]): number {
  return Math.min(4000, Math.max(800, missing.length * 700));
}

export function buildSectionRepairMessages(args: {
  missing: string[];
  dealModelBlock: string;
  buyer: string;
  target: string;
  sector: string;
  geography: string;
  existing: string[];
}): ChatMessage[] {
  const headings = args.missing.filter((m) => !isValueBridgeItem(m));
  const needsBridge = args.missing.some(isValueBridgeItem);

  const asks: string[] = [];
  if (headings.length) {
    asks.push(
      `Write these MISSING sections, each opening with its exact "## " heading:\n` +
      headings.map((h) => `## ${h}`).join("\n"),
    );
  }
  if (needsBridge) {
    // Phrased to satisfy the validator's exact terms. The wording is the same requirement
    // the main prompt already states; repeating it here removes any ambiguity.
    asks.push(
      `Write a "## Value Bridge" section containing one numeric sentence that uses these ` +
      `exact terms in this order: "revenue synergy", "cost synergy", "cost-to-achieve", ` +
      `then the resulting net run-rate — every figure taken from the canonical model below.`,
    );
  }

  const system =
    `You are completing a partner-grade M&A advisory document that is already written. ` +
    `Return ONLY the requested sections as Markdown — no preamble, no commentary, and do ` +
    `not restate or rewrite any section that already exists. Match the analytical depth and ` +
    `voice of a senior partner: specific, numeric, no filler.`;

  const user = [
    args.dealModelBlock,
    `Transaction: ${args.buyer} acquiring ${args.target}${args.sector ? ` in ${args.sector}` : ""}${args.geography ? ` (${args.geography})` : ""}.`,
    args.existing.length ? `Sections already written (do NOT repeat): ${args.existing.join(", ")}.` : "",
    asks.join("\n\n"),
    `Every currency figure must match the canonical model exactly. Output only the sections asked for.`,
  ].filter(Boolean).join("\n\n");

  return [
    { role: "system", stable: true, content: system },
    { role: "user", content: user },
  ];
}

/**
 * Merge repaired sections into the existing document.
 *
 * Inserted before "## Next Steps" when that exists so the document still closes on its
 * call to action; appended otherwise. Nothing already in the document is modified.
 */
export function spliceRepairedSections(original: string, repair: string): string {
  const cleaned = repair.trim();
  if (!cleaned) return original;

  // Drop anything before the first heading (stray preamble despite the instruction).
  const firstHeading = cleaned.search(/^##\s+/m);
  const body = firstHeading > 0 ? cleaned.slice(firstHeading) : cleaned;
  if (!body.trim()) return original;

  const have = new Set(existingHeadings(original).map((h) => h.toLowerCase()));
  // Keep only genuinely new sections — never let a repair overwrite existing content.
  const blocks = body
    .split(/(?=^##\s+)/m)
    .map((b) => b.trim())
    .filter(Boolean)
    .filter((b) => {
      const m = /^##\s+(.+)$/m.exec(b);
      return m ? !have.has(m[1].trim().toLowerCase()) : false;
    });
  if (!blocks.length) return original;

  const addition = blocks.join("\n\n");
  const nextSteps = original.search(/^##\s+Next Steps\s*$/m);
  if (nextSteps > 0) {
    return `${original.slice(0, nextSteps).trimEnd()}\n\n${addition}\n\n${original.slice(nextSteps)}`;
  }
  return `${original.trimEnd()}\n\n${addition}\n`;
}
