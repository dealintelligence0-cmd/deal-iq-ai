

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  Target,
  Building2,
  Lightbulb,
  TrendingUp,
  Scissors,
  Network,
  ClipboardList,
  ShieldAlert,
  GitCompare,
  Trophy,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fetchDeals, formatUsdShort, type Deal } from "@/lib/analytics";
import { buildIntelligence, type Intelligence } from "@/lib/intelligence";
import AIResearchClient from "@/components/AIResearchClient";

const sevColor: Record<string, string> = {
  Low: "bg-slate-100 text-slate-700",
  Medium: "bg-amber-50 text-amber-700",
  High: "bg-red-50 text-red-700",
};

const impactColor: Record<string, string> = {
  Low: "bg-slate-100 text-slate-700",
  Medium: "bg-indigo-50 text-indigo-700",
  High: "bg-emerald-50 text-emerald-700",
};

const gradeColor: Record<string, string> = {
  "A+": "text-emerald-600",
  A: "text-emerald-600",
  B: "text-indigo-600",
  C: "text-amber-600",
  D: "text-red-600",
};

export default function DealDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const supabase = createClient();
  const [deal, setDeal] = useState<Deal | null>(null);
  const [intel, setIntel] = useState<Intelligence | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: one } = await supabase
        .from("deals")
        .select(
          "id,deal_date,buyer,target,sector,country,deal_type,status,normalized_value_usd,stake_percent,value_raw,created_at"
        )
        .eq("id", id)
        .single();
      if (one) {
        const all = await fetchDeals();
        setDeal(one as Deal);
        setIntel(buildIntelligence(one as Deal, all));
      }
      setLoading(false);
    })();
  }, [id, supabase]);

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!deal || !intel) {
    return (
      <div className="py-20 text-center">
        <p className="text-slate-500">Deal not found.</p>
        <Link
          href="/dashboard/deals"
          className="mt-4 inline-flex items-center gap-1 text-sm text-indigo-600"
        >
          <ArrowLeft className="h-4 w-4" /> Back to pipeline
        </Link>
      </div>
    );
  }

  return (
    <div>
      {/* Back link */}
      <Link
        href="/dashboard/deals"
        className="mb-4 inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft className="h-3 w-3" /> Pipeline
      </Link>

      {/* Header */}
      <div className="mb-6 rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-indigo-50/30 to-purple-50/30 p-6 shadow-sm">
        <div className="flex items-start justify-between gap-6">
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-md bg-slate-900 px-2 py-0.5 font-medium text-white">
                {deal.status ?? "—"}
              </span>
              {deal.sector && (
                <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-indigo-700">
                  {deal.sector}
                </span>
              )}
              {deal.country && (
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-slate-700">
                  {deal.country}
                </span>
              )}
              {deal.deal_date && (
                <span className="text-slate-500">· {deal.deal_date}</span>
              )}
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">
              {deal.buyer} <span className="text-slate-400">→</span> {deal.target}
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-700">
              {intel.headline}
            </p>
          </div>
          {(() => {
          const params = new URLSearchParams({
            buyer: deal.buyer ?? "",
            target: deal.target ?? "",
            sector: deal.sector ?? "",
            geography: deal.country ?? "",
            deal_size: deal.value_raw ?? "",
            deal_id: deal.id,
          }).toString();
          const generalUrl = "/dashboard/proposals?" + params;
          const researchUrl = generalUrl + "&research=1";
          return (
            <div className="mt-4 flex flex-wrap gap-2">
              <a href={generalUrl} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Generate Proposal (General)</a>
              <a href={researchUrl} className="rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:from-indigo-700 hover:to-purple-700">Generate with AI Research</a>
            </div>
          );
        })()}
          {/* Score moved into bottom DealTakeawayBanner */}
        </div>

        <div className="mt-6 grid gap-3 border-t border-slate-200 pt-5 sm:grid-cols-4">
          <Kpi label="Deal Value" value={deal.normalized_value_usd ? formatUsdShort(deal.normalized_value_usd) : (deal.value_raw ?? "—")} />
          <Kpi label="Stake" value={deal.stake_percent ? `${deal.stake_percent}%` : "—"} />
          <Kpi label="Sector" value={deal.sector ?? "—"} />
          <Kpi label="Geography" value={deal.country ?? "—"} />
        </div>
      </div>

     {/* DEAL TAKEAWAY — top decision banner */}
      <DealTakeawayBanner deal={deal} />

      {/* Buyer / Target profiles */}
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <ProfileCard icon={Building2} tone="indigo" title="Buyer Context" profile={intel.buyerProfile} role="buyer" deal={deal} />
        <ProfileCard icon={Target} tone="purple" title="Target Context" profile={intel.targetProfile} role="target" deal={deal} />
      </div>

      {/* PARTNER DECISION BLOCK — Investment Thesis · Why Now · Deal Tension · Advisory Angle */}
      <PartnerDecisionBlock deal={deal} />

{/* AI-Researched Deal Context — replaces generic Strategic Rationale + generic Synergies + numeric Integration Complexity */}
     <AIResearchClient
        dealId={deal.id}
        buyer={deal.buyer}
        target={deal.target}
        sector={deal.sector}
        country={deal.country}
        dealType={deal.deal_type}
        stakePercent={deal.stake_percent}
        cached={(deal as { ai_enrichment?: Record<string, unknown> }).ai_enrichment ?? null}
      />

      {/* Integration Complexity (label only — no /10 score) */}
      <Section icon={Network} title="Integration Complexity">
        <div className="flex items-start gap-4">
          <span
            className={`rounded-md px-3 py-1 text-sm font-bold ${
              intel.integrationComplexity.level === "Low" ? "bg-emerald-100 text-emerald-800"
              : intel.integrationComplexity.level === "Medium" ? "bg-indigo-100 text-indigo-800"
              : intel.integrationComplexity.level === "High" ? "bg-amber-100 text-amber-800"
              : "bg-red-100 text-red-800"
            }`}
          >
            {intel.integrationComplexity.level}
          </span>
          <p className="text-xs text-slate-500 dark:text-slate-400">Based on size, geography, sector, and deal structure</p>
        </div>
        <ul className="mt-3 space-y-1.5">
          {intel.integrationComplexity.drivers.map((d, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
              <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-slate-400" />
              {d}
            </li>
          ))}
        </ul>
      </Section>

      {/* TSA */}
      <Section icon={ClipboardList} title="Likely TSA Needs">
        <div className="grid gap-2 sm:grid-cols-2">
          {intel.tsaNeeds.map((t, i) => (
            <div
              key={i}
              className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700"
            >
              <span className="mt-0.5 text-xs font-semibold text-indigo-600">
                {String(i + 1).padStart(2, "0")}
              </span>
              {t}
            </div>
          ))}
        </div>
      </Section>

      {/* Regulatory risks */}
      <Section icon={ShieldAlert} title="Regulatory Risks">
        <ul className="space-y-3">
          {intel.regulatoryRisks.map((r, i) => (
            <li key={i} className="flex items-start gap-3 rounded-lg border border-slate-200 p-3">
              <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${sevColor[r.severity]}`}>
                {r.severity}
              </span>
              <span className="text-sm text-slate-700">{r.risk}</span>
            </li>
          ))}
        </ul>
      </Section>

     {/* Comparables */}
      <Section icon={GitCompare} title="Comparable Deals">
        <ComparablePatternInsight comparables={intel.comparables} deal={deal} />
        {intel.comparables.length === 0 ? (
          <p className="text-sm text-slate-500">
            No comparable transactions in your dataset yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Buyer / Target</th>
                  <th className="px-3 py-2">Country</th>
                  <th className="px-3 py-2 text-right">Value</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {intel.comparables.map((c) => (
                  <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2 text-slate-600">{c.deal_date ?? "—"}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-900">{c.buyer}</div>
                      <div className="text-xs text-slate-500">{c.target}</div>
                    </td>
                    <td className="px-3 py-2 text-slate-600">{c.country ?? "—"}</td>
                    <td className="px-3 py-2 text-right font-mono text-slate-800">
                      {c.normalized_value_usd ? formatUsdShort(c.normalized_value_usd) : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/dashboard/deals/${c.id}`}
                        className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
                      >
                        View →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Advisory score breakdown */}
          </div>
  );
}

// ---------- Subcomponents ----------

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-0.5 text-base font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function ScoreBadge({ score, grade }: { score: number; grade: string }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-slate-200 bg-white p-4">
      <div className={`text-3xl font-bold ${gradeColor[grade]}`}>{grade}</div>
      <div className="text-xs text-slate-500">Advisory</div>
      <div className="mt-0.5 text-xs font-mono text-slate-400">{score}/100</div>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  tone = "indigo",
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  tone?: "indigo" | "emerald" | "amber";
  children: React.ReactNode;
}) {
  const tones = {
    indigo: "text-indigo-600 bg-indigo-50",
    emerald: "text-emerald-600 bg-emerald-50",
    amber: "text-amber-600 bg-amber-50",
  };
  return (
    <div className="mb-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${tones[tone]}`}>
          <Icon className="h-4 w-4" />
        </div>
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function ProfileCard({
  icon: Icon, tone, title, profile, role, deal,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: "indigo" | "purple";
  title: string;
  profile: { name: string; dealsInvolved: number; totalValueUsd: number; sectors: string[]; countries: string[]; avgDealSize: number };
  role: "buyer" | "target";
  deal: { sector: string | null; country: string | null; deal_type: string | null; stake_percent: number | null; normalized_value_usd: number | null; insight_sections?: { thesis?: string; why_now?: string; value_drivers?: string[]; risks?: string[]; advisory_angle?: string } | null };
}) {
  const tones = {
    indigo: "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/30 dark:text-indigo-400",
    purple: "bg-purple-50 text-purple-600 dark:bg-purple-950/30 dark:text-purple-400",
  };

  const usdM = (deal.normalized_value_usd ?? 0) / 1_000_000;
  const sizeLabel = usdM >= 1000 ? "large" : usdM >= 250 ? "mid-market" : "small-cap";
  const crossBorder = (deal.country ?? "").includes(",");
  const isHotSector = /tech|saas|software|fintech|life|pharma|healthcare|biotech|renewable|infrastructure|data center|ev|semiconductor|defence/i.test(deal.sector ?? "");
  const isRegulated = /pharma|life|healthcare|financial|banking|bfsi|insurance|energy|defence|telecom|utilities/i.test(deal.sector ?? "");
  const isComplexDeal = /merger|jv|carve|spin|ipo/i.test(deal.deal_type ?? "");
  const stake = deal.stake_percent;
  const ins = deal.insight_sections ?? {};

  // BUYER bullets
  const buyerBullets: string[] = [];
  if (role === "buyer") {
    // 1) Strategic Intent
    if (isHotSector) buyerBullets.push(`Strategic intent: positioning in ${deal.sector} during sector consolidation window`);
    else if (crossBorder) buyerBullets.push(`Strategic intent: ${deal.country?.split(",")[0]} → ${deal.country?.split(",").slice(1).join(",")} expansion via M&A vs greenfield`);
    else buyerBullets.push(`Strategic intent: ${deal.sector ?? "sector"} consolidation; bolt-on to existing platform`);

    // 2) Recent deal pattern (using profile.dealsInvolved)
    if (profile.dealsInvolved >= 5) buyerBullets.push(`Active acquirer: ${profile.dealsInvolved} prior deals tracked, suggests serial M&A playbook`);
    else if (profile.dealsInvolved >= 2) buyerBullets.push(`Selective acquirer: ${profile.dealsInvolved} prior deals — measured M&A approach`);
    else buyerBullets.push(`First-time / opportunistic acquirer in this dataset — likely engaging external advisors`);

    // 3) Capability gap
    if (deal.deal_type && /carve|spin/i.test(deal.deal_type)) buyerBullets.push(`Capability gap: targeted asset purchase signals specific portfolio need vs broad consolidation`);
    else buyerBullets.push(`Fills capability gap in ${deal.sector ?? "sector"}; ${stake && stake >= 90 ? "full-control acquisition" : stake && stake >= 50 ? "majority stake" : "minority partnership"}`);

    // 4) Operating model
    if (stake != null && stake >= 90) buyerBullets.push(`Full-absorption likely: 100% control suggests integration-heavy operating model`);
    else if (stake != null && stake >= 50) buyerBullets.push(`Controlled-autonomy likely: majority + retained minority partner suggests phased integration`);
    else buyerBullets.push(`Light-touch likely: minority position, governance-only intervention model`);

    // 5) Advisory signal
    if (isComplexDeal || crossBorder || isRegulated) buyerBullets.push(`HIGH advisory signal: ${isComplexDeal ? deal.deal_type : ""}${isComplexDeal && crossBorder ? " + " : ""}${crossBorder ? "cross-border" : ""}${(isComplexDeal || crossBorder) && isRegulated ? " + " : ""}${isRegulated ? "regulated sector" : ""} requires external counsel + advisors`);
    else buyerBullets.push(`MEDIUM advisory signal: ${sizeLabel} deal, standard execution; advisor for DD + valuation`);
  }

  // TARGET bullets
  const targetBullets: string[] = [];
  if (role === "target") {
    // 1) Core strength (use thesis if available)
    if (ins.thesis) targetBullets.push(`Core asset: ${ins.thesis.slice(0, 130)}${ins.thesis.length > 130 ? "…" : ""}`);
    else targetBullets.push(`Core asset: ${profile.name} — ${deal.sector ?? "sector"} player in ${deal.country ?? "geography"}`);

    // 2) Strategic asset value
    if (isHotSector) targetBullets.push(`Strategic value: scarce asset in active ${deal.sector} category — multiple bidders likely`);
    else if (isRegulated) targetBullets.push(`Strategic value: licensed/regulated entity, high barriers to organic build`);
    else targetBullets.push(`Strategic value: established ${deal.sector ?? "sector"} position with operating history`);

    // 3) Fit with buyer
    if (deal.deal_type && /merger/i.test(deal.deal_type)) targetBullets.push(`Fit: largely overlapping — merger of equals dynamics, branding decisions critical`);
    else if (crossBorder) targetBullets.push(`Fit: complementary geographic footprint, limited operational overlap`);
    else targetBullets.push(`Fit: complementary capability/customer base; integration overlay required`);

    // 4) Scalability
    if (usdM >= 1000) targetBullets.push(`Scalability: large platform — buyer can scale via cross-sell + adjacent M&A around target`);
    else if (usdM >= 250) targetBullets.push(`Scalability: mid-market — capacity expansion + GTM acceleration as primary levers`);
    else targetBullets.push(`Scalability: tactical asset — capability acquisition over scale play`);

    // 5) Risk flags
    const riskFlag = ins.risks && ins.risks.length > 0 ? ins.risks[0] : (
      isRegulated ? "Regulatory transition + license carryover" :
      crossBorder ? "Cross-border cultural + operating model alignment" :
      "Talent retention + customer continuity through transition"
    );
    targetBullets.push(`Risk flag: ${riskFlag}`);
  }

  const bullets = role === "buyer" ? buyerBullets : targetBullets;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#15151f]">
      <div className="mb-4 flex items-center gap-2">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${tones[tone]}`}>
          <Icon className="h-4 w-4" />
        </div>
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h2>
      </div>
      <div className="text-xl font-semibold text-slate-900 dark:text-white">{profile.name}</div>

      {/* Deal-relevant intelligence bullets */}
      <ul className="mt-4 space-y-2 border-t border-slate-100 pt-4 dark:border-white/5">
        {bullets.map((b, i) => (
          <li key={i} className="flex items-start gap-2 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
            <span className={`mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full ${tone === "indigo" ? "bg-indigo-500" : "bg-purple-500"}`} />
            <span>{b}</span>
          </li>
        ))}
      </ul>

      {/* Quick stats footer */}
      <div className="mt-4 grid grid-cols-3 gap-3 border-t border-slate-100 pt-3 dark:border-white/5">
        <Kpi label="Deals" value={profile.dealsInvolved.toLocaleString()} />
        <Kpi label="Total Value" value={formatUsdShort(profile.totalValueUsd)} />
        <Kpi label="Avg Size" value={profile.avgDealSize > 0 ? formatUsdShort(profile.avgDealSize) : "—"} />
      </div>

      {profile.sectors.length > 0 && (
        <div className="mt-3 text-[10px]">
          <span className="text-slate-500">Sectors: </span>
          <span className="text-slate-700 dark:text-slate-300">{profile.sectors.slice(0, 4).join(" · ")}</span>
        </div>
      )}
      {profile.countries.length > 0 && (
        <div className="text-[10px]">
          <span className="text-slate-500">Geos: </span>
          <span className="text-slate-700 dark:text-slate-300">{profile.countries.slice(0, 4).join(" · ")}</span>
        </div>
      )}
    </div>
  );
}
function SynergyList({ items }: { items: { area: string; description: string; impact: "Low" | "Medium" | "High" }[] }) {
  return (
    <div className="space-y-3">
      {items.map((s, i) => (
        <div key={i} className="flex items-start gap-3 rounded-lg border border-slate-200 p-3">
          <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${impactColor[s.impact]}`}>
            {s.impact}
          </span>
          <div>
            <div className="text-sm font-medium text-slate-900">{s.area}</div>
            <div className="text-xs text-slate-600">{s.description}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
function DealTakeawayBanner({ deal }: { deal: Record<string, unknown> }) {
  const takeaway = deal.deal_takeaway as string | null;
  const targeting = deal.targeting_recommendation as string | null;
  const targetingReason = deal.targeting_reason as string | null;
  const confidence = deal.confidence_level as string | null;
  const advScore = deal.advisory_score as number | null;
  const prioScore = deal.priority_score as number | null;
  const riskScore = deal.risk_score as number | null;

  if (!takeaway && !targeting) {
    return (
      <div className="mb-6 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
        <p className="text-sm font-medium text-amber-800 dark:text-amber-300">⚠ Run &quot;Derive Fields&quot; on Pipeline page to generate intelligence for this deal.</p>
      </div>
    );
  }

  const targetingColor = targeting === "HIGH" ? "from-emerald-600 to-emerald-700"
    : targeting === "MEDIUM" ? "from-amber-500 to-amber-600"
    : "from-slate-500 to-slate-600";

  const advAttractiveness = (advScore ?? 0) >= 70 ? "HIGH" : (advScore ?? 0) >= 40 ? "MEDIUM" : "LOW";
  const advColor = advAttractiveness === "HIGH" ? "bg-emerald-100 text-emerald-800"
    : advAttractiveness === "MEDIUM" ? "bg-amber-100 text-amber-800"
    : "bg-slate-100 text-slate-700";

  return (
    <div className="mb-6 overflow-hidden rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-purple-50 shadow-sm dark:border-indigo-900/30 dark:from-indigo-950/20 dark:via-[#15151f] dark:to-purple-950/20">
      <div className={`bg-gradient-to-r ${targetingColor} px-5 py-3 text-white`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-bold uppercase tracking-widest opacity-80">Decision</span>
            <span className="text-2xl font-bold">{targeting ?? "—"}</span>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="rounded-full bg-white/20 px-2.5 py-1 font-semibold">Priority {prioScore ?? "—"}</span>
            <span className="rounded-full bg-white/20 px-2.5 py-1 font-semibold">Advisory {advScore ?? "—"}</span>
            <span className="rounded-full bg-white/20 px-2.5 py-1 font-semibold">Risk {riskScore ?? "—"}</span>
          </div>
        </div>
      </div>
      <div className="px-5 py-4">
        <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-400">Deal Takeaway</p>
        <p className="mt-1 text-sm leading-relaxed text-slate-800 dark:text-slate-200">{takeaway ?? "—"}</p>
        {targetingReason && (
          <>
            <p className="mt-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">Targeting Justification</p>
            <p className="mt-1 text-xs text-slate-700 dark:text-slate-300">{targetingReason}</p>
          </>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-indigo-100 pt-3 dark:border-indigo-900/20">
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${advColor}`}>
            Advisory Attractiveness: {advAttractiveness}
          </span>
          {confidence && (
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-medium text-slate-700 dark:bg-white/10 dark:text-slate-300">
              Confidence: {confidence}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function PartnerDecisionBlock({ deal }: { deal: Record<string, unknown> }) {
  type Insight = {
    thesis?: string; why_now?: string; value_drivers?: string[];
    risks?: string[]; tensions?: string; advisory_angle?: string;
  };
  const ins = (deal.insight_sections as Insight | null) ?? {};
  const priorityReason = deal.priority_reason as string | null;
  const advisoryReason = deal.advisory_reason as string | null;
  const riskReason = deal.risk_reason as string | null;

  if (!ins.thesis && !ins.why_now) return null;

  return (
    <div className="mb-6">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
        <span className="inline-block h-1 w-6 rounded-full bg-indigo-500" />
        Partner Decision Brief
      </h2>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Investment Thesis */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#15151f]">
          <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">Investment Thesis</p>
          <p className="mt-2 text-sm text-slate-800 dark:text-slate-200">{ins.thesis ?? "—"}</p>
        </div>

        {/* Why Now */}
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-sm dark:border-emerald-900/30 dark:bg-emerald-950/10">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Why Now</p>
          <p className="mt-2 text-sm text-slate-800 dark:text-slate-200">{ins.why_now ?? "—"}</p>
        </div>

        {/* Deal Tension */}
        <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-4 shadow-sm dark:border-rose-900/30 dark:bg-rose-950/10">
          <p className="text-[10px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400">Deal Tension</p>
          <p className="mt-2 text-sm text-slate-800 dark:text-slate-200">{ins.tensions ?? "—"}</p>
        </div>

        {/* Value Drivers */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#15151f]">
          <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">Value Drivers</p>
          <ul className="mt-2 space-y-1.5">
            {(ins.value_drivers ?? []).map((d, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300">
                <span className="mt-1 h-1 w-1 flex-shrink-0 rounded-full bg-indigo-500" />
                <span>{d}</span>
              </li>
            ))}
            {(!ins.value_drivers || ins.value_drivers.length === 0) && <li className="text-xs text-slate-400">—</li>}
          </ul>
        </div>

        {/* Key Risks */}
        <div className="rounded-xl border border-amber-200 bg-amber-50/30 p-4 shadow-sm dark:border-amber-900/30 dark:bg-amber-950/10">
          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">Key Risks</p>
          <ul className="mt-2 space-y-1.5">
            {(ins.risks ?? []).map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300">
                <span className="mt-1 h-1 w-1 flex-shrink-0 rounded-full bg-amber-500" />
                <span>{r}</span>
              </li>
            ))}
            {(!ins.risks || ins.risks.length === 0) && <li className="text-xs text-slate-400">—</li>}
          </ul>
        </div>

        {/* Advisory Angle */}
        <div className="rounded-xl border border-purple-200 bg-purple-50/50 p-4 shadow-sm dark:border-purple-900/30 dark:bg-purple-950/10">
          <p className="text-[10px] font-bold uppercase tracking-wider text-purple-700 dark:text-purple-400">Advisory Angle</p>
          <p className="mt-2 text-sm text-slate-800 dark:text-slate-200">{ins.advisory_angle ?? "—"}</p>
        </div>
      </div>

      {/* Score Drivers */}
      {(priorityReason || advisoryReason || riskReason) && (
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {priorityReason && (
            <div className="rounded-lg border-l-4 border-l-indigo-500 bg-slate-50 p-3 dark:bg-white/5">
              <p className="text-[9px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-400">Priority Drivers</p>
              <p className="mt-1 text-[11px] font-mono text-slate-700 dark:text-slate-300">{priorityReason}</p>
            </div>
          )}
          {advisoryReason && (
            <div className="rounded-lg border-l-4 border-l-purple-500 bg-slate-50 p-3 dark:bg-white/5">
              <p className="text-[9px] font-bold uppercase tracking-wider text-purple-700 dark:text-purple-400">Advisory Drivers</p>
              <p className="mt-1 text-[11px] font-mono text-slate-700 dark:text-slate-300">{advisoryReason}</p>
            </div>
          )}
          {riskReason && (
            <div className="rounded-lg border-l-4 border-l-amber-500 bg-slate-50 p-3 dark:bg-white/5">
              <p className="text-[9px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">Risk Drivers</p>
              <p className="mt-1 text-[11px] font-mono text-slate-700 dark:text-slate-300">{riskReason}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}




function ComparablePatternInsight({ comparables, deal }: {
  comparables: Array<{ id: string; deal_date: string | null; buyer: string; target: string; country: string | null; normalized_value_usd: number | null }>;
  deal: { sector: string | null; country: string | null; deal_type: string | null; normalized_value_usd: number | null };
}) {
  if (!comparables || comparables.length === 0) return null;

  const totalValue = comparables.reduce((sum, c) => sum + (c.normalized_value_usd ?? 0), 0);
  const avg = totalValue / comparables.length / 1_000_000;
  const dealUsdM = (deal.normalized_value_usd ?? 0) / 1_000_000;
  const sameCountry = comparables.filter((c) => c.country === deal.country).length;
  const allSameRegion = sameCountry / comparables.length >= 0.7;

  let pattern = "";
  if (avg > 0 && dealUsdM > 0) {
    const ratio = dealUsdM / avg;
    if (ratio > 1.5) pattern = `This deal sits ${ratio.toFixed(1)}× the comparable average — premium pricing signals strategic urgency or scarcity. Expect competitive bidder dynamics and aggressive synergy assumptions.`;
    else if (ratio < 0.5) pattern = `Deal value is ${(1/ratio).toFixed(1)}× below comparable average — likely reflects sub-scale target or distressed pricing. Verify EBITDA quality.`;
    else pattern = `Deal value tracks comparable averages closely (${ratio.toFixed(1)}×). Pricing logic appears benchmarked; differentiation must come from synergy execution.`;
  } else {
    pattern = `Comparable set ranges across multiple deal sizes; sector pattern more relevant than size benchmark.`;
  }

  if (allSameRegion) pattern += ` ${sameCountry}/${comparables.length} comparables in ${deal.country} — geographic concentration confirms regional consolidation thesis.`;

  return (
    <div className="mb-4 rounded-lg border-l-4 border-l-indigo-500 bg-indigo-50/50 p-3 dark:bg-indigo-950/20">
      <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-400">Insight from Comparables</p>
      <p className="mt-1 text-xs leading-relaxed text-slate-800 dark:text-slate-200">{pattern}</p>
    </div>
  );
}

