

export type ScenarioCase = {
  name: "Base" | "Upside" | "Downside";
  probability: number;
  ebitdaImpactPct: number;
  npvImpactUsdM: number;
  keyTriggerVariables: string[];
};

export function buildScenarioCases(input: { synergyRunRateUsdM: number; costToAchieveUsdM: number; baseEbitdaUsdM?: number }): ScenarioCase[] {
  const baseNpv = input.synergyRunRateUsdM * 6 - input.costToAchieveUsdM;
  return [
    {
      name: "Base",
      probability: 0.55,
      ebitdaImpactPct: 8,
      npvImpactUsdM: Math.round(baseNpv),
      keyTriggerVariables: [
        "Regulatory clearance on planned timeline",
        "Integration milestones achieved",
        "Retention of key commercial talent",
      ],
    },
    {
      name: "Upside",
      probability: 0.2,
      ebitdaImpactPct: 12,
      npvImpactUsdM: Math.round(baseNpv * 1.35),
      keyTriggerVariables: [
        "Faster synergy capture",
        "Cross-sell outperformance",
        "Procurement savings above plan",
      ],
    },
    {
      name: "Downside",
      probability: 0.25,
      ebitdaImpactPct: 3,
      npvImpactUsdM: Math.round(baseNpv * 0.45),
      keyTriggerVariables: [
        "Regulatory remedy burden",
        "TSA overrun",
        "Customer churn during transition",
      ],
    },
  ];
}
