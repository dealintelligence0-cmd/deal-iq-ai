

/**
 * Canonical Deal Model service.
 *
 * Every AI module (proposal / pmi / synergy / tsa) calls `getOrSeed` BEFORE generation
 * and uses the returned model as the single source of truth for numbers.
 *
 * If the model is unseeded, the FIRST module to call it seeds it from sector benchmarks
 * and persists. Subsequent modules read the seeded values verbatim.
 *
 * Partner overrides (set via sliders in Deal Model UI) win over AI-derived values.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSynergyBenchmark } from "./industry";

export type Currency = "USD" | "INR" | "EUR" | "GBP" | "JPY" | "CNY" | "AUD" | "SGD" | "AED";

// Static FX (partner can override per-deal). USD = 1.0
const FX_TO_USD: Record<Currency, number> = {
  USD: 1.0, INR: 1/84, EUR: 1.08, GBP: 1.27, JPY: 1/155,
  CNY: 1/7.2, AUD: 0.66, SGD: 0.74, AED: 0.27,
};

export type Initiative = {
  name: string;
  category: string;
  basis: string;       // "8% of overlapping SG&A" — derivation in words
  amount_y1: number;
  amount_y2: number;
  amount_y3: number;
  runrate: number;
  confidence: "HIGH" | "MEDIUM" | "STRETCH";
  owner: string;
};

export type Risk = {
  name: string;
  category: "regulatory" | "execution" | "market" | "talent" | "technology" | "integration";
  probability_pct: number;
  impact_amount: number;
  mitigation: string;
  owner: string;
};

export type RegulatoryFiling = {
  jurisdiction: string;
  filing_name: string;
  threshold_logic: string;
  estimated_timeline_days: number;
  owner: string;
};

export type Comparable = {
  acquirer: string;
  target: string;
  year: number;
  size_usd_m: number;
  geography: string;
  rationale: string;
  outcome?: string;
  synergy_ev_pct?: number;
};

export type DealModel = {
  deal_id: string;
  primary_currency: Currency;
  fx_rate_to_usd: number;

  ev_primary: number;
  ev_usd: number;
  target_revenue_primary: number | null;
  target_ebitda_primary: number | null;
  buyer_revenue_primary: number | null;

  cost_synergy_y1: number;
  cost_synergy_y2: number;
  cost_synergy_y3: number;
  cost_synergy_runrate: number;
  cost_synergy_confidence: "HIGH" | "MEDIUM" | "STRETCH";

  rev_synergy_y1: number;
  rev_synergy_y2: number;
  rev_synergy_y3: number;
  rev_synergy_runrate: number;
  rev_synergy_confidence: "HIGH" | "MEDIUM" | "STRETCH";

  one_time_integration_cost: number;
  net_runrate_y3: number;
  payback_months: number;

  cost_initiatives: Initiative[];
  rev_initiatives: Initiative[];
  risk_register: Risk[];
  regulatory_filings: RegulatoryFiling[];
  comparables_chosen: Comparable[];

  base_case: { synergy_capture_pct: number; irr_pct: number; multiple: number; probability_pct: number };
  upside_case: { synergy_capture_pct: number; irr_pct: number; multiple: number; probability_pct: number };
  downside_case: { synergy_capture_pct: number; irr_pct: number; multiple: number; probability_pct: number };

  written_by: Record<string, string>;
  partner_overrides: Record<string, true>;
};

export type SeedInput = {
  deal_id: string;
  user_id: string;
  buyer: string;
  target: string;
  sector: string;
  geography: string;
  deal_size_input: string;       // raw text "INR 400m-2bn" or "$11.45bn"
  buyer_type?: string;
  ownership_type?: string;
  target_revenue_input?: string;
  target_ebitda_input?: string;
  buyer_revenue_input?: string;
};

// ---------------------------------------------------------------------------
// Currency parser — handles "INR 400m-2bn", "$11.45bn", "EUR 500m", "1,200,000 INR"
// ---------------------------------------------------------------------------
export function parseCurrencyAndAmount(input: string): { currency: Currency; amount: number } {
  if (!input) return { currency: "USD", amount: 0 };
  const upper = input.toUpperCase().replace(/,/g, "");

  let currency: Currency = "USD";
  if (/\bINR\b|₹|\bRS\b/.test(upper)) currency = "INR";
  else if (/\bEUR\b|€/.test(upper)) currency = "EUR";
  else if (/\bGBP\b|£/.test(upper)) currency = "GBP";
  else if (/\bJPY\b|¥/.test(upper)) currency = "JPY";
  else if (/\bCNY\b|RMB/.test(upper)) currency = "CNY";
  else if (/\bAUD\b/.test(upper)) currency = "AUD";
  else if (/\bSGD\b/.test(upper)) currency = "SGD";
  else if (/\bAED\b/.test(upper)) currency = "AED";

  // For ranges like "400m-2bn" take the midpoint
  const matches = upper.match(/(\d+(?:\.\d+)?)\s*(K|M|MN|MM|B|BN|T)?/g) ?? [];
  const amounts = matches.map((m) => {
    const n = parseFloat(m);
    if (/T/.test(m)) return n * 1e12;
    if (/B/.test(m)) return n * 1e9;
    if (/M/.test(m)) return n * 1e6;
    if (/K/.test(m)) return n * 1e3;
    return n;
  }).filter((n) => n > 0);

  if (amounts.length === 0) return { currency, amount: 0 };
  const amount = amounts.length === 1 ? amounts[0] : (Math.min(...amounts) + Math.max(...amounts)) / 2;
  return { currency, amount };
}

export function fmtAmount(n: number, currency: Currency): string {
  const symbol = currency === "USD" ? "$" : currency === "INR" ? "₹" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : currency + " ";
  if (n >= 1e9) return `${symbol}${(n/1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${symbol}${(n/1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${symbol}${(n/1e3).toFixed(0)}K`;
  return `${symbol}${n.toFixed(0)}`;
}

// ---------------------------------------------------------------------------
// Seed defaults — anchored to existing sector benchmarks (industry.ts)
// ---------------------------------------------------------------------------
function deriveSeed(input: SeedInput): Omit<DealModel, "deal_id" | "written_by" | "partner_overrides"> {
  const { currency, amount: ev_primary } = parseCurrencyAndAmount(input.deal_size_input);
  const fx = FX_TO_USD[currency];
  const ev_usd = ev_primary * fx;

  const target_rev = input.target_revenue_input ? parseCurrencyAndAmount(input.target_revenue_input).amount : null;
  const target_ebitda = input.target_ebitda_input ? parseCurrencyAndAmount(input.target_ebitda_input).amount : null;
  const buyer_rev = input.buyer_revenue_input ? parseCurrencyAndAmount(input.buyer_revenue_input).amount : null;

  const benchRaw = getSynergyBenchmark(input.sector);
  // getSynergyBenchmark returns { costLow, costHigh, revLow, revHigh } — convert to single midpoint percentages
  const bench = {
    costPct: (benchRaw.costLow + benchRaw.costHigh) / 2,
    revPct: (benchRaw.revLow + benchRaw.revHigh) / 2,
  };
  const buyerCostMul = input.buyer_type === "pe" ? 1.2 : input.buyer_type === "carve_out" ? 0.7 : 1.0;
  const buyerRevMul = input.buyer_type === "strategic" ? 1.15 : 0.9;
  const ownershipMul = input.ownership_type === "minority" ? 0.5 : input.ownership_type === "jv" ? 0.6 : 1.0;

  const costPct = bench.costPct * buyerCostMul * ownershipMul;
  const revPct = bench.revPct * buyerRevMul * ownershipMul;
  const oneTimePct = 0.04;

  const cost_runrate = ev_primary * costPct;
  const rev_runrate = ev_primary * revPct;
  const one_time = ev_primary * oneTimePct;

  // Realisation curve 20/60/100
  const cost_y1 = cost_runrate * 0.20;
  const cost_y2 = cost_runrate * 0.60;
  const cost_y3 = cost_runrate * 1.00;
  const rev_y1 = rev_runrate * 0.20;
  const rev_y2 = rev_runrate * 0.60;
  const rev_y3 = rev_runrate * 1.00;

  const net_y3 = cost_y3 + rev_y3;
  const cumulative_y1 = (cost_y1 + rev_y1) - one_time;
  const payback_months = cumulative_y1 >= 0 ? 12 : Math.min(36, 12 + Math.round((one_time - (cost_y1 + rev_y1)) / Math.max((cost_runrate + rev_runrate) / 12, 1)));

  return {
    primary_currency: currency,
    fx_rate_to_usd: fx,
    ev_primary,
    ev_usd,
    target_revenue_primary: target_rev,
    target_ebitda_primary: target_ebitda,
    buyer_revenue_primary: buyer_rev,
    cost_synergy_y1: cost_y1,
    cost_synergy_y2: cost_y2,
    cost_synergy_y3: cost_y3,
    cost_synergy_runrate: cost_runrate,
    cost_synergy_confidence: "MEDIUM",
    rev_synergy_y1: rev_y1,
    rev_synergy_y2: rev_y2,
    rev_synergy_y3: rev_y3,
    rev_synergy_runrate: rev_runrate,
    rev_synergy_confidence: "MEDIUM",
    one_time_integration_cost: one_time,
    net_runrate_y3: net_y3,
    payback_months,
    cost_initiatives: [],   // Populated by first synergy generation
    rev_initiatives: [],    // Populated by first synergy generation
    risk_register: [],      // Populated by first proposal/pmi generation
    regulatory_filings: [], // Populated by first proposal generation
    comparables_chosen: [], // Populated by first proposal generation
    base_case:     { synergy_capture_pct: 70, irr_pct: 15, multiple: 12.5, probability_pct: 50 },
    upside_case:   { synergy_capture_pct: 100, irr_pct: 20, multiple: 15.0, probability_pct: 25 },
    downside_case: { synergy_capture_pct: 35, irr_pct: 10, multiple: 10.0, probability_pct: 25 },
  };
}

// ---------------------------------------------------------------------------
// Get-or-seed: every AI route calls this BEFORE generation
// ---------------------------------------------------------------------------
export async function getOrSeed(sb: SupabaseClient, input: SeedInput): Promise<DealModel> {
  const { data: existing } = await sb.from("deal_models").select("*").eq("deal_id", input.deal_id).maybeSingle();
  if (existing) return rowToModel(existing);

  const seed = deriveSeed(input);
  const row = {
    deal_id: input.deal_id, user_id: input.user_id, ...seed,
    written_by: { seed: "auto-from-benchmarks" },
    partner_overrides: {},
  };
  const { data: inserted, error } = await sb.from("deal_models").insert(row).select("*").single();
  if (error || !inserted) {
    // Couldn't persist — return seed in-memory so generation can still proceed
    return { deal_id: input.deal_id, ...seed, written_by: { seed: "in-memory-only" }, partner_overrides: {} } as DealModel;
  }
  return rowToModel(inserted);
}

// ---------------------------------------------------------------------------
// Update — used when an AI module derives richer detail (initiatives/risks)
// or when the partner overrides via sliders.
// Partner-overridden fields are NEVER overwritten by subsequent AI generations.
// ---------------------------------------------------------------------------
export async function updateModel(
  sb: SupabaseClient,
  deal_id: string,
  patch: Partial<DealModel>,
  source: "ai-proposal" | "ai-synergy" | "ai-pmi" | "ai-tsa" | "partner-override",
): Promise<DealModel | null> {
  const { data: existing } = await sb.from("deal_models").select("*").eq("deal_id", deal_id).maybeSingle();
  if (!existing) return null;

  const overrides = (existing.partner_overrides as Record<string, true>) ?? {};
  const written_by = (existing.written_by as Record<string, string>) ?? {};
  const filteredPatch: Partial<DealModel> = {};
  const newWrittenBy: Record<string, string> = { ...written_by };

  for (const [key, value] of Object.entries(patch)) {
    // Skip fields the partner has manually overridden — unless this update IS the partner override
    if (source !== "partner-override" && overrides[key]) continue;
    (filteredPatch as Record<string, unknown>)[key] = value;
    newWrittenBy[key] = source;
    if (source === "partner-override") overrides[key] = true;
  }

  const updateRow = { ...filteredPatch, written_by: newWrittenBy, partner_overrides: overrides };
  const { data: updated } = await sb.from("deal_models").update(updateRow).eq("deal_id", deal_id).select("*").single();
  return updated ? rowToModel(updated) : null;
}

function rowToModel(row: Record<string, unknown>): DealModel {
  return row as unknown as DealModel;
}

// ---------------------------------------------------------------------------
// Render the model as a prompt block — every AI route injects this
// so all four modules see THE SAME numbers.
// ---------------------------------------------------------------------------
export function dealModelToPromptBlock(m: DealModel): string {
  const cur = m.primary_currency;
  return `## CANONICAL DEAL MODEL (single source of truth — DO NOT re-derive these numbers)

Currency: ${cur} (FX to USD: ${m.fx_rate_to_usd.toFixed(4)})

EV (primary): ${fmtAmount(m.ev_primary, cur)}
EV (USD-equivalent): ${fmtAmount(m.ev_usd, "USD")}

Target Revenue: ${m.target_revenue_primary ? fmtAmount(m.target_revenue_primary, cur) : "TBD"}
Target EBITDA: ${m.target_ebitda_primary ? fmtAmount(m.target_ebitda_primary, cur) : "TBD"}
Buyer Revenue: ${m.buyer_revenue_primary ? fmtAmount(m.buyer_revenue_primary, cur) : "TBD"}

Cost Synergy Run-rate: ${fmtAmount(m.cost_synergy_runrate, cur)} [${m.cost_synergy_confidence}]
  Y1 ${fmtAmount(m.cost_synergy_y1, cur)} / Y2 ${fmtAmount(m.cost_synergy_y2, cur)} / Y3 ${fmtAmount(m.cost_synergy_y3, cur)}

Revenue Synergy Run-rate: ${fmtAmount(m.rev_synergy_runrate, cur)} [${m.rev_synergy_confidence}]
  Y1 ${fmtAmount(m.rev_synergy_y1, cur)} / Y2 ${fmtAmount(m.rev_synergy_y2, cur)} / Y3 ${fmtAmount(m.rev_synergy_y3, cur)}

One-time Integration Cost: ${fmtAmount(m.one_time_integration_cost, cur)}
Net Run-rate (Y3): ${fmtAmount(m.net_runrate_y3, cur)}
Payback: ${m.payback_months} months

Synergy / EV %: cost ${(m.cost_synergy_runrate / Math.max(m.ev_primary, 1) * 100).toFixed(1)}% + rev ${(m.rev_synergy_runrate / Math.max(m.ev_primary, 1) * 100).toFixed(1)}% = ${((m.cost_synergy_runrate + m.rev_synergy_runrate) / Math.max(m.ev_primary, 1) * 100).toFixed(1)}%

Scenarios:
- Base: ${m.base_case.synergy_capture_pct}% capture / ${m.base_case.irr_pct}% IRR / ${m.base_case.multiple}x / ${m.base_case.probability_pct}% prob
- Upside: ${m.upside_case.synergy_capture_pct}% / ${m.upside_case.irr_pct}% / ${m.upside_case.multiple}x / ${m.upside_case.probability_pct}%
- Downside: ${m.downside_case.synergy_capture_pct}% / ${m.downside_case.irr_pct}% / ${m.downside_case.multiple}x / ${m.downside_case.probability_pct}%

${m.cost_initiatives.length > 0 ? `Cost Initiatives (already derived — cite by name, do not re-invent):
${m.cost_initiatives.map((i) => `- ${i.name} (${i.category}): ${i.basis} = ${fmtAmount(i.runrate, cur)} runrate [${i.confidence}, owner: ${i.owner}]`).join("\n")}` : "Cost initiatives: NOT YET DERIVED — first to generate this should populate."}

${m.rev_initiatives.length > 0 ? `Revenue Initiatives (already derived — cite by name, do not re-invent):
${m.rev_initiatives.map((i) => `- ${i.name} (${i.category}): ${i.basis} = ${fmtAmount(i.runrate, cur)} runrate [${i.confidence}, owner: ${i.owner}]`).join("\n")}` : "Revenue initiatives: NOT YET DERIVED."}

${m.risk_register.length > 0 ? `Risk Register (canonical — use these exact risks):
${m.risk_register.map((r) => `- ${r.name} (${r.category}): ${r.probability_pct}% × ${fmtAmount(r.impact_amount, cur)} — ${r.mitigation} [owner: ${r.owner}]`).join("\n")}` : "Risk register: NOT YET DERIVED."}

${m.regulatory_filings.length > 0 ? `Regulatory Filings (canonical — cite by jurisdiction):
${m.regulatory_filings.map((f) => `- ${f.jurisdiction} ${f.filing_name}: ${f.threshold_logic}, ~${f.estimated_timeline_days}d, owner: ${f.owner}`).join("\n")}` : "Regulatory filings: NOT YET DERIVED."}

${m.comparables_chosen.length > 0 ? `Comparable Transactions (canonical — cite these, do not invent others):
${m.comparables_chosen.map((c) => `- ${c.acquirer} / ${c.target} (${c.year}, ${c.geography}): $${c.size_usd_m}M${c.synergy_ev_pct ? `, ${c.synergy_ev_pct}% synergy/EV` : ""}${c.outcome ? `. ${c.outcome}` : ""}`).join("\n")}` : "Comparables: NOT YET DERIVED."}

PROVENANCE: ${Object.entries(m.written_by).map(([k, v]) => `${k}=${v}`).join(", ")}
PARTNER-OVERRIDDEN FIELDS (do not change these in generation): ${Object.keys(m.partner_overrides).join(", ") || "none"}`;
}
