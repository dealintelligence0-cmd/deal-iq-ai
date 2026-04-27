"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  FileText, Sparkles, Loader2, Copy, Printer,
  CheckCircle2, ChevronDown, History, Trash2, Plus, X,
} from "lucide-react";
import { renderVisualProposal, renderCitations } from "@/lib/proposal/visual-renderer";
import { cleanMarkdownToHTML } from "@/lib/ai/utils";
import { classifyDeal, generateServices, type Service, type DealClassification } from "@/lib/intelligence/deal-classifier";

type ProposalType =
  | "advisory" | "executive_summary" | "board_memo"
  | "investment_teaser" | "integration_blueprint" | "hundred_day_plan";

const PROPOSAL_OPTIONS: { value: ProposalType; label: string; icon: string; desc: string }[] = [
  { value: "advisory", label: "M&A Advisory Proposal", icon: "▸", desc: "Full client-facing advisory mandate proposal" },
  { value: "executive_summary", label: "Executive Summary", icon: "■", desc: "Concise deal summary for senior leadership" },
  { value: "board_memo", label: "Board Memo", icon: "★", desc: "Formal memo for board approval" },
  { value: "investment_teaser", label: "Investment Teaser", icon: "$", desc: "Confidential marketing teaser for buyers" },
  { value: "integration_blueprint", label: "Integration Blueprint", icon: "●", desc: "Post-merger integration roadmap" },
  { value: "hundred_day_plan", label: "100-Day Plan", icon: "✓", desc: "Action plan for first 100 days post-close" },
];

type SavedProposal = {
  id: string; label: string; content: string;
  createdAt: string; provider: string; model: string;
};



function renderMarkdown(md: string): string {
  return cleanMarkdownToHTML(md);
}

function ProposalsPageInner() {
  const searchParams = useSearchParams();
  const [proposalType, setProposalType] = useState<ProposalType>("advisory");
  const [clientName, setClientName] = useState("");
  const [buyer, setBuyer] = useState("");
  const [target, setTarget] = useState("");
  const [sector, setSector] = useState("");
  const [geography, setGeography] = useState("");
  const [dealSize, setDealSize] = useState("");
  const [noteRationale, setNoteRationale] = useState("");
  const [noteRisks, setNoteRisks] = useState("");
  const [noteWins, setNoteWins] = useState("");
  const [noteAsks, setNoteAsks] = useState("");
  const notes = [
    noteRationale,
    noteRisks ? `[RISKS] ${noteRisks}` : "",
    noteWins ? `[WINS] ${noteWins}` : "",
    noteAsks ? `[ASKS] ${noteAsks}` : "",
  ].filter(Boolean).join("\n");
  const [usePremium, setUsePremium] = useState(false);
  const [stakePercent, setStakePercent] = useState("");
  const [dealTypeInput, setDealTypeInput] = useState("");
  const [clientRole, setClientRole] = useState<"buyer" | "seller" | "pe" | "jv_partner">("buyer");
  const [mandateType, setMandateType] = useState<string>("buy_side");
  const [buyerType, setBuyerType] = useState<string>("strategic");
  const [ownershipType, setOwnershipType] = useState<string>("majority");
  const [integrationStyle, setIntegrationStyle] = useState<string>("functional");
  const [services, setServices] = useState<Service[]>([]);
  const [customServiceName, setCustomServiceName] = useState("");
  const [showClassification, setShowClassification] = useState(false);
  const [researchBrief, setResearchBrief] = useState<string>("");
  const [researchLoading, setResearchLoading] = useState(false);
  const [researchStatus, setResearchStatus] = useState<string>("");
  const [useResearch, setUseResearch] = useState(false);
  const [researchMode, setResearchMode] = useState<"web" | "prompt">("prompt");
  const [customPrompt, setCustomPrompt] = useState("");
  const [showPromptEditor, setShowPromptEditor] = useState(false);
  const [dealId, setDealId] = useState<string>("");

  useEffect(() => {
    const b = searchParams.get("buyer");
    const t = searchParams.get("target");
    const s = searchParams.get("sector");
    const g = searchParams.get("geography");
    const ds = searchParams.get("deal_size");
    const did = searchParams.get("deal_id");
    const wantsResearch = searchParams.get("research") === "1";

    if (b) setBuyer(b);
    if (t) setTarget(t);
    if (s) setSector(s);
    if (g) setGeography(g);
    if (ds) setDealSize(ds);
    if (did) setDealId(did);

    if (wantsResearch && b && t) {
      runResearch(b, t, s ?? "", g ?? "", did ?? undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

async function runResearch(b: string, t: string, s: string, g: string, did?: string) {
    setResearchLoading(true);
    setResearchStatus(researchMode === "prompt" ? "Generating AI research from prompt..." : "Fetching live market intelligence...");
    try {
     let r = await fetch("/api/research", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          buyer: b, target: t, sector: s, geography: g,
          deal_id: did, deal_size: dealSize,
          mode: researchMode,
          custom_prompt: researchMode === "prompt" ? customPrompt : undefined,
        }),
      });
      let j = await r.json();
      // Auto-fallback: web mode failed → retry as prompt-based
      if (!j.brief && researchMode === "web") {
        setResearchStatus("Web research failed — falling back to prompt-based AI...");
        r = await fetch("/api/research", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            buyer: b, target: t, sector: s, geography: g,
            deal_id: did, deal_size: dealSize,
            mode: "prompt",
          }),
        });
        j = await r.json();
        if (j.brief) setResearchMode("prompt");
      }
      if (j.brief) {
        const block = `Buyer: ${j.brief.buyer_profile}\n\nTarget: ${j.brief.target_profile}\n\nSector: ${j.brief.sector_signals}\n\nComparables: ${j.brief.comparables}\n\nRisks: ${j.brief.live_risks}\n\nSources:\n${j.brief.citations.map((c: { title: string; url: string }, i: number) => `[${i + 1}] ${c.title} — ${c.url}`).join("\n")}`;
        setResearchBrief(block);
        setUseResearch(true);
        setUsePremium(true);
        setResearchStatus(j.cached ? `✓ Loaded cached research (${j.brief.citations.length} sources)` : `✓ Fresh research complete (${j.brief.citations.length} sources)`);
      } else {
        setResearchStatus(`✗ ${j.error ?? "Research failed"}`);
      }
    } catch (e) {
      setResearchStatus(`✗ ${String(e)}`);
    } finally {
      setResearchLoading(false);
    }
  }

  const classification: DealClassification | null = (buyer || target) ? classifyDeal({
    buyer, target, sector, country: geography,
    deal_type: dealTypeInput,
    stake_percent: stakePercent ? Number(stakePercent) : null,
    notes,
  }) : null;

  useEffect(() => {
    if (classification && services.length === 0) {
      setServices(generateServices(classification, {
        buyer, target, sector, country: geography,
        deal_type: dealTypeInput,
        stake_percent: stakePercent ? Number(stakePercent) : null,
        notes,
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buyer, target, sector, geography, dealTypeInput, stakePercent]);

  function toggleService(id: string) {
    setServices((prev) => prev.map((s) => s.id === id ? { ...s, selected: !s.selected } : s));
  }

  function addCustomService() {
    if (!customServiceName.trim()) return;
    setServices((prev) => [...prev, {
      id: "custom_" + Date.now(),
      name: customServiceName.trim(),
      type: "custom",
      selected: true,
    }]);
    setCustomServiceName("");
  }

  function removeService(id: string) {
    setServices((prev) => prev.filter((s) => s.id !== id));
  }

  const [generating, setGenerating] = useState(false);
  const [content, setContent] = useState<string | null>(null);
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [via, setVia] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [history, setHistory] = useState<SavedProposal[]>([]);
  useEffect(() => {
    (async () => {
      const sb = (await import("@/lib/supabase/client")).createClient();
      const { data } = await sb.from("proposals")
        .select("id,proposal_type,buyer,target,content,provider,model,created_at")
        .order("created_at", { ascending: false })
        .limit(20);
      if (data) {
        setHistory(data.map((d) => ({
          id: d.id,
          label: `${(PROPOSAL_OPTIONS.find(o => o.value === d.proposal_type)?.label ?? d.proposal_type)} — ${d.target ?? d.buyer ?? "Unnamed"}`,
          content: d.content,
          createdAt: new Date(d.created_at).toLocaleString(),
          provider: d.provider ?? "",
          model: d.model ?? "",
        })));
      }
    })();
  }, []);
  const [showHistory, setShowHistory] = useState(false);

  async function generate() {
    setGenerating(true); setError(null); setContent(null);
    try {
      const res = await fetch("/api/ai/proposal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposal_type: proposalType, client_name: clientName,
          buyer, target, sector, geography, deal_size: dealSize,
          notes: useResearch && researchBrief ? `${notes}\n\n${researchBrief}` : notes,
          use_premium: usePremium,
          stake_percent: stakePercent ? Number(stakePercent) : undefined,
          deal_type_input: dealTypeInput || undefined,
          client_role: clientRole,
          mandate_type: mandateType,
          buyer_type: buyerType,
          ownership_type: ownershipType, integration_style: integrationStyle,
          selected_services: services,
          research_docs: useResearch ? researchBrief : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error ?? "Generation failed. Check AI Settings.");
      } else {
        setContent(data.content);
        setProvider(data.provider);
        setModel(data.model ?? "");
        setVia(data.viaFallback ?? false);
        const label = PROPOSAL_OPTIONS.find((o) => o.value === proposalType)?.label ?? proposalType;
        setHistory((prev) => [{
          id: Date.now().toString(),
          label: `${label} — ${target || buyer || "Unnamed"}`,
          content: data.content,
          createdAt: new Date().toLocaleString(),
          provider: data.provider,
          model: data.model ?? "",
        }, ...prev].slice(0, 20));
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setGenerating(false);
    }
  }

  function copyToClipboard() {
    if (!content) return;
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function printDoc() {
    if (!content) return;
    const win = window.open("", "_blank");
    if (!win) return;
    const label = PROPOSAL_OPTIONS.find((o) => o.value === proposalType)?.label ?? "";
    const dealTitle = [target, "·", buyer].filter(Boolean).join(" ");
    const today = new Date().toLocaleDateString();
    const footerText = "This document is for informational purposes only and does not constitute financial, legal, or investment advice. No reliance should be placed on this analysis. Independent verification is required.";

    win.document.write(`<!DOCTYPE html><html><head>
<meta charset="utf-8"/>
<title>${label}</title>
<script src="https://cdn.tailwindcss.com"></script>
<style>
@page { margin: 22mm 18mm 26mm 18mm; }
body {
  font-family: -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif;
  color: #0f172a;
  background: #fff;
  font-size: 11px;
  line-height: 1.55;
  margin: 0;
  padding: 0;
}
.pdf-wrap { max-width: 780px; margin: 0 auto; padding: 0 8px; }
.pdf-header { border-bottom: 2px solid #4f46e5; padding-bottom: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-start; }
.pdf-header .label { font-size: 9px; font-weight: 700; letter-spacing: 2px; color: #4f46e5; text-transform: uppercase; }
.pdf-header h1 { font-size: 20px; font-weight: 700; margin: 4px 0 0; }
.pdf-header .sub { font-size: 11px; color: #64748b; margin-top: 2px; }
.pdf-header .meta { text-align: right; font-size: 10px; color: #64748b; }
section { margin: 22px 0; page-break-inside: avoid; }
section h2 { font-size: 14px; font-weight: 700; color: #0f172a; margin: 0 0 10px; padding-bottom: 6px; border-bottom: 1px solid #e2e8f0; }
section h2 .num { font-size: 9px; color: #4f46e5; font-weight: 700; letter-spacing: 1.5px; margin-right: 8px; }
table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 10px; table-layout: fixed; }
th { background: #eef2ff; color: #3730a3; font-weight: 700; text-align: left; padding: 8px 10px; border-bottom: 2px solid #c7d2fe; word-break: break-word; }
td { padding: 7px 10px; border-bottom: 1px solid #f1f5f9; word-break: break-word; vertical-align: top; }
tr { page-break-inside: avoid; }
table { page-break-inside: auto; }
thead { display: table-header-group; }
section { page-break-inside: avoid; }
.metric-card { display: inline-block; background: rgba(99,102,241,0.08); border: 1px solid rgba(99,102,241,0.2); border-radius: 8px; padding: 10px 14px; margin: 4px 6px 4px 0; }
.metric-card .l { font-size: 9px; text-transform: uppercase; letter-spacing: 1px; color: #64748b; font-weight: 600; }
.metric-card .v { font-size: 16px; font-weight: 700; color: #0f172a; margin-top: 2px; }
ul, ol { padding-left: 18px; margin: 6px 0; }
li { margin: 3px 0; }
strong { color: #0f172a; }
.pdf-footer { position: fixed; bottom: 8mm; left: 18mm; right: 18mm; font-size: 8px; color: #94a3b8; text-align: center; border-top: 0.5px solid #e2e8f0; padding-top: 4px; }
.notice-page { page-break-before: always; padding-top: 30px; }
.notice-page h1 { font-size: 18px; font-weight: 700; color: #0f172a; border-bottom: 2px solid #4f46e5; padding-bottom: 8px; margin-bottom: 16px; }
.notice-page p { font-size: 11px; color: #475569; margin: 10px 0; line-height: 1.6; }
.notice-page ul li { font-size: 11px; color: #475569; margin: 6px 0; }
@media print { .pdf-footer { display: block; } }
</style>
</head><body>
<div class="pdf-wrap">
  <div class="pdf-header">
    <div>
      <div class="label">Deal IQ AI · Confidential</div>
      <h1>${label}</h1>
      ${dealTitle ? `<div class="sub">${dealTitle}</div>` : ""}
    </div>
    <div class="meta">
      ${today}<br/>
      ${dealSize ? `<strong>${dealSize}</strong><br/>` : ""}
      ${sector || ""}
    </div>
  </div>
  ${renderVisualProposal(content)}
  ${researchBrief ? renderCitations(researchBrief) : ""}

  <div class="notice-page">
    <h1>Important Notice</h1>
    <p>This document was generated using AI-powered analysis tools. Before relying on any portion of this content, please review the limitations below.</p>
    <ul>
      <li>AI-generated insights may be incomplete, inaccurate, or rely on outdated public information.</li>
      <li>The platform is provided on an &ldquo;as is&rdquo; basis without any warranties, express or implied.</li>
      <li>The platform owner accepts no liability for decisions, outcomes, or losses arising from use of, or reliance on, this analysis.</li>
      <li>Use of the platform and its outputs is at the user&apos;s sole risk.</li>
      <li>Independent professional diligence is required before any financial, legal, regulatory, or investment decision.</li>
    </ul>
    <p style="margin-top:24px;color:#94a3b8;font-size:10px;">© ${new Date().getFullYear()} Rahul Yadav. All rights reserved. Unauthorized replication or commercial use is prohibited.</p>
  </div>
</div>
<div class="pdf-footer">${footerText}</div>
</body></html>`);
    win.document.close();
    win.onload = () => {
      setTimeout(() => { win.focus(); win.print(); }, 250);
    };
  }

  const selectedOption = PROPOSAL_OPTIONS.find((o) => o.value === proposalType);
  return (
    <div className="flex h-full min-h-screen flex-col gap-0 lg:flex-row">
      <aside className="w-full shrink-0 border-b border-slate-200 bg-white p-6 lg:w-80 lg:border-b-0 lg:border-r lg:overflow-y-auto">
        <div className="flex items-center gap-2 mb-6">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600">
            <FileText className="h-4 w-4 text-white" />
          </div>
          <div className="page-header">
          <h1 className="text-lg font-semibold text-white">Proposal Generator</h1>
          <p className="mt-1 text-xs text-white/60">AI-powered consulting documents</p>
        </div>
        </div>

        <div className="mb-5">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Document Type</label>
          <div className="space-y-1.5">
            {PROPOSAL_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setProposalType(opt.value)}
                className={`w-full rounded-lg border px-3 py-2.5 text-left transition ${
                  proposalType === opt.value ? "border-indigo-300 bg-indigo-50" : "border-slate-200 bg-white hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-base">{opt.icon}</span>
                  <div>
                    <p className={`text-xs font-semibold ${proposalType === opt.value ? "text-indigo-700" : "text-slate-700"}`}>{opt.label}</p>
                    <p className="text-[10px] text-slate-400">{opt.desc}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Deal Details</label>
          {[
            { label: "Client / Advisory House", value: clientName, set: setClientName, placeholder: "e.g. Goldman Sachs" },
            { label: "Buyer / Acquirer", value: buyer, set: setBuyer, placeholder: "e.g. Reliance Industries" },
            { label: "Target Company", value: target, set: setTarget, placeholder: "e.g. Future Retail" },
            { label: "Sector", value: sector, set: setSector, placeholder: "e.g. Retail, Technology" },
            { label: "Geography", value: geography, set: setGeography, placeholder: "e.g. India, South Asia" },
            { label: "Deal Size", value: dealSize, set: setDealSize, placeholder: "e.g. $500M, ₹4,200 Cr" },
          ].map((f) => (
            <div key={f.label}>
              <label className="mb-1 block text-[11px] font-medium text-slate-600">{f.label}</label>
              <input type="text" value={f.value} onChange={(e) => f.set(e.target.value)} placeholder={f.placeholder}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:border-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-200" />
            </div>
          ))}
       <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3">
            <p className="mb-2 text-[11px] font-semibold text-amber-900">Insider Insights (boost proposal quality)</p>
            <div className="space-y-2">
              <div>
                <label className="block text-[10px] font-medium text-slate-600">Strategic Rationale</label>
                <textarea value={noteRationale} onChange={(e) => setNoteRationale(e.target.value)} rows={2}
                  placeholder="Why this deal? What's the thesis?"
                  className="w-full rounded border border-amber-200 bg-white px-2 py-1 text-[11px]" />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-slate-600">Known Risks / Concerns</label>
                <textarea value={noteRisks} onChange={(e) => setNoteRisks(e.target.value)} rows={2}
                  placeholder="Antitrust risk, talent flight, customer concentration..."
                  className="w-full rounded border border-amber-200 bg-white px-2 py-1 text-[11px]" />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-slate-600">Wins / Differentiators</label>
                <textarea value={noteWins} onChange={(e) => setNoteWins(e.target.value)} rows={2}
                  placeholder="What makes this deal special? Strategic moat?"
                  className="w-full rounded border border-amber-200 bg-white px-2 py-1 text-[11px]" />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-slate-600">Client Asks</label>
                <textarea value={noteAsks} onChange={(e) => setNoteAsks(e.target.value)} rows={2}
                  placeholder="What does the client specifically want emphasized?"
                  className="w-full rounded border border-amber-200 bg-white px-2 py-1 text-[11px]" />
              </div>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-600">Deal Type (e.g. Acquisition, PE Buyout, JV, Carve-out)</label>
            <input type="text" value={dealTypeInput} onChange={(e) => setDealTypeInput(e.target.value)} placeholder="Acquisition"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:border-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-200" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-600">Stake %</label>
              <input type="number" min="0" max="100" value={stakePercent} onChange={(e) => setStakePercent(e.target.value)} placeholder="100"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-indigo-300 focus:outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-600">Client Role</label>
              <select value={clientRole} onChange={(e) => setClientRole(e.target.value as typeof clientRole)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-indigo-300 focus:outline-none">
                <option value="buyer">Buyer</option>
                <option value="seller">Seller</option>
                <option value="pe">PE Fund</option>
                <option value="jv_partner">JV Partner</option>
              </select>
            </div>
          </div>

          <div>
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Mandate Type</label>
              <select value={mandateType} onChange={(e) => setMandateType(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white">
                <option value="buy_side">Buy-side advisory</option>
                <option value="sell_side">Sell-side advisory</option>
                <option value="vendor_assist">Vendor assist</option>
                <option value="pmi_only">PMI only (post-close)</option>
                <option value="carve_out">Carve-out</option>
                <option value="synergy_capture">Synergy capture</option>
                <option value="value_creation">Value creation post-close</option>
                <option value="distressed">Distressed M&A</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Buyer Type</label>
              <select value={buyerType} onChange={(e) => setBuyerType(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white">
                <option value="strategic">Strategic corporate</option>
                <option value="pe">PE sponsor</option>
                <option value="family_office">Family office</option>
                <option value="sovereign">Sovereign / infra</option>
                <option value="founder">Founder buyer</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Ownership Type</label>
              <select value={ownershipType} onChange={(e) => setOwnershipType(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white">
                <option value="minority">Minority stake</option>
                <option value="majority">Majority stake</option>
                <option value="full">Full acquisition (100%)</option>
                <option value="jv">Joint venture</option>
                <option value="merger">Merger of equals</option>
              </select>
            </div>
          <div>
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Integration Style</label>
              <select value={integrationStyle} onChange={(e) => setIntegrationStyle(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white">
                <option value="light_touch">Light touch (preserve autonomy)</option>
                <option value="controlled_autonomy">Controlled autonomy</option>
                <option value="functional">Functional integration</option>
                <option value="full_absorption">Full absorption</option>
                <option value="standalone_holdco">Standalone holdco</option>
              </select>
            </div>
          {classification && (
            <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 p-3">
              <button onClick={() => setShowClassification(!showClassification)}
                className="flex w-full items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-indigo-700">
                <span>Deal Classification</span>
                <ChevronDown className={`h-3 w-3 transition-transform ${showClassification ? "rotate-180" : ""}`} />
              </button>
              {showClassification && (
                <div className="mt-2 space-y-1 text-[10px] text-slate-700">
                  <p><strong>Category:</strong> {classification.category.replace(/_/g, " ")}</p>
                  <p><strong>Control:</strong> {classification.control}</p>
                  <p><strong>Buyer:</strong> {classification.buyerType}</p>
                  <p><strong>Intent:</strong> {classification.intent}</p>
                  <p><strong>Integration:</strong> {classification.integrationNeed.replace(/_/g, " ")}</p>
                </div>
              )}
            </div>
          )}

          {services.length > 0 && (
            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-600">Services ({services.filter(s => s.selected).length} selected)</label>
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2">
                {services.map((s) => (
                  <label key={s.id} className="flex cursor-pointer items-start gap-2 rounded px-1 py-0.5 text-[11px] hover:bg-slate-50">
                    <input type="checkbox" checked={s.selected} onChange={() => toggleService(s.id)}
                      className="mt-0.5 rounded border-slate-300" />
                    <span className="flex-1 text-slate-700">{s.name}</span>
                    <span className={`text-[9px] uppercase ${s.type === "core" ? "text-indigo-600" : s.type === "custom" ? "text-purple-600" : "text-slate-400"}`}>{s.type}</span>
                    {s.type === "custom" && (
                      <button onClick={(e) => { e.preventDefault(); removeService(s.id); }} className="text-red-400 hover:text-red-600">
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </label>
                ))}
              </div>
              <div className="mt-1.5 flex gap-1">
                <input type="text" value={customServiceName} onChange={(e) => setCustomServiceName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addCustomService()}
                  placeholder="Add custom service…"
                  className="flex-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] focus:border-indigo-300 focus:outline-none" />
                <button onClick={addCustomService} disabled={!customServiceName.trim()}
                  className="rounded-lg bg-slate-900 px-2 py-1 text-[11px] text-white hover:bg-slate-800 disabled:opacity-40">
                  <Plus className="h-3 w-3" />
                </button>
              </div>
            </div>
          )}
          {(buyer && target) && (
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <label className="text-[11px] font-semibold text-slate-700">Research Mode</label>
              <select value={researchMode} onChange={(e) => setResearchMode(e.target.value as "web" | "prompt")}
                className="mt-1 w-full rounded border border-slate-200 px-2 py-1.5 text-[11px]">
               <option value="prompt">Prompt-Based AI (default — uses your LLM)</option>
                <option value="web">Live Web (requires Tavily/Brave/Serper key)</option>
              </select>
              <p className="mt-1 text-[10px] text-slate-500">
                {researchMode === "web"
                  ? "Fetches live web sources. Requires search-provider API key."
                  : "Uses your Smart-tier LLM with a custom prompt. No web access."}
              </p>
              {researchMode === "prompt" && (
                <>
                  <button onClick={() => setShowPromptEditor(!showPromptEditor)}
                    className="mt-2 text-[10px] font-medium text-indigo-600 hover:text-indigo-700">
                    {showPromptEditor ? "Hide" : "Edit"} prompt template ▾
                  </button>
                  {showPromptEditor && (
                    <div className="mt-2">
                      <textarea value={customPrompt}
                        onChange={(e) => setCustomPrompt(e.target.value)}
                        rows={8}
                        placeholder="Leave empty to use default research template. Variables: {{buyer}} {{target}} {{sector}} {{geography}} {{deal_size}}"
                        className="w-full rounded border border-slate-200 px-2 py-1.5 font-mono text-[10px]" />
                      <button onClick={async () => {
                        const m = await import("@/lib/research/web-research");
                        setCustomPrompt(m.DEFAULT_RESEARCH_PROMPT);
                      }} className="mt-1 text-[10px] text-slate-500 hover:text-indigo-600">
                        Load default template
                      </button>
                    </div>
                  )}
                </>
              )}
             
            </div>
          )}
          {(researchBrief || researchLoading || researchStatus) && (
            <div className="rounded-lg border border-purple-200 bg-gradient-to-br from-indigo-50 to-purple-50 p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-purple-900">ߔ Live Research</p>
                {researchBrief && (
                  <label className="flex items-center gap-1 text-[10px] text-purple-700">
                    <input type="checkbox" checked={useResearch} onChange={(e) => setUseResearch(e.target.checked)}
                      className="h-3 w-3 rounded border-purple-300" />
                    Use in proposal
                  </label>
                )}
              </div>
              {researchStatus && <p className="mt-1 text-[10px] text-slate-600">{researchStatus}</p>}
              {researchLoading && <div className="mt-2 h-1 animate-pulse rounded-full bg-purple-200" />}
              {researchBrief && !researchLoading && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-[10px] font-medium text-purple-700">View brief ({researchBrief.length} chars)</summary>
                  <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-white p-2 text-[9px] text-slate-700">{researchBrief.slice(0, 1000)}...</pre>
                </details>
              )}
              {!researchBrief && !researchLoading && buyer && target && (
                <button onClick={() => runResearch(buyer, target, sector, geography, dealId)}
                  className="mt-2 w-full rounded-md bg-purple-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-purple-700">
                  Run Live Research Now
                </button>
              )}
            </div>
          )}

          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
            <div>
              <p className="text-xs font-medium text-slate-700">Premium AI</p>
              <p className="text-[10px] text-slate-500">Uses Smart provider from Settings</p>
            </div>
            <button onClick={() => setUsePremium(!usePremium)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${usePremium ? "bg-indigo-600" : "bg-slate-300"}`}>
              <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${usePremium ? "translate-x-4" : "translate-x-0.5"}`} />
            </button>
          </div>

          <button onClick={generate} disabled={generating || (!buyer && !target)}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md hover:from-indigo-700 hover:to-purple-700 disabled:cursor-not-allowed disabled:opacity-50">
            {generating
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</>
              : <><Sparkles className="h-4 w-4" /> Generate Document</>}
          </button>
          {(!buyer && !target) && (
            <p className="text-center text-[10px] text-slate-400">Enter buyer or target to generate</p>
          )}
        </div>

        {history.length > 0 && (
          <div className="mt-6">
            <button onClick={() => setShowHistory(!showHistory)}
              className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
              <span className="flex items-center gap-1.5"><History className="h-3.5 w-3.5" /> History ({history.length})</span>
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showHistory ? "rotate-180" : ""}`} />
            </button>
            {showHistory && (
              <div className="mt-2 space-y-1.5">
                {history.map((h) => (
                  <button key={h.id} onClick={() => setContent(h.content)}
                    className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-left hover:bg-slate-50">
                    <p className="truncate text-xs font-medium text-slate-700">{h.label}</p>
                    <p className="text-[10px] text-slate-400">{h.createdAt} · {h.provider}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </aside>

      <main className="flex-1 overflow-y-auto bg-slate-50 p-6">
        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <strong>Error:</strong> {error}
          </div>
        )}

        {generating && (
          <div className="space-y-4 animate-pulse">
            <div className="h-8 w-3/4 rounded-lg bg-slate-200" />
            <div className="h-4 w-full rounded bg-slate-200" />
            <div className="h-4 w-5/6 rounded bg-slate-200" />
            <div className="h-4 w-4/5 rounded bg-slate-200" />
            <div className="mt-6 h-6 w-1/2 rounded-lg bg-slate-200" />
            <div className="h-4 w-full rounded bg-slate-200" />
            <div className="h-4 w-3/4 rounded bg-slate-200" />
          </div>
        )}

        {!generating && !content && (
          <div className="flex h-full min-h-[400px] flex-col items-center justify-center gap-4 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100">
              <span className="text-3xl">{selectedOption?.icon}</span>
            </div>
            <div>
              <p className="text-base font-semibold text-slate-700">{selectedOption?.label}</p>
              <p className="mt-1 text-sm text-slate-400">{selectedOption?.desc}</p>
            </div>
            <p className="max-w-xs text-xs text-slate-400">
              Fill in the deal details on the left and click <strong>Generate Document</strong>.
            </p>
          </div>
        )}

        {!generating && content && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="text-lg">{selectedOption?.icon}</span>
                <div>
                  <p className="text-sm font-semibold text-slate-800">{selectedOption?.label}</p>
                  <p className="text-xs text-slate-400">
                    {provider}{model && ` · ${model}`}
                    {via && <span className="ml-1 rounded bg-amber-100 px-1 text-amber-700">fallback</span>}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={copyToClipboard}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                  {copied
                    ? <><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Copied!</>
                    : <><Copy className="h-3.5 w-3.5" /> Copy</>}
                </button>
                <button onClick={printDoc}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                  <Printer className="h-3.5 w-3.5" /> Print / Save PDF
                </button>
                <button onClick={() => setContent(null)}
                  className="flex items-center gap-1.5 rounded-lg border border-red-100 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100">
                  <Trash2 className="h-3.5 w-3.5" /> Clear
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white px-8 py-8 shadow-sm">
              <div className="mb-6 flex items-start justify-between border-b border-slate-200 pb-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-indigo-600">DEAL IQ AI</p>
                  <p className="mt-0.5 text-xs text-slate-400">Intelligence · Advisory · Execution</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-400 font-mono">{new Date().toLocaleDateString()}</p>
                  {clientName && <p className="text-xs text-slate-500">Prepared for: <strong>{clientName}</strong></p>}
                  <p className="mt-0.5 text-[10px] text-slate-400">CONFIDENTIAL</p>
                </div>
              </div>

              <div className="mb-5 flex flex-wrap gap-2">
                {[buyer, target, sector, geography, dealSize].filter(Boolean).map((tag) => (
                  <span key={tag} className="rounded-full border border-indigo-100 bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
                    {tag}
                  </span>
                ))}
              </div>

           <article className="max-w-none"
                dangerouslySetInnerHTML={{ __html: renderVisualProposal(content) + (researchBrief ? renderCitations(researchBrief) : "") }} />

              <div className="mt-8 border-t border-slate-100 pt-4 text-[10px] text-slate-400">
                Generated by Deal IQ AI · {model} · {new Date().toLocaleString()} · Confidential.
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
export default function ProposalsPage() {
  return (
    <Suspense fallback={<div className="p-6">Loading...</div>}>
      <ProposalsPageInner />
    </Suspense>
  );
}
