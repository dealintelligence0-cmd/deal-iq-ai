



"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { Compass, Flame, RefreshCw, ChevronRight, Loader2, Sparkles, TrendingUp, Key, BarChart3, ChevronDown, ChevronUp, ArrowRight, Building2, Activity, Info } from "lucide-react";

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
  velocity_score?: number | null;
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
// Interactive Sector Thematic Radar
// =====================================================================
// Fully driven by the live themes (clustered from the deal pipeline on
// each refresh). Pick a sector → the themes in that sector become radar
// axes. Two overlaid layers:
//   Green = momentum score (derived from heat tier + deal-count density)
//   Blue  = historical M&A EV/EBITDA multiple, blended from each theme's
//           sector mix using sector benchmark references.
// Selecting a theme loads the identified accounts (member deals) on the right.
// =====================================================================

type Member = {
  id: string;
  heading?: string | null;
  buyer?: string | null;
  target?: string | null;
  dominant_sector?: string | null;
  dominant_geography?: string | null;
  intelligence_size?: string | number | null;
  deal_date?: string | null;
  similarity?: number | null;
};

// Approximate historical M&A EV/EBITDA multiples by sector (benchmark reference,
// not pipeline-derived — the pipeline does not carry EBITDA). Matched by keyword;
// a theme's blue value is the average across the sectors it spans.
const SECTOR_EV_EBITDA: { match: RegExp; x: number }[] = [
  { match: /software|saas|cloud|computer: ?software|it services/i, x: 22 },
  { match: /internet|tech|\bai\b|data|semiconduc|computer: ?hardware/i, x: 20 },
  { match: /real estate|property/i, x: 19 },
  { match: /biotech|pharma|medical|health|life scien/i, x: 18 },
  { match: /consumer: ?foods|food|beverage|fmcg/i, x: 16 },
  { match: /financial|fintech|insurance|bank|services \(other\)/i, x: 14 },
  { match: /consumer/i, x: 14 },
  { match: /media|entertainment|leisure/i, x: 13 },
  { match: /defen[cs]e|aerospace/i, x: 13 },
  { match: /industrial|electronics|manufactur|products and services/i, x: 11 },
  { match: /automotive|auto|mobility|transport/i, x: 10 },
  { match: /energy|utilit|infrastructure|power/i, x: 9 },
  { match: /telecom/i, x: 8 },
];

function evEbitdaForSector(sector?: string | null): number {
  if (!sector) return 12;
  for (const r of SECTOR_EV_EBITDA) if (r.match.test(sector)) return r.x;
  return 12;
}

function blendedEvEbitda(sectors: string[]): number {
  if (!sectors || sectors.length === 0) return 12;
  const vals = sectors.map(evEbitdaForSector);
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
}

const HEAT_BASE: Record<string, number> = { hot: 72, warm: 50, cool: 30 };

function momentumFor(theme: Theme, maxDealCount: number): number {
  const base = HEAT_BASE[theme.heat] ?? 40;
  const density = maxDealCount > 0 ? 28 * (theme.deal_count / maxDealCount) : 0;
  return Math.min(100, Math.round(base + density));
}

type Axis = {
  themeId: string;
  label: string;
  emoji: string;
  momentum: number;
  valuation: number;
  dealCount: number;
  heat: string;
  buyers: string[];
};

const VAL_MAX = 25; // EV/EBITDA scale ceiling for the blue layer

function ThematicRadar({ themes }: { themes: Theme[] }) {
  const [collapsed, setCollapsed] = useState(false);
  const [sector, setSector] = useState<string>("");
  const [selectedThemeId, setSelectedThemeId] = useState<string>("");
  const [hover, setHover] = useState<number | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  // Sectors present across live themes, ranked by how many themes touch them.
  const sectorOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of themes) for (const s of t.sectors ?? []) counts.set(s, (counts.get(s) ?? 0) + 1);
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name, count]) => ({ name, count }));
  }, [themes]);

  // Default the dropdown to the densest sector once themes load.
  useEffect(() => {
    if (!sector && sectorOptions.length > 0) setSector(sectorOptions[0].name);
  }, [sectorOptions, sector]);

  const axes: Axis[] = useMemo(() => {
    if (!sector) return [];
    const inSector = themes.filter((t) => (t.sectors ?? []).includes(sector));
    const maxDeal = Math.max(1, ...inSector.map((t) => t.deal_count ?? 0));
    return inSector
      .sort((a, b) => (b.deal_count ?? 0) - (a.deal_count ?? 0))
      .slice(0, 8)
      .map((t) => ({
        themeId: t.id,
        label: t.display_name,
        emoji: t.emoji,
        momentum: momentumFor(t, maxDeal),
        valuation: blendedEvEbitda(t.sectors ?? []),
        dealCount: t.deal_count ?? 0,
        heat: t.heat,
        buyers: t.active_buyers ?? [],
      }));
  }, [themes, sector]);

  // Keep a selected theme in sync with the current sector's axes.
  useEffect(() => {
    if (axes.length === 0) { setSelectedThemeId(""); return; }
    if (!axes.some((a) => a.themeId === selectedThemeId)) setSelectedThemeId(axes[0].themeId);
  }, [axes, selectedThemeId]);

  // Load the identified accounts (member deals) for the selected theme.
  useEffect(() => {
    if (!selectedThemeId) { setMembers([]); return; }
    let cancelled = false;
    setMembersLoading(true);
    fetch(`/api/themes/${selectedThemeId}`)
      .then((r) => r.json())
      .then((j) => { if (!cancelled) setMembers((j.members ?? []).slice(0, 12)); })
      .catch(() => { if (!cancelled) setMembers([]); })
      .finally(() => { if (!cancelled) setMembersLoading(false); });
    return () => { cancelled = true; };
  }, [selectedThemeId]);

  const size = 400;
  const center = size / 2;
  const maxRadius = size / 2 - 70;
  const n = axes.length;

  const polarPoint = (radius: number, angleIdx: number) => {
    const angle = (Math.PI * 2 * angleIdx) / Math.max(1, n) - Math.PI / 2;
    return { x: center + radius * Math.cos(angle), y: center + radius * Math.sin(angle) };
  };

  const buildPath = (valueFn: (a: Axis) => number, scaleMax: number) =>
    axes.map((a, i) => {
      const r = Math.min(1, valueFn(a) / scaleMax) * maxRadius;
      const p = polarPoint(r, i);
      return `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
    }).join(" ") + " Z";

  const momentumPath = n >= 3 ? buildPath((a) => a.momentum, 100) : "";
  const valuationPath = n >= 3 ? buildPath((a) => a.valuation, VAL_MAX) : "";
  const rings = [0.25, 0.5, 0.75, 1].map((pct) =>
    axes.map((_, i) => {
      const p = polarPoint(maxRadius * pct, i);
      return `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
    }).join(" ") + " Z"
  );

  const selectedAxis = axes.find((a) => a.themeId === selectedThemeId) ?? null;

  return (
    <div className="card mb-4 overflow-hidden">
      <button onClick={() => setCollapsed(!collapsed)}
              className="flex w-full items-center justify-between border-b border-slate-100 px-5 py-3 text-left transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/30">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-emerald-500" />
          <span className="text-sm font-semibold text-slate-800 dark:text-white">Thematic Radar Hub (Interactive)</span>
          <span className="hidden text-[10.5px] italic text-slate-500 sm:inline">Momentum vs. sector EV/EBITDA, and the accounts driving each theme</span>
        </div>
        {collapsed ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronUp className="h-4 w-4 text-slate-400" />}
      </button>

      {!collapsed && (
        <div className="p-5">
          {themes.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-[12.5px] text-slate-500 dark:border-slate-700">
              No themes yet. Click <b>Refresh themes</b> to cluster your deal pipeline — the radar populates from the result.
            </div>
          ) : (
            <>
              {/* Sector selector */}
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Sector</label>
                <select
                  value={sector}
                  onChange={(e) => setSector(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[12.5px] text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  {sectorOptions.map((s) => (
                    <option key={s.name} value={s.name}>{s.name} ({s.count})</option>
                  ))}
                </select>
                <span className="text-[11px] text-slate-500">{axes.length} active theme{axes.length === 1 ? "" : "s"} in this sector</span>
              </div>

              <div className="grid gap-4 lg:grid-cols-[1.6fr,1fr]">
                {/* Radar chart */}
                <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-white">
                    <Compass className="h-4 w-4 text-emerald-500" /> {sector || "Sector"} — Thematic Radar
                  </h3>

                  {n >= 3 ? (
                    <div className="relative flex items-center justify-center">
                      <svg viewBox={`0 0 ${size} ${size}`} className="max-w-full" style={{ maxHeight: 420 }}>
                        {rings.map((path, i) => (
                          <path key={i} d={path} fill="none" stroke="rgb(148, 163, 184)" strokeWidth="0.5" strokeOpacity="0.3" />
                        ))}
                        {axes.map((_, i) => {
                          const p = polarPoint(maxRadius, i);
                          return <line key={i} x1={center} y1={center} x2={p.x} y2={p.y} stroke="rgb(148, 163, 184)" strokeWidth="0.5" strokeOpacity="0.3" />;
                        })}
                        <path d={valuationPath} fill="rgb(59, 130, 246)" fillOpacity="0.18" stroke="rgb(59, 130, 246)" strokeWidth="1.5" />
                        <path d={momentumPath} fill="rgb(16, 185, 129)" fillOpacity="0.28" stroke="rgb(16, 185, 129)" strokeWidth="1.5" />

                        {/* Interactive momentum vertices */}
                        {axes.map((a, i) => {
                          const r = (a.momentum / 100) * maxRadius;
                          const p = polarPoint(r, i);
                          const isSel = a.themeId === selectedThemeId;
                          return (
                            <circle key={a.themeId} cx={p.x} cy={p.y} r={isSel ? 5 : 3.5}
                              fill={isSel ? "rgb(5, 150, 105)" : "rgb(16, 185, 129)"} stroke="white" strokeWidth="1.5"
                              style={{ cursor: "pointer" }}
                              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
                              onClick={() => setSelectedThemeId(a.themeId)} />
                          );
                        })}

                        {/* Axis labels */}
                        {axes.map((a, i) => {
                          const p = polarPoint(maxRadius + 30, i);
                          const short = a.label.length > 22 ? a.label.slice(0, 21) + "…" : a.label;
                          return (
                            <text key={a.themeId} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle"
                                  className="fill-slate-700 dark:fill-slate-300" style={{ fontSize: 9.5, fontWeight: a.themeId === selectedThemeId ? 700 : 500, cursor: "pointer" }}
                                  onClick={() => setSelectedThemeId(a.themeId)}>
                              {short}
                            </text>
                          );
                        })}

                        {/* Hover tooltip */}
                        {hover !== null && axes[hover] && (() => {
                          const a = axes[hover];
                          const p = polarPoint((a.momentum / 100) * maxRadius, hover);
                          const tx = Math.min(size - 92, Math.max(4, p.x + 8));
                          const ty = Math.min(size - 40, Math.max(4, p.y - 38));
                          return (
                            <g pointerEvents="none">
                              <rect x={tx} y={ty} width={150} height={40} rx={5} fill="rgb(15, 23, 42)" opacity="0.94" />
                              <text x={tx + 8} y={ty + 15} style={{ fontSize: 9.5, fontWeight: 700 }} fill="white">{a.emoji} Momentum {a.momentum}%</text>
                              <text x={tx + 8} y={ty + 29} style={{ fontSize: 9 }} fill="rgb(147, 197, 253)">EV/EBITDA ~{a.valuation}x · {a.dealCount} deals</text>
                            </g>
                          );
                        })()}
                      </svg>
                    </div>
                  ) : (
                    // Fallback for <3 themes (radar polygon needs at least 3 axes)
                    <div className="space-y-2 py-2">
                      {axes.map((a) => (
                        <button key={a.themeId} onClick={() => setSelectedThemeId(a.themeId)}
                                className={`block w-full rounded-lg border p-2.5 text-left ${a.themeId === selectedThemeId ? "border-emerald-300 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/30" : "border-slate-200 dark:border-slate-700"}`}>
                          <div className="mb-1 text-[12px] font-semibold text-slate-800 dark:text-white">{a.label}</div>
                          <div className="flex items-center gap-2 text-[10px]">
                            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">Momentum {a.momentum}%</span>
                            <span className="rounded bg-blue-100 px-1.5 py-0.5 text-blue-800 dark:bg-blue-950 dark:text-blue-300">EV/EBITDA ~{a.valuation}x</span>
                          </div>
                        </button>
                      ))}
                      {axes.length === 0 && <p className="text-[12px] italic text-slate-500">No themes in this sector.</p>}
                    </div>
                  )}

                  <div className="mt-2 space-y-1 text-center">
                    <p className="text-[10.5px] italic text-slate-500">
                      <span className="mr-1 inline-block h-2 w-2 rounded bg-emerald-500" /> Green: momentum (heat × deal density)
                      <span className="ml-3 mr-1 inline-block h-2 w-2 rounded bg-blue-500" /> Blue: sector EV/EBITDA benchmark
                    </p>
                    <p className="flex items-center justify-center gap-1 text-[9.5px] text-slate-400">
                      <Info className="h-2.5 w-2.5" /> EV/EBITDA uses historical sector benchmark multiples (pipeline carries no EBITDA); momentum is derived from live theme heat and deal count.
                    </p>
                  </div>
                </div>

                {/* Theme list + identified accounts */}
                <div className="space-y-3">
                  <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                    <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Active themes — {sector}</h3>
                    <div className="space-y-1">
                      {axes.map((a) => (
                        <button key={a.themeId} onClick={() => setSelectedThemeId(a.themeId)}
                                className={`flex w-full items-center justify-between rounded p-2 text-left transition ${a.themeId === selectedThemeId
                                  ? "bg-emerald-100 dark:bg-emerald-950/40"
                                  : "hover:bg-slate-50 dark:hover:bg-slate-800"}`}>
                          <span className={`flex items-center gap-1.5 text-[11.5px] font-medium ${a.themeId === selectedThemeId ? "text-emerald-700 dark:text-emerald-400" : "text-slate-700 dark:text-slate-300"}`}>
                            <Activity className="h-3 w-3" /> {a.label.length > 26 ? a.label.slice(0, 25) + "…" : a.label}
                          </span>
                          <span className="font-mono text-[10.5px] text-emerald-600">{a.momentum}%</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        <Building2 className="h-3 w-3" /> Identified Accounts
                      </h3>
                      {selectedAxis && (
                        <Link href={`/dashboard/themes/${selectedAxis.themeId}`} className="text-[10px] font-medium text-emerald-600 hover:underline">
                          View theme →
                        </Link>
                      )}
                    </div>
                    {membersLoading ? (
                      <div className="flex items-center gap-2 py-3 text-[11px] text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading accounts…</div>
                    ) : members.length === 0 ? (
                      <p className="py-2 text-[11px] italic text-slate-500">No accounts linked to this theme yet.</p>
                    ) : (
                      <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
                        {members.map((m) => (
                          <div key={m.id} className="rounded border border-slate-200 p-2 dark:border-slate-700">
                            <div className="mb-0.5 flex items-start justify-between gap-2">
                              <div className="text-[11.5px] font-semibold text-slate-900 dark:text-white">
                                {m.buyer ? <>{m.buyer} <ArrowRight className="inline h-2.5 w-2.5 text-emerald-500" /> </> : null}
                                <span className="text-emerald-700 dark:text-emerald-400">{m.target || m.heading || "Target"}</span>
                              </div>
                              {m.intelligence_size != null && (
                                <span className="flex-shrink-0 rounded bg-slate-100 px-1 py-0.5 text-[9px] font-mono text-slate-600 dark:bg-slate-800 dark:text-slate-400">{String(m.intelligence_size)}</span>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 text-[9.5px] text-slate-500">
                              {m.dominant_sector && <span className="rounded bg-slate-100 px-1 py-0.5 dark:bg-slate-800">{m.dominant_sector}</span>}
                              {m.dominant_geography && <span className="rounded bg-emerald-50 px-1 py-0.5 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">{m.dominant_geography}</span>}
                              {m.deal_date && <span>{new Date(m.deal_date).getFullYear()}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// =====================================================================
// Main page
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

      {/* Interactive thematic radar — driven by live themes */}
      <ThematicRadar themes={themes} />

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
