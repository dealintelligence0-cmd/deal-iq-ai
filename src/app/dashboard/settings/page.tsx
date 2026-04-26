"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { PROVIDERS, type ProviderId } from "@/lib/ai/providers";
import { CheckCircle2, XCircle, AlertCircle, Trash2, Key, Settings as SettingsIcon, Search, Loader2, RefreshCw, Shield } from "lucide-react";

type Tier = "fast" | "smart";
type KeyStatus = { kind: string; provider: string | null; model: string | null; has_key: boolean };

export default function SettingsPage() {
  const sb = createClient();
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Provider selection state
  const [fastProv, setFastProv] = useState<ProviderId>("free");
  const [smartProv, setSmartProv] = useState<ProviderId>("free");
  const [fastModel, setFastModel] = useState<string | null>(null);
  const [smartModel, setSmartModel] = useState<string | null>(null);

  // Key entry state
  const [fastKey, setFastKey] = useState("");
  const [smartKey, setSmartKey] = useState("");
  const [tavilyVal, setTavilyVal] = useState("");
  const [researchProv, setResearchProv] = useState<string>("tavily");

  const [status, setStatus] = useState<string>("");
  const [keysStatus, setKeysStatus] = useState<KeyStatus[]>([]);
  const [testing, setTesting] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const { data: u } = await sb.auth.getUser();
      if (!u.user) { setErr("Not signed in"); setLoaded(true); return; }

      const { data } = await sb.from("ai_settings")
        .select("bulk_provider,premium_provider,bulk_model,premium_model,research_provider")
        .eq("user_id", u.user.id).maybeSingle();

      if (data) {
        if (PROVIDERS[data.bulk_provider as ProviderId]) setFastProv(data.bulk_provider as ProviderId);
        if (PROVIDERS[data.premium_provider as ProviderId]) setSmartProv(data.premium_provider as ProviderId);
        setFastModel(data.bulk_model ?? null);
        setSmartModel(data.premium_model ?? null);
        if (data.research_provider) setResearchProv(data.research_provider);
      } else {
        await sb.from("ai_settings").insert({ user_id: u.user.id });
      }

      const { data: ks } = await sb.rpc("ai_keys_status");
      if (ks) setKeysStatus(ks as KeyStatus[]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "load failed");
    } finally { setLoaded(true); }
  }, [sb]);

  useEffect(() => { loadAll(); }, [loadAll]);

async function saveProvider(tier: Tier, p: ProviderId) {
    if (tier === "fast") { setFastProv(p); setFastModel(null); }
    else { setSmartProv(p); setSmartModel(null); }
    const { data: u } = await sb.auth.getUser();
    if (!u.user) return;
    const { error } = await sb.from("ai_settings").update({
      [tier === "fast" ? "bulk_provider" : "premium_provider"]: p,
      [tier === "fast" ? "bulk_model" : "premium_model"]: null,
    }).eq("user_id", u.user.id);
    if (error) {
      setStatus(`Error saving provider: ${error.message}`);
      return;
    }
    setStatus(`✓ ${tier === "fast" ? "Fast" : "Smart"} provider set to ${PROVIDERS[p].label}. Now save the API key below.`);
    // Refresh keys-status (badges) WITHOUT touching dropdown state
    const { data: ks } = await sb.rpc("ai_keys_status");
    if (ks) setKeysStatus(ks as KeyStatus[]);
  }

  async function saveKey(tier: Tier) {
    const key = tier === "fast" ? fastKey : smartKey;
    if (!key.trim()) return;
    setStatus(`Saving ${tier} key...`);
    const r = await fetch("/api/ai/save-key", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: tier === "fast" ? "bulk" : "premium", key: key.trim() }),
    });
    const j = await r.json();
    setStatus(j.ok ? `✓ ${tier} key saved. Now click Auto-detect to verify.` : `Error: ${j.error}`);
    if (j.ok) {
      if (tier === "fast") setFastKey(""); else setSmartKey("");
      const { data: ks } = await sb.rpc("ai_keys_status");
      if (ks) setKeysStatus(ks as KeyStatus[]);
    }
  }

  async function probe(tier: Tier) {
    const provider = tier === "fast" ? fastProv : smartProv;
    if (provider === "free") {
      setStatus("Cannot Auto-detect: provider is set to Free. Pick a real AI provider first.");
      return;
    }
    setTesting(tier);
    setStatus(`Testing ${tier} key against ${provider}...`);
    const r = await fetch("/api/ai/test", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: tier, provider }),
    });
    const j = await r.json();
    setTesting(null);
    if (j.ok) {
      if (tier === "fast") setFastModel(j.model); else setSmartModel(j.model);
      setStatus(`✓ ${tier} key working — auto-selected model: ${j.model}`);
      const { data: ks } = await sb.rpc("ai_keys_status");
      if (ks) setKeysStatus(ks as KeyStatus[]);
    } else {
      setStatus(`✗ ${tier} key FAILED: ${j.error}. Tried: ${(j.tried ?? []).join(", ")}`);
    }
  }

  async function deleteKey(kind: string) {
    if (!confirm(`Delete ${kind} key? This will clear the saved API key from the database.`)) return;
    const r = await fetch("/api/ai/delete-key", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind }),
    });
    const j = await r.json();
    setStatus(j.ok ? `✓ ${kind} key deleted` : `Error: ${j.error}`);
    if (j.ok) {
      if (kind === "bulk") { setFastModel(null); setFastProv("free"); }
      if (kind === "premium") { setSmartModel(null); setSmartProv("free"); }
      const { data: ks } = await sb.rpc("ai_keys_status");
      if (ks) setKeysStatus(ks as KeyStatus[]);
    }
  }

  if (!loaded) return <div className="p-6">Loading...</div>;
  if (err) return <div className="p-6 text-red-600">{err}</div>;

  const providers = Object.values(PROVIDERS);
  const fastStatus = keysStatus.find((k) => k.kind === "bulk");
  const smartStatus = keysStatus.find((k) => k.kind === "premium");
  const tavilyStatus = keysStatus.find((k) => k.kind === "tavily");
  const braveStatus = keysStatus.find((k) => k.kind === "brave");
  const serperStatus = keysStatus.find((k) => k.kind === "serper");
  return (
    <div className="max-w-4xl space-y-6 p-2">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">AI Settings</h1>
        <p className="mt-1 text-sm text-slate-500">Manage AI providers, API keys, and research tools.</p>
      </div>

      {/* SECTION 1: KEYS STATUS DASHBOARD */}
      <section className="card p-5 border-l-4 border-l-emerald-500">
        <div className="mb-4 flex items-center gap-2">
          <Key className="h-4 w-4 text-emerald-600" />
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Saved Keys & Status</h2>
          <button onClick={loadAll} className="ml-auto flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50">
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
        </div>

        <div className="space-y-2">
          {[
            { row: smartStatus, label: "Smart Tier (Proposals · PMI · Synergy · TSA)", color: "indigo" },
            { row: fastStatus, label: "Fast Tier (Bulk Enrichment)", color: "emerald" },
            { row: tavilyStatus, label: "Tavily (Web Research)", color: "amber" },
            { row: braveStatus, label: "Brave (Web Research)", color: "amber" },
            { row: serperStatus, label: "Serper (Web Research)", color: "amber" },
          ].map(({ row, label }) => {
            const ok = row?.has_key && row.provider && row.provider !== "free";
            const partial = row?.has_key && (!row.provider || row.provider === "free");
            const icon = ok ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                       : partial ? <AlertCircle className="h-4 w-4 text-amber-500" />
                       : <XCircle className="h-4 w-4 text-slate-300" />;
            const statusText = ok ? "ACTIVE" : partial ? "INCOMPLETE" : "EMPTY";
            const statusColor = ok ? "text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-400"
                              : partial ? "text-amber-700 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400"
                              : "text-slate-400 bg-slate-50 dark:bg-white/5";

            return (
              <div key={label} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-[#15151f]">
                {icon}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">{label}</p>
                    <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${statusColor}`}>{statusText}</span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {row?.has_key ? (
                      <>
                        <span className="font-medium">Provider:</span> {row.provider ?? "—"}
                        {row.model && <> · <span className="font-medium">Model:</span> {row.model}</>}
                      </>
                    ) : "No key saved"}
                  </p>
                </div>
                {row?.has_key && (
                  <button onClick={() => deleteKey(row.kind)}
                    className="flex shrink-0 items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[10px] font-medium text-red-700 hover:bg-red-100">
                    <Trash2 className="h-3 w-3" /> Delete
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <p className="mt-3 text-[11px] text-slate-500">
          <strong className="text-slate-700">ACTIVE</strong> = key saved + provider selected (not Free) + model resolved · <strong className="text-amber-700">INCOMPLETE</strong> = key saved but provider is Free (won&apos;t generate AI output)
        </p>
      </section>

      {/* SECTION 2: PROVIDER SELECTION + KEY MGMT */}
      <section className="card p-5 border-l-4 border-l-indigo-500">
        <div className="mb-4 flex items-center gap-2">
          <SettingsIcon className="h-4 w-4 text-indigo-600" />
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">AI Providers</h2>
        </div>
        <p className="mb-4 text-xs text-slate-500">Step 1: pick provider · Step 2: save key · Step 3: Auto-detect</p>

        {(["smart", "fast"] as const).map((tier) => {
          const prov = tier === "fast" ? fastProv : smartProv;
          const model = tier === "fast" ? fastModel : smartModel;
          const keyVal = tier === "fast" ? fastKey : smartKey;
          const setKeyVal = tier === "fast" ? setFastKey : setSmartKey;
          const meta = PROVIDERS[prov];
          const tierLabel = tier === "smart" ? "Smart Tier (Proposals · PMI · Synergy · TSA)" : "Fast Tier (Bulk Enrichment)";

          return (
            <div key={tier} className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
              <h3 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-200">{tierLabel}</h3>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400">1. Provider</label>
                  <select value={prov} onChange={(e) => saveProvider(tier, e.target.value as ProviderId)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white">
                    {providers.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                  {meta.keyDocsUrl && prov !== "free" && (
                    <a href={meta.keyDocsUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[11px] text-indigo-600">Get API key →</a>
                  )}
                </div>
                {meta.needsKey && (
                  <div>
                    <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400">2. API Key</label>
                    <div className="mt-1 flex gap-2">
                      <input type="password" value={keyVal} onChange={(e) => setKeyVal(e.target.value)}
                        placeholder="Paste key"
                        className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
                      <button onClick={() => saveKey(tier)}
                        className="rounded-lg bg-slate-900 px-3 py-2 text-xs text-white">Save</button>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-3 flex items-center gap-3">
                <button onClick={() => probe(tier)} disabled={testing === tier}
                  className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs text-white hover:bg-indigo-700 disabled:opacity-50">
                  {testing === tier ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  3. Auto-detect & Test
                </button>
                {model && (
                  <span className="rounded bg-emerald-50 px-2 py-1 font-mono text-[11px] text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
                    ✓ {model}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </section>
      {/* SECTION 3: WEB RESEARCH */}
      <section className="card p-5 border-l-4 border-l-amber-500">
        <div className="mb-4 flex items-center gap-2">
          <Search className="h-4 w-4 text-amber-600" />
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Web Research Provider</h2>
        </div>
        <p className="mb-3 text-xs text-slate-600">Live web search for AI proposals. Switch any time if a free tier exhausts.</p>

        <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400">Provider</label>
        <select value={researchProv} onChange={async (e) => {
            setResearchProv(e.target.value);
            const { data: u } = await sb.auth.getUser();
            if (u.user) await sb.from("ai_settings").update({ research_provider: e.target.value }).eq("user_id", u.user.id);
            setStatus(`✓ Research provider set to ${e.target.value}`);
            loadAll();
          }}
          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white">
          <option value="tavily">Tavily — best AI-tuned (1,000/mo free)</option>
          <option value="brave">Brave Search — broad index (2,000/mo free)</option>
          <option value="serper">Serper — Google results (2,500/mo free)</option>
        </select>

        <p className="mt-3 text-[11px] text-slate-500">
          Get free key:{" "}
          {researchProv === "tavily"  && <a href="https://app.tavily.com/home" target="_blank" rel="noreferrer" className="text-indigo-600">app.tavily.com →</a>}
          {researchProv === "brave"   && <a href="https://api.search.brave.com/app/keys" target="_blank" rel="noreferrer" className="text-indigo-600">api.search.brave.com →</a>}
          {researchProv === "serper"  && <a href="https://serper.dev/api-key" target="_blank" rel="noreferrer" className="text-indigo-600">serper.dev →</a>}
        </p>

        <div className="mt-3 flex gap-2">
          <input type="password" value={tavilyVal} onChange={(e) => setTavilyVal(e.target.value)}
            placeholder={researchProv === "tavily" ? "tvly-..." : researchProv === "brave" ? "BSA..." : "Serper API key"}
            className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
          <button onClick={async () => {
            if (!tavilyVal.trim()) return;
            const r = await fetch("/api/ai/save-tavily-key", {
              method: "POST", headers: { "content-type": "application/json" },
              body: JSON.stringify({ provider: researchProv, key: tavilyVal.trim() }),
            });
            const j = await r.json();
            setStatus(j.ok ? `✓ ${researchProv} key saved.` : "Error: " + j.error);
            if (j.ok) { setTavilyVal(""); loadAll(); }
          }} className="rounded-lg bg-amber-600 px-3 py-2 text-sm text-white">Save</button>
        </div>
      </section>

      {/* SECTION 4: DANGER ZONE — admin only */}
      <AdminDangerZone setStatus={setStatus} />

      {status && (
        <div className="sticky bottom-4 mx-auto max-w-3xl rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-lg dark:border-white/10 dark:bg-[#15151f]">
          {status}
        </div>
      )}
    </div>
  );
}

function AdminDangerZone({ setStatus }: { setStatus: (s: string) => void }) {
  const sb = createClient();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [confirming, setConfirming] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadCounts = useCallback(async () => {
    const { data: u } = await sb.auth.getUser();
    if (!u.user) return;
    const tables = ["deals", "proposals", "uploads"];
    const c: Record<string, number> = {};
    for (const t of tables) {
      const { count } = await sb.from(t).select("*", { count: "exact", head: true }).eq("user_id", u.user.id);
      c[t] = count ?? 0;
    }
    setCounts(c);
  }, [sb]);

  useEffect(() => {
    (async () => {
      const { data } = await sb.rpc("is_admin");
      setIsAdmin(Boolean(data));
      if (data) loadCounts();
    })();
  }, [sb, loadCounts]);

  async function purge(table: string) {
    setLoading(true);
    const { data: u } = await sb.auth.getUser();
    if (!u.user) { setLoading(false); return; }
    const { error } = await sb.rpc("purge_user_data", { p_uid: u.user.id, p_table: table });
    setLoading(false);
    setConfirming(null);
    if (error) { setStatus("Error: " + error.message); return; }
    setStatus(`✓ ${table === "all" ? "All data" : table} cleared.`);
    loadCounts();
  }

  if (isAdmin === null) return null;
  if (!isAdmin) {
    return (
      <section className="card p-4 border-l-4 border-l-slate-300">
        <p className="flex items-center gap-2 text-xs text-slate-500">
          <Shield className="h-3 w-3" />
          Danger Zone is restricted to admin users.
        </p>
      </section>
    );
  }

  const items = [
    { key: "deals", label: "Deals" },
    { key: "proposals", label: "Proposals" },
    { key: "uploads", label: "Uploads" },
    { key: "all", label: "All Data" },
  ];

  return (
    <section className="card p-5 border-l-4 border-l-red-500">
      <h2 className="flex items-center gap-2 text-base font-semibold text-red-700 dark:text-red-400">
        <Trash2 className="h-4 w-4" /> Danger Zone — Admin Only
        <span className="ml-auto rounded-md bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-700">Admin</span>
      </h2>
      <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">Permanently delete data to stay under free-tier limits. Auth account preserved.</p>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {items.map((it) => (
          <div key={it.key} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-white/10 dark:bg-white/5">
            <div>
              <p className="text-xs font-medium text-slate-700 dark:text-slate-300">{it.label}</p>
              {it.key !== "all" && <p className="text-[10px] text-slate-500">{counts[it.key] ?? 0} rows</p>}
            </div>
            <button onClick={() => setConfirming(it.key)} disabled={loading}
              className="rounded-md bg-red-50 px-2 py-1 text-[11px] font-medium text-red-700 hover:bg-red-100 disabled:opacity-50 dark:bg-red-950/30 dark:text-red-400">
              Clear
            </button>
          </div>
        ))}
      </div>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="card max-w-sm p-5">
            <h3 className="font-semibold text-slate-900 dark:text-white">Confirm permanent delete</h3>
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
              Permanently delete <strong>{confirming === "all" ? "ALL data" : confirming}</strong>. Cannot be undone.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setConfirming(null)} className="rounded-md border border-slate-200 px-3 py-1.5 text-xs text-slate-700 dark:border-white/10 dark:text-slate-300">Cancel</button>
              <button onClick={() => purge(confirming)} disabled={loading}
                className="rounded-md bg-red-600 px-3 py-1.5 text-xs text-white disabled:opacity-50">
                {loading ? "Deleting..." : "Yes, delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
