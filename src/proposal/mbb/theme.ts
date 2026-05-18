/**
 * Deal IQ AI — Consulting-grade Visual Wrapper
 * Single source of truth for the MBB / Big4 presentation theme used by the
 * PPTX exporter, the browser print → PDF path, the inline HTML renderer, and
 * the server-side PDF route.
 *
 * Colour language:  deep navy / teal / sapphire / green
 * Reference style: McKinsey, Bain, BCG executive decks (look & feel only)
 *
 * NOTE: this file contains NO content logic. It is pure presentation tokens.
 */

// ---------------------------------------------------------------------------
// Colour palette — hex WITHOUT the leading `#` so it can be passed straight
// to pptxgenjs. The CSS helpers below add the `#` where needed.
// ---------------------------------------------------------------------------
export const MBB = {
  // Primary brand
  navy:        "051C2C", // McKinsey deep navy — covers, dividers, headers
  navyDeep:    "020D1A", // Closing slide background
  ink:         "0B2545", // Primary text on light backgrounds

  // Teal (primary accent)
  teal:        "00A9E0", // Vibrant structural teal — rules, KPIs, hero accent
  tealDark:    "0F7C8C", // Pressed / shaded teal
  tealPale:    "E6F6FB", // Card fills, table alt rows

  // Blue (secondary accent)
  blue:        "2251FF", // Sapphire — chart series, links, callouts
  blueDeep:    "0A2540", // Section divider bands
  bluePale:    "EAF0FF",

  // Green (positive / value)
  green:       "00B388", // Synergy / value-creation accent
  greenDeep:   "006F52",
  greenPale:   "E6F7F1",

  // Neutrals
  body:        "2A3340", // Body copy
  muted:       "5C6773", // Secondary text, captions, footnotes
  rule:        "D7DEE3", // 1px rules, table borders
  surface:     "F5F8FA", // Card / sidebar background
  surfaceAlt:  "EEF3F7",
  white:       "FFFFFF",

  // Status
  warn:        "C77700",
  warnPale:    "FFF4DC",
  risk:        "B5121B",
  riskPale:    "FCE8EA",
} as const;

// ---------------------------------------------------------------------------
// Typography
// Use Arial — rendered identically on Windows, Mac, Google Slides, LibreOffice.
// ---------------------------------------------------------------------------
export const FONT = {
  display: "Arial",
  body:    "Arial",
  mono:    "Consolas",
} as const;

// ---------------------------------------------------------------------------
// PPTX layout constants (LAYOUT_WIDE = 13.33 × 7.5 inches)
// ---------------------------------------------------------------------------
export const SLIDE = {
  W: 13.33,
  H: 7.5,
  // Standard margins
  marginX: 0.5,
  marginTop: 0.45,
  marginBottom: 0.55,
  // Content band (between top rule and bottom rule)
  contentTop: 1.25,
  contentBottom: 6.85,
  contentW: 12.33,
} as const;

// ---------------------------------------------------------------------------
// Brand strings
// ---------------------------------------------------------------------------
export const BRAND = {
  name: "Deal IQ AI",
  tagline: "Intelligence · Advisory · Execution",
  confidential: "CONFIDENTIAL · WORKING DRAFT",
} as const;

// ---------------------------------------------------------------------------
// CSS helpers — for HTML print, server PDF, and inline renderer
// ---------------------------------------------------------------------------
export const css = {
  // returns "#RRGGBB"
  hex: (token: keyof typeof MBB) => `#${MBB[token]}`,
};

// Convenience: a CSS variables block consumers can drop into a <style> tag so
// the print template, inline renderer, and any future surface stay aligned.
export function mbbCssVars(): string {
  return `
:root {
  --mbb-navy:      #${MBB.navy};
  --mbb-navy-deep: #${MBB.navyDeep};
  --mbb-ink:       #${MBB.ink};
  --mbb-teal:      #${MBB.teal};
  --mbb-teal-dark: #${MBB.tealDark};
  --mbb-teal-pale: #${MBB.tealPale};
  --mbb-blue:      #${MBB.blue};
  --mbb-blue-deep: #${MBB.blueDeep};
  --mbb-blue-pale: #${MBB.bluePale};
  --mbb-green:     #${MBB.green};
  --mbb-green-deep:#${MBB.greenDeep};
  --mbb-green-pale:#${MBB.greenPale};
  --mbb-body:      #${MBB.body};
  --mbb-muted:     #${MBB.muted};
  --mbb-rule:      #${MBB.rule};
  --mbb-surface:   #${MBB.surface};
  --mbb-surface-alt:#${MBB.surfaceAlt};
  --mbb-warn:      #${MBB.warn};
  --mbb-warn-pale: #${MBB.warnPale};
  --mbb-risk:      #${MBB.risk};
  --mbb-risk-pale: #${MBB.riskPale};
}
`.trim();
}
