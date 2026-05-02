

export type DerivedRisk = { risk: string; sourceOrReasoning: string; whyItMatters: string; impact: "low"|"medium"|"high"; likelihoodJustification: string };

export type RiskRegisterItem = {
  risk: string;
  trigger: string;
  precedent: string;
  probabilityPct: number;
  impactUsdM: { low: number; base: number; high: number };
  owner: string;
  mitigation: string;
};

export function deriveDealRisks(input: { geography: string; customerConcentration?: number; researchNotes?: string }): DerivedRisk[] {
  return [
    { risk: "Regulatory exposure", sourceOrReasoning: `Jurisdiction focus: ${input.geography || "unspecified"}.`, whyItMatters: "Approval delay can defer close and value capture.", impact: "high", likelihoodJustification: "Cross-border and regulated sectors have multi-agency review risk." },
    { risk: "Litigation / IP risk", sourceOrReasoning: input.researchNotes ? "Research notes indicate active legal/IP signals." : "No external litigation scan attached.", whyItMatters: "Unexpected claims can create indemnity leakage and integration constraints.", impact: "medium", likelihoodJustification: "Likelihood increases where IP-heavy offerings drive value." },
    { risk: "Customer concentration", sourceOrReasoning: `Top-customer concentration proxy ${input.customerConcentration ?? 0}%`, whyItMatters: "Revenue-at-risk spikes if key accounts churn during transition.", impact: "high", likelihoodJustification: "Concentrated books are historically sensitive to service disruptions." },
    { risk: "Antitrust precedent", sourceOrReasoning: "Market overlap and past authority interventions are evaluated qualitatively.", whyItMatters: "Remedies can reduce synergy scope.", impact: "medium", likelihoodJustification: "Higher risk where combined share materially shifts category structure." },
    { risk: "Management / operational dependency", sourceOrReasoning: "Key-person and transitional dependency reviewed from deal notes.", whyItMatters: "Dependency can impair Day-1 execution and continuity.", impact: "medium", likelihoodJustification: "Likelihood rises when carve-out TSAs or founder-led ops are significant." },
  ];
}

export function buildRiskRegister(input: { geography: string; enterpriseValueUsdM?: number; crossBorder?: boolean }): RiskRegisterItem[] {
  const ev = Math.max(0, input.enterpriseValueUsdM ?? 0);
  const pct = (p: number) => Number((ev * p).toFixed(1));
  return [
    {
      risk: "Regulatory remedy risk",
      trigger: "Second request / phase-2 investigation",
      precedent: input.crossBorder ? "Cross-border filings often extend to 9-12 months." : "Domestic overlaps can still trigger deep antitrust review.",
      probabilityPct: input.crossBorder ? 45 : 30,
      impactUsdM: { low: pct(0.01), base: pct(0.025), high: pct(0.05) },
      owner: "General Counsel",
      mitigation: "Pre-filing advocacy, remedy playbook, clean-team discipline.",
    },
    {
      risk: "Customer attrition during transition",
      trigger: "Service SLA miss >2 weeks or account coverage disruption",
      precedent: "Large integrations commonly see churn concentration in top 20 accounts.",
      probabilityPct: 35,
      impactUsdM: { low: pct(0.008), base: pct(0.015), high: pct(0.03) },
      owner: "Chief Revenue Officer",
      mitigation: "Top-50 account SWAT plan, continuity SLAs, retention pricing guardrails.",
    },
  ];
}
