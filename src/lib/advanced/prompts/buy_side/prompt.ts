import type { AdvancedPromptBuilder } from "../types";

export const buy_sidePrompt: AdvancedPromptBuilder = (ctx) => `You are leading buy-side diligence and value-creation planning.
Deal: ${ctx.buyer} acquiring ${ctx.target}; ${ctx.sector}; ${ctx.geography}; ${ctx.dealSize}.
Notes: ${ctx.notes || "N/A"}
Research: ${ctx.researchInsights || "N/A"}

Use these exact headings:
## Investment Thesis
## Value-at-Stake Bridge
## Commercial Diligence Findings
## Operating Model Fit Assessment
## Synergy Underwrite Plan
## Diligence Red Flags & Confirmatory Tests
## Day-100 Ownership Agenda

Every section must include assumptions, quantified logic, and decision implications.`;
