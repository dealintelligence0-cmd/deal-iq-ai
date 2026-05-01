import type { AdvancedPromptBuilder } from "../types";

export const joint_venturePrompt: AdvancedPromptBuilder = (ctx) => `You are leading joint-venture strategy design.
Parties: ${ctx.buyer} + ${ctx.target}; ${ctx.sector}; ${ctx.geography}; ${ctx.dealSize}.
Notes: ${ctx.notes || "N/A"}
Research: ${ctx.researchInsights || "N/A"}

Use these exact headings:
## JV Strategic Intent & Scope Boundary
## Contribution Model (Assets, IP, Talent)
## Governance & Deadlock Architecture
## Economics Waterfall (Capital, Returns, Exit)
## Regulatory & Competition Considerations
## Operating Model and Control Matrix
## Dispute, Exit, and Unwind Mechanics

Each section must be analytical, quantified, and decision-oriented.`;
