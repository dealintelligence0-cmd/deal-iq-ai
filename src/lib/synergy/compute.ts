

/**
 * Phase 8 — Synergy Quantification math + narrative.
 *
 * Pure math (no AI): NPV calculation, year-by-year realization curve.
 * AI: generate detailed math narrative explaining the model assumptions.
 */

import type { RouteConfig } from "@/lib/ai/router";
import { routedCall } from "@/lib/ai/router";

export type SynergyModel = {
  account_name: string;
  buyer_name: string | null;
  target_revenue_m: number;
  target_ebitda_m: number;
  wacc_pct: number;
  one_time_cost_m: number;
  cost_hq_ga_m: number; cost_it_infra_m: number; cost_procurement_m: number;
  cost_facilities_m: number; cost_other_m: number;
  rev_cross_sell_m: number; rev_price_opt_m: number; rev_territory_m: number;
  rev_bundling_m: number; rev_other_m: number;
  realize_y1_pct: number; realize_y2_pct: number; realize_y3_pct: number;
  realize_y4_pct: number; realize_y5_pct: number;
};

export type SynergyOutput = {
  total_cost_run_rate_m: number;
  total_rev_run_rate_m: number;
  total_run_rate_m: number;
  year_curve: Array<{ year: number; cost_m: number; rev_m: number; total_m: number; cumulative_m: number }>;
  npv_m: number;
  npv_after_costs_m: number;
};

export function computeSynergy(m: SynergyModel): SynergyOutput {
  const totalCostRR = (m.cost_hq_ga_m||0) + (m.cost_it_infra_m||0) + (m.cost_procurement_m||0)
                     + (m.cost_facilities_m||0) + (m.cost_other_m||0);
  const totalRevRR  = (m.rev_cross_sell_m||0) + (m.rev_price_opt_m||0) + (m.rev_territory_m||0)
                     + (m.rev_bundling_m||0) + (m.rev_other_m||0);
  const realize = [m.realize_y1_pct, m.realize_y2_pct, m.realize_y3_pct, m.realize_y4_pct, m.realize_y5_pct]
                    .map((p) => Math.max(0, Math.min(100, p || 0)) / 100);
  const wacc = Math.max(0, Math.min(0.4, (m.wacc_pct || 10) / 100));

  let npv = 0;
  let cumulative = 0;
  const year_curve = realize.map((r, idx) => {
    const yr = idx + 1;
    const cost = totalCostRR * r;
    const rev  = totalRevRR  * r;
    const total = cost + rev;
    cumulative += total;
    npv += total / Math.pow(1 + wacc, yr);
    return {
      year: yr,
      cost_m: Math.round(cost * 100) / 100,
      rev_m:  Math.round(rev  * 100) / 100,
      total_m: Math.round(total * 100) / 100,
      cumulative_m: Math.round(cumulative * 100) / 100,
    };
  });

  return {
    total_cost_run_rate_m: totalCostRR,
    total_rev_run_rate_m: totalRevRR,
    total_run_rate_m: totalCostRR + totalRevRR,
    year_curve,
    npv_m: Math.round(npv * 100) / 100,
    npv_after_costs_m: Math.round((npv - (m.one_time_cost_m || 0)) * 100) / 100,
  };
}

const NARRATIVE_PROMPT = `You are a senior M&A advisor explaining synergy math to a CFO.

Given a deal's synergy model + computed outputs, write a 5-paragraph narrative:
  1. Headline result (NPV, total run-rate, payback period)
  2. Cost-side bridge (HQ/G&A + IT + procurement + facilities, with deduplication logic)
  3. Revenue-side bridge (cross-sell + pricing + territory + bundling, with realism caveats)
  4. Realization curve commentary (why year 1 is conservative, when full run-rate hits)
  5. Sensitivity flag (what would change the answer most — WACC, revenue realization, one-time costs)

OUTPUT — strict JSON:
{ "narrative": "5-paragraph text. Use \\n\\n between paragraphs. ~600 words total." }

RULES:
- Use real numbers from the inputs, not placeholders
- No fluff words ("transformational", "leverage", "robust", "synergies" as a generic noun)
- Be honest about risk
- Output MUST be valid JSON. No markdown.`;

export async function generateSynergyNarrative(
  routeCfg: RouteConfig,
  m: SynergyModel,
  o: SynergyOutput
): Promise<{ narrative: string; cost_usd: number; provider: string | null; model: string | null; error: string | null }> {
  const userPrompt = `DEAL: ${m.buyer_name ?? "Buyer"} acquiring ${m.account_name}
Target revenue $${m.target_revenue_m}M, EBITDA $${m.target_ebitda_m}M
WACC ${m.wacc_pct}%, one-time integration cost $${m.one_time_cost_m}M

COST SYNERGIES (run-rate $M): HQ/G&A ${m.cost_hq_ga_m}, IT ${m.cost_it_infra_m}, Procurement ${m.cost_procurement_m}, Facilities ${m.cost_facilities_m}, Other ${m.cost_other_m}. TOTAL: $${o.total_cost_run_rate_m}M

REVENUE SYNERGIES (run-rate $M): Cross-sell ${m.rev_cross_sell_m}, Price optimization ${m.rev_price_opt_m}, Territory expansion ${m.rev_territory_m}, Bundling ${m.rev_bundling_m}, Other ${m.rev_other_m}. TOTAL: $${o.total_rev_run_rate_m}M

REALIZATION CURVE: Y1 ${m.realize_y1_pct}%, Y2 ${m.realize_y2_pct}%, Y3 ${m.realize_y3_pct}%, Y4 ${m.realize_y4_pct}%, Y5 ${m.realize_y5_pct}%

COMPUTED:
- 5-year NPV (gross): $${o.npv_m}M
- 5-year NPV (after one-time costs): $${o.npv_after_costs_m}M
- Cumulative by Y5: $${o.year_curve[4]?.cumulative_m}M

Generate the 5-paragraph CFO narrative.`;

  try {
    const res = await routedCall(routeCfg, [
      { role: "system", content: NARRATIVE_PROMPT, stable: true },
      { role: "user", content: userPrompt },
    ], 2000);
    const cost = ((res.inputTokens / 1000) * 0.0015) + ((res.outputTokens / 1000) * 0.006);

    if (res.model === "rules-v1" || res.text.startsWith("[rule-based]")) {
      return { narrative: "", cost_usd: cost, provider: res.provider, model: res.model,
        error: `AI fell through to rules-v1 (provider ${res.provider} failed).` };
    }

    // Extract narrative
    const clean = res.text.replace(/```(?:json)?/gi, "").trim();
    const a = clean.indexOf("{");
    const b = clean.lastIndexOf("}");
    let narrative = "";
    if (a >= 0 && b > a) {
      try { narrative = String(JSON.parse(clean.slice(a, b + 1)).narrative ?? "").slice(0, 5000); }
      catch { narrative = clean.slice(0, 5000); }
    } else {
      narrative = clean.slice(0, 5000);
    }
    return { narrative, cost_usd: cost, provider: res.provider, model: res.model, error: null };
  } catch (e: any) {
    return { narrative: "", cost_usd: 0, provider: null, model: null, error: e?.message ?? String(e) };
  }
}
