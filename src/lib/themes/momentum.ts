

/**
 * Theme momentum scoring (shared by the radar UI and the refresh pipeline).
 *
 * velocity_score is not populated in the data, so momentum is derived from the
 * signals that are: the theme's heat tier plus its deal-count density relative
 * to the densest theme in the comparison set. Pure function — safe on client
 * and server. Single source of truth so the radar and the cognition write agree.
 */

export const HEAT_BASE: Record<string, number> = { hot: 72, warm: 50, cool: 30 };

export function computeMomentum(heat: string, dealCount: number, maxDealCount: number): number {
  const base = HEAT_BASE[heat] ?? 40;
  const density = maxDealCount > 0 ? 28 * (dealCount / maxDealCount) : 0;
  return Math.min(100, Math.round(base + density));
}

/**
 * Portfolio momentum signal fed into the cognition layer (theme.momentum_score).
 * Uses the lead (highest-momentum) theme — a decline here is the meaningful
 * trigger for revisiting buyer prioritization.
 */
export function portfolioMomentum(themes: Array<{ heat: string; dealCount: number }>): number | null {
  if (themes.length === 0) return null;
  const maxDeal = Math.max(1, ...themes.map((t) => t.dealCount));
  return Math.max(...themes.map((t) => computeMomentum(t.heat, t.dealCount, maxDeal)));
}
