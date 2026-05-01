

import { pharmaSectorFramework } from "../frameworks/sector/pharma";

export type SynergyLine = {
  category: string;
  assumption: string;
  calculationLogic: string;
  comparableReference: string;
  confidence: "low" | "medium" | "high";
};

export function deriveSynergies(input: {
  sector: string;
  revenue?: number;
  sgaRatio?: number;
  procurementRatio?: number;
  researchNotes?: string;
}): SynergyLine[] {
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
