import type { AdvancedPromptBuilder } from "../types";

export const carveOutPrompt: AdvancedPromptBuilder = (ctx) => `You are a senior carve-out advisory partner. Produce an enterprise-grade carve-out plan with analytically derived content.

Deal: ${ctx.buyer} acquiring carve-out from ${ctx.target}; sector ${ctx.sector}; geography ${ctx.geography}; size ${ctx.dealSize}.
Notes: ${ctx.notes || "N/A"}
Research: ${ctx.researchInsights || "No external research provided"}

Output format (use exact section headings):
## Separation Critical Path
Include sequenced activities, dependency chain, gating criteria, and critical timeline assumptions.

## Stranded Cost Quantification
Estimate stranded costs by function (SG&A, IT, facilities, shared services), show base, separation leakage, remediation runway, and annualized net stranded burden.

## TSA Service Catalog
Table with service tower, baseline cost proxy, service level, transition duration, exit trigger, and commercial pricing logic.

## Standalone Capability Gap Analysis
Assess capability maturity for Finance, HR, IT, Legal, Cyber, Procurement, Regulatory; include gap severity, build/buy/borrow recommendation, and Day-1 readiness score.

## Day-1 Cutover Plan
Define command center model, cutover checklist by workstream, pre-close simulations, fallback contingencies, and first-week KPIs.

## Customer Continuity Plan
Identify customer exposure points (contract novation, billing migration, service continuity), quantify revenue-at-risk bands, and mitigations.

## Regulatory & Compliance Risks (deal-specific)
Provide jurisdiction-specific regulatory filings, licensing separation issues, data/privacy transfer constraints, and compliance ownership map.

## Technology Separation Blueprint
Cover application disentanglement, identity and access split, ERP/data migration waves, cyber controls, and post-TSA decommission milestones.

Requirements: each section must include quantified assumptions, explicit reasoning, and implementation actions. Avoid generic text.`;
