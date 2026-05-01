

import type { AdvancedPromptBuilder } from "../types";

export const synergy_capturePrompt: AdvancedPromptBuilder = (ctx) => `You are leading synergy capture and tracking design.
Deal: ${ctx.buyer}/${ctx.target}; ${ctx.sector}; ${ctx.geography}; ${ctx.dealSize}.
Notes: ${ctx.notes || "N/A"}
Research: ${ctx.researchInsights || "N/A"}

Use these exact headings:
## Synergy Baseline & Scope
## Revenue Synergy Model
## Cost Synergy Model
## One-Time Cost to Achieve
## Realization Timeline by Wave
## Risk-Adjusted Capture Forecast
## Governance, Owners, and KPI Controls

Each section must provide assumptions, math logic, confidence levels, and dependencies.`;
