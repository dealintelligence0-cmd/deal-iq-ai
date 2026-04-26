"use client";

import { useState } from "react";
import {
  BookOpen, ChevronRight, Search, Rocket, Upload, GitMerge,
  AlertTriangle, Briefcase, Sparkles, FileText, Download, Shield,
  Settings as SettingsIcon, HelpCircle, Zap, FlaskConical, Globe, Trash2, History,
} from "lucide-react";

type Section = {
  id: string; title: string; icon: typeof BookOpen;
  content: { heading?: string; body: string; steps?: string[] }[];
};

const SECTIONS: Section[] = [
  {
    id: "getting-started", title: "Getting Started", icon: Rocket,
    content: [
      { heading: "Welcome to Deal IQ AI", body: "Deal IQ AI turns raw M&A deal data into investment-grade intelligence and consulting-grade proposals. This guide gets you from zero to your first AI-researched proposal in under 10 minutes." },
      { heading: "End-to-end workflow", body: "", steps: [
        "Upload — drop CSV/XLSX files of raw deal records",
        "Map — tell the system which column is buyer, target, date, value",
        "Cleanse — automatic dedup, date normalization, name cleanup",
        "Validate — review exceptions and value-parsing tests",
        "Enrich — AI scores each deal for priority, risk, advisory attractiveness",
        "Research — pull live web or AI prompt-based intelligence per deal",
        "Generate — 6 proposal types with embedded research and citations",
        "Export — branded CSV/JSON/PDF/PPTX for client delivery",
      ]},
      { heading: "Required setup (5 minutes)", body: "", steps: [
        "Settings → save a Smart-tier AI key (Anthropic, Google, or Groq — all have free tiers)",
        "Settings → Research Provider → save Tavily / Brave / Serper key (free tiers, 1000-2500/month)",
        "Done. Everything else just works.",
      ]},
    ],
  },
  {
    id: "uploads", title: "Uploading Data", icon: Upload,
    content: [
      { heading: "Supported formats", body: "CSV, XLSX, XLS, TXT, JSON. Max 50 MB per file. Multiple files at once." },
      { heading: "How to upload", body: "", steps: [
        "Sidebar → Uploads",
        "Drag files onto the drop zone, or click to browse",
        "Each file shows row count + preview",
        "Click Import — file is saved to private Supabase storage",
      ]},
    ],
  },
  {
    id: "mapping", title: "Column Mapping", icon: GitMerge,
    content: [
      { heading: "Why this exists", body: "Different data sources use different headers — Buyer vs Acquirer vs Purchaser. Mapping translates source columns into Deal IQ's standard fields." },
      { heading: "How to map", body: "", steps: [
        "Sidebar → Mapping",
        "Tick the files to merge → Load",
        "Auto-detected fields show green checkmarks",
        "Fix any required fields flagged red (Date, Buyer, Target)",
        "Save as a template for future identical files",
        "Import — cleansing engine runs automatically",
      ]},
    ],
  },
  {
    id: "exceptions", title: "Exceptions", icon: AlertTriangle,
    content: [
      { heading: "What is the Exceptions page?", body: "Every imported row passes through 8 cleansing rules. Any rule that fires logs an exception. Use this page to audit data quality before relying on it for proposals." },
      { heading: "Three severity levels", body: "", steps: [
        "INFO (blue) — cosmetic fixes like 'Acme Corp.' → 'Acme Corp'",
        "WARNING (amber) — suspicious values: deal value outside $5M-$500B, stake outside 0-100%",
        "ERROR (red) — missing required fields; row was skipped",
      ]},
      { heading: "How to use", body: "", steps: [
        "Sidebar → Exceptions",
        "Filter by severity to triage worst issues first",
        "Click Resolve to archive — keeps the row in deals but marks it reviewed",
        "Toggle 'Show resolved' to audit your fix history",
      ]},
      { heading: "Why it matters", body: "Garbage in = garbage out. A proposal built on bad data is worse than no proposal. Spend 5 minutes on Exceptions after every import." },
    ],
  },
  {
    id: "value-tests", title: "Value Tests", icon: FlaskConical,
    content: [
      { heading: "What is the Value Tests page?", body: "A self-test for the value-parsing engine. Confirms the system correctly reads values like '$1.2B', '₹4,200 Cr', '$500M for 49%', '$1-2B', and 11 currencies (USD, EUR, GBP, INR, JPY, CNY, AUD, CAD, SGD, CHF, HKD)." },
      { heading: "When to use", body: "", steps: [
        "After any code change to the parser",
        "If imported deal values look wrong",
        "Before exporting financial reports — ensures parsing math is sound",
      ]},
      { heading: "How to read results", body: "Each test row shows: input string → expected USD value → actual parsed value. Green = pass; red = fail. All 15+ fixtures should pass on a healthy build." },
    ],
  },
  {
    id: "pipeline", title: "Deal Pipeline", icon: Briefcase,
    content: [
      { heading: "Overview", body: "Sidebar → Deals. Your enterprise pipeline view of every imported and enriched deal." },
      { heading: "Filters & sort", body: "", steps: [
        "Search box — live-filter by buyer or target",
        "4 dropdowns — sector, country, deal type, status",
        "Date and value ranges",
        "Click any column header to sort",
      ]},
      { heading: "Bulk actions", body: "Tick rows → Delete N or Export CSV. Filters and sort apply to the export." },
      { heading: "Deal detail", body: "Click any buyer name → opens an 11-section intelligence view: headline, profiles, rationale, synergies, integration complexity, TSA, risks, comparables, advisory score. Two action buttons: 'Generate Proposal (General)' for instant offline output, or 'Generate with AI Research' for premium research-backed output." },
    ],
  },
];
const MORE_SECTIONS: Section[] = [
  {
    id: "enrich", title: "Enrich AI", icon: Sparkles,
    content: [
      { heading: "What is Enrich AI?", body: "For each selected deal, AI produces: cleaned buyer/target names, classified deal type, priority score (1-10), advisory attractiveness score (1-10), risk flag (low/med/high), and a 2-3 sentence strategic summary. Used by Pipeline filters and Proposal generation." },
      { heading: "How it works", body: "", steps: [
        "Sidebar → Enrich AI",
        "Click Select All Pending (or tick individual rows)",
        "Click Enrich Selected — runs in batches of 10",
        "Live progress bar + success/fail log per row",
        "Refresh Deals page → scores now visible",
      ]},
      { heading: "Free vs paid", body: "If a Fast-tier API key is saved (Groq Llama is free + fastest), enrichment uses real AI. Without a key, the rule-based engine computes scores from deal size + sector — zero cost, less nuanced summaries. Either way works." },
    ],
  },
  {
    id: "ai-tiers", title: "AI Tiers (Premium / Economic / Offline)", icon: Sparkles,
    content: [
      { heading: "Three tiers — pick before each generation", body: "Every AI generation (Proposals · PMI · Synergy · TSA) opens a confirmation modal. Pick the tier that matches your need, budget, and quality bar." },
      { heading: "Premium AI", body: "Anthropic Claude / OpenAI GPT / xAI Grok. Best reasoning, deepest analysis, richest sector-specific output. Costs ~$0.05-0.20 per generation. Use for client-facing deliverables and IC papers." },
      { heading: "Economic AI", body: "Groq / Gemini Flash / DeepSeek / Mistral. 80% of premium quality at 1-5% of cost. Often free under monthly limits. Use for drafts, internal reviews, exploratory work." },
      { heading: "Offline (rule-based)", body: "Deterministic template — instant, free, no AI tokens. Available only for Proposals and PMI. Structurally complete but lacks deep reasoning. Use when AI quotas are exhausted or for predictable outputs." },
      { heading: "How it works", body: "", steps: [
        "Settings → save keys for both Premium and Economic tiers",
        "Click Generate on any AI page → modal shows token estimates + costs",
        "Pick tier → generation runs",
        "Cost is logged with each saved output for budget tracking",
      ]},
    ],
  },
  {
    id: "history", title: "History & Reuse", icon: History,
    content: [
      { heading: "Auto-saved on every generation", body: "Synergy, PMI, TSA, and Proposal outputs are saved to your private history (last 20 each). Saved with deal facts, provider, model, cost, and full content." },
      { heading: "How to access", body: "", steps: [
        "Click the History button (top-right of any AI page) — count badge shows saved items",
        "Click Load on any item → reloads form fields + content",
        "Click trash icon → permanently deletes that history entry",
        "Cost shown per item — total $ visible across runs",
      ]},
      { heading: "Privacy", body: "History is per-user via Supabase RLS. Other users cannot see your runs. Delete anytime via the trash icon." },
      { heading: "Use cases", body: "Reuse: pull up a prior Synergy model when client asks for an updated version. Compare: regenerate same deal with different AI tier to compare quality. Audit: see which tier + provider was used historically." },
    ],
  },
  {
    id: "research", title: "Research Modes", icon: Globe,
    content: [
      { heading: "Two research modes", body: "Available on the Proposals page when you have a buyer and target. Pick from a dropdown:" },
      { heading: "Mode 1 — Live Web Research", body: "", steps: [
        "Provider: Tavily, Brave, or Serper (whichever key is saved in Settings)",
        "Runs 5 parallel searches: buyer, target, sector, comparables, regulatory",
        "Returns 12+ live citations with URLs",
        "Cached 24h per deal — re-running is free within that window",
        "Best for: current quarter facts, recent deal activity, regulatory news",
        "Cost: counts against search-provider's monthly free tier",
      ]},
      { heading: "Mode 2 — Prompt-Based AI Research", body: "", steps: [
        "Uses your Smart-tier LLM (GPT / Claude / Gemini / Groq)",
        "Editable prompt template with {{buyer}} {{target}} {{sector}} variables",
        "5-section output: sector, buyer, target, rationale+synergies, risks",
        "Best for: when web search quota exhausted, or stable historical context",
        "No live web — relies on LLM training data",
        "Cost: counts against your AI provider's tokens",
      ]},
      { heading: "When to switch", body: "If Tavily / Brave / Serper quota runs out, flip the dropdown to Prompt-Based — zero downtime. Both modes feed into the same proposal pipeline." },
    ],
  },
  {
    {
    id: "pmi", title: "PMI Studio", icon: Briefcase,
    content: [
      { heading: "What it does", body: "Sidebar → PMI Studio. AI-powered Post-Merger Integration playbook generator. NOT a proposal — this is the execution plan after the deal closes." },
      { heading: "5 output modes", body: "", steps: [
        "Narrative — full board-ready PMI proposal",
        "Slides — slide-style deck format",
        "Workplan — Function × Phase deliverable matrix",
        "Roadmap — Pre/Post-Day-1 Gantt visual",
        "SteerCo Pack — concise update format (500-700 words)",
      ]},
      { heading: "Inputs", body: "Buyer, Target, Sector, Deal Size, Synergy Ambition (Low/Med/High), Public/Private, Listed/Unlisted, TSA Needed, Cross-Border, Key Risks, Known Issues, Notes." },
      { heading: "Output sections", body: "Integration Strategy · Functional Plans (sector-tailored) · Cross-Function Dependency Map · Day-0/1/100 Plan · KPI Tree (linked to synergies) · Risk Register · IMO Cadence." },
      { heading: "Premium / Economic / Offline", body: "Click Generate → modal pops with 3 tiers. Premium = best output. Economic = cheap + fast. Offline = template-based." },
    ],
  },
  {
    id: "synergy", title: "Synergy Engine", icon: Sparkles,
    content: [
      { heading: "What it does", body: "Bottom-up financial synergy model with sector-anchored benchmarks, comparable transactions, and NPV calculation." },
      { heading: "Inputs", body: "Buyer, Target, Sector, Geography, Deal Size, optional Target Revenue / EBITDA / Buyer Revenue, Synergy Ambition (Conservative/Base/Aggressive)." },
      { heading: "Output", body: "", steps: [
        "Executive Summary — total synergy, NPV, payback, confidence",
        "Cost Synergies — 8+ initiatives × Y1/Y2/Y3 with confidence and owner",
        "Revenue Synergies — 5+ initiatives × Y1/Y2/Y3",
        "Integration Costs — itemized one-time costs",
        "Net Synergy Waterfall — EBITDA bridge + NPV @ 10%",
        "Realisation Risks — 4+ risks with $ impact",
        "Sector Benchmarks — 3 named comparable transactions",
      ]},
      { heading: "Smart-tier required", body: "Synergy modeling needs reasoning depth. Save Anthropic/OpenAI/Gemini/Groq key in Settings." },
    ],
  },
  {
    id: "tsa", title: "TSA Generator", icon: FileText,
    content: [
      { heading: "What it does", body: "Generates a Transitional Service Agreement framework for carve-outs. Service catalog · pricing · exit milestones · governance." },
      { heading: "Inputs", body: "Seller (provider), Buyer (carve-out), Sector, Deal Size, Geography, Close Date, selected Functions (12 options — IT, Finance, HR, Legal, Procurement, Facilities, etc.), Duration (6-24mo), Pricing Basis (Cost+5/10%, Market, Negotiated)." },
      { heading: "Output", body: "", steps: [
        "Executive Summary — scope, cost, duration, top exit dependencies",
        "Service Catalog — one row per function with SLA, pricing, obligations",
        "Pricing Summary — total TSA cost vs % of deal value",
        "Exit Milestone Critical Path — sequence with predecessors",
        "Governance & SLA — escalation paths, breach remedies",
        "Risks & Mitigation — top 5 risks",
        "Negotiation Strategy — 5 buyer positions with fallback",
      ]},
      { heading: "Complexity rating", body: "Auto-rates as Simple (1-3 functions), Standard (4-6), or Complex (7+). Adjusts pricing benchmark and exit timeline." },
    ],
  },
  {
    id: "exports", title: "Export Center", icon: Download,
    content: [
      { heading: "4 formats", body: "", steps: [
        "CSV — Excel/Sheets-compatible raw data",
        "JSON — for developers and APIs",
        "PDF — branded report with KPIs and deal table",
        "PPTX — 4-slide deck: title, KPIs+chart, top 15, closing",
      ]},
      { heading: "Filter before export", body: "Sector and Status dropdowns narrow the export. Counter updates live." },
    ],
  },
  {
    id: "settings", title: "Settings", icon: SettingsIcon,
  content: [
      { heading: "Three AI tiers", body: "Premium Smart (Claude/GPT/Grok — best reasoning), Economic (Groq/Gemini Flash/DeepSeek — cheap & fast), Fast Tier (bulk enrichment). Save a key per tier. Generation modal lets you pick at runtime." },
      { heading: "Saved Keys & Status", body: "Top section of Settings shows all saved keys with status badges (ACTIVE / INCOMPLETE / EMPTY). One-click Delete to remove. Refresh button re-checks DB state." },
      { heading: "15 AI providers supported", body: "Google, OpenAI, Anthropic, Mistral, DeepSeek, Alibaba Qwen, xAI Grok, Cohere, Groq, NVIDIA NIM, OpenRouter, Together, HuggingFace, Replicate, plus a free rule-based fallback." },
      { heading: "Web research provider", body: "Pick Tavily / Brave / Serper. Switch any time if a free tier exhausts. Combined free quota across all 3 = 5,500+ searches/month." },
      { heading: "Security & RLS", body: "All API keys encrypted at rest with pgcrypto. Row-level security ensures keys are isolated per user — invisible to other accounts." },
      { heading: "Admin Danger Zone", body: "Visible only to admin users. Live row counts + one-click delete with confirmation. Non-admins see a restricted message. Set role via SQL: UPDATE users SET role = 'admin' WHERE email = ...;" },
    ],
  },
  {
    id: "activity", title: "Activity & Security", icon: Shield,
    content: [
      { heading: "Audit log", body: "Every AI call and major action recorded with user ID, timestamp, metadata. Sidebar → Activity for last 200 events." },
      { heading: "Rate limits", body: "20 enrichments/min · 20 proposals/min · 5 researches/min. Prevents runaway spend." },
      { heading: "Row-level security", body: "Every table enforces strict RLS — your deals, proposals, keys are invisible to other users." },
    ],
  },
  {
    id: "faq", title: "FAQ", icon: HelpCircle,
    content: [
      { heading: "Is my data private?", body: "Yes. RLS scopes every query to your user ID. API keys are encrypted. No user can see another user's data." },
      { heading: "Do AI providers see my deal data?", body: "Only when you trigger enrichment, research, or proposal generation. Anthropic and Google Enterprise APIs don't train on traffic by default." },
      { heading: "Which AI provider should I pick?", body: "Fast Tier: Groq (free, fastest). Smart Tier: Anthropic Claude (best reasoning) or Google Gemini Pro (free tier)." },
      { heading: "What if all my free tiers exhaust?", body: "Pick Economic tier (Groq is free + fast) or Offline rule-based when generating. Research: switch from Web to Prompt-Based mode. Synergy/TSA require AI — switch tier in the modal." },
      { heading: "How is cost tracked?", body: "Every AI generation logs estimated cost based on input/output tokens × provider rates. Visible in History per item. Total spend visible by summing cost column." },
      { heading: "Can I edit a generated proposal?", body: "Copy to clipboard, paste into Word/Docs, edit there. Direct in-app editing is on the roadmap." },
      { heading: "How do I reset everything?", body: "Settings → Danger Zone → Clear All Data. Auth is preserved." },
      { heading: "Multi-user workspaces?", body: "v1 is single-user. Multi-user orgs are planned for v2." },
    ],
  },
];

const ALL = [...SECTIONS, ...MORE_SECTIONS];

// Group sections to match main sidebar
const HELP_GROUPS: { label: string; ids: string[] }[] = [
  { label: "Getting Started", ids: ["getting-started"] },
  { label: "Deal Data", ids: ["uploads", "mapping", "exceptions", "value-tests", "pipeline", "enrich"] },
  { label: "Advisory Intelligence", ids: ["proposals", "ai-tiers", "research", "history"] },
  { label: "System", ids: ["exports", "settings", "activity", "faq"] },
];

export default function HelpPage() {
  const [activeId, setActiveId] = useState(ALL[0].id);
  const [search, setSearch] = useState("");
  const active = ALL.find((s) => s.id === activeId) ?? ALL[0];
  const filtered = search.trim()
    ? ALL.filter((s) =>
        s.title.toLowerCase().includes(search.toLowerCase()) ||
        s.content.some((c) => (c.heading + " " + c.body).toLowerCase().includes(search.toLowerCase()))
      )
    : ALL;

  return (
    <div className="flex h-full min-h-screen flex-col lg:flex-row">
      <aside className="w-full shrink-0 border-b border-slate-200 bg-white p-4 lg:w-72 lg:border-b-0 lg:border-r lg:p-6">
        <div className="mb-4 flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-indigo-500" />
          <h1 className="text-sm font-semibold text-slate-900">User Manual</h1>
        </div>
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input type="text" placeholder="Search help…" value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-xs outline-none focus:border-indigo-300 focus:bg-white" />
        </div>
       <nav className="space-y-3">
          {HELP_GROUPS.map((g) => {
            const items = g.ids.map((id) => filtered.find((s) => s.id === id)).filter(Boolean) as Section[];
            if (items.length === 0) return null;
            return (
              <div key={g.label}>
                <p className="mb-1 px-2 text-[9px] font-bold uppercase tracking-widest text-slate-400">{g.label}</p>
                <div className="space-y-0.5">
                  {items.map((s) => {
                    const Icon = s.icon;
                    return (
                      <button key={s.id} onClick={() => setActiveId(s.id)}
                        className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition ${
                          activeId === s.id ? "bg-indigo-50 font-semibold text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-300"
                            : "text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-white/5"}`}>
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        <span className="flex-1 truncate">{s.title}</span>
                        {activeId === s.id && <ChevronRight className="h-3 w-3" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>
        <div className="mt-8 rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-purple-50 p-4">
          <Zap className="h-5 w-5 text-indigo-600" />
          <p className="mt-2 text-xs font-semibold text-slate-900">Quick start</p>
          <ol className="mt-2 space-y-1 text-[11px] text-slate-600">
            <li>1. Settings → save AI + research keys</li>
            <li>2. Upload → drop CSV</li>
            <li>3. Mapping → import</li>
            <li>4. Enrich → run all</li>
            <li>5. Deals → generate proposal</li>
          </ol>
        </div>

        <div className="mt-4 rounded-xl border border-red-100 bg-red-50 p-3">
          <Trash2 className="h-4 w-4 text-red-600" />
          <p className="mt-1 text-xs font-semibold text-red-900">Reset workspace</p>
          <p className="mt-1 text-[10px] text-red-700">Settings → Danger Zone → clear deals/proposals/all data with confirmation.</p>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto bg-slate-50 px-6 py-8 lg:px-12">
        <div className="mx-auto max-w-3xl">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600">
              <active.icon className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900">{active.title}</h2>
              <p className="text-xs text-slate-500">User Manual · {ALL.findIndex((s) => s.id === active.id) + 1} of {ALL.length}</p>
            </div>
          </div>
          <div className="space-y-6">
            {active.content.map((block, i) => (
              <section key={i} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                {block.heading && <h3 className="mb-2 text-base font-semibold text-slate-900">{block.heading}</h3>}
                {block.body && <p className="text-sm leading-relaxed text-slate-700">{block.body}</p>}
                {block.steps && (
                  <ol className="mt-3 space-y-2">
                    {block.steps.map((step, j) => (
                      <li key={j} className="flex gap-3 text-sm text-slate-700">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-700">{j + 1}</span>
                        <span className="leading-relaxed">{step}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            ))}
          </div>
          <div className="mt-10 flex items-center justify-between border-t border-slate-200 pt-6">
            {ALL.findIndex((s) => s.id === active.id) > 0 && (
              <button onClick={() => setActiveId(ALL[ALL.findIndex((s) => s.id === active.id) - 1].id)}
                className="text-xs font-medium text-indigo-600 hover:text-indigo-700">
                ← {ALL[ALL.findIndex((s) => s.id === active.id) - 1].title}
              </button>
            )}
            <div className="ml-auto">
              {ALL.findIndex((s) => s.id === active.id) < ALL.length - 1 && (
                <button onClick={() => setActiveId(ALL[ALL.findIndex((s) => s.id === active.id) + 1].id)}
                  className="text-xs font-medium text-indigo-600 hover:text-indigo-700">
                  {ALL[ALL.findIndex((s) => s.id === active.id) + 1].title} →
                </button>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
