# Deal IQ AI — Platform Review & Enterprise-Grade Roadmap
### A senior Big4 post-deal M&A partner's teardown of the current build, and the plan to make it enterprise-ready

*Reviewer's lens: a Big4 / MBB partner who runs post-deal engagements — buy-side
diligence, PMI, carve-out, separation, JV stand-up, synergy and TSA — and who
decides whether an intelligence product and its generated collateral are good
enough to (a) shape where I spend my origination time and (b) go in front of a
client to win the mandate.*

*Scope guardrail (from the product owner, and I agree with it): **Deal IQ is a
deal-intelligence and outreach / sales engine. It is not a project-management
tool.** Everything below is judged against that definition. Where the product
has drifted into execution tracking, I say so and recommend cutting it.*

*Evidence base: the live screenshots and two AI-generated decks in the `Deal-IQ`
Drive folder (advisory proposal deck + PMI playbook deck), plus a read of the
codebase (`src/app`, `src/lib`) and the existing
`PROPOSAL_GENERATION_STRATEGIC_ROADMAP.md`.*

---

## 0. Verdict in one paragraph

The platform is **ambitious and, in places, genuinely differentiated** — the
deal-DNA classifier, comparables grounding, canonical deal-model discipline,
BYO-API-key economics, and the themes/signals origination layer are real assets
that most Big4 internal tools do not have. But it is **not yet enterprise-grade,
and the gap is not features — it is trust, focus, and reliability.** The single
generated deck I was handed to review would have **ended a client relationship**:
its title page and its entire body describe two different transactions. That one
defect tells me the system can emit a confident, beautifully formatted document
that is factually incoherent — which is the worst possible failure mode for a
partner-facing tool. The right move now is **narrow the surface, harden the core,
and make every generated artifact provably consistent** before adding anything.

**Overall grade today: 6/10** as a demo; **3/10** as something I would let a
partner send to a client unsupervised. The roadmap below is how it gets to a
defensible 9.

---

## 1. What I actually saw in the generated artifacts (the damning specifics)

I review generated output the way I review a junior's first draft before it goes
to a client. Here is what the two decks and the screens show, verbatim from the
files:

### 1.1 CRITICAL — Entity data-bleed / cross-contamination *(mandate-ending)*
The advisory deck is titled and cover-branded **"Eicher Motors → Volvo Financial
Services India"** (Financial Services). Every substantive slide — executive
summary, verdict, synergy model, risk register, valuation, IC questions, deal
thesis, 100-day plan — is about **"Sodexo's acquisition of Shashi Catering
Services"** (contract catering, Western India). The two have nothing to do with
each other. A CFO would spot this in five seconds and never take a second
meeting. **This is the number-one thing to fix and it is a hard release
blocker.** It means the title/cover layer and the narrative layer are drawing
from different sources with no consistency gate between them.

### 1.2 CRITICAL — Numbers that do not reconcile inside the same document
- Cover shows **"₹403.5M ENTERPRISE VALUE"**; the body repeatedly states the EV
  is **"₹3.0B"**. The **synergy** figure (₹403.5M run-rate) has been rendered
  into the **Enterprise Value** slot on the cover. A valuation product that
  confuses EV with synergy on page 1 is not defensible.
- Deal size is carried as a **bucket range — "INR 4bn–21bn"** — yet the deck
  emits precise figures (₹403.5M, ₹3.0B, 13.5% synergy/EV, 13-month payback)
  with no bridge back to that range. This is *false precision*, the exact thing
  a partner is trained to strip out.
- The Risk Register appears **twice** with contradictory headers ("6 at high
  probability" vs "1 at high probability") and a second copy with empty
  Type/Impact cells. **Conditions & Kill Switches** and **Deal Thesis** also
  duplicate. The deck is padding slide count with repeated sections.

### 1.3 HIGH — The PMI deck is a project-management tracker, which is out of scope
The PMI playbook deck is built entirely from **% progress, milestone status
(Complete/Open), activity start/end weeks, and "2/7 Day-1 ready"** — i.e. a live
integration tracker. That is a *project-management* artifact. Per the product
definition, Deal IQ is **not** a PM tool. A pitch-stage partner does not have
real progress data (the deal hasn't closed); showing "39% avg progress / GTM 0%
complete" on a *sales* deck is meaningless and slightly embarrassing. See §3 for
the reposition-or-cut recommendation.

### 1.4 MEDIUM — Sector reasoning is still generic; entities are placeholders
- The synergy screen shows **Revenue total $19.00M and Cost total $19.00M —
  identical** — with generic functional-unit rows ("HQ & Core G&A", "IT
  Infrastructure"). That is a default table, not a modelled one.
- The Financial-Services deck reasons like a *catering* deck. Nothing in it
  touches the things an FS post-deal partner would expect: capital treatment,
  regulator conduct rules, book quality, funding/liquidity, or (for Volvo
  Financial Services India specifically) captive-finance economics. The existing
  proposal roadmap already flags this; the sample confirms it is unresolved.

### 1.5 MEDIUM — Rough edges visible in the product UI itself
The Themes screen surfaces internal failure text to the user: *"Used
deterministic fallback labels for 4 of 6 themes (AI labeling failed for those).
First error: AI returned empty or placeholder content."* Diagnostic plumbing is
leaking into a partner-facing surface. Enterprise tools degrade silently and
gracefully; they do not narrate their own AI failures on screen.

**None of these are cosmetic.** They are coherence, evidence, scope, and
reliability defects — precisely the dimensions on which a partner's credibility
rests.

---

## 2. Where the product is genuinely strong (protect these)

Being fair, several things here are better than most Big4 internal tooling:

1. **Deal-DNA conditioning exists in the code** — `deal-classifier`,
   `context-engine` (deal_type / sector / geography / regulatory screen),
   `advanced/prompts` per mandate type (buy_side, carve_out, JV, distressed…).
   The skeleton to say "*this* deal" rather than "M&A in general" is present.
2. **Canonical deal-model discipline** — the "single source of truth so every
   module cites the same numbers" instruction is exactly the right architecture.
   It is not yet *enforced* (see §1.1/1.2), but the intent is correct.
3. **Comparables grounding + "do not invent" instruction** — precedent-based
   argumentation is how partners actually win, and it is wired in.
4. **Origination layer (Themes Radar, Signal Intel Hub, Bolt-on Engine, Advisor
   Map)** — this is the genuinely novel part. Most tools help you *write* about a
   deal; few help you *find* and *prioritise* it. This is the strategic moat.
5. **BYO-API-key economics** — pushing model cost to the user's own keys is what
   makes a free-tier-hosted product viable for a firm. Keep it.
6. **Voice discipline / banned-phrase gate** — the anti-"AI-slop" ruleset is
   strong and partner-appropriate.

The roadmap is deliberately built to **harden and deepen these six**, not
replace them.

---

## 3. Feature portfolio decision: Keep / Improve / Cut / Add

The platform has **~25 modules** in the sidebar and route tree (Pipeline,
Prioritization, Triage, Themes, Signals, Bolt-on, Advisor Map, Narratives,
Proposals, PMI Studio, Synergy, TSA, Brief, Insights, Cognition, Exceptions,
Resolution Tasks, Mapping, Uploads, Enrich, Value-Test, Analytics, Activity,
Exports, Admin…). **This is too many for the team size and it is diluting
quality.** Enterprise-grade means *fewer, deeper, reliable* surfaces. Decisions:

### 3.1 KEEP & DEEPEN — the two-pillar core
**Pillar A — Deal Intelligence (find & prioritise):**
- **Deal Pipeline + Import/Ingestion** — the spine. Harden data quality (see the
  "INR 4bn–21bn" range problem — normalise to a numeric value + currency at
  ingest).
- **Themes Radar + Signal Intel Hub** — the origination moat. Fix the visible
  AI-labeling failures; make labeling reliable, not "fallback".
- **Bolt-on Engine + Advisor Map** — high-value, differentiated. Keep.
- **Prioritization / Triage** — good, but merge into one "Origination Queue" (see
  cuts).

**Pillar B — Outreach / Sales (win the mandate):**
- **M&A Proposals** — the flagship deliverable. This is where the coherence bug
  lives and where §4/§5 focus.
- **Synergy Quantification + TSA Generator** — keep as *proposal artifacts*
  (evidence for the pitch), not standalone calculators. Fix the placeholder
  ($19M = $19M) modelling.
- **Account Narratives + Executive Brief** — keep; these are outreach assets.

### 3.2 IMPROVE (priority order)
1. **Proposals** — enforce entity + numeric coherence (the §1.1/1.2 fixes).
2. **Synergy / TSA** — real bottom-up builds with basis lines, not default tables.
3. **Themes labeling** — reliability; stop leaking failure text.
4. **Ingestion normalisation** — deal size → {value, currency}, not a range string.

### 3.3 CUT or REPOSITION (this is where focus comes from)
- **PMI Playbook Studio → reposition, do not track.** Strip the execution
  tracker (% progress, milestone Complete/Open, activity Gantt, "Day-1 ready
  2/7"). Keep only the **pitch-grade integration *point of view*** — "here is how
  we would run the first 100 days and why our approach de-risks *your* deal" — as
  a proposal section. If it keeps a live tracker, it violates the product
  definition. **Recommendation: cut the tracking half entirely.**
- **Cognition / Insights / Value-Test / Exceptions / Resolution-Tasks /
  Mapping** — these read as half-built experiments and internal plumbing exposed
  as pages. **Recommendation: pull them out of the partner-facing nav** (keep the
  code behind a feature flag if useful for R&D). Every extra half-working tab
  lowers the perceived quality of the whole product.
- **Analytics / Activity** — collapse into one lightweight "Workspace Activity"
  admin view. Not a partner surface.
- **Triage Queue + Prioritization** — merge into a single **Origination Queue**.

### 3.4 ADD (net-new, only after the core is hard)
1. **A pre-flight coherence gate** on every generated deck (the deterministic
   validator in §5.1). This is the highest-value *new* capability — it is what
   makes output trustworthy.
2. **"One-click pitch pack"** — proposal + synergy + integration POV assembled
   into a single, entity-consistent PPTX from one deal record. (The pieces exist;
   the missing thing is the guaranteed-consistent assembly.)
3. **Sector knowledge packs** (FS/insurance, banking, healthcare/pharma,
   industrials, tech, energy, consumer, TMT) — real value levers, the
   regulator(s) and what they gate, standard diligence reds, synergy ranges *with
   basis*. Turns "understands M&A" into "understands *my* sector".
4. **Provenance/citation layer** — every external market claim carries a source;
   every modelled number is labelled "modelled". (Detailed in the existing
   proposal roadmap, H2.)
5. **Audit trail + export watermarking** — for a firm, "who generated what, from
   which deal record, with which model, when" is a compliance requirement.

---

## 4. The enterprise-grade bar (what "enterprise" actually means here)

For a Big4 firm, "enterprise-grade" is **not** more features. It is five
non-negotiables. Score today in brackets:

| Dimension | What it means for Deal IQ | Today |
|---|---|---|
| **Correctness / coherence** | No document ever contradicts itself or names the wrong company. | **2/10** — §1.1/1.2 |
| **Security & tenancy** | Client data isolated per workspace; RLS enforced; keys encrypted; no IDOR. | **5/10** — RLS work started (recent commits), needs audit |
| **Reliability** | Generation succeeds or fails cleanly; no failure text leaks; graceful degradation. | **4/10** — §1.5 |
| **Auditability** | Every artifact traceable to inputs, model, user, time; exportable log. | **3/10** |
| **Scalability on free tier** | Works within Vercel/Supabase/GitHub free limits, with a known upgrade path. | **6/10** — see §6 |

The roadmap is sequenced to raise the *lowest* bars first: **coherence, then
reliability, then auditability/security, then scale.** You do not scale a product
that emits incoherent documents — you just scale the embarrassment.

---

## 5. Roadmap — sequenced horizons

Framed as **capabilities**, sequenced so each unlocks the next. This complements
(does not replace) `PROPOSAL_GENERATION_STRATEGIC_ROADMAP.md`, which covers
*proposal reasoning quality* in depth; this document covers *platform
trust, focus and scale*.

### Horizon 0 — Stop the bleeding *(days, not weeks — do this first)*
The release blockers. Nothing else ships until these are green.

1. **Entity-coherence gate.** Before any deck renders, assert that the cover
   buyer/target/sector/EV **equal** the narrative's buyer/target/sector/EV. If
   they diverge, block the export and surface a fix, not a broken deck. Root-cause
   the Eicher/Sodexo bleed: the title layer and narrative layer must both read
   from the **same canonical deal record**, not two paths.
2. **Numeric-coherence gate.** EV, synergy, payback, and currency must be
   internally consistent and must reconcile to the deal record. Never render the
   synergy value into the EV field. Never emit a precise figure when the input is
   a range without showing the bridge.
3. **De-duplicate sections.** One Risk Register, one Deal Thesis, one Conditions
   block per deck. Kill slide-count padding.
4. **Stop leaking failure text** in Themes and anywhere else. Degrade silently;
   log server-side.
5. **Normalise deal size at ingest** to `{value_usd, currency, basis}`. Retire
   the free-text "INR 4bn–21bn" range as a source for precise math.

### Horizon 1 — Focus the surface *(1–2 weeks)*
6. Execute the §3.3 cuts: remove half-built modules from partner nav; merge
   Triage+Prioritization; reposition PMI Studio to a pitch POV (cut the tracker).
7. Collapse the nav to the **two pillars** (Deal Intelligence / Outreach) plus a
   thin Admin. Fewer, deeper, reliable.

### Horizon 2 — Make every number defensible *(2–4 weeks)*
8. **Every quantum gets a build + basis line** (synergy, stranded cost, TSA cost,
   retention). Fix the $19M=$19M placeholder — real driver × rate × base.
9. **Triangulate by named comparable** on every headline (the comparables engine
   already exists; surface the citation).
10. **Provenance layer** — external claims cited, modelled numbers labelled.

### Horizon 3 — Sector & deal-type depth *(4–8 weeks)*
11. Ship **sector knowledge packs** (start with FS + one more high-volume sector
    from the pipeline). This is what would have saved the Volvo FS deck.
12. Make the **section spine deal-type-aware** (carve-out ≠ acquisition ≠ JV) —
    already scaffolded in `advanced/prompts`; wire the *content* to obey it.

### Horizon 4 — Enterprise trust: security, audit, tenancy *(parallel from day 1)*
13. **RLS audit** across every table (recent commits started this — finish and
    verify with `get_advisors`). No cross-workspace read path.
14. **Encrypt BYO keys at rest**, confirm no key ever reaches the client bundle.
15. **Audit trail + watermarked exports** — artifact → {deal, user, model, time}.
16. **Workspace isolation** hardening for multi-partner firms.

### Horizon 5 — Quality system that compounds *(ongoing)*
17. Turn the rubric/critique layer into a **hard gate** (Deal-Specificity,
    Evidence, Argumentation, Risk Judgement, Coherence, Polish) with a minimum
    ship bar — per the proposal roadmap H4.
18. **Reference library of won decks** as few-shot anchors + capture partner
    edits and win/loss to close the loop.

---

## 6. Scaling on free tier — the real constraints and the upgrade path

The product is on **GitHub + Vercel + Supabase free tiers + Upstash QStash**.
This is a legitimate architecture for a pilot, but there are hard ceilings a
partner-facing rollout will hit. Be honest about them:

| Layer | Free-tier ceiling | Where Deal IQ will hit it | Mitigation / upgrade trigger |
|---|---|---|---|
| **Vercel Hobby** | Serverless functions cap at **60s**; the deck/scan routes set `maxDuration = 300`. Hobby also forbids commercial use and limits crons. | Long AI generations and the 300s cron will **fail or be throttled** on Hobby. Commercial use by a firm technically violates Hobby ToS. | Move heavy generation to **async job + QStash callback** (already have QStash) so no single request exceeds 60s. Budget **Vercel Pro** as the first paid upgrade the moment real firm usage starts — it is a licensing requirement, not just a perf one. |
| **Vercel Cron** | Hobby allows limited crons (currently using the 2 daily slots). | Fine for now (themes 02:00, signals 03:00). More cadence needs Pro. | Keep to 2 daily; batch work inside them. |
| **Supabase Free** | **500MB DB, 1GB file storage, project pauses after 7 days inactivity, 2 projects, limited connections**. | Ingested deal corpora + embeddings + proposals history will approach 500MB; **auto-pause** will make a partner's login fail intermittently. | Prune history (already doing, cap 20). Move embeddings to a compact store. **Trigger for Supabase Pro:** first paying firm OR DB > 400MB OR the pause behaviour is seen in a demo. |
| **AI cost** | BYO key = $0 to the platform. | None — this is the smart part. | Keep BYO; add per-workspace usage visibility so a firm can govern its own spend. |
| **Connection pooling** | Free Supabase has tight connection limits; serverless fan-out exhausts them. | Concurrent partners + cron + queue workers. | Use Supabase's pooled connection string everywhere; ensure the admin client isn't opening per-request pools. |

**Principle:** the free tier is fine to *prove the product* and run a small
pilot, but **the first real firm deployment must budget Vercel Pro + Supabase Pro
on day one** — not for features, but because (a) Hobby prohibits commercial use,
(b) 60s limits break real generations, and (c) project auto-pause is
unacceptable in front of a partner. Architect now (async jobs, pooled
connections, pruned storage) so the upgrade is a config change, not a rewrite.

---

## 7. Action plan — the first 30 tickets, sequenced

**Sprint 0 (release blockers — this week):**
1. Entity-coherence validator; block export on mismatch.
2. Fix cover EV/synergy field mapping; numeric-coherence validator.
3. Single-render each of Risk/Thesis/Conditions; remove duplicate slides.
4. Route all deck text + cover from one canonical deal record; delete the second path.
5. Suppress AI-failure text in Themes UI; log server-side only.
6. Ingest normalisation: deal_size → {value, currency}.

**Sprint 1 (focus):**
7. Remove Cognition/Insights/Value-Test/Exceptions/Resolution-Tasks/Mapping from nav (flag-gate).
8. Merge Triage + Prioritization → Origination Queue.
9. Reposition PMI Studio → integration POV proposal section; cut the tracker.
10. Nav → two pillars + Admin.

**Sprint 2 (defensibility):**
11–14. Synergy/TSA real builds + basis lines; comparables citation on headlines; provenance labels; kill $19M placeholder.

**Sprint 3 (depth):**
15–18. FS sector pack + one more; deal-type-aware spine wired to content.

**Sprint 4 (enterprise trust, runs in parallel):**
19–24. RLS audit + fix; encrypt keys at rest; audit trail; watermarked exports; workspace isolation tests; async-job refactor for >60s generations.

**Sprint 5 (compounding quality):**
25–30. Rubric hard gate; red-team pass; won-deck few-shot library; edit/win-loss capture; usage visibility per workspace; upgrade-trigger runbook (Vercel Pro / Supabase Pro).

---

## 8. How we will know it worked

- **Coherence test (the one that matters most now):** 100 generated decks, zero
  entity mismatches, zero internal numeric contradictions. Blind-checked.
- **Focus test:** partner nav shows ≤ 10 surfaces, every one of which works end
  to end. No "AI labeling failed" text ever reaches a user.
- **Defensibility test:** every headline number on every page has a build, a
  basis line, and (where external) a citation.
- **Deal-fit test:** swapping deal type / sector visibly changes the spine, the
  risks, the language — not just the names.
- **Enterprise test:** RLS-audited, keys encrypted, every artifact auditable, and
  a documented, budgeted upgrade path off the free tier.
- **Partner test (final):** a post-deal partner scores a blind sample ≥ 8.5/10
  and would put it in front of a client without a rewrite.

---

## 9. One-line summary

> Deal IQ has a real moat in origination and a strong architectural intent
> (canonical model, deal-DNA, comparables). But today it can emit a confident
> deck that names the wrong company — so the mandate now is **narrow the surface,
> enforce coherence, make every number defensible, and architect the free-tier
> exit** — in that order — before adding a single new feature. Trust first,
> then depth, then scale.
