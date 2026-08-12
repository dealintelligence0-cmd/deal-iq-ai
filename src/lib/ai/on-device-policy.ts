// src/lib/ai/on-device-policy.ts
//
// Explicit policy layer for on-device (browser) AI — an ALLOW-LIST, not a convention
// (pipeline rule 4). On-device AI is T1: advisory pre-processing only. It must NEVER
// touch canonical financial logic. Every call site that invokes on-device AI passes
// one of these task constants, so a future dev cannot quietly route a forbidden task
// (valuation, synergy sizing, risk scoring, final recommendation, …) through browser AI.

// Tasks on-device AI MAY perform: summarization / compression / candidate extraction /
// filtering / grouping. All are ADVISORY — their output is untrusted and re-validated.
export const ON_DEVICE_ALLOWED_TASKS = [
  "research-summarize",
  "research-compress",
  "fact-extraction-candidate",
  "relevance-filter",
  "duplicate-detection",
  "semantic-grouping",
  "deal-intake-extraction-candidate",
  "key-label-suggestion",
] as const;

// Tasks on-device AI must NEVER perform. These produce or select canonical numbers /
// determinations and belong exclusively to the deterministic engines + cloud tiers.
export const ON_DEVICE_FORBIDDEN_TASKS = [
  "financial-calculation",
  "valuation",
  "synergy-value-determination",
  "scenario-calculation",
  "comparable-selection",
  "risk-scoring",
  "final-recommendation",
  "canonical-number-generation",
] as const;

export type OnDeviceTask = (typeof ON_DEVICE_ALLOWED_TASKS)[number];
export type ForbiddenOnDeviceTask = (typeof ON_DEVICE_FORBIDDEN_TASKS)[number];

const ALLOWED = new Set<string>(ON_DEVICE_ALLOWED_TASKS);
const FORBIDDEN = new Set<string>(ON_DEVICE_FORBIDDEN_TASKS);

// Non-throwing membership check — for call sites that want to branch rather than crash.
export function isOnDeviceTaskAllowed(task: string): task is OnDeviceTask {
  return ALLOWED.has(task);
}

export function isOnDeviceTaskForbidden(task: string): task is ForbiddenOnDeviceTask {
  return FORBIDDEN.has(task);
}

// Runtime tripwire (rule 4): THROWS in dev if a forbidden or unknown task string is
// passed; NO-OP in production so a stray call can never crash a partner's session.
// The dev-time throw is what stops a forbidden task from ever being wired into browser AI.
export function assertOnDeviceTaskAllowed(task: string): asserts task is OnDeviceTask {
  if (isOnDeviceTaskAllowed(task)) return;
  // Production: silently allow (no-op) — never take down a live session over a guard.
  if (typeof process !== "undefined" && process.env?.NODE_ENV === "production") return;
  const why = isOnDeviceTaskForbidden(task)
    ? `"${task}" is on the FORBIDDEN list — canonical/financial work must never run on-device.`
    : `"${task}" is not a recognized on-device task. Add it to ON_DEVICE_ALLOWED_TASKS only if it is genuinely advisory.`;
  throw new Error(`[on-device-policy] Blocked on-device AI task: ${why}`);
}
