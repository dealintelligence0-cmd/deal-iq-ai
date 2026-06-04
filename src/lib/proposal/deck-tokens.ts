/**
 * Deal IQ AI — Consulting-grade deck design tokens.
 *
 * SINGLE SOURCE OF TRUTH for the upgraded PPTX proposal output.
 * Every hex value, font size, and layout coordinate used by the consulting-grade
 * deck templates lives here. Do NOT inline hex strings or magic numbers anywhere
 * in `deck-templates.ts` or `pptx-exporter.ts` — import these constants instead.
 *
 * Canvas is 16:9 at 10.0" × 5.625" (PptxGenJS LAYOUT_16x9 / standard widescreen),
 * matching the reference consulting deck.
 *
 * Semantic colours (risk = red, warning = amber, success = green) are fixed and
 * MUST NOT be re-skinned by any theme/colour-plate logic.
 */

export const DECK_TOKENS = {
  navy:    "0D1B3E",
  navyMd:  "1E3A6E",
  teal:    "0D9488",
  tealLt:  "E6F7F5",
  gray50:  "F8FAFC",
  gray200: "E2E8F0",
  gray400: "94A3B8",
  text:    "1E293B",
  muted:   "64748B",
  white:   "FFFFFF",
  steelBl: "B0C4DE",
  amber:   "D97706",
  amberLt: "FEF3C7",
  red:     "B91C1C",
  redLt:   "FEE2E2",
  green:   "059669",
  greenLt: "D1FAE5",
} as const;

export const DECK_FONTS = {
  face:         "Calibri",
  titleSize:    20,
  sectionSize:  10,
  bodySize:     10.5,
  bulletSize:   9.5,
  metricSize:   22,
  footnoteSize: 7.5,
} as const;

export const DECK_LAYOUT = {
  W: 10.0,
  H: 5.625,
  marginX: 0.38,
  sectionBarH: 0.52,
  titleY: 0.62,
  contentTop: 1.1,
} as const;

/**
 * Semantic colour resolver for risk probability bands. These map to the FIXED
 * semantic palette and are never affected by brand/theme colour plates.
 */
export function probabilityBand(pct: number): { fill: string; light: string } {
  if (pct >= 20) return { fill: DECK_TOKENS.red, light: DECK_TOKENS.redLt };
  if (pct >= 11) return { fill: DECK_TOKENS.amber, light: DECK_TOKENS.amberLt };
  return { fill: DECK_TOKENS.green, light: DECK_TOKENS.greenLt };
}

export type DeckToken = keyof typeof DECK_TOKENS;
