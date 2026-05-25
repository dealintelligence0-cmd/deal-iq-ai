

/**
 * Rules Engine (Phase 1)
 *
 * Reads cognition_propagation_rules and applies matching effects when an
 * assumption changes. Pure deterministic logic — no AI calls here.
 *
 * Three effect kinds supported in v1:
 *   - 'flag'      : record a non-numeric warning that surfaces in synthesis brief
 *   - 'derive'    : compute a new assumption value via a simple formula
 *   - 'recompute' : re-derive a downstream assumption (formula-based)
 *
 * 'notify' is reserved for Phase 4 (real-time toasts).
 *
 * Recursion guard: chain depth capped at 3 to prevent runaway propagation.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { reviseAssumption, type Revision } from "./orchestrator";

type PropagationInput = {
  triggerKey: string;
  triggerValue: number | null;
  previousValue: number | null;
  workspaceId: string | null;
  dealId: string | null;
  chainDepth: number;
};

type Rule = {
  id: string;
  name: string;
  trigger_key: string;
  trigger_condition: any;
  effect_kind: "flag" | "derive" | "recompute" | "notify";
  effect_target_key: string | null;
  effect_formula: string | null;
  effect_message: string | null;
  enabled: boolean;
  max_chain_depth: number;
};

/**
 * Find all enabled rules matching the triggered key and apply their effects.
 * Returns the revision rows created by downstream propagation.
 */
export async function applyPropagation(input: PropagationInput): Promise<Revision[]> {
  if (input.chainDepth > 3) return []; // hard safety cap

  const admin = createAdminClient();
  const { data: rules } = await admin
    .from("cognition_propagation_rules")
    .select("*")
    .eq("trigger_key", input.triggerKey)
    .eq("enabled", true);

  if (!rules || rules.length === 0) return [];

  const downstream: Revision[] = [];

  for (const rule of rules as Rule[]) {
    // Evaluate optional condition (e.g. { "delta_pct_gt": 20 })
    if (!conditionMet(rule.trigger_condition, input)) continue;

    switch (rule.effect_kind) {
      case "flag": {
        // Write a flag assumption — surfaces in the next synthesis brief
        if (!rule.effect_target_key || !rule.effect_message) break;
        const result = await reviseAssumption({
          workspaceId: input.workspaceId,
          dealId: input.dealId,
          key: `flag.${rule.effect_target_key}`,
          valueText: rule.effect_message,
          valueJson: { rule_id: rule.id, rule_name: rule.name, triggered_at: new Date().toISOString() },
          confidence: 0.8,
          source: "derived",
          triggeredBy: "propagation_rule",
          triggerMeta: { rule_id: rule.id, source_key: input.triggerKey },
          reason: `Rule fired: ${rule.name}`,
          chainDepth: input.chainDepth, // inherit, won't recurse since flags don't trigger other rules
        });
        if (result.revision) downstream.push(result.revision);
        break;
      }

      case "derive":
      case "recompute": {
        if (!rule.effect_target_key || !rule.effect_formula) break;
        const newValue = evalFormula(rule.effect_formula, {
          trigger_value: input.triggerValue ?? 0,
          previous_value: input.previousValue ?? 0,
        });
        if (newValue === null) break;

        const result = await reviseAssumption({
          workspaceId: input.workspaceId,
          dealId: input.dealId,
          key: rule.effect_target_key,
          valueNumeric: newValue,
          confidence: 0.6, // derived values have lower confidence
          source: "derived",
          triggeredBy: "propagation_rule",
          triggerMeta: { rule_id: rule.id, source_key: input.triggerKey, formula: rule.effect_formula },
          reason: `Derived by rule: ${rule.name}`,
          chainDepth: input.chainDepth,
        });
        if (result.revision) downstream.push(result.revision);
        downstream.push(...result.propagatedRevisions);
        break;
      }

      case "notify":
        // Reserved for Phase 4
        break;
    }
  }

  return downstream;
}

/**
 * Evaluate a simple math expression. Supports: + - * / ( ) numbers and
 * the variables $trigger_value, $previous_value.
 * No eval(), no Function() — explicit tokenizer for safety.
 *
 * Examples:
 *   "$trigger_value * 0.6 + 12"
 *   "$trigger_value - $previous_value"
 */
function evalFormula(formula: string, vars: Record<string, number>): number | null {
  try {
    let expr = formula;
    for (const [k, v] of Object.entries(vars)) {
      expr = expr.replaceAll(`$${k}`, String(v));
    }
    // Strict whitelist: digits, decimals, math ops, parens, spaces
    if (!/^[\d\s+\-*/().]+$/.test(expr)) return null;
    // Safe-ish: with the whitelist above, this is a pure math expression
    // eslint-disable-next-line no-new-func
    const result = new Function(`"use strict"; return (${expr});`)();
    return typeof result === "number" && isFinite(result) ? result : null;
  } catch {
    return null;
  }
}

function conditionMet(cond: any, input: PropagationInput): boolean {
  if (!cond || typeof cond !== "object") return true;

  if (typeof cond.delta_pct_gt === "number" && input.previousValue && input.triggerValue) {
    const deltaPct = Math.abs((input.triggerValue - input.previousValue) / input.previousValue) * 100;
    if (deltaPct <= cond.delta_pct_gt) return false;
  }
  if (typeof cond.gt === "number" && (input.triggerValue ?? 0) <= cond.gt) return false;
  if (typeof cond.lt === "number" && (input.triggerValue ?? 0) >= cond.lt) return false;

  return true;
}
