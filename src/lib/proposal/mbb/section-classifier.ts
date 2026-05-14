/**
 * Heading → visual-kind classifier.
 * Pure inference from the heading string. NEVER mutates content.
 * Used by both the inline HTML renderer and the PPTX exporter so the same
 * section gets the same visual treatment across surfaces.
 */

export type SectionKind =
  | "exec_summary"
  | "thesis"
  | "score"
  | "synergy"
  | "valuation"
  | "scenario"
  | "risk"
  | "regulatory"
  | "must_be_true"
  | "contrarian"
  | "ic_questions"
  | "recommendation"
  | "market"
  | "integration"
  | "day1"
  | "hundred_day"
  | "workstream"
  | "governance"
  | "why_us"
  | "next_steps"
  | "services"
  | "engagement"
  | "transaction"
  | "tsa"
  | "diligence"
  | "sources"
  | "generic";

interface KindRule { kind: SectionKind; patterns: RegExp[] }

const RULES: KindRule[] = [
  { kind: "exec_summary",   patterns: [/executive\s+summary/i, /why\s+this\s+deal\s+matters/i, /key\s+takeaways/i] },
  { kind: "thesis",         patterns: [/deal\s+thesis/i, /strategic\s+rationale/i, /investment\s+thesis/i] },
  { kind: "score",          patterns: [/deal\s+score/i, /scorecard/i, /assessment\s+score/i] },
  { kind: "synergy",        patterns: [/synergy/i, /value\s+creation/i, /value[-\s]+at[-\s]+stake/i] },
  { kind: "valuation",      patterns: [/valuation/i, /price/i, /enterprise\s+value/i] },
  { kind: "scenario",       patterns: [/scenario/i, /sensitivity/i, /base.*upside.*downside/i] },
  { kind: "risk",           patterns: [/risk(?!ada)/i, /why\s+not/i, /contrarian.*risk/i, /downside/i] },
  { kind: "regulatory",     patterns: [/regulator/i, /antitrust/i, /compliance/i, /legal\s+considerations/i] },
  { kind: "must_be_true",   patterns: [/what\s+must\s+be\s+true/i, /pre[-\s]?conditions/i] },
  { kind: "contrarian",     patterns: [/contrarian/i, /devil'?s\s+advocate/i] },
  { kind: "ic_questions",   patterns: [/ic\s+question/i, /investment\s+committee/i, /committee\s+question/i] },
  { kind: "recommendation", patterns: [/recommendation/i, /verdict/i, /go.{0,3}no[-\s]?go/i] },
  { kind: "market",         patterns: [/market\b/i, /industry/i, /sector\s+landscape/i, /competitive\s+landscape/i] },
  { kind: "day1",           patterns: [/day[-\s]?1\b/i, /day\s+one/i] },
  { kind: "hundred_day",    patterns: [/100[-\s]?day/i, /hundred[-\s]?day/i, /first\s+100/i] },
  { kind: "integration",    patterns: [/integration/i, /pmi\b/i, /post[-\s]?merger/i] },
  { kind: "workstream",     patterns: [/workstream/i, /functional/i, /work[-\s]?plan/i] },
  { kind: "governance",     patterns: [/governance/i, /imo\b/i, /steerco/i, /operating\s+model/i] },
  { kind: "why_us",         patterns: [/why\s+us/i, /our\s+credentials/i, /our\s+team/i, /relevant\s+experience/i] },
  { kind: "next_steps",     patterns: [/next\s+steps/i, /immediate\s+actions/i, /call\s+to\s+action/i] },
  { kind: "services",       patterns: [/services\s+offered/i, /scope\s+of\s+work/i, /our\s+services/i] },
  { kind: "engagement",     patterns: [/engagement\s+model/i, /commercial\s+terms/i, /fees?\b/i] },
  { kind: "transaction",    patterns: [/transaction\s+overview/i, /deal\s+overview/i, /transaction\s+structure/i] },
  { kind: "tsa",            patterns: [/tsa\b/i, /transition\s+service/i, /service\s+catalog/i] },
  { kind: "diligence",      patterns: [/diligence/i, /due\s+dilig/i] },
  { kind: "sources",        patterns: [/^sources?$/i, /citations?/i, /references?$/i, /bibliography/i] },
];

export function classifyHeading(rawHeading: string): SectionKind {
  const h = rawHeading.replace(/^\d+\.\s*/, "").trim();
  for (const rule of RULES) {
    if (rule.patterns.some((re) => re.test(h))) return rule.kind;
  }
  return "generic";
}

// SVG-icon mapping (used in inline HTML & print). Returns inline SVG markup
// so we don't depend on icon fonts that wouldn't print reliably.
export function inlineSvgIcon(kind: SectionKind, size = 18, color = "#00A9E0"): string {
  const c = color;
  const s = size;
  const stroke = `stroke="${c}" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"`;
  const fill = `fill="${c}"`;
  switch (kind) {
    case "exec_summary":
      return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="4" width="18" height="16" rx="2" ${stroke}/><path d="M7 9h10M7 13h10M7 17h6" ${stroke}/></svg>`;
    case "thesis":
      return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2l3 6 6 .9-4.5 4.3 1 6.3L12 16.8 6.5 19.5l1-6.3L3 8.9 9 8z" ${stroke}/></svg>`;
    case "score":
      return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M3 20h18M6 20V10m6 10V4m6 16v-7" ${stroke}/></svg>`;
    case "synergy":
    case "valuation":
      return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2v20M16 6H10a3 3 0 0 0 0 6h4a3 3 0 0 1 0 6H8" ${stroke}/></svg>`;
    case "scenario":
      return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M3 17l6-6 4 4 8-8" ${stroke}/><path d="M14 7h7v7" ${stroke}/></svg>`;
    case "risk":
    case "contrarian":
      return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 3l10 18H2L12 3z" ${stroke}/><path d="M12 10v5M12 18.5v.01" ${stroke}/></svg>`;
    case "regulatory":
      return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M6 4h9l4 4v12H6z" ${stroke}/><path d="M14 4v5h5M9 14h6M9 17h6" ${stroke}/></svg>`;
    case "must_be_true":
    case "recommendation":
      return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M5 12l5 5L20 7" ${stroke}/></svg>`;
    case "ic_questions":
      return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="9" ${stroke}/><path d="M9.5 9.5a2.5 2.5 0 0 1 5 0c0 1.5-2.5 2-2.5 4M12 17.5v.01" ${stroke}/></svg>`;
    case "market":
      return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="9" ${stroke}/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" ${stroke}/></svg>`;
    case "integration":
    case "day1":
    case "hundred_day":
      return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="9" ${stroke}/><path d="M12 7v5l3 2" ${stroke}/></svg>`;
    case "workstream":
      return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="4" width="7" height="7" rx="1" ${stroke}/><rect x="14" y="4" width="7" height="7" rx="1" ${stroke}/><rect x="3" y="14" width="7" height="7" rx="1" ${stroke}/><rect x="14" y="14" width="7" height="7" rx="1" ${stroke}/></svg>`;
    case "governance":
      return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M3 21h18M5 21V10M9 21V10M13 21V10M17 21V10M21 21V10M2 10h20L12 3z" ${stroke}/></svg>`;
    case "why_us":
      return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M7 4h10v6a5 5 0 0 1-10 0z" ${stroke}/><path d="M9 20h6M12 15v5" ${stroke}/></svg>`;
    case "next_steps":
      return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M5 12h14M13 6l6 6-6 6" ${stroke}/></svg>`;
    case "services":
      return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M3 7h18M3 12h18M3 17h18" ${stroke}/><circle cx="6" cy="7" r="1" ${fill}/><circle cx="6" cy="12" r="1" ${fill}/><circle cx="6" cy="17" r="1" ${fill}/></svg>`;
    case "engagement":
      return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M9 12l2 2 4-4" ${stroke}/><path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" ${stroke}/></svg>`;
    case "transaction":
      return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M3 7h18l-3 3M21 17H3l3-3" ${stroke}/></svg>`;
    case "tsa":
      return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M5 12h14M5 12l4-4M5 12l4 4M19 12l-4-4M19 12l-4 4" ${stroke}/></svg>`;
    case "diligence":
      return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="11" cy="11" r="7" ${stroke}/><path d="M21 21l-5-5" ${stroke}/></svg>`;
    case "sources":
      return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M4 5a2 2 0 0 1 2-2h11l3 3v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" ${stroke}/><path d="M8 9h8M8 13h8M8 17h5" ${stroke}/></svg>`;
    default:
      return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="3" ${fill}/></svg>`;
  }
}
