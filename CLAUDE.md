# CLAUDE.md — Deal IQ AI Project Knowledge Base

> This file is the single source of truth for all Claude sessions (chat, Claude Code, agents) working on Deal IQ AI.
> Read this entire file before writing any code, making any edit, or answering any architecture question.

---

## 1. What This Tool Is

**Deal IQ AI** is an M&A advisory platform for senior partners at MBB and Big4 consulting firms (McKinsey, BCG, Bain, Deloitte, EY, PwC). It generates board-ready advisory proposals, synergy analyses, PMI plans, and TSA documents using AI.

**User persona:** A senior partner evaluating whether to pursue an acquisition mandate. They open the tool, enter buyer + target + deal context, and get advisor-quality analysis in under 5 minutes. The output must be defensible in front of a CEO or Investment Committee — NOT generic AI output.

**Partner pain points (real feedback, drives all quality decisions):**
- "Numbers I can't defend" → canonical deal model must be authoritative
- "Sounds like AI" → banned-phrase list + voice discipline rules
- "Missing depth" → named initiatives, specific moves, not generic percentages
- "Can't tell which precedent transactions are real" → real comparables library only
- "Missing strategic intent / missing so what" → every number needs derivation + business implication

---

## 2. Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js | 15.5.9 |
| Runtime | React | 19.0.0 |
| Styling | Tailwind CSS | 3.4.14 |
| Database | Supabase (PostgreSQL) | @supabase/supabase-js ^2.45.4 |
| Auth | Supabase Auth | (email + password) |
| Deployment | Vercel free tier | — |
| Language | TypeScript | 5.6.3 |
| Icons | lucide-react | 0.456.0 |

**GitHub:** `github.com/dealintelligence0-cmd/deal-iq-ai` (branch: `main`)
**Live URL:** `https://deal-iq-ai.vercel.app`

---

## 3. Repository Structure

```
src/
├── app/
│   ├── api/
│   │   ├── ai/
│   │   │   ├── proposal/route.ts      ← M&A advisory proposals (423 lines)
│   │   │   ├── synergy/route.ts       ← Synergy analysis (309 lines)
│   │   │   ├── pmi/route.ts           ← Post-merger integration (255 lines)
│   │   │   ├── tsa/route.ts           ← Transaction structure advice (251 lines)
│   │   │   ├── save-key/route.ts      ← Legacy: save key to ai_settings
│   │   │   ├── delete-key/route.ts    ← Legacy: delete key from ai_settings
│   │   │   ├── save-tavily-key/route.ts ← Research API key storage
│   │   │   ├── enrich/route.ts        ← Deal enrichment
│   │   │   ├── enrich-batch/route.ts  ← Batch enrichment
│   │   │   └── test/route.ts          ← Provider connectivity test
│   │   ├── keys/
│   │   │   ├── route.ts               ← ❌ MISSING — GET/POST for multi-key library
│   │   │   └── [id]/route.ts          ← ✅ EXISTS — PATCH/DELETE per key
│   │   ├── deals/
│   │   │   ├── ai-insights/route.ts
│   │   │   ├── derive/route.ts
│   │   │   └── research-context/route.ts
│   │   └── research/route.ts
│   └── dashboard/
│       ├── page.tsx                   ← Executive dashboard
│       ├── deals/
│       │   ├── page.tsx               ← Deal pipeline list
│       │   └── [id]/page.tsx          ← Single deal view (has DealModelCard)
│       ├── proposals/page.tsx         ← Module 1 UI
│       ├── synergy/page.tsx           ← Module 2 UI
│       ├── pmi/page.tsx               ← Module 3 UI (recently fixed)
│       ├── tsa/page.tsx               ← Module 4 UI
│       └── settings/page.tsx          ← AI settings (has KeyLibraryManager)
├── lib/
│   ├── ai/
│   │   ├── providers.ts               ← All AI provider configs + callProvider()
│   │   ├── router.ts                  ← routedCall() — picks best model + fallback
│   │   ├── key-resolver.ts            ← resolveKey() — multi-key library lookup
│   │   ├── advisory-rules.ts          ← buildAdvisoryRules() — mandate/sector rules
│   │   ├── cost-estimator.ts          ← Token cost estimation per provider
│   │   └── utils.ts
│   ├── intelligence/
│   │   ├── deal-model.ts              ← getOrSeed(), dealModelToPromptBlock()
│   │   ├── industry.ts                ← getSynergyBenchmark() by sector
│   │   ├── context-engine.ts          ← buildDealContext(), contextToPromptBlock()
│   │   ├── deal-classifier.ts         ← classifyDeal(), generateServices()
│   │   ├── brief-engine.ts
│   │   └── pmi-engine.ts              ← generatePmiProposal() offline fallback
│   ├── advanced/
│   │   ├── engines/
│   │   │   ├── synergy_engine.ts      ← deriveSynergies(), buildSynergyLevers()
│   │   │   ├── risk_engine.ts         ← deriveDealRisks(), buildRiskRegister()
│   │   │   └── scenario_engine.ts     ← buildScenarioCases()
│   │   ├── validators/
│   │   │   ├── output_validator.ts    ← validateRequiredSections()
│   │   │   └── quality_validator.ts   ← evaluateProposalQuality()
│   │   ├── prompts/                   ← getAdvancedPromptBuilder()
│   │   ├── frameworks/
│   │   └── types/
│   ├── proposal/
│   │   ├── visual-renderer.ts         ← renderVisualProposal() — HTML from markdown
│   │   └── offline-engine.ts          ← generateOfflineProposal()
│   ├── research/
│   │   └── web-research.ts            ← researchDeal(), briefToPromptBlock()
│   ├── dealContext.ts                 ← sessionStorage persistence across modules
│   └── supabase/
│       ├── client.ts                  ← Browser client (createBrowserClient)
│       ├── server.ts                  ← Server client (createServerClient + cookies)
│       └── admin.ts                   ← Admin client (service role, server-only)
└── components/
    ├── AIGenerateConfirm.tsx          ← Modal: tier selection before generation
    ├── AIResearchClient.tsx
    ├── DealModelCard.tsx              ← Canonical deal numbers display + sliders
    ├── KeyLibraryManager.tsx          ← Unlimited API key management UI
    ├── DisclaimerModal.tsx
    ├── Footer.tsx
    └── ThemeToggle.tsx
```

---

## 4. Supabase Patterns — How to Use

### Three client types — use the right one

```ts
// 1) In API routes (server-side, respects RLS, user auth via cookies)
import { createClient } from "@/lib/supabase/server";
const supabase = await createClient();
const { data: { user } } = await supabase.auth.getUser();

// 2) In API routes (admin operations, bypasses RLS — use with extreme care)
import { createAdminClient } from "@/lib/supabase/admin";
const admin = createAdminClient();

// 3) In client components ("use client" pages)
import { createClient } from "@/lib/supabase/client";
const sb = createClient();
```

### Always authenticate first in API routes

```ts
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // ...rest of logic using admin client for actual queries
}
```

### RPC calls — encryption functions

```ts
// Encrypt a plaintext key → use the server-side RPC (keeps binary off the wire)
const { data, error } = await admin.rpc("insert_provider_key", {
  p_user_id: user.id, p_provider, p_label, p_plaintext_key: rawKey,
  p_default_model: null, p_is_default_smart: false,
  p_is_default_economic: false, p_is_default_fast: false,
});

// Decrypt a stored key
const { data: dec } = await admin.rpc("decrypt_key", { cipher: encryptedValue });
const apiKey = dec as string | null;
```

### Encryption implementation (Supabase DB)
- Uses `pgcrypto` extension: `pgp_sym_encrypt` / `pgp_sym_decrypt`
- Passphrase: `current_setting('app.settings.jwt_secret', true)` — fallback: `'deal-iq-ai-fallback-pepper-change-me'`
- `key_encrypted` columns in `provider_keys` are type `bytea`
- NEVER call `encrypt_key` RPC directly from API routes — use `insert_provider_key` RPC instead (avoids bytea JSON serialization)

---

## 5. Database Schema

### Core tables

```sql
-- Deal records
deals (id uuid, user_id uuid, buyer text, target text, sector text,
       country text, deal_size_text text, created_at timestamptz)

-- AI-generated outputs (all 4 modules)
ai_outputs (id uuid, user_id uuid, module text, buyer text, target text,
            sector text, deal_size text, tier text, provider text, model text,
            cost_estimate_usd numeric, content text, created_at timestamptz)

-- Legacy 3-slot AI provider config (still used as fallback)
ai_settings (user_id uuid, premium_provider text, premium_model text,
             premium_key_encrypted bytea, economic_provider text,
             economic_model text, economic_key_encrypted bytea,
             bulk_provider text, bulk_model text, bulk_key_encrypted bytea,
             research_provider text, tavily_key_encrypted bytea,
             brave_key_encrypted bytea, serper_key_encrypted bytea)

-- NEW: unlimited multi-key library
provider_keys (id uuid, user_id uuid, provider text, label text,
               key_encrypted bytea, default_model text,
               is_default_smart boolean, is_default_economic boolean,
               is_default_fast boolean, created_at timestamptz,
               last_used_at timestamptz)

-- Canonical deal financial model (one row per deal)
deal_model (deal_id uuid, primary_currency text, fx_rate_to_usd numeric,
            ev_primary numeric, ev_usd numeric,
            target_revenue_primary numeric, target_ebitda_primary numeric,
            buyer_revenue_primary numeric,
            cost_synergy_runrate numeric, rev_synergy_runrate numeric,
            one_time_integration_cost numeric, net_runrate_y3 numeric,
            cost_synergy_confidence text, rev_synergy_confidence text,
            partner_overrides jsonb, base_case jsonb, written_by jsonb)
```

### SQL functions (RPCs)
- `decrypt_key(cipher bytea) → text` — symmetric decrypt using jwt_secret
- `encrypt_key(plaintext text) → bytea` — symmetric encrypt using jwt_secret
- `insert_provider_key(p_user_id, p_provider, p_label, p_plaintext_key, ...) → table` — atomic encrypt + insert

---

## 6. AI Provider Architecture

### Supported providers (ProviderId)

| Provider | API Style | Smart Models | Fast Models |
|---|---|---|---|
| `anthropic` | anthropic | claude-opus-4-7, claude-sonnet-4-6 | claude-haiku-4-5 |
| `google` | gemini | gemini-2.5-pro, gemini-2.5-flash | gemini-2.5-flash, gemini-2.0-flash |
| `openai` | openai | gpt-4.1, gpt-4o | gpt-4.1-mini, gpt-4o-mini |
| `groq` | groq | llama-3.3-70b-versatile | llama-3.1-8b-instant |
| `deepseek` | openai | deepseek-reasoner, deepseek-chat | deepseek-chat |
| `openrouter` | openrouter | anthropic/claude-opus-4, openai/gpt-5.4-pro | meta-llama/llama-3.3-70b-instruct:free |
| `mistral` | openai | mistral-large-latest | mistral-small-latest |
| `xai` | openai | grok-4.1, grok-4 | grok-4-mini |
| `free` | rules | (offline rule-based) | (offline rule-based) |

### ⚠️ Deprecated models — NEVER USE

- `gemini-2.5-pro-preview-06-05` → use `gemini-2.5-pro`
- `gemini-2.5-flash-preview-05-20` → use `gemini-2.5-flash`

### Key resolution order (resolveKey in key-resolver.ts)

1. Explicit `key_id` in request body (partner picked a specific key in generation modal)
2. Default key for tier from `provider_keys` table (`is_default_smart` / `is_default_economic`)
3. Legacy fallback from `ai_settings` columns (`premium_*` / `economic_*` / `bulk_*`)
4. Returns `{ provider: "free", apiKey: null }` → offline rule-based generation

### Groq rate limit guard

Groq free tier: 12K tokens/minute on Llama 70B. PMI/Synergy prompts hit ~15K tokens.

```ts
// In pmi/route.ts and synergy/route.ts, before routedCall():
const estimatedTokens = messages.reduce((acc, m) => acc + Math.ceil(m.content.length / 4), 0);
if (cfg.primaryProvider === "groq" && estimatedTokens > 11000 && cfg.primaryModel?.includes("70b")) {
  cfg.primaryModel = "llama-3.1-8b-instant";
}
```

---

## 7. Four AI Modules — Architecture

### Common pattern for ALL four routes

```ts
// Step 1: Authenticate
const { data: { user } } = await supabase.auth.getUser();

// Step 2: Parse body
const body = await req.json();

// Step 3: Get canonical deal model (ALWAYS before generation)
const dm = await getOrSeed(admin, dealId, sector, geography);
const dealModelBlock = dealModelToPromptBlock(dm);

// Step 4: Resolve API key (new library → legacy fallback)
const { resolveKey } = await import("@/lib/ai/key-resolver");
const resolved = await resolveKey(admin, user.id, tier, overrideKeyId);

// Step 5: Build finalSystemPrompt = systemPrompt + CANONICAL DEAL MODEL DISCIPLINE clause
const finalSystemPrompt = systemPrompt + `\n\n# CANONICAL DEAL MODEL DISCIPLINE (CRITICAL)\n...`;

// Step 6: Build messages array with dealModelBlock injected
const messages: ChatMessage[] = [
  { role: "system", stable: true, content: finalSystemPrompt },
  { role: "user", content: dealModelBlock + "\n\n" + userPrompt },
];

// Step 7: Call AI
const result = await routedCall(cfg, messages, maxTokens);
```

### Tier parameter differences per module

| Module | Tier param in request body |
|---|---|
| `proposal/route.ts` | `use_premium: boolean` → translate as `use_premium ? "smart" : "economic"` |
| `synergy/route.ts` | `tier: "premium" \| "economic" \| "offline"` |
| `pmi/route.ts` | `tier: "premium" \| "economic" \| "offline"` |
| `tsa/route.ts` | `tier: "premium" \| "economic" \| "offline"` |

### Research system (synergy only)

Synergy route has an extra web research block:
- Reads `tavily_key_encrypted` / `brave_key_encrypted` / `serper_key_encrypted` from `ai_settings`
- Calls `researchDeal()` → `briefToPromptBlock()` → injects `researchBlock` into user message
- This is a SEPARATE system from the AI key library — do NOT touch it when modifying key resolution

---

## 8. Session Persistence (dealContext.ts)

All four module pages persist state in `sessionStorage` — survives tab navigation, dies on browser close.

```ts
// Keys used:
"dealiq:dealContext"  // { deal_id, buyer, target, sector, geography, deal_size }
"dealiq:output:proposal"
"dealiq:output:synergy"
"dealiq:output:pmi"
"dealiq:output:tsa"

// Functions:
saveDealContext(ctx)           // merge, non-empty values win
loadDealContext()              // fallback when no URL params
resetIfNewDeal(newDealId)      // wipes ALL context + outputs when deal changes
saveOutput(module, content)    // store generated output
loadOutput(module)             // restore on mount
clearOutput(module)            // on Clear button click
```

### Required useEffect structure for each module page

Every module page MUST have these three effects in this order, as SIBLING effects (NEVER nested):

```tsx
// 1) Load tier settings + history (async IIFE)
useEffect(() => {
  (async () => {
    // load ai_settings / provider_keys UI state
    // load history from ai_outputs
  })();
}, [sb]);

// 2) URL params → sessionStorage fallback → restore cached output (mount-only)
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const did = params.get("deal_id");
  if (did) resetIfNewDeal(did);
  const stored = loadDealContext();
  // merge URL params (win) with stored (fallback)
  // call all setters
  // saveDealContext(merged)
  const cached = loadOutput("module-name");
  if (cached) setContent(cached);
}, []);

// 3) Auto-save context on any field change
useEffect(() => {
  saveDealContext({ buyer, target, sector, geography, deal_size: dealSize, deal_id: dealId });
}, [buyer, target, sector, geography, dealSize, dealId]);
```

---

## 9. Deal Pipeline → Module URL Flow

From `src/app/dashboard/deals/[id]/page.tsx`:

```ts
const params = new URLSearchParams({
  deal_id: deal.id, buyer: deal.buyer ?? "",
  target: deal.target ?? "", sector: deal.sector ?? "",
  geography: deal.country ?? "", deal_size: deal.deal_size_text ?? ""
}).toString();

// Links to each module:
const proposalUrl = `/dashboard/proposals?${params}`;
const synergyUrl  = `/dashboard/synergy?${params}`;
const pmiUrl      = `/dashboard/pmi?${params}`;
const tsaUrl      = `/dashboard/tsa?${params}`;
```

---

## 10. What's Working vs. What's Missing

### ✅ SHIPPED AND WORKING

- All 4 AI modules generate output (proposal / synergy / PMI / TSA)
- Deal Model canonical numbers (`getOrSeed`, `dealModelToPromptBlock`)
- `DealModelCard` component on deal detail page
- Session persistence across module navigation
- History saving to `ai_outputs` table
- Copy / Print / Clear buttons on all 4 module output toolbars
- Multi-key library schema (`provider_keys` table + RLS + single-default trigger)
- `KeyLibraryManager.tsx` component mounted on Settings page
- `src/app/api/keys/[id]/route.ts` (PATCH + DELETE)
- `src/lib/ai/key-resolver.ts` (resolveKey with legacy fallback)
- All 4 AI routes use `resolveKey()` (no longer use legacy inline lookup)
- Deprecated Gemini preview models removed from candidates list
- Groq 413 token-rate guard in PMI route
- `finalSystemPrompt` + CANONICAL DEAL MODEL DISCIPLINE in all 4 routes

### ❌ MISSING — Must create

#### CRITICAL (blocks multi-key library)

**File to create:** `src/app/api/keys/route.ts`

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from("provider_keys")
    .select("id, provider, label, default_model, is_default_smart, is_default_economic, is_default_fast, created_at, last_used_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message, keys: [] }, { status: 500 });
  return NextResponse.json({ keys: rows ?? [] });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json() as {
    provider: string; label: string; key: string;
    default_model?: string | null;
    is_default_smart?: boolean; is_default_economic?: boolean; is_default_fast?: boolean;
  };
  if (!body.provider || !body.label || !body.key) {
    return NextResponse.json({ error: "provider, label, and key are required" }, { status: 400 });
  }
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("insert_provider_key", {
    p_user_id: user.id, p_provider: body.provider, p_label: body.label,
    p_plaintext_key: body.key, p_default_model: body.default_model ?? null,
    p_is_default_smart: body.is_default_smart ?? false,
    p_is_default_economic: body.is_default_economic ?? false,
    p_is_default_fast: body.is_default_fast ?? false,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const inserted = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({ key: inserted });
}
```

#### HIGH PRIORITY (proposal quality — 40% → 70% partner rating)

**File to create:** `src/lib/intelligence/comparables.ts`
- ~50 real verifiable M&A transactions keyed by sector + geography
- Sectors: pharma, consumer, tech, financial, industrials, energy, logistics, healthcare
- Functions: `getComparables(sector, geography, count)` + `buildComparablesBlock(sector, geography)`
- Critical rule: prompt must say "cite ONLY these transactions — DO NOT INVENT any others"

**File to modify:** `src/app/api/ai/proposal/route.ts`
- Replace `advisory` prompt in `PROPOSAL_PROMPTS` with 11-section reference-anchored structure:
  1. Deal Context (buyer/target overview side-by-side)
  2. Key Focus Areas (4-quadrant strategic frame)
  3. Revenue Synergy Opportunities (named product/channel opportunity buckets)
  4. Cost Synergy Opportunities (named function moves: Procurement, IT, HR, etc.)
  5. Integration Approach (phasing, governance, Day-1 priorities)
  6. Talent & Cultural (retention plan, org design, leadership decisions)
  7. Risk Register (by function, probability, mitigation, owner)
  8. Value Bridge & Scenarios (base/upside/downside with assumptions shown)
  9. Comparable Transactions (from library ONLY — real deals with EV/EBITDA + outcome)
  10. Recommendation (why buy, why now, walk-away conditions)
  11. Why Us (firm's relevant track record on similar deals)
- Expand banned phrases to 25+: leveraging, robust, world-class, deliver value, create value, unlock potential, value creation, synergistic, holistic, transformative, actionable, game-changing, cutting-edge, best-in-class, seamless, streamline, optimize, utilize, stakeholder, ecosystem, paradigm, bandwidth, learnings, impactful, scalable
- Add voice discipline rules: specific > general; active > passive; every number gets "so what"; named entities throughout; numbers must show derivation

#### MEDIUM PRIORITY (UX quality)

**Feature:** Auto-seed Deal Model card on deal page open
- `DealModelCard.tsx` currently shows "No model yet" if no row exists
- Should call `/api/deals/seed-model` (POST) on mount if no model row found
- Create `src/app/api/deals/seed-model/route.ts` that calls `getOrSeed()` and returns the model

**Feature:** Hide Rubric tab in Settings
- Find the Rubric tab in `src/app/dashboard/settings/page.tsx`
- Hide it (`{false && <RubricTab />}` or CSS `hidden`)
- Keep scoring logic — it powers the silent quality scoring

#### LOW PRIORITY (Phase 6+)

- Section-level edit/regenerate on proposal output
- Deal prioritization / strategic dashboard (rank deals by win probability)
- Multi-key Settings UI cleanup (remove legacy 3-slot provider blocks once library is live)

---

## 11. Coding Rules — Non-Negotiable

### Non-technical operator constraint
The operator (dealintelligence0-cmd) is non-technical. All deliverables MUST be:
- Copy-paste ready — no "you'll need to configure X manually"
- File-complete — never say "add the rest of your existing code here"
- Specific about WHERE to paste — exact function name, line context, find/replace anchors

### TypeScript rules
- Every API route body must be typed (use `as { field: type }` cast if needed)
- Dynamic params in Next.js 15 routes must be `{ params: Promise<{ id: string }> }` — always `await params`
- Never use `any` — use `unknown` + type narrowing
- `useEffect` calls are SIBLINGS, never nested

### Supabase rules
- Never call `createAdminClient()` from a client component
- Always check `user` before any data operation
- RLS is enabled on all tables — service role key bypasses it, use carefully
- `provider_keys.key_encrypted` is `bytea` — never try to pass it through JS as a string

### Next.js rules
- All API routes are in `src/app/api/` as `route.ts`
- Dynamic routes: folder name with `[param]` — e.g. `src/app/api/keys/[id]/route.ts`
- Export named functions `GET`, `POST`, `PATCH`, `DELETE` — not default export
- Server components can use `await createClient()` — client components use `createClient()` (sync)

### AI route rules
- Always call `getOrSeed()` before building prompts — deal model is the source of truth
- Always use `finalSystemPrompt` (systemPrompt + CANONICAL DEAL MODEL DISCIPLINE) — never raw `systemPrompt`
- Always inject `dealModelBlock` into the user message, not the system message
- Response variable name differs by module: proposal uses `data`, others use `j` — match it in `saveOutput()`
- `saveOutput()` goes AFTER `setContent()` in the success branch — never before the API call

### Build safety checklist before every push
Run mentally (or literally in Cursor):
```bash
grep -n "uuseEffect\|saveOutput.*data\." src/app/dashboard/pmi/page.tsx
grep -n "saveOutput.*data\." src/app/dashboard/synergy/page.tsx src/app/dashboard/tsa/page.tsx
grep -n "premium_key_encrypted" src/app/api/ai/*/route.ts  # should be 0 (all replaced by resolveKey)
grep -n "gemini.*preview" src/lib/ai/providers.ts  # should be 0
```

---

## 12. Environment Variables

```bash
# Public (safe to use in client components)
NEXT_PUBLIC_SUPABASE_URL=https://[project-ref].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[anon-key]

# Server-only (NEVER use in client components)
SUPABASE_SERVICE_ROLE_KEY=[service-role-key]
```

Set in Vercel dashboard → Project Settings → Environment Variables.
Set in Supabase: `app.settings.jwt_secret` must match the JWT secret used for encryption.

---

## 13. Pending Items — Ordered by Impact

| Priority | Feature | File(s) | Effort | Impact |
|---|---|---|---|---|
| P0 | Create `src/app/api/keys/route.ts` | New file | 5 min | Unblocks multi-key library |
| P0 | Reference-anchored proposal prompt (11 sections) | `proposal/route.ts` | 20 min | 40% → 65% partner rating |
| P0 | Real comparables library (50 verified deals) | New: `comparables.ts` + `proposal/route.ts` | 15 min | Eliminates fake citations |
| P0 | Anti-AI-voice prompt discipline (25+ banned phrases + rules) | `proposal/route.ts` | 10 min | Removes "sounds like AI" |
| P1 | Auto-seed Deal Model on deal page open | New: `seed-model/route.ts` + `DealModelCard.tsx` | 15 min | Removes UX confusion |
| P1 | Hide Rubric Settings tab | `settings/page.tsx` | 5 min | Reduces UI clutter |
| P2 | Section-level edit/regenerate | `proposals/page.tsx` + components | 3-4 hrs | Quality of life |
| P2 | Deal prioritization dashboard | New page + API | 6-8 hrs | Strategic differentiation |
| P3 | Legacy Settings UI cleanup | `settings/page.tsx` | 30 min | After multi-key stable |

---

## 14. Success Criteria

### Multi-key library complete when:
1. Settings → API Key Library section visible
2. Add Key → fills provider + label + key → Save succeeds (no JSON error)
3. Key appears in list with provider badge + star default toggles
4. Delete key → permanently removed
5. Generate proposal → uses the Smart-default key

### Proposal quality improved (40% → 70%) when:
1. Output opens with Deal Context (not Deal Score table)
2. Revenue synergies: named opportunity buckets with specific products/channels
3. Cost synergies: named function moves ("Procurement: Joint vendor development in local markets")
4. Every number has "so what" (e.g. "₹51M cost synergy run-rate by Year 3 — equivalent to 4.25% of combined SG&A")
5. Comparable transactions are verifiable real deals with EV/EBITDA multiples
6. Zero occurrence of: leveraging, robust, world-class, create value, deliver value
7. Buyer and target are named by name throughout — not "the buyer" / "the target"

---

*Last updated: Based on repo state `deal-iq-ai-main__26_.zip` (commit 2c29c6c). Update this file after each significant feature ship.*
