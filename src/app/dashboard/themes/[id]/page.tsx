"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, ExternalLink, Building2, Globe, Users, TrendingUp, Target, Lightbulb } from "lucide-react";

type Theme = {
  id: string; slug: string; display_name: string; emoji: string;
  strategic_summary: string; why_it_matters: string;
  drivers: string[]; likely_next_targets: string[];
  pitch_hypothesis: string; consulting_angle: string;
  deal_count: number;
  active_buyers: string[]; sectors: string[]; geographies: string[];
  heat: "hot" | "warm" | "cool";
  last_refreshed_at: string;
};

type Member = {
  id: string; heading: string; buyer: string | null; target: string | null;
  dominant_sector: string | null; dominant_geography: string | null;
  deal_type: string | null; deal_status: string | null; deal_date: string | null;
  similarity: number;
};

export default function ThemeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [theme, setTheme] = useState<Theme | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/themes/${id}`);
        const j = await r.json();
        setTheme(j.theme);
        setMembers(j.members ?? []);
      } finally { setLoading(false); }
    })();
  }, [id]);

  if (loading) return <div className="flex items-center justify-center p-20"><Loader2 className="h-6 w-6 animate-spin text-indigo-600" /></div>;
  if (!theme) return <div className="p-6 text-sm text-slate-500">Theme not found.</div>;

  return (
    <div className="space-y-6 p-6">
      <Link href="/dashboard/themes" className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:underline">
        <ArrowLeft className="h-3 w-3" /> All themes
      </Link>

      <div className="rounded-xl border-2 border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-6 shadow-sm dark:border-indigo-900 dark:from-indigo-950/40 dark:to-slate-900">
        <div className="flex items-start gap-4">
          <div className="text-5xl">{theme.emoji}</div>
          <div className="flex-1">
            <div className="mb-1 flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{theme.display_name}</h1>
              <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                theme.heat === "hot" ? "bg-rose-100 text-rose-700" : theme.heat === "warm" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-700"
              }`}>{theme.heat}</span>
              <span className="rounded bg-indigo-100 px-2 py-0.5 text-[10px] font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                {theme.deal_count} deals
              </span>
            </div>
            <p className="text-sm italic text-slate-700 dark:text-slate-300">{theme.strategic_summary}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <h2 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
            <TrendingUp className="h-3.5 w-3.5" /> Why it matters
          </h2>
          <p className="text-[13px] text-slate-700 dark:text-slate-300">{theme.why_it_matters}</p>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <h2 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
            <Lightbulb className="h-3.5 w-3.5" /> Drivers
          </h2>
          <ul className="space-y-1 text-[13px] text-slate-700 dark:text-slate-300">
            {theme.drivers.map((d, i) => <li key={i}>• {d}</li>)}
          </ul>
        </section>

        <section className="rounded-lg border-2 border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-900 dark:bg-indigo-950/30">
          <h2 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
            <Target className="h-3.5 w-3.5" /> Pitch hypothesis
          </h2>
          <p className="text-[13px] text-indigo-900 dark:text-indigo-200">{theme.pitch_hypothesis}</p>
          <p className="mt-3 border-t border-indigo-200 pt-2 text-[12px] italic text-indigo-800 dark:border-indigo-800 dark:text-indigo-300">
            <b>Consulting angle:</b> {theme.consulting_angle}
          </p>
        </section>

        <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
          <h2 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
            <Building2 className="h-3.5 w-3.5" /> Likely next targets
          </h2>
          <ul className="space-y-1 text-[13px] text-emerald-900 dark:text-emerald-200">
            {theme.likely_next_targets.map((t, i) => <li key={i}>• {t}</li>)}
          </ul>
        </section>
      </div>

      <section>
        <h2 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
          <Users className="h-3.5 w-3.5" /> Active buyers
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {theme.active_buyers.map((b) => (
            <span key={b} className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">{b}</span>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">Member deals ({members.length})</h2>
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          <table className="w-full text-[12px]">
            <thead className="bg-slate-50 dark:bg-slate-800">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium text-slate-600 dark:text-slate-400">Buyer → Target</th>
                <th className="px-3 py-2 font-medium text-slate-600 dark:text-slate-400">Sector</th>
                <th className="px-3 py-2 font-medium text-slate-600 dark:text-slate-400">Geography</th>
                <th className="px-3 py-2 font-medium text-slate-600 dark:text-slate-400">Type</th>
                <th className="px-3 py-2 text-right font-medium text-slate-600 dark:text-slate-400">Fit</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-3 py-2 max-w-[280px] truncate" title={m.heading}>
                    <Link href={`/dashboard/deals/${m.id}`} className="text-indigo-600 hover:underline">
                      {m.buyer ?? "—"} → {m.target ?? "—"}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{m.dominant_sector ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{m.dominant_geography ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{m.deal_type ?? "—"}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-500">{Math.round((m.similarity ?? 0) * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
