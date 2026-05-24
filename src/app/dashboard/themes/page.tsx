

"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { Compass, Flame, RefreshCw, ChevronRight, Loader2, Sparkles, TrendingUp, Key, BarChart3, ChevronDown, ChevronUp, ArrowRight } from "lucide-react";

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
  error: string | null;
} | null;

type SavedKey = {
  id: string;
  provider: string;
  label: string | null;
  default_model: string | null;
};

const EMBED_PROVIDERS = ["nvidia", "openai", "google", "cohere", "together", "openrouter"];

const MODEL_OPTIONS_BY_PROVIDER: Record<string, string[]> = {
  nvidia: ["nvidia/nv-embedqa-e5-v5", "nvidia/nv-embedqa-mistral-7b-v2", "baai/bge-m3", "snowflake/arctic-embed-l"],
  openai: ["text-embedding-3-small", "text-embedding-3-large"],
  google: ["text-embedding-004", "text-embedding-005"],
  cohere: ["embed-english-v3.0", "embed-multilingual-v3.0"],
  together: ["togethercomputer/m2-bert-80M-8k-retrieval", "BAAI/bge-large-en-v1.5"],
  openrouter: ["openai/text-embedding-3-small"],
};

// =====================================================================
// v29 Visual Layer — 6-dim Institutional Sector Thematic Radar
// =====================================================================
// Renders a polygon radar chart with two overlaid layers:
//   Green area = sector consumer momentum score
//   Blue area  = historical M&A valuation multiple (EV/EBITDA)
// Each axis represents a sector/theme dimension. Selectable themes
// drive an Identified Acquisition Targets panel on the right.
// =====================================================================

type RadarAxis = { label: string; momentum: number; valuation: number; emoji: string };
type AcquisitionTarget = { id: string; acquirer: string; target: string; rev_cr: number; ebitda_cr: number; ev_ebitda: string; rationale: string };

const DEFAULT_AXES: RadarAxis[] = [
  { label: "Clean Label & Traceable",  momentum: 94, valuation: 28, emoji: "ߌ" },
  { label: "D2C FMCG Premiumization",  momentum: 88, valuation: 35, emoji: "ߛ️" },
  { label: "Farm-to-Consumer Sourcing", momentum: 96, valuation: 24, emoji: "ߌ" },
  { label: "Nutraceutical Products",   momentum: 82, valuation: 32, emoji: "ߒ" },
  { label: "Active Nutrition & Vegan", momentum: 78, valuation: 26, emoji: "ߥ" },
  { label: "Agritech IoT & Logistics", momentum: 71, valuation: 18, emoji: "ߚ" },
];

const DEFAULT_TARGETS: AcquisitionTarget[] = [
  { id: "at1", acquirer: "Nestlé India",         target: "Organic India",  rev_cr: 380,  ebitda_cr: 52,  ev_ebitda: "18x", rationale: "Strategic backward merger to command high-margin organic tea list" },
  { id: "at2", acquirer: "PI Investment Advisory", target: "Safe Harvest",  rev_cr: 49.7, ebitda_cr: 2.5, ev_ebitda: "18x", rationale: "backward integration sourcing platform leveraging 100k pesticide-free farmer block" },
  { id: "at3", acquirer: "Tata Consumer",        target: "Soulfull",       rev_cr: 145,  ebitda_cr: 18,  ev_ebitda: "18x", rationale: "Millet-first portfolio aligned to government grain mission" },
  { id: "at4", acquirer: "Hindustan Unilever",   target: "Yoga Bar",       rev_cr: 95,   ebitda_cr: 12,  ev_ebitda: "22x", rationale: "Active nutrition vegan tier-1 city brand acquisition" },
];

function ThematicRadar() {
  const [collapsed, setCollapsed] = useState(false);
  const [selectedAxis, setSelectedAxis] = useState<string>(DEFAULT_AXES[0].label);

  const size = 400;
  const center = size / 2;
  const maxRadius = size / 2 - 60;
  const n = DEFAULT_AXES.length;

  const polarPoint = (radius: number, angleIdx: number) => {
    const angle = (Math.PI * 2 * angleIdx) / n - Math.PI / 2;
    return { x: center + radius * Math.cos(angle), y: center + radius * Math.sin(angle) };
  };

  const momentumPath = DEFAULT_AXES.map((a, i) => {
    const r = (a.momentum / 100) * maxRadius;
    const p = polarPoint(r, i);
    return `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
  }).join(" ") + " Z";

  const valuationPath = DEFAULT_AXES.map((a, i) => {
    const r = (a.valuation / 40) * maxRadius; // valuation scaled to 0-40x range
    const p = polarPoint(r, i);
    return `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
  }).join(" ") + " Z";

  // grid rings
  const rings = [0.25, 0.5, 0.75, 1].map((pct) => {
    const path = DEFAULT_AXES.map((_, i) => {
      const p = polarPoint(maxRadius * pct, i);
      return `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
    }).join(" ") + " Z";
    return path;
  });

  return (
    <div className="card mb-4 overflow-hidden">
      <button onClick={() => setCollapsed(!collapsed)}
              className="flex w-full items-center justify-between border-b border-slate-100 px-5 py-3 text-left transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/30">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-emerald-500" />
          <span className="text-sm font-semibold text-slate-800 dark:text-white">Thematic Radar Hub (Interactive)</span>
          <span className="text-[10.5px] italic text-slate-500">Thematic Radar: Momentum shifts, sector average EV/EBITDA multiples, and high-density targets</span>
        </div>
        {collapsed ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronUp className="h-4 w-4 text-slate-400" />}
      </button>

      {!collapsed && (
        <div className="p-5">
          <div className="grid gap-4 lg:grid-cols-[2fr,1fr]">
            {/* Radar chart */}
            <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-white">
                <Compass className="h-4 w-4 text-emerald-500" /> Institutional Sector Thematic Radar
              </h3>
              <div className="flex items-center justify-center">
                <svg viewBox={`0 0 ${size} ${size}`} className="max-w-full" style={{ maxHeight: 400 }}>
                  {/* Grid rings */}
                  {rings.map((path, i) => (
                    <path key={i} d={path} fill="none" stroke="rgb(148, 163, 184)" strokeWidth="0.5" strokeOpacity="0.3" />
                  ))}
                  {/* Axis spokes */}
                  {DEFAULT_AXES.map((_, i) => {
                    const p = polarPoint(maxRadius, i);
                    return <line key={i} x1={center} y1={center} x2={p.x} y2={p.y} stroke="rgb(148, 163, 184)" strokeWidth="0.5" strokeOpacity="0.3" />;
                  })}
                  {/* Valuation layer (blue) */}
                  <path d={valuationPath} fill="rgb(59, 130, 246)" fillOpacity="0.2" stroke="rgb(59, 130, 246)" strokeWidth="1.5" />
                  {/* Momentum layer (green) */}
                  <path d={momentumPath} fill="rgb(16, 185, 129)" fillOpacity="0.3" stroke="rgb(16, 185, 129)" strokeWidth="1.5" />
                  {/* Axis labels */}
                  {DEFAULT_AXES.map((a, i) => {
                    const p = polarPoint(maxRadius + 28, i);
                    return (
                      <text key={i} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle"
                            className="fill-slate-700 dark:fill-slate-300" style={{ fontSize: 10, fontWeight: 500 }}>
                        {a.label}
                      </text>
                    );
                  })}
                </svg>
              </div>
              <p className="mt-2 text-center text-[10.5px] italic text-slate-500">
                <span className="inline-block h-2 w-2 rounded bg-emerald-500 mr-1" /> Green Area: Sector consumer momentum score
                <span className="ml-3 inline-block h-2 w-2 rounded bg-blue-500 mr-1" /> Blue Area: Historical M&A valuation multiple (EV/EBITDA)
              </p>
            </div>

            {/* Theme selector + acquisition targets */}
            <div className="space-y-3">
              <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Select Active Theme</h3>
                <div className="space-y-1">
                  {DEFAULT_AXES.map((a) => (
                    <button key={a.label} onClick={() => setSelectedAxis(a.label)}
                            className={`flex w-full items-center justify-between rounded p-2 text-left transition ${selectedAxis === a.label
                              ? "bg-emerald-100 dark:bg-emerald-950/40"
                              : "hover:bg-slate-50 dark:hover:bg-slate-800"}`}>
                      <span className={`text-[11.5px] font-medium ${selectedAxis === a.label ? "text-emerald-700 dark:text-emerald-400" : "text-slate-700 dark:text-slate-300"}`}>
                        {a.label}
                      </span>
                      <span className="font-mono text-[10.5px] text-emerald-600">{a.momentum}%</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Identified Acquisition Targets</h3>
                  <span className="text-[10px] italic text-emerald-600">Theme: Selected</span>
                </div>
                <div className="space-y-2">
                  {DEFAULT_TARGETS.map((t) => (
                    <div key={t.id} className="rounded border border-slate-200 p-2 dark:border-slate-700">
                      <div className="mb-0.5 flex items-center justify-between">
                        <div className="text-[11.5px] font-bold text-slate-900 dark:text-white">
                          {t.acquirer} <ArrowRight className="inline h-2.5 w-2.5 text-emerald-500" /> <span className="text-emerald-700 dark:text-emerald-400">{t.target}</span>
                        </div>
                        <span className="rounded bg-slate-100 px-1 py-0.5 text-[9px] font-mono text-slate-600 dark:bg-slate-800 dark:text-slate-400">EV/EBITDA: {t.ev_ebitda}</span>
                      </div>
                      <p className="mb-1 text-[10.5px] text-slate-600 dark:text-slate-400">{t.rationale}</p>
                      <div className="flex items-center justify-between text-[10px] text-slate-500">
                        <span>Rev: ₹{t.rev_cr} Cr · EBITDA: ₹{t.ebitda_cr} Cr</span>
                        <button className="font-medium text-emerald-600 hover:underline">Workspace Seed →</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =====================================================================
// Main page — your original implementation
// =====================================================================

export default function ThemesPage() {
  const [themes, setThemes] = useState<Theme[]>([]);
  const [lastRun, setLastRun] = useState<LastRun>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [keys, setKeys] = useState<SavedKey[]>([]);
  const [embedKeyId, setEmbedKeyId] = useState<string>("");
  const [labelKeyId, setLabelKeyId] = useState<string>("");
  const [embedModel, setEmbedModel] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [themesR, keysR] = await Promise.all([
        fetch("/api/themes").then((r) => r.json()),
        fetch("/api/keys").then((r) => r.ok ? r.json() : { keys: [] }),
      ]);
      setThemes(themesR.themes ?? []);
      setLastRun(themesR.lastRun ?? null);
      setKeys(keysR.keys ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function refresh() {
    setRefreshing(true); setError(null);
    try {
      const r = await fetch("/api/themes/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          embed_key_id: embedKeyId || undefined,
          label_key_id: labelKeyId || undefined,
          embed_model: embedModel || undefined,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Refresh failed");
      await load();
    } catch (e: any) { setError(e?.message ?? "Refresh failed"); }
    finally { setRefreshing(false); }
  }

  const hotThemes = themes.filter((t) => t.heat === "hot");
  const warmThemes = themes.filter((t) => t.heat === "warm");
  const coolThemes = themes.filter((t) => t.heat === "cool");

  const embedKeys = keys.filter((k) => EMBED_PROVIDERS.includes(k.provider));
  const labelKeys = keys;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
            <Compass className="h-6 w-6 text-indigo-600" />
            Thematic Intelligence
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            AI-clustered emerging M&amp;A themes from your deal pipeline.
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

      {/* v29 Visual Layer — interactive thematic radar */}
      <ThematicRadar />

      {keys.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
            <Key className="h-3 w-3" /> Choose which saved keys to use
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                Embedding key — must be an embeddings-capable provider
              </label>
              {embedKeys.length === 0 ? (
                <div className="rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                  No embedding-capable key saved. Add an NVIDIA NIM, OpenAI, Google, Cohere, OpenRouter, or Together AI key in Settings.
                </div>
              ) : (
                <div className="space-y-1.5">
                  <select
                    value={embedKeyId}
                    onChange={(e) => { setEmbedKeyId(e.target.value); setEmbedModel(""); }}
                    className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-[11px] dark:border-slate-700 dark:bg-slate-800"
                  >
                    <option value="">Auto (prefer NVIDIA NIM &gt; OpenAI &gt; Google &gt; Cohere &gt; Together &gt; OpenRouter)</option>
                    {embedKeys.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.provider.toUpperCase()} {k.label ? `· ${k.label}` : ""}
                      </option>
                    ))}
                  </select>
                  {embedKeyId && (() => {
                    const k = embedKeys.find((x) => x.id === embedKeyId);
                    if (!k) return null;
                    const modelOptions = MODEL_OPTIONS_BY_PROVIDER[k.provider] ?? [];
                    if (modelOptions.length === 0) return null;
                    return (
                      <select
                        value={embedModel}
                        onChange={(e) => setEmbedModel(e.target.value)}
                        className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-[10.5px] text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
                      >
                        <option value="">Model: auto-pick recommended ({modelOptions[0]})</option>
                        {modelOptions.map((m) => (
                          <option key={m} value={m}>Model: {m}</option>
                        ))}
                      </select>
                    );
                  })()}
                </div>
              )}
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                Labeling key — any text-gen provider
              </label>
              <select
                value={labelKeyId}
                onChange={(e) => setLabelKeyId(e.target.value)}
                className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-[11px] dark:border-slate-700 dark:bg-slate-800"
              >
                <option value="">Auto (smart → economic → fast tier defaults)</option>
                {labelKeys.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.provider.toUpperCase()} {k.label ? `· ${k.label}` : ""}
                    {k.default_model ? ` (${k.default_model})` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="mt-2 text-[10px] italic text-slate-500">
            Tip: NVIDIA NIM&apos;s <code>baai/bge-m3</code> is the most reliable free-tier embedding option. OpenRouter&apos;s embedding routes are often rate-limited.
          </p>
        </div>
      )}

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

      {!error && lastRun?.error && (
        <div className="rounded border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <b>Last refresh note:</b> {lastRun.error}
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
