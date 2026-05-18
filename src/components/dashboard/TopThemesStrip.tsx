"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Compass, ChevronRight, ExternalLink } from "lucide-react";

type Theme = {
  id: string; slug: string; display_name: string; emoji: string;
  strategic_summary: string; deal_count: number;
  heat: "hot" | "warm" | "cool";
};

/**
 * Shows top 5 active themes ranked hot → warm → cool, then deal_count.
 * Designed for the Executive Dashboard.
 */
export default function TopThemesStrip() {
  const [themes, setThemes] = useState<Theme[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch("/api/themes")
      .then((r) => r.ok ? r.json() : { themes: [] })
      .then((j) => { if (alive) setThemes((j.themes ?? []).slice(0, 5)); })
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  if (loading || themes.length === 0) return null;

  return (
    <div className="mb-6 rounded-xl border-2 border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-white p-5 shadow-sm dark:border-indigo-900 dark:from-indigo-950/40 dark:via-slate-900 dark:to-slate-900">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Compass className="h-4 w-4 text-indigo-600" />
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">
            Top Themes This Week
          </h2>
          <span className="rounded bg-indigo-600 px-2 py-0.5 text-[10px] font-medium text-white">
            partner radar
          </span>
        </div>
        <Link href="/dashboard/themes" className="flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:underline dark:text-indigo-400">
          All themes <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      <p className="mb-3 text-[11px] text-slate-600 dark:text-slate-400">
        AI-clustered strategic themes from your live pipeline. Tap any theme for the strategic synthesis + pitch hypothesis.
      </p>

      <ol className="grid gap-2 md:grid-cols-2 lg:grid-cols-5">
        {themes.map((t, i) => {
          const heatColor =
              t.heat === "hot" ? "border-rose-200 hover:border-rose-300"
            : t.heat === "warm" ? "border-amber-200 hover:border-amber-300"
            :                       "border-slate-200 hover:border-slate-300";
          return (
            <li key={t.id}>
              <Link href={`/dashboard/themes/${t.id}`}
                    className={`block h-full rounded-lg border-2 bg-white p-3 shadow-sm transition-all hover:shadow-md dark:bg-slate-900 ${heatColor}`}>
                <div className="mb-1 flex items-start gap-2">
                  <span className="text-lg">{t.emoji}</span>
                  <ChevronRight className="ml-auto h-3 w-3 flex-shrink-0 text-slate-400" />
                </div>
                <h3 className="line-clamp-2 text-[12px] font-bold leading-tight text-slate-900 dark:text-white">{t.display_name}</h3>
                <p className="mt-1 line-clamp-2 text-[10.5px] italic leading-snug text-slate-600 dark:text-slate-400">{t.strategic_summary}</p>
                <div className="mt-2 flex items-center justify-between text-[10px]">
                  <span className="rounded bg-indigo-100 px-1.5 py-0.5 font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">{t.deal_count} deals</span>
                  <span className={`rounded px-1.5 py-0.5 font-bold uppercase ${
                    t.heat === "hot" ? "bg-rose-100 text-rose-700" : t.heat === "warm" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"
                  }`}>{t.heat}</span>
                </div>
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
