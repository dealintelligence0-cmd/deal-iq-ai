"use client";

import { useState } from "react";
import {
  BookOpen, ChevronRight, Search, Rocket, Upload, GitMerge,
  AlertTriangle, Briefcase, Sparkles, FileText, Download, Shield,
  Settings as SettingsIcon, HelpCircle, Zap,
} from "lucide-react";

type Section = {
  id: string;
  title: string;
  icon: typeof BookOpen;
  content: { heading?: string; body: string; steps?: string[] }[];
};

const SECTIONS: Section[] = [
  {
    id: "getting-started",
    title: "Getting Started",
    icon: Rocket,
    content: [
      { heading: "Welcome to Deal IQ AI", body: "Deal IQ AI transforms raw M&A deal data into actionable intelligence. This 5-minute guide gets you from zero to your first enriched dataset." },
      { heading: "The 5-step workflow", body: "Every feature in Deal IQ follows this progression:", steps: [
        "Upload — drop CSV/XLSX files containing raw deal records",
        "Map — tell the system which column is the buyer, target, date, value, etc.",
        "Cleanse — automatic deduplication, date normalization, company name cleanup",
        "Enrich — AI scores every deal for priority, risk, and advisory attractiveness",
        "Export — download CSV/JSON/PDF/PPTX branded for client delivery",
      ]},
      { heading: "First-time setup", body: "Before uploading, spend 2 minutes in Settings to save a free AI key:", steps: [
        "Go to Settings in the sidebar",
        "Fast Tier: pick Groq → Get API key → console.groq.com → create free key → paste → Save → Auto-detect",
        "Smart Tier: pick Google → Get API key → aistudio.google.com → create free key → paste → Save → Auto-detect",
        "You now have free AI for enrichment AND premium proposals",
      ]},
    ],
  },
  {
    id: "uploads",
    title: "Uploading Data",
    icon: Upload,
    content: [
      { heading: "Supported formats", body: "CSV, XLSX, XLS, TXT, JSON. Max 50 MB per file. Multiple files can be uploaded at once." },
      { heading: "How to upload", body: "", steps: [
        "Sidebar → Uploads",
        "Drag files onto the drop zone, or click to browse",
        "Each file shows a Ready badge with row count",
        "Click the eye icon on any card to preview the first 25 rows",
        "Click Import to save raw files + parse metadata into Supabase",
      ]},
      { heading: "What happens after import", body: "The raw file is stored securely in your private Storage bucket. Only you can access it. The row count + column headers are saved to the uploads table so you can map columns without re-parsing." },
    ],
  },
  {
    id: "mapping",
    title: "Column Mapping",
    icon: GitMerge,
    content: [
      { heading: "Why mapping is required", body: "Different data providers use different column names: Buyer vs Acquirer vs Purchaser. The mapping step tells Deal IQ which source column represents each standard field." },
      { heading: "How to map", body: "", steps: [
        "Sidebar → Mapping",
        "Tick the files you want to merge → click Load N files",
        "System auto-detects most fields (look for green checkmarks)",
        "Fix any red-flagged required fields (Deal Date, Buyer, Target)",
        "Optionally type a name and click Save to create a reusable template",
        "Click Import N deals to cleanse + save to your Deals table",
      ]},
      { heading: "Saved templates", body: "After saving, the template appears in the Load Template dropdown at the top of the mapping grid. Reuse it on any future file with the same column layout — one click restores all mappings." },
      { heading: "What counts as a duplicate", body: "Rows with identical buyer + target + date (after cleansing) are treated as duplicates and skipped. The count shows in the import toast." },
    ],
  },
  {
    id: "exceptions",
    title: "Exceptions & Data Quality",
    icon: AlertTriangle,
    content: [
      { heading: "What are exceptions", body: "During import, every row passes through 8 cleansing rules. Any rule that fires logs an exception record. There are three severities:" },
      { heading: "Severity levels", body: "", steps: [
        "INFO (blue) — cosmetic fixes like suffix removal (Acme Corp → Acme)",
        "WARNING (amber) — suspicious values like $5M < deal < $500B range, or stake outside 0–100",
        "ERROR (red) — missing required fields that made the row unusable",
      ]},
      { heading: "Resolving exceptions", body: "Click Exceptions in the sidebar → filter by severity → click Resolve to archive. Resolved items disappear by default but can be shown with the toggle." },
    ],
  },
  {
    id: "pipeline",
    title: "Deal Pipeline",
    icon: Briefcase,
    content: [
      { heading: "Overview", body: "The Deals page is your enterprise pipeline table. Every imported and enriched deal appears here." },
      { heading: "Filtering", body: "Use the filter bar to narrow the view:", steps: [
        "Search — type buyer or target name (live filter)",
        "Sector / Country / Deal Type / Status — multi-dropdowns",
        "Date range — pick From and To",
        "Value range — enter Min and Max in $M",
      ]},
      { heading: "Sorting", body: "Click any column header to sort ascending. Click again for descending." },
      { heading: "Bulk actions", body: "Tick rows to select → Delete N or Export CSV of exactly what you see (filters + sort applied)." },
      { heading: "Deal detail page", body: "Click any buyer name → opens the full intelligence view with 11 sections: headline, buyer/target profiles, rationale, synergies, integration complexity, TSA, regulatory risks, comparables, advisory score." },
    ],
  },
];
const MORE_SECTIONS: Section[] = [
  {
    id: "enrich",
    title: "AI Enrichment",
    icon: Sparkles,
    content: [
      { heading: "What it does", body: "For each selected deal, the AI produces: cleaned buyer/target names, classified deal type, priority score (1-10), advisory attractiveness score (1-10), risk flag (low/med/high), and a 2-3 sentence strategic summary." },
      { heading: "How to run it", body: "", steps: [
        "Sidebar → Enrich AI",
        "Click Select All Pending (or tick individual rows)",
        "Click Enrich Selected — runs batches of 10 in parallel",
        "Watch the progress bar + enrichment log for live status",
        "Refresh the Deals page to see the new scores",
      ]},
      { heading: "Free vs paid", body: "If a Fast Tier API key is saved in Settings, enrichment uses that provider (Groq + Llama 3.3 is free and ultra-fast). If no key is saved, the built-in rule engine computes scores based on deal size and sector — zero cost, but less nuanced summaries." },
    ],
  },
  {
    id: "proposals",
    title: "Proposal Generator",
    icon: FileText,
    content: [
      { heading: "6 document types", body: "", steps: [
        "M&A Advisory Proposal — full client mandate document",
        "Executive Summary — board-ready concise brief",
        "Board Memo — formal approval request",
        "Investment Teaser — confidential marketing doc",
        "Integration Blueprint — post-merger operational plan",
        "100-Day Plan — phased action roadmap",
      ]},
      { heading: "How to generate", body: "", steps: [
        "Sidebar → Proposals",
        "Pick a document type from the left column",
        "Fill in: Client, Buyer, Target, Sector, Geography, Deal Size, Notes",
        "Toggle Premium AI ON for the Smart Tier provider (best quality)",
        "Click Generate Document — takes 10-30 seconds",
        "Use Copy or Print / Save PDF to export",
        "History panel (bottom-left) keeps your last 20 generations in this session",
      ]},
    ],
  },
  {
    id: "exports",
    title: "Export Center",
    icon: Download,
    content: [
      { heading: "4 formats available", body: "", steps: [
        "CSV — spreadsheet-compatible raw data (Excel, Google Sheets, Numbers)",
        "JSON — structured format for developers and API pipelines",
        "PDF — branded pipeline report with KPI grid and deal table",
        "PPTX — 4-slide presentation: title, KPIs + sector chart, top 15, closing",
      ]},
      { heading: "Filter before exporting", body: "Use the Sector and Status dropdowns at the top to narrow your export. The counter updates live so you know exactly what will be downloaded." },
    ],
  },
  {
    id: "settings",
    title: "AI Settings",
    icon: SettingsIcon,
    content: [
      { heading: "Two tiers", body: "Fast Tier for high-volume enrichment tasks. Smart Tier for long-form proposals and deep reasoning." },
      { heading: "15 providers supported", body: "Google, OpenAI, Anthropic, Mistral, DeepSeek, Alibaba Qwen, xAI Grok, Cohere, Groq, NVIDIA NIM, OpenRouter, Together, HuggingFace, Replicate, plus a free rule-based fallback." },
      { heading: "Auto-detect", body: "You never pick specific model versions. Click Auto-detect best model — the system probes the provider's model list and locks in the first one that responds. Works even as providers release new versions." },
      { heading: "Security", body: "API keys are encrypted at rest using pgcrypto and the service role. Keys never appear in your browser after saving, even on reload." },
    ],
  },
  {
    id: "activity",
    title: "Activity & Security",
    icon: Shield,
    content: [
      { heading: "Audit log", body: "Every AI call and major action is recorded to the activity_log table with your user ID, timestamp, and metadata. Sidebar → Activity to review." },
      { heading: "Rate limiting", body: "20 enrichment calls/min and 10 proposals/min per user. Prevents runaway AI spend." },
      { heading: "Row-level security", body: "Every table enforces strict RLS — you can only read and modify your own data. No user can access another user's deals, proposals, or API keys." },
    ],
  },
  {
    id: "faq",
    title: "Frequently Asked Questions",
    icon: HelpCircle,
    content: [
      { heading: "Is my data private?", body: "Yes. Row-level security in Supabase ensures every query is scoped to your user ID. API keys are encrypted. No user can see another user's data." },
      { heading: "Do AI providers see my deal data?", body: "Only when you trigger enrichment or proposal generation. Each provider has its own privacy policy — check before using (Anthropic and Google Enterprise don't train on API traffic by default)." },
      { heading: "Which AI provider should I pick?", body: "For Fast Tier: Groq (free + fastest). For Smart Tier: Anthropic Claude (best reasoning) or Google Gemini 2.5 Pro (free tier available)." },
      { heading: "What if I have no API key?", body: "Enrichment uses a built-in rule engine. Proposals will be limited. Free tier providers (Groq, Google) take 2 minutes to set up." },
      { heading: "How do I delete all my deals?", body: "Supabase → Table Editor → deals → select rows → delete. Exceptions and activity_log will cascade cleanly." },
      { heading: "How do I export everything at once?", body: "Exports page → leave filters empty → click PDF or PPTX for a branded report, or CSV for all raw data." },
      { heading: "Can I edit a deal after import?", body: "Directly from the Deals table in Supabase for now. A UI editor is on the roadmap." },
      { heading: "Can multiple users share a workspace?", body: "Not in v1 — each user sees only their own data. Multi-user orgs are a v2 feature." },
    ],
  },
];

const ALL = [...SECTIONS, ...MORE_SECTIONS];

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
          <input
            type="text"
            placeholder="Search help…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-xs outline-none focus:border-indigo-300 focus:bg-white"
          />
        </div>
        <nav className="space-y-0.5">
          {filtered.map((s) => {
            const Icon = s.icon;
            return (
              <button
                key={s.id}
                onClick={() => setActiveId(s.id)}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition ${
                  activeId === s.id
                    ? "bg-indigo-50 font-semibold text-indigo-700"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="flex-1 truncate">{s.title}</span>
                {activeId === s.id && <ChevronRight className="h-3 w-3" />}
              </button>
            );
          })}
        </nav>

        <div className="mt-8 rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-purple-50 p-4">
          <Zap className="h-5 w-5 text-indigo-600" />
          <p className="mt-2 text-xs font-semibold text-slate-900">Quick-start checklist</p>
          <ol className="mt-2 space-y-1 text-[11px] text-slate-600">
            <li>1. Settings → save Groq key</li>
            <li>2. Upload → drop your CSV</li>
            <li>3. Mapping → import</li>
            <li>4. Enrich → run all</li>
            <li>5. Proposals → generate</li>
          </ol>
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
                {block.heading && (
                  <h3 className="mb-2 text-base font-semibold text-slate-900">{block.heading}</h3>
                )}
                {block.body && (
                  <p className="text-sm leading-relaxed text-slate-700">{block.body}</p>
                )}
                {block.steps && (
                  <ol className="mt-3 space-y-2">
                    {block.steps.map((step, j) => (
                      <li key={j} className="flex gap-3 text-sm text-slate-700">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-700">
                          {j + 1}
                        </span>
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
              <button
                onClick={() => setActiveId(ALL[ALL.findIndex((s) => s.id === active.id) - 1].id)}
                className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
              >
                ← {ALL[ALL.findIndex((s) => s.id === active.id) - 1].title}
              </button>
            )}
            <div className="ml-auto">
              {ALL.findIndex((s) => s.id === active.id) < ALL.length - 1 && (
                <button
                  onClick={() => setActiveId(ALL[ALL.findIndex((s) => s.id === active.id) + 1].id)}
                  className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
                >
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
