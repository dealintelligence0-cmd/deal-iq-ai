/** Parse messy deal-value strings → normalized USD + currency hint.
 * Supports: $250M, €1.2B, £500k, ₹800 Cr, INR 500 crore, 5 bn, 25 lakh, etc.
 * Full intelligence engine lives in Phase 6; this is the cleansing-grade pass.
 */
export type ValueParse = {
  numericOriginal: number | null;
  currency: string | null;
  scale: string | null;
  normalizedUsd: number | null;
  confidence: number; // 0..1
};

const FX: Record<string, number> = {
  USD: 1,
  EUR: 1.08,
  GBP: 1.27,
  INR: 0.012,
  JPY: 0.0067,
  CNY: 0.14,
  AUD: 0.66,
  CAD: 0.73,
  SGD: 0.74,
};

const SYMBOL_TO_CCY: Record<string, string> = {
  "$": "USD",
  "€": "EUR",
  "£": "GBP",
  "₹": "INR",
  "¥": "JPY",
};

const MULTIPLIER: Record<string, number> = {
  k: 1e3,
  thousand: 1e3,
  m: 1e6,
  mn: 1e6,
  million: 1e6,
  mm: 1e6,
  b: 1e9,
  bn: 1e9,
  billion: 1e9,
  t: 1e12,
  tn: 1e12,
  trillion: 1e12,
  lakh: 1e5,
  lac: 1e5,
  cr: 1e7,
  crore: 1e7,
};

export function parseValue(raw: unknown): ValueParse {
  const empty: ValueParse = {
    numericOriginal: null,
    currency: null,
    scale: null,
    normalizedUsd: null,
    confidence: 0,
  };
  if (!raw) return empty;

  const s = String(raw).trim();
  if (!s) return empty;

  let text = s.replace(/,/g, " ").replace(/\s+/g, " ").trim();
  let currency: string | null = null;
  let confidence = 0.4;

  // Detect 3-letter currency code
  const ccyMatch = text.match(/\b(USD|EUR|GBP|INR|JPY|CNY|AUD|CAD|SGD)\b/i);
  if (ccyMatch) {
    currency = ccyMatch[1].toUpperCase();
    text = text.replace(ccyMatch[0], " ");
    confidence += 0.2;
  }
  // Detect symbol
  for (const sym of Object.keys(SYMBOL_TO_CCY)) {
    if (text.includes(sym)) {
      currency = currency ?? SYMBOL_TO_CCY[sym];
      text = text.replace(sym, " ");
      confidence += 0.2;
      break;
    }
  }

  text = text.trim().toLowerCase();

  // Pull number
  const numMatch = text.match(/-?\d+(?:\.\d+)?/);
  if (!numMatch) return empty;
  const numeric = parseFloat(numMatch[0]);
  if (!Number.isFinite(numeric)) return empty;
  confidence += 0.2;

  // Pull scale word (after number)
  const afterNum = text.slice(text.indexOf(numMatch[0]) + numMatch[0].length).trim();
  const scaleMatch = afterNum.match(/^([a-z]+)/);
  let scale: string | null = null;
  let multiplier = 1;
  if (scaleMatch) {
    const token = scaleMatch[1];
    if (MULTIPLIER[token] !== undefined) {
      multiplier = MULTIPLIER[token];
      scale = token;
      confidence += 0.1;
    }
  }

  // Default currency if none found
  if (!currency) currency = "USD";

  const nativeValue = numeric * multiplier;
  const fx = FX[currency] ?? 1;
  const normalizedUsd = nativeValue * fx;

  return {
    numericOriginal: numeric,
    currency,
    scale,
    normalizedUsd: Math.round(normalizedUsd * 100) / 100,
    confidence: Math.min(1, confidence),
  };
}
