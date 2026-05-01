

import type { AdvancedPromptBuilder } from "../types";

export const sell_sidePrompt: AdvancedPromptBuilder = (ctx) => `You are leading sell-side readiness and equity story development.
Deal: ${ctx.target} sale process vs buyer universe incl. ${ctx.buyer}; ${ctx.sector}; ${ctx.geography}; ${ctx.dealSize}.
Notes: ${ctx.notes || "N/A"}
Research: ${ctx.researchInsights || "N/A"}

Use these exact headings:
## Equity Story & Differentiated Positioning
## Buyer Universe Prioritization
## QoE / Normalized EBITDA Defense
## Separation Readiness (if applicable)
## Value Maximization Levers Pre-Sign
## Process Risk Register
## Negotiation Strategy & Bid Tension Plan

Every section must include assumptions, quantified logic, and execution actions.`;
