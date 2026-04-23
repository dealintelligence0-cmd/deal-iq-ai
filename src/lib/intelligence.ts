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
    t.push("Finance & accounting close support (2 quarters)");
  } else {
    t.push("IT infrastructure cutover (6–12 months)");
    t.push("ERP migration plan (9–18 months)");
  }
  if (d.sector === "Technology") {
    t.push("Engineering platform handover and knowledge transfer");
  }
  if (d.sector === "Healthcare") {
    t.push("Regulatory licensing transition (FDA/local health authority)");
    t.push("Clinical data custody and patient privacy continuity");
  }
  if (d.country && d.country.toLowerCase() !== "usa") {
    t.push("Local payroll and statutory filings during transition");
  }
  t.push("HR benefits administration bridge (12 months typical)");
  return t;
}

// ---------- Regulatory risks ----------
function regulatoryRisks(d: Deal): Intelligence["regulatoryRisks"] {
  const r: Intelligence["regulatoryRisks"] = [];
  const size = d.normalized_value_usd ?? 0;

  if (size > 1e8) {
    r.push({
      risk: "HSR antitrust filing required in US; merger review expected",
      severity: size > 5e9 ? "High" : "Medium",
    });
  }
  if (d.country && d.country.toLowerCase() !== "usa" && size > 1e8) {
    r.push({ risk: "Local foreign-direct-investment screening", severity: "Medium" });
  }
  if (d.sector === "Technology") {
    r.push({ risk: "Data protection (GDPR/CCPA) and national-security review", severity: "Medium" });
  }
  if (d.sector === "Healthcare") {
    r.push({ risk: "FDA approvals, HIPAA compliance, clinical trial continuity", severity: "High" });
  }
  if (d.sector === "Financial Services") {
    r.push({ risk: "Banking/securities regulator change-of-control approvals", severity: "High" });
  }
  if (r.length === 0) {
    r.push({ risk: "Standard deal approvals expected; no major regulatory red flags identified", severity: "Low" });
  }
  return r;
}

// ---------- Comparables ----------
function comparables(deal: Deal, all: Deal[]): Deal[] {
  if (!deal.sector) return [];
  const target = deal.normalized_value_usd ?? 0;
  return all
    .filter((d) => d.id !== deal.id && d.sector === deal.sector)
    .map((d) => ({
      d,
      score:
        (d.country === deal.country ? 2 : 0) +
        (d.deal_type === deal.deal_type ? 1 : 0) +
        (target > 0 && d.normalized_value_usd
          ? 3 - Math.min(3, Math.abs(Math.log10(d.normalized_value_usd) - Math.log10(target)))
          : 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((x) => x.d);
}

// ---------- Advisory score ----------
function advisoryScore(d: Deal): Intelligence["advisoryScore"] {
  const factors: { label: string; weight: number; contribution: number }[] = [];
  let total = 0;

  // Deal size → 40%
  const size = d.normalized_value_usd ?? 0;
  const sizeScore = size >= 5e9 ? 100 : size >= 1e9 ? 80 : size >= 1e8 ? 60 : size >= 1e7 ? 40 : 20;
  factors.push({ label: "Transaction size", weight: 40, contribution: sizeScore * 0.4 });
  total += sizeScore * 0.4;

  // Data quality proxy → 20%
  const filled = [d.deal_date, d.buyer, d.target, d.sector, d.country, d.deal_type, d.normalized_value_usd].filter(Boolean).length;
  const dataScore = (filled / 7) * 100;
  factors.push({ label: "Data completeness", weight: 20, contribution: dataScore * 0.2 });
  total += dataScore * 0.2;

  // Status → 20% (live/announced worth most)
  const statusScore = d.status === "live" ? 100 : d.status === "announced" ? 85 : d.status === "rumor" ? 60 : d.status === "closed" ? 30 : 10;
  factors.push({ label: "Deal momentum", weight: 20, contribution: statusScore * 0.2 });
  total += statusScore * 0.2;

  // Sector attractiveness → 20%
  const hotSectors = ["Technology", "Healthcare", "Financial Services"];
  const sectorScore = hotSectors.includes(d.sector ?? "") ? 100 : d.sector ? 60 : 30;
  factors.push({ label: "Sector attractiveness", weight: 20, contribution: sectorScore * 0.2 });
  total += sectorScore * 0.2;

  const score = Math.round(total);
  const grade: Intelligence["advisoryScore"]["grade"] =
    score >= 90 ? "A+" : score >= 80 ? "A" : score >= 65 ? "B" : score >= 50 ? "C" : "D";

  return { score, grade, factors };
}

function fmtUsd(v: number): string {
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}
