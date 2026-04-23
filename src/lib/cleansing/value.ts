/** Deal Value Intelligence Engine — position-based parser. */

export type ValueIntelligence = {
  numericOriginal: number | null;
  currency: string | null;
  scale: string | null;
  nativeValue: number | null;
  normalizedUsd: number | null;
  stakeDetected: number | null;
  impliedHundredPctUsd: number | null;
  isRange: boolean;
  isApprox: boolean;
  confidence: number;
  reasoning: string[];
};

const FX: Record<string, number> = {
  USD: 1, EUR: 1.08, GBP: 1.27, INR: 0.012, JPY: 0.0067,
  CNY: 0.14, AUD: 0.66, CAD: 0.73, SGD: 0.74, CHF: 1.13, HKD: 0.128,
};

// Longest symbols first so "HK$" beats "$"
const SYMBOLS: Array<[string, string]> = [
  ["hk$", "HKD"], ["a$", "AUD"], ["c$", "CAD"], ["s$", "SGD"],
  ["$", "USD"], ["€", "EUR"], ["£", "GBP"], ["₹", "INR"], ["¥", "JPY"],
];

// Longest scale words first for greedy matching
const SCALES: Array<[string, number, string]> = [
  ["trillion", 1e12, "t"],
  ["billions", 1e9, "b"], ["billion", 1e9, "b"],
  ["millions", 1e6, "m"], ["million", 1e6, "m"],
  ["thousand", 1e3, "k"],
  ["crores", 1e7, "cr"], ["crore", 1e7, "cr"],
  ["lakhs", 1e5, "lakh"], ["lakh", 1e5, "lakh"], ["lacs", 1e5, "lakh"], ["lac", 1e5, "lakh"],
  ["tn", 1e12, "t"], ["bn", 1e9, "b"], ["mn", 1e6, "m"], ["mm", 1e6, "m"],
  ["cr", 1e7, "cr"],
  ["t", 1e12, "t"], ["b", 1e9, "b"], ["m", 1e6, "m"], ["k", 1e3, "k"],
];

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
  let work = original.toLowerCase().replace(/,/g, "");

  const isApprox = /^(~|approx|about|c\.|circa)/.test(work) || work.includes("≈");
  if (isApprox) reasoning.push("Approx indicator");

  // 1) Extract inline stake FIRST (so "for 49%" doesn't pollute number parsing)
  let stakeDetected: number | null = null;
  const stakePatterns = [
    /for\s+(\d+(?:\.\d+)?)\s*%/,
    /\((\d+(?:\.\d+)?)\s*%\)/,
    /(\d+(?:\.\d+)?)\s*%\s*(?:stake|holding|ownership|share|interest)/,
  ];
  for (const pat of stakePatterns) {
    const m = work.match(pat);
    if (m) {
      const s = parseFloat(m[1]);
      if (s > 0 && s <= 100) {
        stakeDetected = s;
        reasoning.push(`Inline stake: ${s}%`);
        work = work.replace(m[0], " ");
        break;
      }
    }
  }

  // 2) Detect currency (ISO code or symbol)
  let currency: string | null = null;
  const isoMatch = work.match(/\b(usd|eur|gbp|inr|jpy|cny|aud|cad|sgd|chf|hkd|rs|rupees?)\b/);
  if (isoMatch) {
    const tok = isoMatch[1];
    currency = tok === "rs" || tok.startsWith("rupee") ? "INR" : tok.toUpperCase();
    work = work.replace(isoMatch[0], " ");
    reasoning.push(`Currency code: ${currency}`);
  } else {
    for (const [sym, ccy] of SYMBOLS) {
      if (work.includes(sym)) {
        currency = ccy;
        work = work.split(sym).join(" ");
        reasoning.push(`Symbol: ${sym} → ${ccy}`);
        break;
      }
    }
  }

  // 3) Detect range BEFORE extracting number
  const isRange = /(\d[\d.]*)\s*[-–—]\s*(\d[\d.]*)/.test(work) ||
                  /(\d[\d.]*)\s+to\s+(\d[\d.]*)/.test(work);
  if (isRange) reasoning.push("Range detected — midpoint");

// 4) Extract numbers — strip the range dash first so "-" isn't read as sign
  const scanText = isRange ? work.replace(/[-–—]/g, " ") : work;
  const numMatches = scanText.match(/\d+(?:\.\d+)?/g);
  if (!numMatches || numMatches.length === 0) return empty;

  let numeric: number;
  if (isRange && numMatches.length >= 2) {
    numeric = (parseFloat(numMatches[0]) + parseFloat(numMatches[1])) / 2;
  } else {
    numeric = parseFloat(numMatches[0]);
  }
  if (!Number.isFinite(numeric)) return empty;

// 5) Find the character AFTER the last number — that's where scale lives
  const lastNum = numMatches[numMatches.length - 1];
  const lastIdx = scanText.lastIndexOf(lastNum);
  const afterNum = scanText.slice(lastIdx + lastNum.length).trim();

  let multiplier = 1;
  let scale: string | null = null;
  for (const [word, mul, canon] of SCALES) {
    if (afterNum.startsWith(word)) {
      const nextChar = afterNum.charAt(word.length);
      // word boundary: end-of-string OR non-letter
      if (nextChar === "" || !/[a-z]/.test(nextChar)) {
        multiplier = mul;
        scale = canon;
        reasoning.push(`Scale: ${word} × ${mul.toExponential()}`);
        break;
      }
    }
  }

  // 6) Default currency if still unknown
  if (!currency) {
    currency = (scale === "cr" || scale === "lakh") ? "INR" : "USD";
    reasoning.push(`Currency defaulted → ${currency}`);
  }

  const nativeValue = numeric * multiplier;
  const fx = FX[currency] ?? 1;
  const normalizedUsd = Math.round(nativeValue * fx * 100) / 100;
  reasoning.push(`Native ${currency} ${nativeValue.toLocaleString()} · USD ${normalizedUsd.toLocaleString()}`);

  let impliedHundredPctUsd: number | null = null;
  if (stakeDetected && stakeDetected > 0 && stakeDetected < 100) {
    impliedHundredPctUsd = Math.round((normalizedUsd / (stakeDetected / 100)) * 100) / 100;
    reasoning.push(`Implied 100%: USD ${impliedHundredPctUsd.toLocaleString()}`);
  } else if (stakeDetected === 100) {
    impliedHundredPctUsd = normalizedUsd;
  }

  let confidence = 0.3;
  if (currency) confidence += 0.25;
  if (scale) confidence += 0.2;
  if (stakeDetected !== null) confidence += 0.1;
  if (!isRange && !isApprox) confidence += 0.1;
  if (nativeValue > 0 && nativeValue < 1e15) confidence += 0.05;

  return {
    numericOriginal: numeric,
    currency,
    scale,
    nativeValue,
    normalizedUsd,
    stakeDetected,
    impliedHundredPctUsd,
    isRange,
    isApprox,
    confidence: Math.min(1, confidence),
    reasoning,
  };
}

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

export function formatUsd(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—";
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}
