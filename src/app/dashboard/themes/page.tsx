"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Compass, Flame, RefreshCw, ChevronRight, Loader2, Sparkles, TrendingUp } from "lucide-react";

type Theme = {
  id: string;
  slug: string;
  display_name: string;
  emoji: string;
  strategic_summary: string;
  why_it_matters: string;
  drivers: string[];
  pitch_hypothesis: string;
  deal_count: number;
  active_buyers: string[];
  sectors: string[];
  geographies: string[];
  heat: "hot" | "warm" | "cool";
  last_refreshed_at: string;
};

type LastRun = {
  status: string; completed_at: string | null; started_at: string;
  clusters_created: number | null; embeddings_added: number | null;
} | null;

export default function ThemesPage() {
  const [themes, setThemes] = useState<Theme[]>([]);
  const [lastRun, setLastRun] = useState<LastRun>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/themes");
      const j = await r.json();
      setThemes(j.themes ?? []);
      setLastRun(j.lastRun ?? null);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function refresh() {
    setRefreshing(true); setError(null);
    try {
      const r = await fetch("/api/themes/refresh", { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Refresh failed");
      await load();
    } catch (e: any) { setError(e?.message ?? "Refresh failed"); }
    finally { setRefreshing(false); }
  }

  const hotThemes = themes.filter((t) => t.heat === "hot");
  const warmThemes = themes.filter((t) => t.heat === "warm");
  const coolThemes = themes.filter((t) => t.heat === "cool");

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
            <Compass className="h-6 w-6 text-indigo-600" />
            Thematic Intelligence
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            AI-clustered emerging M&A themes from your deal pipeline. Goldman Sachs–grade strategic synthesis.
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="flex items-center gap-2 rounded-lg border border-indigo-200 bg-white px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
        >
          {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {refreshing ? "Clustering deals…" : "Refresh themes"}
        </button>
      </div>

      {lastRun && (
        <div className="flex items-center gap-3 text-[11px] text-slate-500">
          <span>Last refresh: {lastRun.completed_at ? new Date(lastRun.completed_at).toLocaleString() : "in progress"}</span>
          {lastRun.embeddings_added != null && <span>· {lastRun.embeddings_added} new embeddings</span>}
          {lastRun.clusters_created != null && <span>· {lastRun.clusters_created} themes generated</span>}
        </div>
      )}

      {error && (
        <div className="rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-indigo-600" /></div>
      ) : themes.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-10 text-center dark:border-slate-700 dark:bg-slate-900/50">
          <Sparkles className="mx-auto mb-3 h-8 w-8 text-slate-400" />
          <h3 className="mb-1 text-base font-semibold text-slate-900 dark:text-white">No themes yet</h3>
          <p className="mb-4 text-sm text-slate-500">
            Click <b>Refresh themes</b> above to cluster your pipeline into emerging strategic themes.
            Requires at least 6 canonical deals and an OpenAI/Google/Cohere/OpenRouter key for embeddings.
          </p>
        </div>
      ) : (
        <>
          {hotThemes.length > 0 && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-rose-700 dark:text-rose-300">
                <Flame className="h-4 w-4" /> Hot themes — consolidation accelerating
              </h2>
              <div className="grid gap-3 md:grid-cols-2">
                {hotThemes.map((t) => <ThemeCard key={t.id} theme={t} />)}
              </div>
            </section>
          )}
          {warmThemes.length > 0 && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                <TrendingUp className="h-4 w-4" /> Warm themes — steady activity
              </h2>
              <div className="grid gap-3 md:grid-cols-2">
                {warmThemes.map((t) => <ThemeCard key={t.id} theme={t} />)}
              </div>
            </section>
          )}
          {coolThemes.length > 0 && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-500">
                Early / cool themes
              </h2>
              <div className="grid gap-3 md:grid-cols-2">
                {coolThemes.map((t) => <ThemeCard key={t.id} theme={t} />)}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function ThemeCard({ theme }: { theme: Theme }) {
  const heatStyle =
    theme.heat === "hot"  ? "border-rose-300 bg-gradient-to-br from-rose-50 to-white dark:border-rose-800 dark:from-rose-950/50 dark:to-slate-900"
  : theme.heat === "warm" ? "border-amber-300 bg-gradient-to-br from-amber-50 to-white dark:border-amber-800 dark:from-amber-950/40 dark:to-slate-900"
  :                          "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900";
  return (
    <Link href={`/dashboard/themes/${theme.id}`}
          className={`block rounded-xl border-2 p-4 shadow-sm transition-shadow hover:shadow-md ${heatStyle}`}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{theme.emoji}</span>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">{theme.display_name}</h3>
        </div>
        <ChevronRight className="h-4 w-4 flex-shrink-0 text-slate-400" />
      </div>
      <p className="mb-2 line-clamp-2 text-[12px] italic text-slate-700 dark:text-slate-300">{theme.strategic_summary}</p>
      <div className="mb-2 flex flex-wrap gap-1.5 text-[10px]">
        <span className="rounded bg-indigo-100 px-1.5 py-0.5 font-medium text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">{theme.deal_count} deals</span>
        {theme.sectors.slice(0, 2).map((s) => (
          <span key={s} className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700 dark:bg-slate-800 dark:text-slate-300">{s}</span>
        ))}
        {theme.geographies.slice(0, 2).map((g) => (
          <span key={g} className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">{g}</span>
        ))}
      </div>
      {theme.pitch_hypothesis && (
        <p className="border-t border-slate-200 pt-2 text-[11px] text-slate-600 dark:border-slate-700 dark:text-slate-400">
          <b className="text-indigo-700 dark:text-indigo-300">Pitch:</b> {theme.pitch_hypothesis.slice(0, 200)}
        </p>
      )}
    </Link>
  );
}
