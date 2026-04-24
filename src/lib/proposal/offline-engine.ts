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
    client_name: get('Client / Advisory House') || 'Valued Client',
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

  out.push(`## Risks & Mitigation

**⚠ Regulatory clearance delays or remedies required** — *Mitigation:* engage competition counsel pre-filing; prepare behavioural and structural remedy package; proactive regulator dialogue.

**⚠ Key talent departures post-announcement** — *Mitigation:* retention bonuses structured on 12/24/36-month vest; equity acceleration for critical roles; role clarity in first 30 days.

**⚠ Synergy shortfall from execution failure** — *Mitigation:* IMO governance with milestone-linked incentives; named initiative owners; third-party PMO support.

**⚠ Customer attrition during transition** — *Mitigation:* executive outreach to top 50 accounts pre-announcement; service continuity guarantees; dedicated retention team Day 1.

**⚠ Market deterioration between sign and close** — *Mitigation:* MAC provisions in SPA; reverse break fees; hedging of key exposures; accelerated close timeline.

**⚠ Cultural integration friction** — *Mitigation:* culture diagnostics in first 30 days; leadership alignment programme; integration champions network.`);

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
