import { screenRegulatory } from "@/lib/intelligence/context-engine";
type Facts = {
  buyer: string; target: string; sector: string; geography: string;
  deal_size: string; client_name: string; stake: string;
  intent: string; notes: string;
};

type Synergies = {
  revenue: string; cost: string; total: string;
  revenueVal: number; costVal: number; totalVal: number; hasValue: boolean;
};

type SectorContext = {
  dynamics: string[]; risks: string[]; benchmark: string; valueDrivers: string;
};

const SECTORS: Record<string, SectorContext> = {
  Technology: {
    dynamics: ["digital transformation acceleration", "cloud migration tailwinds", "AI/ML integration at scale"],
    risks: ["hyperscaler competition", "AI commoditization", "cybersecurity demand surge"],
    benchmark: "15–25x EBITDA / 5–12x Revenue",
    valueDrivers: "recurring revenue, net revenue retention, platform extensibility, developer ecosystem",
  },
  Healthcare: {
    dynamics: ["aging demographics", "value-based care transition", "AI-driven diagnostics"],
    risks: ["FDA / reimbursement risk", "clinical trial delays", "payer mix concentration"],
    benchmark: "12–18x EBITDA / 3–8x Revenue",
    valueDrivers: "clinical outcomes, provider retention, pipeline depth, regulatory moat",
  },
  "Financial Services": {
    dynamics: ["digital banking transformation", "fintech disruption", "RegTech adoption"],
    risks: ["regulatory change-of-control approval", "capital adequacy post-close", "credit cycle exposure"],
    benchmark: "8–14x EBITDA / 1.5–3x Book Value",
    valueDrivers: "AUM growth, cost/income ratio, digital engagement, credit quality",
  },
  Industrials: {
    dynamics: ["reshoring tailwinds", "energy transition investment", "supply chain reconfiguration"],
    risks: ["commodity price exposure", "cyclical demand", "ESG compliance costs"],
    benchmark: "8–12x EBITDA / 1–2x Revenue",
    valueDrivers: "installed base, service attach rate, cycle-adjusted margins, capex efficiency",
  },
  Retail: {
    dynamics: ["omnichannel transformation", "private label expansion", "supply chain localization"],
    risks: ["consumer sentiment volatility", "margin compression", "inventory risk"],
    benchmark: "6–10x EBITDA / 0.5–1.5x Revenue",
    valueDrivers: "same-store sales, customer lifetime value, gross margin, digital mix",
  },
};

function getSector(s: string): SectorContext {
  const key = Object.keys(SECTORS).find(k => s.toLowerCase().includes(k.toLowerCase()));
  if (key) return SECTORS[key];
  return {
    dynamics: ["industry consolidation", "digital disruption", "regulatory evolution"],
    risks: ["competitive pressure", "execution complexity", "market cycle risk"],
    benchmark: "8–15x EBITDA / 1–3x Revenue",
    valueDrivers: "market share, margin trajectory, cash conversion, growth runway",
  };
}

function parseVal(s: string): number {
  if (!s) return 0;
  const m = /\$?\s*([\d,.]+)\s*([KMBkmb])?/i.exec(s);
  if (!m) return 0;
  const n = parseFloat(m[1].replace(/,/g, ''));
  const u = (m[2] || '').toUpperCase();
  if (u === 'B') return n * 1e9;
  if (u === 'M') return n * 1e6;
  if (u === 'K') return n * 1e3;
  return n;
}

function fmt(n: number): string {
  if (n >= 1e9) return `$${(n/1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${Math.round(n/1e6)}M`;
  if (n > 0) return `$${Math.round(n).toLocaleString()}`;
  return 'TBD';
}

function parseFacts(prompt: string): Facts {
  const get = (key: string) => {
    const re = new RegExp(`${key}\\s*:\\s*([^\\n]+)`, 'i');
    const m = re.exec(prompt);
    return m ? m[1].trim() : '';
  };
  return {
    buyer: get('Buyer / Acquirer') || get('Buyer'),
    target: get('Target Company') || get('Target'),
    sector: get('Sector'),
    geography: get('Geography') || get('Country'),
    deal_size: get('Deal Size') || get('Value'),
    client_name: (get('Client / Advisory House') || '').replace(/^N\/?A$/i, '') || 'Valued Client',
    stake: get('Stake'),
    intent: get('Strategic Intent'),
    notes: get('Notes'),
  };
}

function compSyn(val: number): Synergies {
  if (val === 0) return { revenue: 'TBD', cost: 'TBD', total: 'TBD', revenueVal: 0, costVal: 0, totalVal: 0, hasValue: false };
  const revenue = val * 0.10, cost = val * 0.13;
  return { revenue: fmt(revenue), cost: fmt(cost), total: fmt(revenue + cost), revenueVal: revenue, costVal: cost, totalVal: revenue + cost, hasValue: true };
}
export function generateOfflineProposal(prompt: string): string {
  const f = parseFacts(prompt);
  const syn = compSyn(parseVal(f.deal_size));
  const sec = getSector(f.sector);
  const B = f.buyer || 'Buyer';
  const T = f.target || 'Target';
  const S = f.sector || 'the sector';
  const G = f.geography || 'the target geography';
  const V = f.deal_size || 'an indicative value';
  const hasGeo = G !== 'the target geography';
  const out: string[] = [];

  // ── Advisor Verdict (always first, both modes) ──
  const revPct = Math.round(syn.revenueVal / Math.max(parseVal(f.deal_size), 1) * 100);
  const costPct = Math.round(syn.costVal / Math.max(parseVal(f.deal_size), 1) * 100);
 out.push(`## 1. Deal Thesis

- **Strategic:** ${B} acquires ${T} in ${S}${hasGeo ? ` across ${G}` : ''} — ${syn.hasValue ? `${syn.total} synergy envelope` : 'synergy envelope pending diligence'} validates ${sec.dynamics[0]} as the platform thesis.
- **Financial:** ${V} consideration${syn.hasValue ? ` against ${revPct + costPct}% combined synergy = ${Math.round((1 - (syn.totalVal / Math.max(parseVal(f.deal_size), 1))) * 100)}% net cost basis at full capture` : ''}; ${parseVal(f.deal_size) >= 1e9 ? 'large-cap' : 'mid-market'} sector multiples imply ${sec.benchmark}.
- **Operational:** ${sec.valueDrivers}.

## 2. Deal Score

| Dimension | Score | Rationale |
|---|---|---|
| Market | ${syn.hasValue && (syn.totalVal/Math.max(parseVal(f.deal_size),1)) > 0.20 ? '8' : '6'}/10 | ${sec.dynamics[0]} |
| Company | 7/10 | Diligence-pending; assumes Q-of-E confirmation |
| Synergy | ${syn.hasValue ? (syn.totalVal/Math.max(parseVal(f.deal_size),1) > 0.22 ? '8' : '6') : '5'}/10 | ${syn.hasValue ? `${syn.total} captured 30/70/100` : 'value not quantified'} |
| Execution Risk (inverted) | ${parseVal(f.deal_size) >= 5e9 ? '5' : '7'}/10 | ${parseVal(f.deal_size) >= 5e9 ? 'mega-cap regulatory + integration complexity' : 'manageable scope'} |

**Composite: ${syn.hasValue ? Math.round(((syn.totalVal/Math.max(parseVal(f.deal_size),1)) > 0.20 ? 7.5 : 6.2) * 10) / 10 : 6.0} / 10 — Verdict: ${syn.hasValue && (syn.totalVal/Math.max(parseVal(f.deal_size),1)) > 0.20 ? 'Strong' : 'Moderate'}**

## 3. Synergy Model

| Type | Year 1 | Year 2 | Year 3 | Confidence |
|---|---|---|---|---|
| Revenue Synergy | ${syn.hasValue ? '$' + Math.round(syn.revenueVal*0.30/1e6) + 'M' : 'TBD'} | ${syn.hasValue ? '$' + Math.round(syn.revenueVal*0.70/1e6) + 'M' : 'TBD'} | ${syn.hasValue ? syn.revenue : 'TBD'} | 60% |
| Cost Synergy | ${syn.hasValue ? '$' + Math.round(syn.costVal*0.30/1e6) + 'M' : 'TBD'} | ${syn.hasValue ? '$' + Math.round(syn.costVal*0.70/1e6) + 'M' : 'TBD'} | ${syn.hasValue ? syn.cost : 'TBD'} | 75% |
| One-time Cost | ${syn.hasValue ? '$(' + Math.round(parseVal(f.deal_size)*0.025/1e6) + 'M)' : 'TBD'} | ${syn.hasValue ? '$(' + Math.round(parseVal(f.deal_size)*0.015/1e6) + 'M)' : 'TBD'} | — | — |
| **Net Run-rate** | — | — | ${syn.hasValue ? syn.total : 'TBD'} | — |

## 4. Risk Engine (Top 4)

| Risk | Type | Probability | $ Impact | Mitigation |
|---|---|---|---|---|
| Regulatory clearance delays | regulatory | 35% | ${syn.hasValue ? '$' + Math.round(parseVal(f.deal_size)*0.02/1e6) + 'M' : '~2% of EV'} | Pre-filing engagement; behavioural remedies prepared |
| Talent attrition (top 100) | execution | 45% | ${syn.hasValue ? '$' + Math.round(syn.revenueVal*0.15/1e6) + 'M' : '~15% of revenue synergy'} | Retention bonuses 12/24/36-mo + equity acceleration |
| Synergy capture shortfall | execution | 50% | ${syn.hasValue ? '$' + Math.round(syn.totalVal*0.30/1e6) + 'M' : '~30% of synergy plan'} | IMO with milestone incentives + named owners |
| Customer attrition during transition | market | 25% | ${syn.hasValue ? '$' + Math.round(syn.revenueVal*0.20/1e6) + 'M' : '~20% of revenue synergy'} | Top 50 account outreach + service continuity SLAs |
// Regulatory screener
  const reg = screenRegulatory({ deal_size_usd: parseVal(f.deal_size), geography: G, sector: S });
  if (reg.flags.length > 0) {
    const checklistRows = reg.checklist.map((c) => "| " + c.jurisdiction + " | " + c.trigger + " | " + c.action + " | " + c.timeline + " |").join("\n");
    out.push("## 4a. Regulatory Screening\n\n**Filings flagged:** " + reg.flags.join(" · ") + "\n\n| Jurisdiction | Trigger | Action | Timeline |\n|---|---|---|---|\n" + checklistRows + "\n\nPre-filing antitrust counsel engagement and remedy planning are mandatory before bid submission.");
  }
## 5. Valuation View

- Implied EV/EBITDA: indicative ${parseVal(f.deal_size) >= 1e9 ? '12-15x' : '8-12x'} (EBITDA assumption pending Q-of-E)
- Sector benchmark: ${sec.benchmark}
- Premium logic: pay control premium of ~25-30% justified by ${syn.hasValue ? Math.round((syn.totalVal/Math.max(parseVal(f.deal_size),1))*100) + '% synergy / EV ratio' : 'capability acquisition value'}

## 6. Scenario Analysis

| Scenario | Synergy Capture | Net Outcome | Probability |
|---|---|---|---|
| Base | 70% | ${syn.hasValue ? '$' + Math.round(syn.totalVal*0.70/1e6) + 'M' : 'TBD'} | 50% |
| Upside | 100% | ${syn.hasValue ? syn.total : 'TBD'} | 25% |
| Downside | 35% | ${syn.hasValue ? '$' + Math.round(syn.totalVal*0.35/1e6) + 'M' : 'TBD'} | 25% |

## 7. What Must Be True

- ${T} EBITDA quality confirmed at announced level (no >5% adjustment)
- Top 10 customer retention >90% through close +12 months
- Regulatory clearance secured within 9 months
- Integration costs held below ${syn.hasValue ? '$' + Math.round(parseVal(f.deal_size)*0.04/1e6) + 'M' : '4% of EV'}
- Year 1 synergy capture ≥30% of plan (leading indicator for full curve)

## 8. Contrarian View — Why This Could Fail

The ${syn.hasValue ? Math.round((syn.totalVal/Math.max(parseVal(f.deal_size),1))*100) + '%' : 'unquantified'} synergy thesis assumes seamless integration in a sector experiencing ${sec.risks[0]}. Historical deals of this profile show 40-50% synergy slippage when ${sec.risks[1]} materializes; if that occurs alongside execution drift, the deal could destroy 15-25% of equity value despite a structurally sound thesis.

## 9. IC Questions (Top 5)

1. What is the customer concentration in ${T}'s top 10 accounts and contractual change-of-control protection?
2. What ${syn.hasValue ? 'percentage of $' + Math.round(syn.costVal/1e6) + 'M cost synergies' : 'cost synergy'} requires headcount reduction and what is the regulatory friction?
3. What is the IT carve-out / integration cost beyond the stated one-time figure?
4. Which competitor reactions (price, M&A counter-bid) could compress the synergy capture window?
5. What pricing power exists post-close to defend the ${sec.benchmark} multiple at exit?

## 10. Recommendation: ${syn.hasValue && (syn.totalVal/Math.max(parseVal(f.deal_size),1)) > 0.22 ? 'GO' : 'CONDITIONAL GO'}

- **Confidence:** ${syn.hasValue ? (syn.totalVal/Math.max(parseVal(f.deal_size),1)) > 0.22 ? '70%' : '55%' : '45%'}
- **Justification:** ${syn.hasValue ? `Composite score and ${Math.round((syn.totalVal/Math.max(parseVal(f.deal_size),1))*100)}% synergy/EV ratio support the thesis even with 50% slippage. Proceed with binding QoE, customer references on top 10 accounts, and regulator pre-clearance dialogue.` : 'Insufficient value data prevents IC-grade scoring. Commission Phase 1 commercial + financial diligence before bid commitment.'} Decision-maker view: ${f.client_name !== 'Valued Client' ? f.client_name : 'IC / Board'} should ${syn.hasValue && (syn.totalVal/Math.max(parseVal(f.deal_size),1)) > 0.22 ? 'authorize bid' : 'authorize diligence with bid contingent on findings'}.`);
  out.push(`## Executive Summary

This proposal presents a comprehensive advisory framework for the proposed transaction between **${B}** and **${T}**${V === 'an indicative value' ? '' : `, with an indicative value of **${V}**`}. The transaction sits within the ${S} sector${hasGeo ? `, with primary exposure in ${G}` : ''}, and creates a combined entity with enhanced market position, pricing power, and a defensible competitive moat.

${syn.hasValue ? `Based on our intelligence engine, the combined entity offers an estimated **${syn.total}** in total synergy value — **${syn.revenue}** revenue synergies and **${syn.cost}** cost synergies — achievable over a 36-month realisation curve. ` : ''}Strategic rationale centres on capability acquisition, geographic expansion, and revenue synergy capture, anchored in the sector's ${sec.dynamics.slice(0,2).join(' and ')}.

- **Transaction value:** ${V}
- **Total synergy estimate:** ${syn.total}
- **Sector benchmark:** ${sec.benchmark}
- **Advisory scope:** End-to-end mandate from diligence through integration`);

  out.push(`## Why This Deal Matters

The transaction is strategically significant given convergent ${S} sector dynamics:
- ${sec.dynamics[0][0].toUpperCase() + sec.dynamics[0].slice(1)}
- ${sec.dynamics[1][0].toUpperCase() + sec.dynamics[1].slice(1)}
- ${sec.dynamics[2][0].toUpperCase() + sec.dynamics[2].slice(1)}

For **${B}**, the acquisition delivers accelerated market access${hasGeo ? ` in ${G}` : ''} and capability consolidation that would take 3–5 years to build organically. Key headwinds to monitor include ${sec.risks.slice(0,2).join(', ')}, and ${sec.risks[2]}.`);

  out.push(`## Strategic Rationale

${B}'s acquisition of ${T} enables: (i) accelerated market penetration${hasGeo ? ` in ${G}` : ''}; (ii) complementary capability acquisition offsetting organic development timelines; (iii) improved competitive positioning against sector consolidators; and (iv) access to ${T}'s customer relationships, intellectual property, and distribution channels.

The investment thesis aligns with ${sec.dynamics[0]} as the primary value driver, with secondary upside from ${sec.valueDrivers}. The combination creates a platform of sufficient scale to pursue further consolidation and establish market leadership within 24–36 months post-close.`);

  out.push(`## Value Creation Thesis

Value creation spans three horizons:

**Near term (0–12 months):** Cost synergy capture via G&A consolidation, procurement leverage, technology rationalisation, and duplicate facility removal${syn.hasValue ? ` (**${syn.cost}**)` : ''}. IMO mobilisation, Day-1 readiness, and quick-win identification within the first 60 days.

**Medium term (12–24 months):** Revenue synergy realisation through cross-sell, pricing optimisation, geographic expansion, and platform bundling${syn.hasValue ? ` (**${syn.revenue}**)` : ''}. Organisational redesign complete; cultural integration programme operating; combined GTM launched.

**Long term (24–48 months):** Multiple arbitrage through transformed operating profile, platform expansion via bolt-on M&A, and strategic exit optionality. Combined entity positioned as sector consolidator with demonstrable operating leverage.`);

  out.push(`## Synergy Roadmap

${syn.hasValue ? `Total synergy value of **${syn.total}** captured on a phased realisation curve: **30%** in Year 1, **70%** cumulative by Year 2, **100%** by Year 3.

**Revenue Synergies — ${syn.revenue}**
- Cross-sell into combined customer base
- Geographic expansion via acquirer distribution
- Pricing power from broader product portfolio
- Platform bundling and attach-rate uplift
- New product co-development

**Cost Synergies — ${syn.cost}**
- G&A consolidation (finance, HR, legal, executive)
- Procurement leverage on combined spend
- Technology stack rationalisation
- Facilities consolidation and footprint optimisation
- Headcount overlap elimination` : `Detailed synergy quantification to be completed during Phase 1 of diligence. Typical ${S} sector transactions of this profile deliver 5–8% cost synergy envelope and 2–4% revenue synergy uplift against combined base, realised on a 36-month curve (30% / 70% / 100%).`}`);

  out.push(`## Day-1 Readiness

Day-1 priorities centre on customer continuity, employee communication, and regulatory compliance. The Integration Management Office (IMO) activates within 48 hours of signing, with daily stand-ups for the first 30 days, formal escalation protocols, and a live synergy tracking dashboard reporting weekly to the Steering Committee.

Critical Day-1 deliverables:
- Customer communication package (top 50 accounts)
- Employee town halls in all major locations
- Regulatory filings and change-of-control notices
- Financial reporting cadence established
- IT access and security provisioning
- Legal entity and contract novation roadmap`);

  out.push(`## 100-Day Plan

The 100-day programme executes in three 30-day waves:

**Days 1–30 — Stabilise:** Establish IMO governance, publish integration charter, confirm Day-1 readiness, conduct leadership alignment sessions, baseline performance metrics, lock retention for top 100 talent.

**Days 31–60 — Integrate:** Finalise target operating model, launch synergy workstreams with named initiative owners, communicate org design to all employees, complete customer and supplier outreach, activate combined GTM plan.

**Days 61–100 — Accelerate:** Execute first restructuring wave, validate Year-1 synergy trajectory against plan, consolidate reporting and governance, publish Day-100 milestone review to Board, secure commitments for Year-2 initiatives.`);

  out.push(`## Functional Workstreams

**Finance:** Chart of accounts alignment · combined reporting · treasury consolidation · tax optimisation · audit transition · working capital normalisation.

**HR & Organisation:** Org design and role mapping · retention for key talent · benefit harmonisation · culture integration programme · works council engagement.

**IT & Technology:** Systems inventory · ERP migration roadmap · data migration and governance · cybersecurity alignment · tech stack decommission plan.

**Operations:** Supply chain consolidation · footprint review · quality system integration · customer service continuity · SLA harmonisation.

**Sales & Commercial:** CRM consolidation · account rationalisation · pricing architecture · commission plan harmonisation · pipeline migration.

**Procurement:** Vendor rationalisation · combined spend analysis · contract renegotiation · preferred supplier programme.

**Legal & Regulatory:** Regulatory filings · contract assignment and novation · IP ownership transfer · licence rationalisation · change-of-control notices.

**Tax:** Entity structure optimisation · transfer pricing review · indirect tax harmonisation · tax attribute preservation · BEPS/Pillar 2 compliance.

**Cyber:** Security posture assessment · identity and access convergence · data classification unification · incident response consolidation · zero-trust roadmap.`);

  out.push(`## Governance Model

Post-close governance establishes a combined-entity Board with clear fiduciary mandates and integration oversight. The Integration Steering Committee (SteerCo) convenes bi-weekly; the IMO meets weekly; the Board receives monthly reports.

- **Board composition:** ${B} majority + ${T} representation + independent directors
- **Integration SteerCo:** CEO, CFO, COO, CTO from both entities + IMO Lead
- **Reporting cadence:** Weekly IMO · Bi-weekly SteerCo · Monthly Board
- **Decision rights:** RACI matrix per workstream with formal Day-1 escalation protocol`);

 out.push(`## Risk & Mitigation

**Regulatory Clearance Delays** — Mitigation: engage competition counsel pre-filing; prepare behavioural and structural remedy package; proactive regulator dialogue.

**Key Talent Departures** — Mitigation: retention bonuses structured on 12/24/36-month vest; equity acceleration for critical roles; role clarity in first 30 days.

**Synergy Shortfall from Execution Failure** — Mitigation: IMO governance with milestone-linked incentives; named initiative owners; third-party PMO support.

**Customer Attrition During Transition** — Mitigation: executive outreach to top 50 accounts pre-announcement; service continuity guarantees; dedicated retention team Day 1.

**Market Deterioration Between Sign and Close** — Mitigation: MAC provisions in SPA; reverse break fees; hedging of key exposures; accelerated close timeline.

**Cultural Integration Friction** — Mitigation: culture diagnostics in first 30 days; leadership alignment programme; integration champions network.`);

  out.push(`## Why Us

Our team combines deep ${S} sector expertise with proven M&A advisory delivery${hasGeo ? ` across ${G} markets` : ''}. We bring:
- Dedicated M&A practice with 100+ completed deals in similar profile
- Integration Management Office specialists embedded in 80%+ of engagements
- Proprietary synergy benchmarking database covering comparable transactions
- On-the-ground regulatory navigation and stakeholder relationships
- End-to-end delivery capability from diligence to Day-100 and beyond`);

  out.push(`## Immediate Next Steps

1. Retain Deal IQ AI on exclusive mandate with fee structure aligned to close
2. Launch financial, legal, commercial, and technical due diligence; establish VDR access
3. Engage competition counsel${hasGeo ? ` in ${G}` : ''} for pre-clearance strategy
4. Engage ECM desk / treasury for consideration structure and shareholder approvals
5. Appoint IMO lead; begin Day-1 readiness planning in parallel with DD
6. Prepare board resolution for ${B}; engage key institutional shareholders`);

  return out.join('\n\n');
}
