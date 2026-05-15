

/**
 * Deal IQ AI — Offline rule-based TSA generator.
 *
 * Deterministic, instant, no AI key required.
 * Produces a board-ready Transitional Service Agreement framework markdown
 * that matches the rest of the consulting-grade output format (## sections,
 * tables, numbered headings) so it renders correctly through renderVisualProposal
 * and exportProposalToPptx.
 */

export type TsaOfflineInput = {
  seller: string;
  buyer: string;
  sector: string;
  geography: string;
  dealSize: string;
  closeDate: string;
  functions: string[];
  duration: string;        // "6" | "12" | "18" | "24"
  pricing: string;         // "cost_plus_5" | "cost_plus_10" | "market_rate" | "negotiated"
  constraints: string;
  mandateType: string;
  buyerType: string;
  ownershipType: string;
  integrationStyle: string;
};

const PRICING_LABEL: Record<string, string> = {
  cost_plus_5: "Cost + 5%",
  cost_plus_10: "Cost + 10%",
  market_rate: "Market Rate",
  negotiated: "Negotiated",
};

// Function → indicative complexity, exit dependency, cost basis
const FN_CATALOG: Record<string, { complexity: "Low" | "Medium" | "High"; exitRisk: "Low" | "Medium" | "High"; costShare: string }> = {
  "IT & Systems":         { complexity: "High",   exitRisk: "High",   costShare: "30-40%" },
  "Finance & Accounting": { complexity: "Medium", exitRisk: "Medium", costShare: "10-15%" },
  "HR & Payroll":         { complexity: "Medium", exitRisk: "Medium", costShare: "8-12%" },
  "Legal":                { complexity: "Low",    exitRisk: "Low",    costShare: "3-5%" },
  "Procurement":          { complexity: "Medium", exitRisk: "Medium", costShare: "6-10%" },
  "Facilities":           { complexity: "Low",    exitRisk: "Low",    costShare: "4-6%" },
  "Customer Service":     { complexity: "Medium", exitRisk: "High",   costShare: "8-12%" },
  "Supply Chain":         { complexity: "High",   exitRisk: "High",   costShare: "12-18%" },
  "Manufacturing":        { complexity: "High",   exitRisk: "High",   costShare: "15-25%" },
  "Sales Support":        { complexity: "Medium", exitRisk: "Medium", costShare: "5-8%" },
  "Tax":                  { complexity: "Medium", exitRisk: "Low",    costShare: "2-4%" },
  "Treasury":             { complexity: "Low",    exitRisk: "Low",    costShare: "2-4%" },
};

function fnInfo(fn: string) {
  return FN_CATALOG[fn] ?? { complexity: "Medium" as const, exitRisk: "Medium" as const, costShare: "5-10%" };
}

export function generateOfflineTsa(input: TsaOfflineInput): string {
  const {
    seller, buyer, sector, geography, dealSize, closeDate,
    functions, duration, pricing, constraints,
    integrationStyle,
  } = input;
  const S = seller || "Seller";
  const B = buyer || "Buyer";
  const dur = duration || "12";
  const pricingLabel = PRICING_LABEL[pricing] ?? pricing ?? "Cost + 10%";
  const sec = sector || "the sector";
  const geo = geography || "the operating geography";
  const size = dealSize || "TBD";
  const close = closeDate || "the announced close date";
  const fns = (functions && functions.length ? functions : ["IT & Systems", "Finance & Accounting", "HR & Payroll"]);
  const intStyle = integrationStyle || "functional";

  // Build function-level service catalog rows
  const serviceRows = fns.map((f, i) => {
    const info = fnInfo(f);
    return `| ${String(i + 1).padStart(2, "0")} | ${f} | ${info.complexity} | ${info.exitRisk} | ${info.costShare} | ${dur} months | ${pricingLabel} |`;
  }).join("\n");

  // Exit plan rows
  const exitRows = fns.map((f) => {
    const info = fnInfo(f);
    const exitMonths = info.complexity === "High" ? Math.max(Number(dur) - 3, 6) : info.complexity === "Medium" ? Math.max(Number(dur) - 6, 4) : Math.max(Number(dur) - 8, 3);
    return `| ${f} | Month ${exitMonths} | ${info.complexity === "High" ? "Parallel-run + cutover" : info.complexity === "Medium" ? "Staggered cutover" : "Direct cutover"} | ${info.exitRisk} risk if delayed |`;
  }).join("\n");

  // SLA standards per function category
  const slaRows = fns.map((f) => {
    const info = fnInfo(f);
    const availability = info.complexity === "High" ? "99.5%" : "99.0%";
    const response = info.exitRisk === "High" ? "≤ 2 business hours" : "≤ 1 business day";
    return `| ${f} | ${availability} uptime | ${response} | Monthly review |`;
  }).join("\n");

  // Governance bodies
  const bodies = [
    ["Steering Committee", "Bi-weekly", "Sponsors from both parties + functional leads", "Strategic decisions, escalations, scope changes"],
    ["TSA Manager Office (TMO)", "Weekly",  "Joint TMO lead + workstream leads",          "Operational delivery, SLA tracking, change requests"],
    ["Workstream Leads",        "Daily / weekly", "Function pairs (seller + buyer counterparts)", "Execution, day-to-day issues, knowledge transfer"],
    ["Audit & Compliance",      "Monthly", "Internal audit + finance + legal",            "Cost validation, regulatory exposure, exit readiness"],
  ];

  // Risk grid
  const risks = [
    ["Scope creep", "High", "Tight scope schedules + formal change-control gate at TMO; any expansion priced separately."],
    ["Cost leakage / over-recovery", "Medium", `Apply ${pricingLabel} consistently; monthly cost-validation review by joint Audit & Compliance.`],
    ["Knowledge transfer gaps", "High", "Embed buyer staff in seller teams from Day 1; documented runbooks before any function exits."],
    ["Service degradation", "Medium", "Defined SLAs with credits; escalation path to Steering Committee within 5 business days."],
    ["Regulatory / data-protection breach", "Medium", "Data-processing agreement signed at Day 0; sub-processor list locked; jurisdictional controls per " + geo + "."],
    ["Exit slippage", "High", "Phase-gate exit reviews at 50%, 75%, 90% of TSA term; trigger contingency budget if any milestone slips by >30 days."],
  ];
  const riskRows = risks.map(([r, p, m]) => `| ${r} | ${p} | ${m} |`).join("\n");

  const bodyRows = bodies.map(([b, c, comp, p]) => `| ${b} | ${c} | ${comp} | ${p} |`).join("\n");

  // Pricing notes
  const pricingNote =
    pricing === "cost_plus_5"  ? "Fully-loaded cost + 5% margin to cover seller's overhead and stranded-cost recovery." :
    pricing === "cost_plus_10" ? "Fully-loaded cost + 10% margin, reflecting standard market practice for carve-out TSAs." :
    pricing === "market_rate"  ? "Benchmarked to external market rates from at least two third-party comparables; review quarterly." :
                                 "Negotiated fixed-fee with annual true-up against actual cost-to-serve; cap at +/- 10% variance.";

  const constraintBlock = constraints && constraints.trim()
    ? `\n\n**Known constraints / context:** ${constraints.trim()}`
    : "";

  return `## 01. Executive Summary

This Transitional Service Agreement (TSA) Framework defines the rule-set under which **${S}** will continue to provide selected operational services to **${B}** following completion of the carve-out / acquisition (target close: **${close}**). The framework covers **${fns.length}** functional service lines, runs for **${dur} months** post-close, and is priced on a **${pricingLabel}** basis.

The TSA is designed to (i) preserve operational continuity through close + 1, (ii) provide the buyer time to stand up standalone capability without value leakage, and (iii) protect both parties through clear scope, SLA, exit, and governance provisions. Deal size: **${size}**; sector: **${sec}**; geography: **${geo}**. Integration style: **${intStyle}**.${constraintBlock}

> Key takeaway — A well-scoped TSA is the single largest determinant of carve-out value retention in the first 12 months. Over 60% of carve-outs that miss synergy targets cite TSA-driven operational disruption as the root cause.

## 02. Service Catalog & Scope

The catalog below covers the agreed in-scope functions. Each function is rated for migration complexity, exit risk, indicative cost share, and contracted duration. Out-of-scope items require a formal change request through the TMO.

| # | Function | Complexity | Exit Risk | Cost Share | Duration | Pricing |
| --- | --- | --- | --- | --- | --- | --- |
${serviceRows}

**Scope boundary:** services are provided at the same level, scope and quality as ${S} provided internally in the 12 months preceding the close date, except where explicitly varied in writing. New requirements, geographic expansion, volume increases >10%, or service-level uplifts are change requests and re-priced.

## 03. Pricing & Cost Recovery

The TSA is priced at **${pricingLabel}**. ${pricingNote}

- **Fully-loaded cost** includes direct labour, allocated systems / facilities, third-party pass-throughs, and a fair share of supervisory overhead.
- **Invoicing** is monthly in arrears, in the functional currency of the providing entity, payable within 30 days.
- **True-up** is performed quarterly; under- or over-recovery is settled within 60 days of quarter-end.
- **Pass-through costs** (third-party software licences, hosting, audit fees) are billed at actual with no margin uplift.
- **Foreign-exchange exposure** between functional currencies is borne by ${B} unless otherwise agreed.

## 04. Service Levels (SLAs)

Service performance is measured monthly against the SLA standards below. Persistent breach (two consecutive months) triggers a formal remediation plan; three consecutive breaches escalate to the Steering Committee.

| Function | Availability | Response time | Review cadence |
| --- | --- | --- | --- |
${slaRows}

Service credits for SLA breaches are capped at 15% of the affected function's monthly fee and are the buyer's exclusive remedy for performance shortfalls (subject to material-breach termination rights).

## 05. Governance Structure

Governance follows a four-layer model from execution up to sponsor level. All escalations follow this hierarchy; nothing bypasses the TMO except confirmed safety, regulatory, or fraud issues.

| Body | Cadence | Composition | Purpose |
| --- | --- | --- | --- |
${bodyRows}

**Day-1 readiness:** the joint TMO must be staffed and operational at least 30 days before close. The Steering Committee charter, RACI, and change-control procedure are signed at signing — not at close.

## 06. Exit Planning & Migration Roadmap

Exit is the most underestimated element of a TSA. The plan below sequences function exits to minimise overlap risk and avoid leaving high-dependency functions until the final 60 days.

| Function | Target exit (month) | Cutover approach | Risk if delayed |
| --- | --- | --- | --- |
${exitRows}

**Exit gates:** 50% / 75% / 90% reviews are mandatory. A function is considered exited only when (i) buyer is operating standalone for two consecutive months without seller dependency, (ii) all data and runbooks have been transferred and validated, and (iii) seller resources have been released or repurposed.

## 07. Knowledge Transfer & Stranded Cost

Knowledge transfer runs in parallel with service delivery throughout the term, not as a final-month sprint. The TMO maintains a knowledge-transfer register tracking artefacts (runbooks, system documentation, vendor contracts, escalation lists) by function.

- **Months 1-3:** baseline current state — process maps, RACI, vendor inventory, system access lists, key-person register.
- **Months 4 to (term - 3):** shadowing, buyer-led delivery under seller supervision, role transfers.
- **Final 3 months:** independent operation under seller observation; ramp-down; formal sign-off at exit gate.

**Stranded cost** in the seller is identified at signing and reviewed quarterly. Stranded cost that cannot be eliminated by the seller during the TSA term is recovered through (i) a one-time termination payment, (ii) extended TSA pricing on residual functions, or (iii) third-party transition assistance, by agreement.

## 08. Risk Register & Mitigation

The risks below are the top issues seen on comparable carve-outs in **${sec}** / **${geo}**. The TMO owns the register and refreshes it monthly.

| Risk | Probability | Mitigation |
| --- | --- | --- |
${riskRows}

## 09. Termination & Step-In Rights

- **For convenience by buyer:** any function may be terminated early by giving 60 days' notice; the buyer pays for stranded cost the seller cannot reasonably eliminate.
- **For convenience by seller:** not permitted during the TSA term, except for material breach.
- **For cause:** uncured material breach (30 days for monetary, 60 days for non-monetary) gives the non-breaching party termination rights.
- **Step-in rights:** if seller fails materially, buyer may step in and operate the affected function at seller's continuing cost, capped at the agreed monthly fee + 25%, for up to 90 days while a permanent solution is implemented.
- **Force majeure:** suspends obligations for up to 60 days, after which the affected function may be terminated without penalty.

## 10. Day-1 Checklist

The TSA is only as good as Day-1 execution. The following items must be confirmed in the 30-day window before close:

1. Joint TMO staffed (lead + workstream leads + finance / legal support).
2. Service catalog signed (Schedule 1) with no open items.
3. Pricing schedule signed (Schedule 2) with first 90 days' costs forecast.
4. SLA schedule signed (Schedule 3) including credits.
5. Exit plan signed (Schedule 4) with month-by-month milestones.
6. Data-processing agreement and sub-processor list locked.
7. Steering Committee charter signed + first meeting calendared.
8. Knowledge-transfer register populated for all in-scope functions.
9. Change-control procedure operational; first standing change-request log in place.
10. Communications plan to affected employees confirmed (joint announcement at Day 0).

## 11. Schedules (referenced)

- **Schedule 1** — Service catalog (full function-level scope, volume baselines, exclusions).
- **Schedule 2** — Pricing (cost build-up, true-up methodology, FX treatment).
- **Schedule 3** — SLAs (function-level metrics, measurement, credits).
- **Schedule 4** — Exit plan (function-by-function with milestones, dependencies, owners).
- **Schedule 5** — Governance (RACI, escalation, change control).
- **Schedule 6** — Data protection (DPA, sub-processor list, jurisdictional controls).
- **Schedule 7** — Key personnel (named seller resources committed for term).

---

_Generated offline (deterministic, rule-based) — no AI key was used. Use as a starting baseline; negotiated terms supersede the framework defaults._
`;
}
