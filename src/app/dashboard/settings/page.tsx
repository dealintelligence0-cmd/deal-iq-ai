

"use client";

import { useEffect, useState } from "react";
import {
  Settings as SettingsIcon, KeyRound, CheckCircle2, XCircle,
  Loader2, Zap, Sparkles, Save, ExternalLink, Wand2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PROVIDERS, type ProviderId } from "@/lib/ai/providers";

type Tier = "fast" | "smart";

type Settings = {
  bulk_provider: ProviderId;
  premium_provider: ProviderId;
  bulk_model: string | null;
  premium_model: string | null;
  monthly_budget_usd: number;
  usage_current_usd: number;
};

export default function AISettingsPage() {
  const supabase = createClient();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [hasKey, setHasKey] = useState<Record<Tier, boolean>>({ fast: false, smart: false });
  const [key, setKey] = useState<Record<Tier, string>>({ fast: "", smart: "" });
  const [savingKind, setSavingKind] = useState<Tier | null>(null);
  const [probing, setProbing] = useState<Tier | null>(null);
  const [result, setResult] = useState<Record<Tier, { ok: boolean; msg: string } | null>>({ fast: null, smart: null });
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data: s } = await supabase
        .from("ai_settings")
        .select("bulk_provider,premium_provider,bulk_model,premium_model,monthly_budget_usd,usage_current_usd")
        .eq("user_id", u.user.id).single();
      if (s) setSettings(s as Settings);
      const [{ data: hb }, { data: hp }] = await Promise.all([
        supabase.rpc("has_ai_key", { p_kind: "bulk" }),
        supabase.rpc("has_ai_key", { p_kind: "premium" }),
      ]);
      setHasKey({ fast: Boolean(hb), smart: Boolean(hp) });
      setLoaded(true);
    })();
  }, [supabase]);

  async function saveKey(tier: Tier) {
    if (!key[tier].trim()) return;
    setSavingKind(tier);
    const res = await fetch("/api/ai/save-key", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: tier === "fast" ? "bulk" : "premium", key: key[tier].trim() }),
    });
    const j = await res.json();
    if (j.ok) {
      setKey((p) => ({ ...p, [tier]: "" }));
      setHasKey((p) => ({ ...p, [tier]: true }));
      setResult((p) => ({ ...p, [tier]: { ok: true, msg: "Key saved. Click Auto-detect best model." } }));
    } else {
      setResult((p) => ({ ...p, [tier]: { ok: false, msg: j.error ?? "Save failed" } }));
    }
    setSavingKind(null);
  }

  async function probeAndSave(tier: Tier) {
    if (!settings) return;
    const provider = tier === "fast" ? settings.bulk_provider : settings.premium_provider;
    setProbing(tier);
    setResult((p) => ({ ...p, [tier]: null }));
    const res = await fetch("/api/ai/test", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: tier, provider }),
    });
    const j = await res.json();
    if (j.ok) {
      setSettings((s) => s ? { ...s, [tier === "fast" ? "bulk_model" : "premium_model"]: j.model } : s);
      setResult((p) => ({
        ...p,
        [tier]: { ok: true, msg: `Auto-selected: ${j.model} (tried ${j.tried.length})` },
      }));
    } else {
      setResult((p) => ({
        ...p,
        [tier]: { ok: false, msg: `${j.error ?? "Probe failed"} · tried ${(j.tried ?? []).join(", ")}` },
      }));
    }
    setProbing(null);
  }

  async function savePrefs() {
    if (!settings) return;
    setSavingPrefs(true);
    const { data: u } = await supabase.auth.getUser();
    if (u.user) {
      await supabase.from("ai_settings").update({
        bulk_provider: settings.bulk_provider,
        premium_provider: settings.premium_provider,
        monthly_budget_usd: settings.monthly_budget_usd,
      }).eq("user_id", u.user.id);
    }
    setSavingPrefs(false);
  }

  if (!loaded || !settings) {
    return <div className="flex h-96 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-indigo-600" /></div>;
  }

  const providerList = Object.values(PROVIDERS);
  const budgetPct = settings.monthly_budget_usd > 0
    ? Math.min(100, (settings.usage_current_usd / settings.monthly_budget_usd) * 100) : 0;

const tiers: Array<{
    key: Tier;
    label: string;
    desc: string;
    icon: typeof Zap;
    iconClass: string;
    providerField: "bulk_provider" | "premium_provider";
    modelField: "bulk_model" | "premium_model";
  }> = [
{ key: "fast",  label: "Fast Tier",  desc: "Row-level enrichment, classification, dedup reasoning — high volume, low latency.", icon: Zap,       iconClass: "bg-emerald-50 text-emerald-600", providerField: "bulk_provider",    modelField: "bulk_model" },
    { key: "smart", label: "Smart Tier", desc: "Proposals, due-diligence memos, long reasoning — quality over speed.",              icon: Sparkles,  iconClass: "bg-purple-50 text-purple-600",   providerField: "premium_provider", modelField: "premium_model" },
  ];

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <SettingsIcon className="h-6 w-6 text-indigo-600" />
          AI Settings
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Pick a provider, save your API key, click Auto-detect. The system probes and locks in the best available model — no version management.
        </p>
      </div>

      {tiers.map((t) => {
        const provider = settings[t.providerField];
        const meta = PROVIDERS[provider];
        const saved = hasKey[t.key];
        const autoModel = settings[t.modelField];
        const r = result[t.key];
        const Icon = t.icon;

        return (
          <div key={t.key} className="mb-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${t.iconClass}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900">{t.label}</h2>
                <p className="text-xs text-slate-500">{t.desc}</p>
              </div>
              {saved && (
                <span className="ml-auto flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                  <CheckCircle2 className="h-3 w-3" /> Key saved
                </span>
              )}
            </div>

            <div className="mt-5">
              <label className="mb-1.5 block text-xs font-medium text-slate-600">Provider</label>
              <select
                value={provider}
                onChange={(e) => setSettings({
                  ...settings,
                  [t.providerField]: e.target.value as ProviderId,
                  [t.modelField]: null, // clear cached model when provider changes
                })}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500"
              >
                {providerList.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
              {meta.keyDocsUrl && (
                <a href={meta.keyDocsUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700">
                  Get API key <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>

            {meta.needsKey && (
              <div className="mt-4">
                <label className="mb-1.5 block text-xs font-medium text-slate-600">API Key</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <KeyRound className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="password"
                      value={key[t.key]}
                      onChange={(e) => setKey((p) => ({ ...p, [t.key]: e.target.value }))}
                      placeholder={saved ? "•••••••• (saved)" : "Paste your key"}
                      className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-sm outline-none focus:border-indigo-500"
                    />
                  </div>
                  <button
                    onClick={() => saveKey(t.key)}
                    disabled={!key[t.key] || savingKind === t.key}
                    className="flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    {savingKind === t.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    Save
                  </button>
                </div>
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
              <button
                onClick={() => probeAndSave(t.key)}
                disabled={probing === t.key || (meta.needsKey && !saved)}
                className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:from-indigo-400 hover:to-purple-500 disabled:opacity-50"
              >
                {probing === t.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                Auto-detect best model
              </button>
              {autoModel && (
                <span className="flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-mono text-indigo-700">
                  <CheckCircle2 className="h-3 w-3" /> {autoModel}
                </span>
              )}
              {r && (
                <div className={`flex items-center gap-1 text-xs ${r.ok ? "text-emerald-700" : "text-red-700"}`}>
                  {r.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                  {r.msg}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Budget */}
      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Budget & Fallback</h2>
        <p className="mt-1 text-xs text-slate-500">
          If the primary provider fails, the router tries the other tier's provider, then free rules.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600">Monthly budget ($USD)</label>
            <input
              type="number" value={settings.monthly_budget_usd}
              onChange={(e) => setSettings({ ...settings, monthly_budget_usd: Number(e.target.value) || 0 })}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600">Current usage</label>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
              ${settings.usage_current_usd.toFixed(4)}
            </div>
          </div>
        </div>

        {settings.monthly_budget_usd > 0 && (
          <div className="mt-3">
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className={`h-full transition-all ${budgetPct > 90 ? "bg-red-500" : budgetPct > 70 ? "bg-amber-500" : "bg-indigo-500"}`}
                style={{ width: `${budgetPct}%` }} />
            </div>
            <div className="mt-1 text-xs text-slate-500">{budgetPct.toFixed(1)}% of budget used</div>
          </div>
        )}

        <button onClick={savePrefs} disabled={savingPrefs}
          className="mt-5 flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
          {savingPrefs ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save preferences
        </button>
      </div>
    </div>
  );
}
