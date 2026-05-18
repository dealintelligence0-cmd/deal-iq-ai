





"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  FileText, Sparkles, Loader2, Copy, Printer,
  CheckCircle2, ChevronDown, History, Trash2, Plus, X, Download, Target,
} from "lucide-react";
import CritiquePanel from "@/components/critique/CritiquePanel";
import { renderVisualProposal, renderCitations } from "@/lib/proposal/visual-renderer";
import { openMbbPrintWindow } from "@/lib/proposal/mbb-print";
import { generateOfflineProposal } from "@/lib/proposal/offline-engine";
import { cleanMarkdownToHTML } from "@/lib/ai/utils";
import { classifyDeal, generateServices, type Service, type DealClassification } from "@/lib/intelligence/deal-classifier";
import { createClient as createSbClient } from "@/lib/supabase/client";
import { topModel } from "@/lib/ai/rubric";
import type { RubricWeights } from "@/lib/ai/rubric";
import { DEFAULT_WEIGHTS_BY_MODULE } from "@/lib/ai/rubric";
import type { ModelCost } from "@/lib/ai/cost-estimator";
import AIGenerateConfirm from "@/components/AIGenerateConfirm";
import EditableProposal from "@/components/EditableProposal";
import { saveDealContext, loadDealContext, saveOutput, loadOutput, clearOutput, resetIfNewDeal } from "@/lib/dealContext";


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
  // Phase 3 rubric: open the model picker modal instead of using the binary toggle
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [premiumTier, setPremiumTier] = useState<{ provider: string | null; model: string | null; hasKey: boolean }>({ provider: null, model: null, hasKey: false });
  const [economicTier, setEconomicTier] = useState<{ provider: string | null; model: string | null; hasKey: boolean }>({ provider: null, model: null, hasKey: false });
  const [userWeights, setUserWeights] = useState<RubricWeights | null>(null);
  const [allowOffline, setAllowOffline] = useState(false);
  const [generationMode, setGenerationMode] = useState<"standard"|"advanced">("standard");
  const [premiumMode, setPremiumMode] = useState(false);
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

  const [generating, setGenerating] = useState(false);
  const [content, setContent] = useState<string | null>(null);
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [via, setVia] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [qualityScore, setQualityScore] = useState<number | null>(null);
  const [qualityBreakdown, setQualityBreakdown] = useState<{
    score: number;
    numericDensity?: number;
    repeatedPhrasePenalty?: number;
    missingOwnerPenalty?: number;
    missingJurisdictionPenalty?: number;
    genericLanguagePenalty?: number;
  } | null>(null);
  const [evidenceCoverage, setEvidenceCoverage] = useState<number | null>(null);
  const [scenarioCount, setScenarioCount] = useState<number>(0);
  const [lastSavedProposalId, setLastSavedProposalId] = useState<string | null>(null);
  const [critiqueOpen, setCritiqueOpen] = useState(false);

  const [history, setHistory] = useState<SavedProposal[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  // Section-level edit/regenerate mode. Off by default — partners see the
  // rendered proposal as before. Toggle to enable per-section toolbars.
  const [editMode, setEditMode] = useState(false);

  // Persist deal context whenever any field changes
  useEffect(() => {
    saveDealContext({ buyer, target, sector, geography, deal_size: dealSize, deal_id: dealId });
  }, [buyer, target, sector, geography, dealSize, dealId]);
useEffect(() => {
    const b = searchParams.get("buyer");
    const t = searchParams.get("target");
    const s = searchParams.get("sector");
    const g = searchParams.get("geography");
    const ds = searchParams.get("deal_size");
    const did = searchParams.get("deal_id");
    const wantsResearch = searchParams.get("research") === "1";

    // If a NEW deal_id arrives, wipe stored context+outputs to prevent mixing deals
    if (did) resetIfNewDeal(did);

    // 1) URL params win when present (came from deal pipeline)
    // 2) Fall back to sessionStorage (sidebar navigation between modules)
    const stored = loadDealContext();
    const finalB = b ?? stored.buyer;
    const finalT = t ?? stored.target;
    const finalS = s ?? stored.sector;
    const finalG = g ?? stored.geography;
    const finalDS = ds ?? stored.deal_size;
    const finalDID = did ?? stored.deal_id;

    if (finalB) setBuyer(finalB);
    if (finalT) setTarget(finalT);
    if (finalS) setSector(finalS);
    if (finalG) setGeography(finalG);
    if (finalDS) setDealSize(finalDS);
    if (finalDID) setDealId(finalDID);

    // Persist whatever we now have
    saveDealContext({
      buyer: finalB, target: finalT, sector: finalS,
      geography: finalG, deal_size: finalDS, deal_id: finalDID,
    });

    // Restore previously generated proposal output for this session
    const cached = loadOutput("proposal");
    if (cached) setContent(cached);

    if (wantsResearch && finalB && finalT) {
      runResearch(finalB, finalT, finalS ?? "", finalG ?? "", finalDID ?? undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runResearch(b: string, t: string, s: string, g: string, did?: string): Promise<string | null> {
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
        return block;
      } else {
        setResearchStatus(`✗ ${j.error ?? "Research failed"}`);
        return null;
      }
    } catch (e) {
      setResearchStatus(`✗ ${String(e)}`);
      return null;
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

  // Load tier configuration + saved rubric weights for the modal
  useEffect(() => {
    (async () => {
      const sb = (await import("@/lib/supabase/client")).createClient();
      const { data: u } = await sb.auth.getUser();
      if (!u.user) return;
      const { data } = await sb.from("ai_settings")
        .select("premium_provider,premium_model,premium_key_encrypted,economic_provider,economic_model,economic_key_encrypted,rubric_weights,allow_free_fallback")
        .eq("user_id", u.user.id).maybeSingle();
      if (data) {
        setPremiumTier({
          provider: data.premium_provider as string | null,
          model: data.premium_model as string | null,
          hasKey: !!data.premium_key_encrypted && data.premium_provider !== "free",
        });
        setEconomicTier({
          provider: data.economic_provider as string | null,
          model: data.economic_model as string | null,
          hasKey: !!data.economic_key_encrypted && data.economic_provider !== "free",
        });
        const savedWeights = data.rubric_weights as Record<string, RubricWeights> | RubricWeights | null;
        if (savedWeights) {
          // Support both shapes: { proposal: {...}, pmi: {...} } OR a single weights object
          if ("cost" in (savedWeights as object)) {
            setUserWeights(savedWeights as RubricWeights);
          } else if ((savedWeights as Record<string, RubricWeights>).proposal) {
            setUserWeights((savedWeights as Record<string, RubricWeights>).proposal);
          }
        }
        setAllowOffline(!!data.allow_free_fallback);
      }
    })();
  }, []);
  
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

  async function generate(
  tier: "premium" | "economic" | "offline" = "premium",
  modelOverride?: string
) {
    setGenerating(true); setError(null); setContent(null);
    try {
      let resolvedResearchBrief = researchBrief;
      if (premiumMode && !resolvedResearchBrief && buyer && target) {
        resolvedResearchBrief = (await runResearch(buyer, target, sector, geography, dealId)) ?? "";
      }
      if (premiumMode && !resolvedResearchBrief) {
        setError("Premium Mode requires research context. Click 'Run Live Research Now' first.");
        return;
      }

      const res = await fetch("/api/ai/proposal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposal_type: proposalType, client_name: clientName,
          deal_id: dealId || undefined,
          buyer, target, sector, geography, deal_size: dealSize,
          notes: useResearch && resolvedResearchBrief ? `${notes}\n\n${resolvedResearchBrief}` : notes,
          use_premium: tier === "premium",
model_override: modelOverride,
          research_mode: researchMode,
          generation_mode: generationMode,
          premium_mode: premiumMode,
          stake_percent: stakePercent ? Number(stakePercent) : undefined,
          deal_type_input: dealTypeInput || undefined,
          client_role: clientRole,
          mandate_type: mandateType,
          buyer_type: buyerType,
          ownership_type: ownershipType, integration_style: integrationStyle,
          selected_services: services,
          research_docs: useResearch ? resolvedResearchBrief : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error ?? "Generation failed. Check AI Settings.");
      } else {
        setContent(data.content);
        saveOutput("proposal", data.content);
        setProvider(data.provider);
        setModel(data.model ?? "");
        setVia(data.viaFallback ?? false);
        setQualityScore(data.qualityScore ?? null);
        setQualityBreakdown(data.qualityBreakdown ?? null);
        setEvidenceCoverage(data.evidenceCoverage ?? null);
        setScenarioCount(Array.isArray(data.scenarios) ? data.scenarios.length : 0);
        setLastSavedProposalId(data.proposalId ?? null);

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
async function promoteToPartnerGrade() {
  const sb = createSbClient();

  const { data: u } = await sb.auth.getUser();
  if (!u.user) return;

  const { data } = await sb
    .from("ai_settings")
    .select(`
      premium_provider,
      premium_model,
      premium_key_encrypted,
      bulk_provider,
      bulk_model,
      bulk_key_encrypted,
      economic_provider,
      economic_model,
      economic_key_encrypted,
      rubric_weights,
      cost_overrides,
      allow_free_fallback
    `)
    .eq("user_id", u.user.id)
    .maybeSingle();

  if (!data) return;

  // Build provider-neutral model pool
  const available: Array<{ provider: string; modelId: string }> = [];

  if (
    data.premium_key_encrypted &&
    data.premium_provider !== "free" &&
    data.premium_model
  ) {
    available.push({
      provider: data.premium_provider,
      modelId: data.premium_model,
    });
  }

  if (
    data.bulk_key_encrypted &&
    data.bulk_provider !== "free" &&
    data.bulk_model
  ) {
    available.push({
      provider: data.bulk_provider,
      modelId: data.bulk_model,
    });
  }

  if (
    data.economic_key_encrypted &&
    data.economic_provider !== "free" &&
    data.economic_model
  ) {
    available.push({
      provider: data.economic_provider,
      modelId: data.economic_model,
    });
  }

  if (data.allow_free_fallback) {
    available.push({
      provider: "free",
      modelId: "rules-v1",
    });
  }

  if (available.length === 0) {
    alert("No AI providers configured. Open Settings → AI to add a key.");
    return;
  }

  // Use saved rubric weights
  const weights =
    (data.rubric_weights as RubricWeights | null) ??
    DEFAULT_WEIGHTS_BY_MODULE.proposal;

  const overrides =
    (data.cost_overrides as Record<string, Partial<ModelCost>> | null) ??
    undefined;

  const top = topModel(
    available,
    "proposal",
    weights,
    overrides
  );

  if (!top) return;

  const ok = confirm(
    `Re-run on top-rubric model:\n\n` +
    `${top.provider} / ${top.modelId}\n` +
    `Score: ${top.totalScore.toFixed(2)} (${top.why})\n` +
    `Est cost: ~$${(
      top.cost.input * 0.0045 +
      top.cost.output * 0.005
    ).toFixed(3)}\n\n` +
    `You can change rubric weights in Settings → AI → Rubric.`
  );

  if (!ok) return;

  await generate("premium", top.modelId);
}
  function copyToClipboard() {
    if (!content) return;
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const [exportingPptx, setExportingPptx] = useState(false);

  async function downloadPptx() {
    if (!content) return;
    setExportingPptx(true);
    try {
      // Dynamic import keeps pptxgenjs out of the initial page bundle (it's ~700KB)
      const { exportProposalToPptx } = await import("@/lib/proposal/pptx-exporter");
      await exportProposalToPptx(
        content,
        {
          buyer, target, sector, geography,
          dealSize, clientName,
        },
        researchBrief || undefined,
      );
    } catch (e) {
      alert(`PPTX export failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setExportingPptx(false);
    }
  }

  function printDoc() {
    if (!content) return;
    const label = PROPOSAL_OPTIONS.find((o) => o.value === proposalType)?.label ?? "M&A Advisory";
    openMbbPrintWindow({
      contentMarkdown: content,
      citationsMarkdown: researchBrief || undefined,
      meta: {
        moduleLabel: label,
        buyer,
        target,
        sector,
        geography,
        dealSize,
        clientName,
      },
    });
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

          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
            <p className="text-xs font-medium text-slate-700">Generation Mode</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button onClick={() => setGenerationMode("standard")} className={`rounded border px-2 py-1 text-xs ${generationMode==="standard" ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-200"}`}>Standard Mode</button>
              <button onClick={() => setGenerationMode("advanced")} className={`rounded border px-2 py-1 text-xs ${generationMode==="advanced" ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-200"}`}>Advanced Mode</button>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
            <div>
              <p className="text-xs font-medium text-slate-700">Premium Mode (Research Required)</p>
              <p className="text-[10px] text-slate-500">Forces research-backed generation path</p>
            </div>
            <button onClick={() => setPremiumMode(!premiumMode)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${premiumMode ? "bg-purple-600" : "bg-slate-300"}`}>
              <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${premiumMode ? "translate-x-4" : "translate-x-0.5"}`} />
            </button>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-[11px] text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
            <p className="font-medium text-slate-700 dark:text-slate-300">Model selection</p>
            <p className="mt-0.5">Click <span className="font-medium text-indigo-600 dark:text-indigo-400">Generate Document</span> to pick tier and model. Recommended model is starred per your rubric (edit in Settings).</p>
          </div>

         <button
            onClick={() => {
              // Modal always available now — premium/economic if keys, or offline rule-based as fallback.
              setConfirmOpen(true);
            }}
            disabled={generating || (!buyer && !target)}
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

              <div className="flex items-center gap-2 text-xs text-slate-600">
                {qualityScore !== null && <span className="rounded bg-emerald-50 px-2 py-1">Quality Score: {qualityScore}/100</span>}
                {qualityScore !== null && qualityScore < 80 && (
                  <button
                    onClick={promoteToPartnerGrade}
                    disabled={generating}
                    className="rounded bg-purple-600 px-3 py-1 text-[11px] font-semibold text-white hover:bg-purple-700 disabled:opacity-50"
                  >
                    {generating ? "Promoting…" : "Promote to top-rubric model"}
                  </button>
                )}
                {evidenceCoverage !== null && <span className="rounded bg-indigo-50 px-2 py-1">Evidence: {evidenceCoverage}%</span>}
                <span className="rounded bg-slate-100 px-2 py-1">Scenarios: {scenarioCount}</span>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setEditMode((v) => !v)}
                  className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium ${
                    editMode
                      ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                  title="Toggle per-section edit & regenerate"
                >
                  ✎ {editMode ? "Editing" : "Edit Sections"}
                </button>
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
                <button onClick={downloadPptx} disabled={exportingPptx}
                  className="flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
                  title="Download as branded PowerPoint deck">
                  {exportingPptx
                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Building...</>
                    : <><Download className="h-3.5 w-3.5" /> Download PPTX</>}
                </button>
                <button
                  onClick={() => setCritiqueOpen(true)}
                  disabled={!lastSavedProposalId}
                  title={lastSavedProposalId ? "Pressure-test through 5 hostile personas" : "Generate a proposal first"}
                  className="flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-40"
                >
                  <Target className="h-3.5 w-3.5" /> Critique This Pitch
                </button>
               <button onClick={() => { setContent(null); clearOutput("proposal"); }}
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

              {editMode ? (
                <EditableProposal
                  content={content}
                  citationsMd={researchBrief || undefined}
                  dealContext={{
                    deal_id: dealId,
                    buyer, target, sector, geography, deal_size: dealSize,
                  }}
                  onContentChange={(newContent) => {
                    setContent(newContent);
                    saveOutput("proposal", newContent);
                  }}
                />
              ) : (
                <article
                  className="max-w-none"
                  dangerouslySetInnerHTML={{ __html: renderVisualProposal(content) + (researchBrief ? renderCitations(researchBrief) : "") }}
                />
              )}

              <div className="mt-8 border-t border-slate-100 pt-4 text-[10px] text-slate-400">
                Generated by Deal IQ AI · {model} · {new Date().toLocaleString()} · Confidential.
              </div>
            </div>
          </div>
        )}
      </main>
   
    <AIGenerateConfirm
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={(tier, modelOverride) => {
          setConfirmOpen(false);
          if (tier === "offline") {
            // Rule-based deterministic proposal — no AI key needed.
            // Build a Facts-style prompt the offline engine can parse.
            const prompt = [
              `Buyer / Acquirer: ${buyer}`,
              `Target Company: ${target}`,
              `Sector: ${sector}`,
              `Geography: ${geography}`,
              `Deal Size: ${dealSize}`,
              `Client / Advisory House: ${clientName || "N/A"}`,
              `Stake: ${stakePercent || "N/A"}`,
              `Strategic Intent: ${dealTypeInput || ""}`,
              `Notes: ${notes || ""}`,
            ].join("\n");
            const md = generateOfflineProposal(prompt);
            setContent(md);
            saveOutput("proposal", md);
            setProvider("offline");
            setModel("rule-based");
            const label = PROPOSAL_OPTIONS.find((o) => o.value === proposalType)?.label ?? proposalType;
            setHistory((prev) => [{
              id: Date.now().toString(),
              label: `${label} — ${target || buyer || "Unnamed"} (offline)`,
              content: md,
              createdAt: new Date().toLocaleString(),
              provider: "offline",
              model: "rule-based",
            }, ...prev].slice(0, 20));
            return;
          }
          generate(tier, modelOverride);
        }}
        module="proposal"
        premiumProvider={{ tier: "premium", ...premiumTier }}
        economicProvider={{ tier: "economic", ...economicTier }}
        hasOfflineFallback={true}
        userWeights={userWeights ?? undefined}
      />
      {lastSavedProposalId && (
        <CritiquePanel
          proposalId={lastSavedProposalId}
          proposalLabel={`${PROPOSAL_OPTIONS.find((o) => o.value === proposalType)?.label ?? "Proposal"} — ${target || buyer || clientName || "Unnamed"}`}
          open={critiqueOpen}
          onClose={() => setCritiqueOpen(false)}
        />
      )}
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
