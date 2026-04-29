/**
 * Big4-style PMI Proposal content kit.
 * Embedded into the AI prompt when generating Integration Blueprint or PMI proposals.
 * Works as a content backbone — AI tailors specifics to deal facts.
 */

export const BIG4_PMI_KIT = `
=== BIG4 PMI PROPOSAL CONTENT KIT (BACKBONE) ===

Use this kit as the content scaffold. Replace all <angle bracket> placeholders with deal-specific
inputs. Tag any uncertain numbers as (Illustrative benchmark) or (To be validated).

---

## SECTION 1 — DEAL CONTEXT
Acquirer snapshot: segments / geography / channels / FY revenue+EBITDA (Client provided / Public source)
Target snapshot: same fields
Deal basics: type / stage / closing timeline / integration intent (full / standalone / hybrid)

Strategic rationale (pick the relevant 3-4):
- Portfolio expansion (products / categories / capability)
- Channel access (OTX / institutional / enterprise / modern trade / e-com)
- Geographic expansion (tier 2/3 / export markets)
- Scale benefits (procurement / shared services / network optimisation)
- Capability and talent (R&D / regulatory / IP / operational know-how)

Key focus areas (use this exact list, in this order):
1. Go-to-market
2. Talent and culture
3. Supply chain and operations
4. Tech and digital
5. Finance
6. Tax
7. ESG and sustainability
8. Corporate governance and compliance
9. IMO (coordinating layer)

---

## SECTION 2 — SYNERGIES (revenue and cost)

REVENUE SYNERGY LEVERS (use 3-4 most relevant):
Lever 1 — Sales force effectiveness and cross-sell
  Cross-sell complementary portfolio into existing accounts
  Upsell and bundle offers across product lines
  Enablement: training, incentives, playbooks, CRM workflows

Lever 2 — Channel expansion
  Extend target products into underpenetrated channels via acquirer distribution
  Tier 2/3 expansion where acquirer has stronger reach
  Specialty channels (institutions, key accounts, clinics)

Lever 3 — Pricing and mix
  Harmonise pricing architecture, trade terms, discounting
  Improve mix through portfolio rationalisation
  Strengthen value-based selling

Lever 4 — International expansion
  Prioritise markets by regulatory readiness + channel feasibility
  In-licensing / partner strategy
  Integrate export and regulatory operating model

For EACH lever include "What must be true":
  Data required, retention assumptions, supply capacity, regulatory approvals, commercial capability

COST SYNERGY LEVERS:
Org structure: remove duplicate roles, align spans/layers, consolidate shared services
Procurement: consolidate spend, renegotiate vendors, rationalise suppliers, standardise specs
Supply chain: network optimisation, warehouse consolidation, freight leverage, S&OP harmonisation, WC improvement
Sales and marketing: brand spend consolidation, agency leverage, rationalise overlapping field roles
IT: application rationalisation, infra consolidation, licence optimisation, ERP/CRM consolidation

REALISATION CURVE (always show this):
  0-6 months: quick wins + leakage control
  6-12 months: structural initiatives start delivering
  12-24 months: run-rate consolidation
  24+ months: optimisation + second-wave synergies

ONE-TIME INTEGRATION COSTS (always separate from run-rate):
  Systems migration, severance, consultant support, facility changes, legal/regulatory

SYNERGY GOVERNANCE (always include):
  Synergy owner per lever
  Weekly tracking + monthly SteerCo
  KPI definitions + benefit validation rules (avoid double-counting)
  Single source of truth tracker (initiative register)

---

## SECTION 3 — FUNCTIONAL POV (use page template per function)

Functional page template:
  Function: <name>
  Key opportunities: 3-6 value levers
  Key risks and watchouts: 3-6 practical risks
  Key interventions: 5-8 concrete actions we will drive
  Deliverables: 3-6 tangible artefacts
  Day 1 critical items: 2-6 (only where relevant)

Per-function content backbones:

IMO:
  Opportunities: integration blueprint, governance cadence, synergy tracking, Day 1 readiness, integration cost tracking, contract/TSA tracking, change orchestration
  Deliverables: IMO charter, governance packs, RAID log, integrated master plan, Day 1 pack, synergy tracker

GTM (Sales/Marketing):
  Opportunities: cross-sell + account expansion, channel expansion, terms harmonisation, incentive design, sales effectiveness
  Interventions: GTM target state design, key account heatmap, pricing/trade terms governance, CRM enablement
  Deliverables: GTM strategy deck, account heatmap, terms harmonisation plan, incentive plan

Talent and Culture:
  Opportunities: retain critical talent, align org design, culture integration
  Interventions: role mapping, spans + layers, retention plan, comms plan, policy harmonisation, performance management alignment
  Deliverables: org design, role map, retention plan, comms plan, policy tracker

Supply chain and Operations:
  Opportunities: network consolidation, logistics efficiency, inventory + WC, S&OP standardisation, quality alignment
  Interventions: network assessment, supplier consolidation, S&OP harmonisation, quality alignment
  Deliverables: network plan, supplier consolidation plan, S&OP blueprint, WC plan

Tech and Digital:
  Opportunities: app rationalisation, licence optimisation, core system consolidation (ERP/CRM/reporting), cyber + identity consolidation
  Interventions: current state assessment, Day 1 risk scan, target architecture, data migration plan, cutover plan, cyber/access controls
  Deliverables: tech landscape map, Day 1 checklist, cutover plan, target roadmap, migration plan

Finance:
  Opportunities: faster close, consolidated reporting, working capital optimisation, treasury + controls uplift
  Interventions: close calendar alignment, COA/DOA harmonisation, controls policies, statutory readiness, WC levers (AR/AP/inventory/credit)
  Deliverables: finance integration plan, close calendar, COA mapping, WC initiative list, KPI dashboard

Tax:
  Opportunities: structure simplification, ETR optimisation, post-close steps, litigation tracking, risk controls
  Interventions: tax attribute review, integration steps, compliance alignment, litigation tracker, transaction tax positions
  Deliverables: tax integration plan, litigation tracker, compliance calendar, advisory memos

ESG:
  Opportunities: standardise reporting boundary, align targets/disclosures, supplier ESG compliance
  Interventions: materiality + reporting alignment, data model + controls for ESG metrics, disclosure readiness
  Deliverables: ESG roadmap, reporting boundary note, data + controls plan

Governance/Compliance:
  Opportunities: unified policy framework, fraud risk prevention, training/compliance culture
  Interventions: code of conduct + ABAC alignment, fraud risk assessment, whistleblowing readiness, training/comms
  Deliverables: policy gap assessment, fraud risk register, training plan, governance committee model

---

## SECTION 4 — VALUE PROPOSITION

Why us for THIS deal:
  Deal-specific understanding of integration risks + value levers
  Ability to run IMO and functional workstreams in parallel
  Proven synergy capture discipline with tracking rigour
  Multi-disciplinary coverage (Ops/Tech/Finance/Tax/HR/Compliance)

Differentiators (tie each to an outcome):
  Faster Day 1 readiness via standard playbooks
  Better synergy capture via initiative-level governance + KPI tracking
  Lower disruption via cutover governance + hypercare model
  Better retention via structured talent + change approach

Tools/IP (generic, not trademarked):
  Synergy benchmark database + initiative register templates
  Program management tooling: RAID, interdependencies, milestone tracking
  Contract + TSA tracker templates
  Change/communication toolkits, stakeholder maps, readiness surveys

---

## SECTION 5 — APPROACH AND WORKPLAN

Phase 0 — Mobilise (Week 0-1):
  Kickoff, governance, workplan baseline, data request, stakeholder mapping
  Deliverables: IMO charter, integrated plan v1, RAID log v1

Phase 1 — Pre-close readiness (Week 1-4):
  Day 1 checklist, cutover planning, synergy initiative identification
  Deliverables: Day 1 plan, synergy register v1, comms plan v1

Phase 2 — Close + Day 1 execution (Close week):
  War room, issue resolution, cutover governance, stakeholder comms
  Deliverables: Day 1 execution pack, hypercare plan

Phase 3 — Post-close integration (Week 1-12):
  Functional integration execution, synergy tracking, operating cadence
  Deliverables: 100-day plan, synergy tracker, monthly reports

Phase 4 — Hypercare + stabilisation (Week 1-8 post-close):
  BAU stabilisation, incident tracking, performance recovery
  Deliverables: hypercare dashboard, closure report

---

## ENFORCEMENT RULES (the AI MUST follow)
1. NEVER invent specific synergy numbers — use ranges with (Illustrative benchmark) tag
2. NEVER use em dashes
3. ALWAYS tag uncertain data: (Client provided), (Public source), (Illustrative benchmark), (To be validated)
4. PRESERVE existing structure when editing — work in EDIT MODE not CREATION MODE
5. Generic content rule: every addition MUST link to deal rationale, value creation, or integration execution
6. Crisp executive Big4 language only — no fluff, no AI filler
=== END KIT ===
`;
