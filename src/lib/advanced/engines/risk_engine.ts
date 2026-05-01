

export type DerivedRisk = {
  risk: string;
  sourceOrReasoning: string;
  whyItMatters: string;
  impact: "low" | "medium" | "high";
  likelihoodJustification: string;
};

export function deriveDealRisks(input: {
  geography: string;
  customerConcentration?: number;
  researchNotes?: string;
}): DerivedRisk[] {
  return [
    {
      risk: "Regulatory exposure",
      sourceOrReasoning: `Jurisdiction focus: ${input.geography || "unspecified"}.`,
      whyItMatters: "Approval delay can defer close and value capture.",
      impact: "high",
      likelihoodJustification: "Cross-border and regulated sectors have multi-agency review risk.",
    },
    {
      risk: "Litigation / IP risk",
      sourceOrReasoning: input.researchNotes ? "Research notes indicate active legal/IP signals." : "No external litigation scan attached.",
      whyItMatters: "Unexpected claims can create indemnity leakage and integration constraints.",
      impact: "medium",
      likelihoodJustification: "Likelihood increases where IP-heavy offerings drive value.",
    },
    {
      risk: "Customer concentration",
      sourceOrReasoning: `Top-customer concentration proxy ${input.customerConcentration ?? 0}%`,
      whyItMatters: "Revenue-at-risk spikes if key accounts churn during transition.",
      impact: "high",
      likelihoodJustification: "Concentrated books are historically sensitive to service disruptions.",
    },
    {
      risk: "Antitrust precedent",
      sourceOrReasoning: "Market overlap and past authority interventions are evaluated qualitatively.",
      whyItMatters: "Remedies can reduce synergy scope.",
      impact: "medium",
      likelihoodJustification: "Higher risk where combined share materially shifts category structure.",
    },
    {
      risk: "Management / operational dependency",
      sourceOrReasoning: "Key-person and transitional dependency reviewed from deal notes.",
      whyItMatters: "Dependency can impair Day-1 execution and continuity.",
      impact: "medium",
      likelihoodJustification: "Likelihood rises when carve-out TSAs or founder-led ops are significant.",
    },
  ];
}
