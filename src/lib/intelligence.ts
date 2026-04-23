

import type { Deal } from "@/lib/analytics";

export type Intelligence = {
  headline: string;
  buyerProfile: Profile;
  targetProfile: Profile;
  rationale: string[];
  revenueSynergies: Synergy[];
  costSynergies: Synergy[];
  integrationComplexity: {
    score: number; // 1–10
    drivers: string[];
    level: "Low" | "Medium" | "High" | "Very High";
  };
  tsaNeeds: string[];
  regulatoryRisks: { risk: string; severity: "Low" | "Medium" | "High" }[];
  comparables: Deal[];
  advisoryScore: {
    score: number; // 0–100
    grade: "A+" | "A" | "B" | "C" | "D";
    factors: { label: string; weight: number; contribution: number }[];
  };
};

export type Profile = {
  name: string;
  dealsInvolved: number;
  totalValueUsd: number;
  sectors: string[];
  countries: string[];
  avgDealSize: number;
};

export function buildIntelligence(deal: Deal, all: Deal[]): Intelligence {
  const buyerDeals = all.filter((d) => d.buyer === deal.buyer);
  const targetDeals = all.filter(
    (d) => d.buyer === deal.target || d.target === deal.target
  );

  return {
    headline: buildHeadline(deal),
    buyerProfile: profile(deal.buyer, buyerDeals),
    targetProfile: profile(deal.target, targetDeals),
    rationale: rationale(deal),
    revenueSynergies: revenueSynergies(deal),
    costSynergies: costSynergies(deal),
    integrationComplexity: integration(deal),
    tsaNeeds: tsaNeeds(deal),
    regulatoryRisks: regulatoryRisks(deal),
    comparables: comparables(deal, all),
    advisoryScore: advisoryScore(deal),
  };
}

// ---------- Headline ----------
function buildHeadline(d: Deal): string {
  const size = d.normalized_value_usd
    ? ` in a ${fmtUsd(d.normalized_value_usd)} transaction`
    : "";
  const stake =
    d.stake_percent && d.stake_percent < 100
      ? ` acquiring a ${d.stake_percent}% stake in`
      : " to acquire";
  const sector = d.sector ? ` in the ${d.sector} sector` : "";
  const geo = d.country ? ` (${d.country})` : "";
  return `${d.buyer ?? "Buyer"}${stake} ${d.target ?? "Target"}${sector}${geo}${size}.`;
}

// ---------- Profile ----------
function profile(name: string | null, deals: Deal[]): Profile {
  const totalValueUsd = deals.reduce(
    (s, d) => s + (d.normalized_value_usd ?? 0),
    0
  );
  const sectors = Array.from(
    new Set(deals.map((d) => d.sector).filter(Boolean) as string[])
  ).slice(0, 5);
  const countries = Array.from(
    new Set(deals.map((d) => d.country).filter(Boolean) as string[])
  ).slice(0, 5);
  return {
    name: name ?? "Unknown",
    dealsInvolved: deals.length,
    totalValueUsd,
    sectors,
    countries,
    avgDealSize: deals.length > 0 ? totalValueUsd / deals.length : 0,
  };
}

// ---------- Rationale ----------
function rationale(d: Deal): string[] {
  const out: string[] = [];
  if (d.sector) {
    out.push(
      `Strengthens ${d.buyer}'s position in the ${d.sector} vertical through consolidation and enhanced market share.`
    );
  }
  if (d.country) {
    out.push(
      `Expands geographic footprint in ${d.country}, unlocking cross-border distribution channels.`
    );
  }
  if (d.stake_percent && d.stake_percent < 50) {
    out.push(
      `Minority ${d.stake_percent}% investment signals strategic optionality with limited integration risk.`
    );
  } else if (d.stake_percent && d.stake_percent >= 50) {
    out.push(
      `Control-stake acquisition (${d.stake_percent}%) enables full operational and strategic alignment.`
    );
  }
  if (d.normalized_value_usd && d.normalized_value_usd > 1e9) {
    out.push(
      `Transaction size (${fmtUsd(d.normalized_value_usd)}) positions this as a transformative deal reshaping the competitive landscape.`
    );
  } else if (d.normalized_value_usd && d.normalized_value_usd < 5e7) {
    out.push(
      `Bolt-on scale (${fmtUsd(d.normalized_value_usd)}) focused on capability acquisition rather than market consolidation.`
    );
  }
  if (out.length === 0) {
    out.push(
      "Strategic rationale to be clarified — limited deal metadata available."
    );
  }
  return out;
}

// ---------- Synergies ----------
type Synergy = { area: string; description: string; impact: "Low" | "Medium" | "High" };

function revenueSynergies(d: Deal): Synergy[] {
  const s: Synergy[] = [];
  if (d.sector) {
    s.push({
      area: "Cross-sell",
      description: `Introduce ${d.target}'s offering to ${d.buyer}'s existing ${d.sector} customer base.`,
      impact: "High",
    });
  }
  if (d.country) {
    s.push({
      area: "Geographic expansion",
      description: `Leverage ${d.country} market entry to accelerate revenue in adjacent regions.`,
      impact: "Medium",
    });
  }
  s.push({
    area: "Bundling",
    description: "Combined product bundles unlock higher ARPU and reduce churn.",
    impact: "Medium",
  });
  return s;
}

function costSynergies(d: Deal): Synergy[] {
  const size = d.normalized_value_usd ?? 0;
  return [
    {
      area: "G&A consolidation",
      description:
        "Finance, legal, HR, and IT function overlap yields 15–25% reduction in back-office spend.",
      impact: size > 1e9 ? "High" : "Medium",
    },
    {
      area: "Procurement",
      description:
        "Combined spend enables vendor renegotiation and 5–10% category savings.",
      impact: "Medium",
    },
    {
      area: "Technology rationalization",
      description:
        "Overlapping SaaS tools, infrastructure, and licenses retired within 18 months.",
      impact: d.sector === "Technology" ? "High" : "Low",
    },
    {
      area: "Real estate",
      description:
        "Footprint consolidation where offices overlap in shared metros.",
      impact: "Low",
    },
  ];
}

// ---------- Integration complexity ----------
function integration(d: Deal): Intelligence["integrationComplexity"] {
  let score = 3;
  const drivers: string[] = [];

  if (d.normalized_value_usd && d.normalized_value_usd > 5e9) {
    score += 3;
    drivers.push("Large transaction size (>$5B) multiplies integration surface");
  } else if (d.normalized_value_usd && d.normalized_value_usd > 1e9) {
    score += 2;
    drivers.push("Sizable deal (>$1B) requires formal IMO governance");
  }

  if (d.country && d.country.toLowerCase() !== "usa" && d.country.toLowerCase() !== "united states") {
    score += 1;
    drivers.push("Cross-border element adds regulatory and cultural complexity");
  }

  if (d.sector === "Technology" || d.sector === "Healthcare") {
    score += 1;
    drivers.push(`${d.sector}-specific regulatory and IP considerations`);
  }

  if (d.stake_percent && d.stake_percent < 100 && d.stake_percent >= 50) {
    score += 1;
    drivers.push(`Majority-not-full stake (${d.stake_percent}%) creates minority shareholder governance`);
  }

  if (drivers.length === 0) {
    drivers.push("Standard integration profile with no outsize complexity factors");
  }

  score = Math.min(10, Math.max(1, score));
  const level: Intelligence["integrationComplexity"]["level"] =
    score <= 3 ? "Low" : score <= 5 ? "Medium" : score <= 7 ? "High" : "Very High";

  return { score, drivers, level };
}

// ---------- TSA ----------
function tsaNeeds(d: Deal): string[] {
  const t: string[] = [];
  if (d.stake_percent !== 100) {
    t.push("IT systems & data access (3–6 months)");
    t.push("Finance & accounting close
