

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
          <div className="mt-4 flex flex-wrap gap-2">
          
            href={`/dashboard/proposals?buyer=${encodeURIComponent(deal.buyer ?? "")}&target=${encodeURIComponent(deal.target ?? "")}&sector=${encodeURIComponent(deal.sector ?? "")}&geography=${encodeURIComponent(deal.country ?? "")}&deal_size=${encodeURIComponent(deal.value_raw ?? "")}&deal_id=${deal.id}`}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            ߓ Generate Proposal (General)
          </a>
          
            href={`/dashboard/proposals?buyer=${encodeURIComponent(deal.buyer ?? "")}&target=${encodeURIComponent(deal.target ?? "")}&sector=${encodeURIComponent(deal.sector ?? "")}&geography=${encodeURIComponent(deal.country ?? "")}&deal_size=${encodeURIComponent(deal.value_raw ?? "")}&deal_id=${deal.id}&research=1`}
            className="rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:from-indigo-700 hover:to-purple-700"
          >
            ߔ Generate with AI Research
          </a>
        </div>
          <ScoreBadge score={intel.advisoryScore.score} grade={intel.advisoryScore.grade} />
        </div>

        <div className="mt-6 grid gap-3 border-t border-slate-200 pt-5 sm:grid-cols-4">
          <Kpi label="Deal Value" value={deal.normalized_value_usd ? formatUsdShort(deal.normalized_value_usd) : (deal.value_raw ?? "—")} />
          <Kpi label="Stake" value={deal.stake_percent ? `${deal.stake_percent}%` : "—"} />
          <Kpi label="Sector" value={deal.sector ?? "—"} />
          <Kpi label="Geography" value={deal.country ?? "—"} />
        </div>
      </div>

      {/* Buyer / Target profiles */}
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <ProfileCard icon={Building2} tone="indigo" title="Buyer Overview" profile={intel.buyerProfile} />
        <ProfileCard icon={Target} tone="purple" title="Target Overview" profile={intel.targetProfile} />
      </div>

      {/* Strategic rationale */}
      <Section icon={Lightbulb} title="Strategic Rationale">
        <ul className="space-y-2">
          {intel.rationale.map((r, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
              <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-indigo-500" />
              <span>{r}</span>
            </li>
          ))}
        </ul>
      </Section>

      {/* Synergies */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Section icon={TrendingUp} title="Revenue Synergies" tone="emerald">
          <SynergyList items={intel.revenueSynergies} />
        </Section>
        <Section icon={Scissors} title="Cost Synergies" tone="amber">
          <SynergyList items={intel.costSynergies} />
        </Section>
      </div>

      {/* Integration complexity */}
      <Section icon={Network} title="Integration Complexity">
        <div className="flex items-center gap-4 border-b border-slate-100 pb-4">
          <div className="text-4xl font-bold text-slate-900">
            {intel.integrationComplexity.score}
            <span className="text-xl text-slate-400">/10</span>
          </div>
          <div>
            <div
              className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium ${
                intel.integrationComplexity.level === "Low"
                  ? "bg-emerald-50 text-emerald-700"
                  : intel.integrationComplexity.level === "Medium"
                  ? "bg-indigo-50 text-indigo-700"
                  : intel.integrationComplexity.level === "High"
                  ? "bg-amber-50 text-amber-700"
                  : "bg-red-50 text-red-700"
              }`}
            >
              {intel.integrationComplexity.level}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Based on size, geography, sector, and deal structure
            </div>
          </div>
        </div>
        <ul className="mt-4 space-y-2">
          {intel.integrationComplexity.drivers.map((d, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
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
      <Section icon={Trophy} title="Advisory Attractiveness Score">
        <div className="flex items-center gap-6 border-b border-slate-100 pb-4">
          <div>
            <div className={`text-5xl font-bold ${gradeColor[intel.advisoryScore.grade]}`}>
              {intel.advisoryScore.grade}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {intel.advisoryScore.score} / 100
            </div>
          </div>
          <div className="flex-1">
            <div className="mb-2 text-xs text-slate-500">
              Composite score across four weighted factors
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-purple-600"
                style={{ width: `${intel.advisoryScore.score}%` }}
              />
            </div>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          {intel.advisoryScore.factors.map((f, i) => (
            <div key={i} className="flex items-center gap-3 text-sm">
              <span className="w-40 text-slate-600">{f.label}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full bg-indigo-500"
                  style={{ width: `${(f.contribution / f.weight) * 100}%` }}
                />
              </div>
              <span className="w-24 text-right font-mono text-xs text-slate-500">
                {f.contribution.toFixed(1)} / {f.weight}
              </span>
            </div>
          ))}
        </div>
      </Section>
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
  icon: Icon,
  tone,
  title,
  profile,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: "indigo" | "purple";
  title: string;
  profile: { name: string; dealsInvolved: number; totalValueUsd: number; sectors: string[]; countries: string[]; avgDealSize: number };
}) {
  const tones = {
    indigo: "bg-indigo-50 text-indigo-600",
    purple: "bg-purple-50 text-purple-600",
  };
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${tones[tone]}`}>
          <Icon className="h-4 w-4" />
        </div>
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      </div>
      <div className="text-xl font-semibold text-slate-900">{profile.name}</div>
      <div className="mt-4 grid grid-cols-3 gap-3 border-t border-slate-100 pt-4">
        <Kpi label="Deals" value={profile.dealsInvolved.toLocaleString()} />
        <Kpi label="Total Value" value={formatUsdShort(profile.totalValueUsd)} />
        <Kpi
          label="Avg Size"
          value={profile.avgDealSize > 0 ? formatUsdShort(profile.avgDealSize) : "—"}
        />
      </div>
      {profile.sectors.length > 0 && (
        <div className="mt-4">
          <div className="text-xs text-slate-500">Active sectors</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {profile.sectors.map((s) => (
              <span key={s} className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                {s}
              </span>
            ))}
          </div>
        </div>
      )}
      {profile.countries.length > 0 && (
        <div className="mt-3">
          <div className="text-xs text-slate-500">Geographies</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {profile.countries.map((c) => (
              <span key={c} className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                {c}
              </span>
            ))}
          </div>
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
