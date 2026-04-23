/** Deal Value Intelligence Engine
 *  Parses messy transaction values into normalized USD + implied 100% valuation.
 *  Pure function, no side-effects. Used by cleansing engine + detail pages.
 */

export type ValueIntelligence = {
  numericOriginal: number | null;   // the number before scaling (250 for "$250M")
  currency: string | null;          // ISO code detected (USD, INR, EUR, GBP, JPY, CNY, AUD, CAD, SGD)
  scale: string | null;             // m, b, t, cr, lakh, k
  nativeValue: number | null;       // numeric * scale in source currency
  normalizedUsd: number | null;     // EV in USD at current FX
  stakeDetected: number | null;     // 0–100 if parsed inline ("for 49%")
  impliedHundredPctUsd: number | null; // normalized_usd / (stake/100) if stake known
  isRange: boolean;                 // true if "$1–2B" was detected
  isApprox: boolean;                // true if "~", "about", "c." prefix
  confidence: number;               // 0..1
  reasoning: string[];              // human-readable trace for debugging
};

const FX: Record<string, number> = {
  USD: 1, EUR: 1.08, GBP: 1.27, INR: 0.012, JPY: 0.0067,
  CNY: 0.14, AUD: 0.66, CAD: 0.73, SGD: 0.74, CHF: 1.13, HKD: 0.128,
};

const SYMBOL_TO_CCY: Record<string, string> = {
  "$": "USD", "€": "EUR", "£": "GBP", "₹": "INR", "¥": "JPY",
  "A$": "AUD", "C$": "CAD", "S$": "SGD", "HK$": "HKD", "CHF": "CHF",
};

const MULTIPLIER: Record<string, { value: number; canonical: string }> = {
  k: { value: 1e3, canonical: "k" }, thousand: { value: 1e3, canonical: "k" },
  m: { value: 1e6, canonical: "m" }, mm: { value: 1e6, canonical: "m" },
  mn: { value: 1e6, canonical: "m" }, million: { value: 1e6, canonical: "m" }, millions: { value: 1e6, canonical: "m" },
  b: { value: 1e9, canonical: "b" }, bn: { value: 1e9, canonical: "b" },
  billion: { value: 1e9, canonical: "b" }, billions: { value: 1e9, canonical: "b" },
  t: { value: 1e12, canonical: "t" }, tn: { value: 1e12, canonical: "t" },
  trillion: { value: 1e12, canonical: "t" },
  lakh: { value: 1e5, canonical: "lakh" }, lac: { value: 1e5, canonical: "lakh" }, lacs: { value: 1e5, canonical: "lakh" }, lakhs: { value: 1e5, canonical: "lakh" },
  cr: { value: 1e7, canonical: "cr" }, crore: { value: 1e7, canonical: "cr" }, crores: { value: 1e7, canonical: "cr" },
};

/** Main parser. Handles stake inline. */
export function parseValueIntelligence(raw: unknown): ValueIntelligence {
  const empty: ValueIntelligence = {
    numericOriginal: null, currency: null, scale: null,
    nativeValue: null, normalizedUsd: null,
    stakeDetected: null, impliedHundredPctUsd: null,
    isRange: false, isApprox: false, confidence: 0, reasoning: [],
  };
  if (!raw) return empty;

  const original = String(raw).trim();
  if (!original) return empty;

  const reasoning: string[] = [];
  let text = original.toLowerCase();

  // Detect approx
  const isApprox = /^(~|approx|about|c\.|circa)/i.test(original.trim()) ||
                   original.includes("~") || original.includes("≈");
  if (isApprox) reasoning.push("Approx indicator detected");

  // Detect range: pick midpoint
  const isRange = /(\d[\d.]*)\s*[-–—to]\s*(\d[\d.]*)/i.test(text);
  if (isRange) reasoning.push("Range detected — using midpoint");

  // Extract inline stake ("for 49%", "49% stake", "(49%)")
  let stakeDetected: number | null = null;
  const stakePatterns = [
    /for\s+(\d+(?:\.\d+)?)\s*%/i,
    /(\d+(?:\.\d+)?)\s*%\s*(?:stake|holding|ownership|share|interest)/i,
    /\((\d+(?:\.\d+)?)\s*%\)/,
  ];
  for (const pat of stakePatterns) {
    const m = original.match(pat);
    if (m) {
      const s = parseFloat(m[1]);
      if (s > 0 && s <= 100) {
        stakeDetected = s;
        reasoning.push(`Inline stake: ${s}%`);
        text = text.replace(m[0].toLowerCase(), " ");
        break;
      }
    }
  }

  // Currency: ISO code wins over symbol
  let currency: string | null = null;
  const isoMatch = text.match(/\b(usd|eur|gbp|inr|jpy|cny|aud|cad|sgd|chf|hkd|rs\.?|rupees?)\b/i);
  if (isoMatch) {
    const tok = isoMatch[1].toLowerCase().replace(".", "");
    currency = tok === "rs" || tok === "rupee" || tok === "rupees" ? "INR" : tok.toUpperCase();
    text = text.replace(isoMatch[0], " ");
    reasoning.push(`Currency code: ${currency}`);
  } else {
    for (const sym of Object.keys(SYMBOL_TO_CCY)) {
      if (original.includes(sym)) {
        currency = SYMBOL_TO_CCY[sym];
        text = text.replace(sym.toLowerCase(), " ");
        reasoning.push(`Symbol: ${sym} → ${currency}`);
        break;
      }
    }
  }

  // Extract number (midpoint if range)
  const numMatches = text.match(/-?\d+(?:\.\d+)?/g);
  if (!numMatches || numMatches.length === 0) return empty;

  let numeric: number;
  if (isRange && numMatches.length >= 2) {
    const lo = parseFloat(numMatches[0]);
    const hi = parseFloat(numMatches[1]);
    numeric = (lo + hi) / 2;
  } else {
    numeric = parseFloat(numMatches[0]);
  }
  if (!Number.isFinite(numeric)) return empty;

  // Scale word after the number
  let scale: string | null = null;
  let multiplier = 1;
  const scaleMatch = text.match(/\b(k|m|mn|mm|bn|b|t|tn|thousand|million|millions|billion|billions|trillion|lakh|lac|lacs|lakhs|cr|crore|crores)\b/i);
  if (scaleMatch) {
    const tok = scaleMatch[1].toLowerCase();
    const mul = MULTIPLIER[tok];
    if (mul) {
      multiplier = mul.value;
      scale = mul.canonical;
      reasoning.push(`Scale: ${tok} × ${mul.value.toExponential()}`);
    }
  }

  if (!currency) {
    currency = (scale === "cr" || scale === "lakh") ? "INR" : "USD";
    reasoning.push(`Currency defaulted → ${currency}`);
  }

  const nativeValue = numeric * multiplier;
  const fx = FX[currency] ?? 1;
  const normalizedUsd = Math.round(nativeValue * fx * 100) / 100;
  reasoning.push(`Native: ${currency} ${nativeValue.toLocaleString()} · USD ${normalizedUsd.toLocaleString()}`);

  let impliedHundredPctUsd: number | null = null;
  if (stakeDetected && stakeDetected > 0 && stakeDetected < 100) {
    impliedHundredPctUsd = Math.round((normalizedUsd / (stakeDetected / 100)) * 100) / 100;
    reasoning.push(`Implied 100%: USD ${impliedHundredPctUsd.toLocaleString()}`);
  } else if (stakeDetected === 100) {
    impliedHundredPctUsd = normalizedUsd;
  }

  // Confidence scoring
  let confidence = 0.3;
  if (isoMatch || Object.keys(SYMBOL_TO_CCY).some((s) => original.includes(s))) confidence += 0.25;
  if (scale) confidence += 0.2;
  if (stakeDetected !== null) confidence += 0.1;
  if (!isRange && !isApprox) confidence += 0.1;
  if (nativeValue > 0 && nativeValue < 1e15) confidence += 0.05;
  confidence = Math.min(1, confidence);

  return {
    numericOriginal: numeric, currency, scale,
    nativeValue, normalizedUsd,
    stakeDetected, impliedHundredPctUsd,
    isRange, isApprox, confidence, reasoning,
  };
}

/** Backward-compatible wrapper used by the cleansing engine (Phase 5). */
export function parseValue(raw: unknown) {
  const r = parseValueIntelligence(raw);
  return {
    numericOriginal: r.numericOriginal,
    currency: r.currency,
    scale: r.scale,
    normalizedUsd: r.normalizedUsd,
    confidence: r.confidence,
  };
}

/** Pretty-print helper for the UI. */
export function formatUsd(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—";
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}
