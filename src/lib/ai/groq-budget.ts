// src/lib/ai/groq-budget.ts
//
// Groq tokens-per-minute (TPM) budgeting.
//
// WHY THIS EXISTS
// Groq charges a request against its TPM allowance as:
//     input tokens  +  the max_completion_tokens you RESERVE
// not just the input. A 10,192-token prompt asking to reserve 8,000 output tokens is
// an 18,192-token request and is rejected by the free tier's 12,000 TPM cap with a
// 413 — even though the prompt itself is well under the limit.
//
// This is why "swap to a smaller model" does not fix a 413: the reservation, not the
// model, is what overflows the budget (and the smaller Groq models do not carry a
// larger TPM allowance). The only things that help are sending less input or
// reserving less output.
//
// This helper trims the RESERVATION to fit the remaining budget, and when that would
// leave too little room to produce a usable document it says so plainly instead of
// letting the provider return a raw 413 the partner cannot act on.

import type { ChatMessage } from "@/lib/ai/providers";

// Free ("on_demand") tier allowance for the Llama models this app routes to.
// Groq publishes this per-model; 12,000 matches llama-3.3-70b-versatile.
export const GROQ_FREE_TPM = 12000;

// Headroom for the fact that chars/4 is an approximation and Groq counts template
// and role scaffolding we do not model exactly.
const SAFETY_MARGIN = 600;

export function estimateMessageTokens(messages: ChatMessage[]): number {
  return messages.reduce((acc, m) => acc + Math.ceil((m.content || "").length / 4), 0);
}

export type GroqBudgetResult =
  | { ok: true; maxTokens: number; trimmed: boolean }
  | { ok: false; message: string; inputTokens: number; available: number };

/**
 * Fit a request into Groq's TPM allowance.
 *
 * Non-Groq providers pass straight through unchanged — this must never alter routing
 * or limits for Anthropic/OpenAI/Gemini/etc.
 *
 * @param minUsefulOutput Below this many output tokens the result would be a truncated
 *   fragment rather than a usable document, so we fail fast with guidance instead.
 */
export function fitGroqTokenBudget(args: {
  provider: string;
  messages: ChatMessage[];
  requestedMaxTokens: number;
  minUsefulOutput: number;
  moduleLabel: string;
}): GroqBudgetResult {
  if (args.provider !== "groq") {
    return { ok: true, maxTokens: args.requestedMaxTokens, trimmed: false };
  }

  const inputTokens = estimateMessageTokens(args.messages);
  const available = GROQ_FREE_TPM - inputTokens - SAFETY_MARGIN;

  if (available >= args.requestedMaxTokens) {
    return { ok: true, maxTokens: args.requestedMaxTokens, trimmed: false };
  }

  if (available >= args.minUsefulOutput) {
    // Enough room for a complete, if tighter, document — reserve exactly what fits.
    return { ok: true, maxTokens: available, trimmed: true };
  }

  return {
    ok: false,
    inputTokens,
    available,
    message:
      `This ${args.moduleLabel} needs about ${inputTokens.toLocaleString()} tokens of context, ` +
      `which leaves too little of Groq's free-tier ${GROQ_FREE_TPM.toLocaleString()} tokens/minute ` +
      `allowance to write a complete document (Groq counts your prompt AND the reserved response ` +
      `against the same limit).\n\n` +
      `Three ways forward:\n` +
      `• Use a different provider for this tier — OpenAI gpt-4.1-mini, Google gemini-2.5-flash, ` +
      `or DeepSeek all have far larger limits and comparable cost. Set one as your ` +
      `Economic default in Settings → API Key Library.\n` +
      `• Upgrade Groq to Dev Tier at console.groq.com/settings/billing.\n` +
      `• Shorten the input — trim the notes field or reduce attached research context.\n\n` +
      `Groq remains a good fit for shorter modules; it is this document's context size that ` +
      `does not fit the free tier.`,
  };
}
