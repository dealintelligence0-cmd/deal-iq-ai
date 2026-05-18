/**
 * Deal IQ AI — MBB-grade scoring rubric.
 *
 * The previous scoring was opaque heuristic. Senior MBB/Big4 partners need
 * scores they can defend to a managing partner. This module produces:
 *
 *   priority_score  (0..100)  "How urgently should we work this?"
 *   advisory_score  (0..100)  "How much advisory wallet is here?"
 *   risk_score      (0..100)  "How likely is this to fall apart / consume team time?"
 *
 * Plus three READABLE reason strings + an itemised breakdown that we surface
 * on hover so partners see exactly which factors contributed.
 *
 * Rubrics encode the partner's actual decision logic. Sources:
 *   - corpdev.ai / midaxo / Mergermarket pursuit playbooks
 *   - MBB practice methodology for "deal triage": Size × Sector × Stage × Stake × Cross-border × Strategic-fit
 *   - Pre/post-deal advisory revenue heuristics: deal size × complexity × buyer sophistication
 */

import type { Deal } from "@/lib/analytics";

// ============================================================================
// FACTOR DEFINITIONS — each is a named contribution with explicit weight
// ============================================================================

export type ScoreFactor = {
  name: string;
  value: string;          // what the factor evaluated to (e.g. "$1.4bn", "cross-border", "takeover")
  points: number;         // how much it added (can be negative for risk)
  rationale: string;      // one-line "why" a partner would say out loud
};

export type ScoreBreakdown = {
  total: number;
  factors: ScoreFactor[];
  band: "PURSUE" | "WATCH" | "PASS";
  summary: string;        // one-line summary suitable for an at-a-glance tooltip
};

// ============================================================================
// SIZE BAND DERIVATION
// ============================================================================

/** Map Mergermarket bucket / USD value → deal size band. */
function sizeBand(valueUsd: number | null, valueRaw: string | null): { band: string; points: number; label: string } {
  if (valueRaw === "> INR 21bn" || (valueUsd != null && valueUsd >= 250_000_000)) {
    return { band: "mega", points: 30, label: ">$250m" };
  }
  if (valueRaw === "INR 4bn-21bn" || (valueUsd != null && valueUsd >= 50_000_000)) {
    return { band: "large", points: 22, label: "$50m–$250m" };
  }
  if (valueRaw === "INR 2bn-4bn" || (valueUsd != null && valueUsd >= 20_000_000)) {
    return { band: "mid", points: 14, label: "$20m–$50m" };
  }
  if (valueRaw === "INR 400m-2bn" || (valueUsd != null && valueUsd >= 5_000_000)) {
    return { band: "small", points: 8, label: "$5m–$20m" };
  }
  return { band: "micro", points: 4, label: "<$5m" };
}

// ============================================================================
// SECTOR HEAT — which sectors are MBB advisory pipelines hottest in right now
// ============================================================================

const SECTOR_HEAT: Record<string, number> = {
  // Hot sectors (high advisory wallet, lots of cross-border)
  "Technology": 18,
  "Computer software": 18,
  "Internet / ecommerce": 16,
  "Healthcare": 16,
  "Medical": 16,
  "Financial Services": 15,
  "Energy": 15,
  // Solid sectors
  "Consumer: Retail": 12,
  "Consumer Discretionary": 12,
  "Consumer: Other": 10,
  "Industrial: Products and Services": 10,
  "Transportation": 9,
  "Leisure": 8,
  // Cooler sectors
  "Services (other)": 6,
  "Real estate": 5,
};

function sectorHeat(sector: string | null): { points: number; label: string } {
  if (!sector) return { points: 6, label: "unclassified" };
  const p = SECTOR_HEAT[sector];
  if (p != null) return { points: p, label: p >= 15 ? "hot" : p >= 10 ? "warm" : "cool" };
  return { points: 8, label: "neutral" };
}

// ============================================================================
// CROSS-BORDER & STAGE FACTORS
// ============================================================================

function crossBorderPoints(deal: Deal): { points: number; label: string } {
  const geos = (deal.geographies_involved ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const country = deal.country ?? "";

  const isCrossBorder =
    geos.length > 1 ||
    /,/.test(deal.geographies_involved ?? "") ||
    (deal.india_flow && deal.india_flow !== "domestic" && deal.india_flow !== "other");

  if (isCrossBorder) return { points: 15, label: "cross-border" };
  return { points: 6, label: "single-country" };
}

function stagePoints(deal: Deal): { points: number; label: string; rationale: string } {
  const status = (deal.status ?? "").toLowerCase();
  const heading = (deal.heading ?? "").toLowerCase();

  // Early-stage announcements have the BIGGEST advisory window
  if (status === "announced") {
    if (/(today|just|new|fresh|just\s+announced)/.test(heading)) {
      return { points: 18, label: "fresh announce", rationale: "fresh announcement — proposal window wide open" };
    }
    return { points: 14, label: "announced", rationale: "announced — proposal window open" };
  }
  if (status === "live") {
    if (/(in\s+talks|exploring|considering|reviews?)/.test(heading)) {
      return { points: 16, label: "pre-deal", rationale: "pre-deal — early-stage outreach window" };
    }
    return { points: 12, label: "live", rationale: "live — actively in market" };
  }
  if (status === "completed") {
    return { points: 8, label: "post-close", rationale: "post-close — PMI / synergy / TSA advisory only" };
  }
  if (status === "abandoned") {
    return { points: 2, label: "abandoned", rationale: "abandoned — minimal advisory value" };
  }
  return { points: 6, label: "unknown stage", rationale: "stage unclear" };
}

// ============================================================================
// DEAL TYPE → ADVISORY COMPLEXITY
// ============================================================================

function dealTypeAdvisory(dealType: string | null): { points: number; rationale: string } {
  const t = (dealType ?? "").toLowerCase();
  if (t === "takeover" || t === "buyout") return { points: 22, rationale: "PE / takeover — high advisory wallet (DD, value-creation, debt advisory)" };
  if (t === "acquisition") return { points: 20, rationale: "strategic M&A — full pre-deal + PMI mandate possible" };
  if (t === "merger") return { points: 24, rationale: "merger — highest complexity (integration, synergy, regulatory)" };
  if (t === "investment") return { points: 12, rationale: "minority investment — limited advisory beyond commercial DD" };
  if (t === "ipo") return { points: 14, rationale: "IPO — readiness + carve-out advisory" };
  if (t === "capital markets") return { points: 10, rationale: "capital markets — narrower advisory scope" };
  return { points: 8, rationale: "deal type unclassified" };
}

// ============================================================================
// STAKE FACTOR
// ============================================================================

function stakeAdvisory(stakePct: number | null, stakeStatus: string | null): { points: number; label: string } {
  if (stakePct != null) {
    if (stakePct >= 50) return { points: 12, label: `${stakePct}% (control)` };
    if (stakePct >= 25) return { points: 8, label: `${stakePct}% (significant minority)` };
    return { points: 4, label: `${stakePct}% (minority)` };
  }
  if (stakeStatus === "control") return { points: 12, label: "control" };
  if (stakeStatus === "majority") return { points: 10, label: "majority" };
  if (stakeStatus === "minority") return { points: 5, label: "minority" };
  return { points: 6, label: "unknown stake" };
}

// ============================================================================
// RISK FACTORS — these REDUCE confidence / increase execution risk
// ============================================================================

function regulatoryRisk(deal: Deal): { points: number; rationale: string } {
  const sector = (deal.sector ?? "").toLowerCase();
  const country = (deal.country ?? "").toLowerCase();
  const heading = (deal.heading ?? "").toLowerCase();

  // High-regulation sectors
  if (sector.includes("financial") || sector.includes("healthcare") || sector.includes("medical") ||
      sector.includes("energy") || sector.includes("defense") || sector.includes("telecom")) {
    return { points: 22, rationale: "regulated sector — antitrust / sector regulator approval required" };
  }
  // Cross-border tech to/from China / Russia / Iran
  if ((country.includes("china") || /\bchin/.test(heading)) && deal.india_flow !== "domestic") {
    return { points: 28, rationale: "China cross-border — heightened CFIUS / FDI screening risk" };
  }
  // Cross-border general
  if (deal.india_flow && deal.india_flow !== "domestic" && deal.india_flow !== "other") {
    return { points: 15, rationale: "cross-border — FDI / antitrust review timeline" };
  }
  return { points: 6, rationale: "domestic, low-regulation sector" };
}

function dataQualityRisk(deal: Deal): { points: number; rationale: string } {
  const conf = deal.parse_confidence ?? 1.0;
  if (conf < 0.5) return { points: 25, rationale: "low parse confidence — verify entities before pursuing" };
  if (conf < 0.75) return { points: 12, rationale: "moderate parse confidence — sanity-check buyer/target" };
  return { points: 3, rationale: "high parse confidence" };
}

function stageRisk(deal: Deal): { points: number; rationale: string } {
  const status = (deal.status ?? "").toLowerCase();
  if (status === "live") {
    return { points: 12, rationale: "live deal — outcome uncertain, may collapse" };
  }
  if (status === "abandoned") {
    return { points: 35, rationale: "deal abandoned — re-pursuit unlikely" };
  }
  return { points: 5, rationale: "stage is firm" };
}

// ============================================================================
// MAIN SCORE BUILDERS
// ============================================================================

export function scorePriority(deal: Deal): ScoreBreakdown {
  const size = sizeBand(deal.normalized_value_usd, deal.value_raw);
  const heat = sectorHeat(deal.sector);
  const cb = crossBorderPoints(deal);
  const stage = stagePoints(deal);
  const stake = stakeAdvisory(deal.stake_percent, (deal as any).stake_status);

  const factors: ScoreFactor[] = [
    { name: "Deal size", value: size.label, points: size.points,
      rationale: `${size.label} deals carry meaningful advisory fees` },
    { name: "Sector heat", value: deal.sector ?? "unclassified", points: heat.points,
      rationale: `${heat.label} sector for MBB advisory activity` },
    { name: "Cross-border", value: cb.label, points: cb.points,
      rationale: cb.label === "cross-border" ? "Cross-border deals demand more advisory work" : "Single-country: standard advisory depth" },
    { name: "Stage", value: stage.label, points: stage.points,
      rationale: stage.rationale },
    { name: "Stake", value: stake.label, points: stake.points,
      rationale: stake.label.includes("control") ? "Control stake → full PMI mandate possible" : "Stake size shapes mandate breadth" },
  ];

  const total = Math.min(100, factors.reduce((s, f) => s + f.points, 0));
  const band = total >= 70 ? "PURSUE" : total >= 50 ? "WATCH" : "PASS";
  const summary = `${size.label} ${heat.label}-sector ${cb.label} ${stage.label} → ${band}`;

  return { total: Math.round(total), factors, band, summary };
}

export function scoreAdvisory(deal: Deal): ScoreBreakdown {
  const dt = dealTypeAdvisory(deal.deal_type);
  const cb = crossBorderPoints(deal);
  const size = sizeBand(deal.normalized_value_usd, deal.value_raw);
  const stage = stagePoints(deal);

  // Advisory weighting is different — favours complexity + size
  const factors: ScoreFactor[] = [
    { name: "Deal type", value: deal.deal_type ?? "—", points: dt.points,
      rationale: dt.rationale },
    { name: "Deal size", value: size.label, points: Math.round(size.points * 0.8),
      rationale: `${size.label} → advisory fee scales with deal size` },
    { name: "Cross-border", value: cb.label, points: cb.points,
      rationale: cb.label === "cross-border" ? "Cross-border → DD, regulatory, PMI complexity all expand" : "Single-country: standard scope" },
    { name: "Stage", value: stage.label, points: Math.round(stage.points * 0.7),
      rationale: stage.rationale.includes("window open") ? "Early stage → pre-deal AND post-deal mandates available" : stage.rationale },
  ];
  const total = Math.min(100, factors.reduce((s, f) => s + f.points, 0));
  const band = total >= 70 ? "PURSUE" : total >= 50 ? "WATCH" : "PASS";

  // Compose a "wallet estimate" string
  const walletM = Math.round(
    (deal.normalized_value_usd ?? 0) / 1_000_000 * 0.01      // ~1% of deal value
  );
  const summary = walletM > 0
    ? `Advisory wallet est. $${walletM}m: ${dt.rationale.split(" — ")[1] ?? dt.rationale}`
    : `Advisory wallet: ${dt.rationale}`;

  return { total: Math.round(total), factors, band, summary };
}

export function scoreRisk(deal: Deal): ScoreBreakdown {
  const reg = regulatoryRisk(deal);
  const dq = dataQualityRisk(deal);
  const sr = stageRisk(deal);

  const factors: ScoreFactor[] = [
    { name: "Regulatory", value: deal.sector ?? "—", points: reg.points,
      rationale: reg.rationale },
    { name: "Data quality", value: `${Math.round((deal.parse_confidence ?? 1) * 100)}%`, points: dq.points,
      rationale: dq.rationale },
    { name: "Stage risk", value: deal.status ?? "—", points: sr.points,
      rationale: sr.rationale },
  ];

  const total = Math.min(100, factors.reduce((s, f) => s + f.points, 0));
  // For risk: HIGH = bad. So band labels flip.
  const band = total >= 50 ? "PASS" : total >= 30 ? "WATCH" : "PURSUE";
  const summary = total >= 50
    ? `Elevated execution risk: ${reg.rationale.split(" — ")[0]}`
    : total >= 30
      ? "Moderate risk — manageable with planning"
      : "Low risk — clean execution path";

  return { total: Math.round(total), factors, band, summary };
}

// ============================================================================
// "PURSUE SCORE" — composite that the Prioritization page uses
// ============================================================================

export function computePursueScore(deal: Deal, weights = { priority: 0.50, advisory: 0.30, size: 0.20, risk: 0.15 }): {
  total: number;
  recommendation: "PURSUE" | "WATCH" | "PASS";
  summary: string;
} {
  const pri = scorePriority(deal).total;
  const adv = scoreAdvisory(deal).total;
  const risk = scoreRisk(deal).total;

  // Size normalization is included in priority already; use deal value directly
  const sizeNorm = Math.min(100, ((deal.normalized_value_usd ?? 0) / 250_000_000) * 100);

  const raw = pri * weights.priority + adv * weights.advisory + sizeNorm * weights.size - risk * weights.risk;
  const positiveTotal = weights.priority + weights.advisory + weights.size;
  const total = Math.max(0, Math.min(100, (raw / positiveTotal)));

  const recommendation = total >= 60 ? "PURSUE" : total >= 40 ? "WATCH" : "PASS";
  const summary = recommendation === "PURSUE"
    ? "Top of pipeline — actively pursue this week"
    : recommendation === "WATCH"
      ? "Watch-list — revisit on developments"
      : "Below threshold — pass unless circumstances change";
  return { total: Math.round(total), recommendation, summary };
}
