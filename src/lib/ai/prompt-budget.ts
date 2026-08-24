// src/lib/ai/prompt-budget.ts
//
// Budget-aware prompt assembly.
//
// PURPOSE
// Some providers cap a request at input + reserved output combined (Groq's free tier
// allows 12,000 tokens/minute for both together). A prompt that is fine on Anthropic or
// Gemini simply cannot be sent as-is. Rather than refuse the generation — or push the
// partner onto a provider they have no key for — we ASSEMBLE THE PROMPT TO FIT: keep
// everything that carries authority, and drop the derived, re-derivable context first.
//
// PRIORITY MODEL
// Every optional block declares a dropPriority. Lower numbers are sacrificed first.
// Blocks that carry authority — the canonical Deal Model, the section checklist that
// defines the document's structure, the system instruction — are simply not passed in
// as droppable, so they can never be removed by this mechanism.
//
// The result degrades gracefully: on a constrained provider the partner gets a complete
// document derived from the canonical numbers with less supporting context, instead of
// an error. On an unconstrained provider nothing is dropped at all.

const CHARS_PER_TOKEN = 4;

export function approxTokens(text: string): number {
  return Math.ceil((text || "").length / CHARS_PER_TOKEN);
}

export type PromptPart = {
  // Human-readable name, surfaced so the route can report what was omitted.
  label: string;
  text: string;
  // Lower = dropped earlier. Omit for parts that must always be kept.
  dropPriority?: number;
  // Optional shortened form tried BEFORE dropping the part entirely.
  compact?: string;
};

export type AssemblyResult = {
  text: string;
  inputTokens: number;
  dropped: string[];   // labels removed entirely
  compacted: string[]; // labels replaced by their shortened form
  fits: boolean;       // false when everything droppable is gone and it still does not fit
};

/**
 * Join parts into a single prompt that fits `maxInputTokens`.
 *
 * Order of sacrifice: compact the lowest-priority block, then the next, and only once
 * every compaction is exhausted start removing blocks outright (lowest priority first).
 * Compacting before dropping keeps as much signal as possible at every budget level.
 */
export function assembleWithinBudget(parts: PromptPart[], maxInputTokens: number): AssemblyResult {
  const dropped = new Set<string>();
  const compacted = new Set<string>();

  const render = (): string =>
    parts
      .filter((p) => !dropped.has(p.label))
      .map((p) => (compacted.has(p.label) && p.compact !== undefined ? p.compact : p.text))
      .filter((t) => t && t.trim().length > 0)
      .join("\n\n");

  const fitsNow = () => approxTokens(render()) <= maxInputTokens;
  if (fitsNow()) {
    const text = render();
    return { text, inputTokens: approxTokens(text), dropped: [], compacted: [], fits: true };
  }

  // Droppable blocks, least valuable first.
  const ladder = parts
    .filter((p) => typeof p.dropPriority === "number")
    .sort((a, b) => (a.dropPriority ?? 0) - (b.dropPriority ?? 0));

  // Pass 1 — swap in shortened forms where one was supplied.
  for (const p of ladder) {
    if (fitsNow()) break;
    if (p.compact !== undefined && approxTokens(p.compact) < approxTokens(p.text)) compacted.add(p.label);
  }

  // Pass 2 — remove blocks outright, lowest priority first.
  for (const p of ladder) {
    if (fitsNow()) break;
    dropped.add(p.label);
  }

  // Pass 3 — refill. Pass 2 stops as soon as the prompt fits, which can leave headroom
  // unused: several small low-priority blocks may have been sacrificed before the single
  // large block that actually created the overage. Walk back from most valuable to least
  // and restore anything that still fits, so the budget is spent rather than merely met.
  for (const p of [...ladder].reverse()) {
    if (!dropped.has(p.label)) continue;
    dropped.delete(p.label);
    if (!fitsNow()) {
      // Restoring the full text overflows — try the shortened form before giving up.
      if (p.compact !== undefined) {
        compacted.add(p.label);
        if (fitsNow()) continue;
        compacted.delete(p.label);
      }
      dropped.add(p.label);
    }
  }

  const text = render();
  return {
    text,
    inputTokens: approxTokens(text),
    dropped: [...dropped],
    compacted: [...compacted].filter((l) => !dropped.has(l)),
    fits: approxTokens(text) <= maxInputTokens,
  };
}
