

import { pharmaSectorFramework } from "../frameworks/sector/pharma";

export type SynergyLine = { category: string; assumption: string; calculationLogic: string; comparableReference: string; confidence: "low"|"medium"|"high" };

export function deriveSynergies(input: { sector: string; revenue?: number; sgaRatio?: number; procurementRatio?: number; researchNotes?: string }): SynergyLine[] {
  const revenue = input.revenue ?? 0;
  const sgaBase = revenue * (input.sgaRatio ?? 0.22);
  const procurementBase = revenue * (input.procurementRatio ?? 0.2);
  const lines: SynergyLine[] = [
    {
      category: "SG&A overlap",
      assumption: "30% functional overlap in headquarters and commercial support functions.",
      calculationLogic: `SG&A base ${sgaBase.toFixed(1)} × 30% overlap × 35% realizable = ${(sgaBase * 0.3 * 0.35).toFixed(1)}`,
      comparableReference: "Comparable integrations frequently deliver 8-15% SG&A reductions on overlapping cost pools.",
      confidence: revenue > 0 ? "medium" : "low",
    },
    {
      category: "Procurement leverage",
      assumption: "Addressable spend at 20% of revenue; 5% negotiated savings through scale tiering.",
      calculationLogic: `Procurement base ${procurementBase.toFixed(1)} × 5% = ${(procurementBase * 0.05).toFixed(1)}`,
      comparableReference: "Scale sourcing programs typically capture low-to-mid single digit savings.",
      confidence: "medium",
    },
  ];
  if (input.sector.toLowerCase().includes("pharma")) {
    lines.push({
      category: "R&D consolidation",
      assumption: pharmaSectorFramework.calculationHeuristics[2],
      calculationLogic: `R&D proxy assumed 16% of revenue: ${(revenue * 0.16).toFixed(1)} × 10% = ${(revenue * 0.16 * 0.1).toFixed(1)}`,
      comparableReference: pharmaSectorFramework.industryBenchmarks[1],
      confidence: "medium",
    });
  }
  return lines;
}

export type SynergyLever = {
  lever: string;
  formula: string;
  lowUsdM: number;
  baseUsdM: number;
  highUsdM: number;
  confidence: "low" | "medium" | "high";
  evidence: string;
  pmiWorkstream: string;
};

const toM = (v: number) => Number((v / 1_000_000).toFixed(1));

export function buildSynergyLevers(input: {
  sector: string;
  revenueUsd?: number;
  cogsRatio?: number;
  sgaRatio?: number;
  itSpendRatio?: number;
}): SynergyLever[] {
  const revenue = Math.max(0, input.revenueUsd ?? 0);
  const cogs = revenue * (input.cogsRatio ?? 0.58);
  const sga = revenue * (input.sgaRatio ?? 0.22);
  const it = revenue * (input.itSpendRatio ?? 0.04);
  const isPharma = input.sector.toLowerCase().includes("pharma");

  const levers: SynergyLever[] = [
    {
      lever: "Procurement savings",
      formula: `Addressable COGS ${toM(cogs)} × 2.5%-5.0%`,
      lowUsdM: toM(cogs * 0.025),
      baseUsdM: toM(cogs * 0.0375),
      highUsdM: toM(cogs * 0.05),
      confidence: revenue > 0 ? "medium" : "low",
      evidence: "Scale sourcing and vendor rebids on addressable direct+indirect categories.",
      pmiWorkstream: "Procurement",
    },
    {
      lever: "SG&A overlap",
      formula: `Overlapping SG&A ${toM(sga)} × 8%-14%`,
      lowUsdM: toM(sga * 0.08),
      baseUsdM: toM(sga * 0.11),
      highUsdM: toM(sga * 0.14),
      confidence: revenue > 0 ? "high" : "low",
      evidence: "Role duplication elimination and shared-services consolidation.",
      pmiWorkstream: "Finance & HR",
    },
    {
      lever: "IT platform rationalization",
      formula: `IT spend ${toM(it)} × 10%-18%`,
      lowUsdM: toM(it * 0.1),
      baseUsdM: toM(it * 0.14),
      highUsdM: toM(it * 0.18),
      confidence: "medium",
      evidence: "Application and infra decommission after TSA exit.",
      pmiWorkstream: "IT",
    },
  ];

  if (isPharma) {
    const rnd = revenue * 0.16;
    levers.push({
      lever: "R&D portfolio rationalization",
      formula: `R&D base ${toM(rnd)} × 6%-10%`,
      lowUsdM: toM(rnd * 0.06),
      baseUsdM: toM(rnd * 0.08),
      highUsdM: toM(rnd * 0.1),
      confidence: "medium",
      evidence: pharmaSectorFramework.industryBenchmarks[0],
      pmiWorkstream: "R&D / Medical",
    });
  }

  return levers;
}
