import type { AdvancedPromptBuilder } from "../types";

export const pmi_onlyPrompt: AdvancedPromptBuilder = (ctx) => `You are leading post-merger integration (PMI) execution.
Deal: ${ctx.buyer}/${ctx.target}; ${ctx.sector}; ${ctx.geography}; ${ctx.dealSize}.
Notes: ${ctx.notes || "N/A"}
Research: ${ctx.researchInsights || "N/A"}

Use these exact headings:
## Integration Value Thesis
## IMO Governance & Decision Rights
## Workstream Wave Plan
## Day-1 / Day-30 / Day-100 Milestones
## Synergy Delivery PMO
## Culture, Talent, and Change Risk
## KPI Cockpit and Escalation Triggers

Each section must include logic, assumptions, quantified impact, and owners.`;
