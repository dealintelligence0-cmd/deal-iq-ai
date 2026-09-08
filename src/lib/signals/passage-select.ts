// src/lib/signals/passage-select.ts
//
// PHASE 7F — document processing: spend the filing budget on the passages that can
// actually carry a signal, and skip the call entirely when none can.
//
// TWO PROBLEMS THIS SOLVES
//
// 1) THE BUDGET WAS SPENT ON THE WRONG PART OF THE DOCUMENT.
//    buildUserPrompt() took content.slice(0, 24_000) while its comment claimed it
//    "focuses on the most signal-dense sections". Taking the FIRST 24K characters does
//    not do that. An SEC 10-K opens with a cover page, table of contents, Item 1
//    Business and Item 1A Risk Factors; MD&A, results of operations and leadership
//    changes — where margin pressure, transformation and succession signals actually
//    appear — come much later. The same is true of UK annual reports and Indian
//    exchange filings, which open with statutory front matter.
//
//    Note this fix does not DEPEND on that claim. Selecting the highest-density
//    passages is at least as good as taking the head under ANY distribution: if a
//    document really does carry its signals up front, those leading windows score
//    highest and are selected anyway. The head-slice is only ever equal or worse.
//
// 2) SOME FILINGS CANNOT PRODUCE A SIGNAL AT ALL.
//    Every signal the prompt defines requires an evidence_quote that is "word-for-word
//    from the filing". A document containing no vocabulary from any of the five
//    categories has nothing to quote, so any signal returned for it would be ungrounded
//    — exactly what the prompt forbids. Those calls can be skipped.
//
// WHY THE VOCABULARY IS DELIBERATELY BROAD
// A missed signal is a missed advisory opportunity — a real quality loss, unlike the
// provable no-ops eliminated in Phases 7D/7E. So the gate is tuned to almost never
// fire: a SINGLE hit anywhere in the document, from any category, sends it to the
// model. In practice most 10-Ks will trip several terms and be processed exactly as
// before; the skip is a safety net for genuinely bland documents (a routine coupon
// notice, an administrative 8-K), not a broad filter.
//
// Passage text is sliced VERBATIM and never rewritten, so evidence_quote stays
// word-for-word quotable from the original filing.

/** Terms per signal category, mirroring the five the extractor prompt defines. */
const CATEGORY_TERMS: Record<string, string[]> = {
  margin_pressure: [
    "margin", "cost", "expense", "efficiency", "restructur", "headcount", "layoff",
    "redundanc", "savings", "inflation", "pricing pressure", "gross profit",
    "operating income", "operating loss", "impairment", "write-down", "writedown",
    "cost base", "overhead", "profitability", "decline in revenue", "shortfall",
  ],
  transformation_pressure: [
    "erp", "sap", "oracle", "cloud", "digital", "migration", "modernis", "moderniz",
    "legacy system", "technology debt", "technical debt", "transformation", "automation",
    "it system", "platform upgrade", "system implementation", "digitis", "digitiz",
  ],
  activist_activity: [
    "activist", "shareholder proposal", "board nominee", "proxy contest", "proxy fight",
    "governance", "strategic review", "schedule 13d", "13d", "requisition", "dissident",
    "stewardship", "board representation", "shareholder letter",
  ],
  acquisition_intent: [
    "acquisition", "acquire", "merger", "divest", "carve-out", "carve out", "disposal",
    "portfolio review", "capital allocation", "bolt-on", "joint venture", "stake sale",
    "transaction", "letter of intent", "definitive agreement", "tender offer",
    "strategic alternatives", "spin-off", "spinoff", "demerger",
  ],
  leadership_change: [
    "chief executive", "chief financial", "chief operating", "ceo", "cfo", "coo",
    "chairman", "chairperson", "resign", "appoint", "succession", "interim",
    "step down", "stepped down", "departure", "board change", "managing director",
    "retire", "transition of leadership",
  ],
};

export type VocabularyScan = {
  /** False only when NO category has any lexical presence — then the call is skipped. */
  present: boolean;
  /** Categories with at least one hit, for telemetry and debugging. */
  categories: string[];
};

/**
 * Does this document contain anything any of the five categories could quote?
 *
 * Conservative by construction: one hit from one category anywhere in the text is
 * enough to send the filing to the model.
 */
export function scanSignalVocabulary(text: string): VocabularyScan {
  const hay = (text || "").toLowerCase();
  const categories: string[] = [];
  for (const [category, terms] of Object.entries(CATEGORY_TERMS)) {
    if (terms.some((t) => hay.includes(t))) categories.push(category);
  }
  return { present: categories.length > 0, categories };
}

// Large enough that a selected passage carries its own context rather than arriving as
// a stranded fragment; small enough that eight of them fit the existing 24K budget.
const WINDOW_CHARS = 3_000;

// Marks a gap so the model does not read two non-adjacent passages as continuous text.
const GAP_MARKER = "\n\n[… section omitted …]\n\n";

/**
 * Choose which parts of a long filing to send, within the same character budget.
 *
 * Documents at or under the budget are returned UNCHANGED — short filings behave
 * exactly as before. Longer ones are scored in windows by how many distinct category
 * terms each contains, the best windows are kept, and they are re-joined in original
 * document order so the narrative still reads forwards.
 */
export function selectSignalPassages(text: string, budgetChars = 24_000): string {
  const content = text || "";
  if (content.length <= budgetChars) return content;

  const windows: Array<{ start: number; text: string; score: number }> = [];
  for (let i = 0; i < content.length; i += WINDOW_CHARS) {
    const slice = content.slice(i, i + WINDOW_CHARS);
    const hay = slice.toLowerCase();
    let score = 0;
    for (const terms of Object.values(CATEGORY_TERMS)) {
      // Count DISTINCT terms rather than total occurrences, so one word repeated
      // fifty times cannot outrank a passage that genuinely spans several themes.
      for (const t of terms) if (hay.includes(t)) score++;
    }
    windows.push({ start: i, text: slice, score });
  }

  // Highest scoring first; ties broken by earlier position so the head of the document
  // still wins when nothing distinguishes the candidates.
  const ranked = [...windows].sort((a, b) => (b.score - a.score) || (a.start - b.start));

  const chosen: typeof windows = [];
  let used = 0;
  for (const w of ranked) {
    const cost = w.text.length + (chosen.length ? GAP_MARKER.length : 0);
    if (used + cost > budgetChars) continue;
    chosen.push(w);
    used += cost;
  }

  // Nothing scored and nothing fit — fall back to the original head slice rather than
  // sending an empty prompt.
  if (chosen.length === 0) return content.slice(0, budgetChars);

  chosen.sort((a, b) => a.start - b.start);

  // Only mark a gap where one actually exists (selected windows can be adjacent).
  let out = "";
  let prevEnd = -1;
  for (const w of chosen) {
    if (out && w.start !== prevEnd) out += GAP_MARKER;
    out += w.text;
    prevEnd = w.start + w.text.length;
  }
  return out;
}
