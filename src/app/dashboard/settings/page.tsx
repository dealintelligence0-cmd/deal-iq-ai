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
  const [hasKeyFast, setHasKeyFast] = useState(false);
  const [hasKeySmart, setHasKeySmart] = useState(false);
  const [keyFast, setKeyFast] = useState("");
  const [keySmart, setKeySmart] = useState("");
  const [savingKind, setSavingKind] = useState<Tier | null>(null);
  const [probing, setProbing] = useState<Tier | null>(null);
  const [resultFast, setResultFast] = useState<{ ok: boolean; msg: string } | null>(null);
  const [resultSmart, setResultSmart] = useState<{ ok: boolean; msg: string } | null>(null);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data: u } = await supabase.auth.getUser();
        if (!u.user) { setLoadError("Not signed in"); setLoaded(true); return; }

        const { data: s, error } = await supabase
          .from("ai_settings")
          .select("bulk_provider,premium_provider,bulk_model,premium_model,monthly_budget_usd,usage_current_usd")
          .eq("user_id", u.user.id)
          .maybeSingle();

        if (error) { setLoadError(error.message); setLoaded(true); return; }

        let row = s;
        if (!row) {
          const { data: inserted } = await supabase
            .from("ai_settings")
            .insert({ user_id: u.user.id })
            .select("bulk_provider,premium_provider,bulk_model,premium_model,monthly_budget_usd,usage_current_usd")
            .single();
          async function saveKey(tier: Tier) {
    const key = tier === "fast" ? keyFast : keySmart;
    if (!key.trim()) return;
    setSavingKind(tier);
    const res = await fetch("/api/ai/save-key", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: tier === "fast" ? "bulk" : "premium", key: key.trim() }),
    });
    const j = await res.json();
    if (j.ok) {
      if (tier === "fast") { setKeyFast(""); setHasKeyFast(true); setResultFast({ ok: true, msg: "Key saved. Click Auto-detect." }); }
      else { setKeySmart(""); setHasKeySmart(true); setResultSmart({ ok: true, msg: "Key saved. Click Auto-detect." }); }
    } else {
      if (tier === "fast") setResultFast({ ok: false, msg: j.error ?? "Save failed" });
      else setResultSmart({ ok: false, msg: j.error ?? "Save failed" });
    }
    setSavingKind(null);
  }

  async function probeAndSave(tier: Tier) {
    if (!settings) return;
    const provider = tier === "fast" ? settings.bulk_provider : settings.premium_provider;
    setProbing(tier);
    if (tier === "fast") setResultFast(null); else setResultSmart(null);
    const res = await fetch("/api/ai/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: tier, provider }),
    });
    const j = await res.json();
    if (j.ok) {
      setSettings({ ...settings, [tier === "fast" ? "bulk_model" : "premium_model"]: j.model });
      const m = { ok: true, msg: `Auto-selected: ${j.model} (tried ${j.tried?.length ?? 0})` };
      if (tier === "fast") setResultFast(m); else setResultSmart(m);
    } else {
      const m = { ok: false, msg: `${j.error ?? "Probe failed"} · tried ${(j.tried ?? []).join(", ")}` };
      if (tier === "fast") setResultFast(m); else setResultSmart(m);
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

  if (!loaded) {
    return <div className="flex h-96 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-indigo-600" /></div>;
  }
  if (loadError || !settings) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6">
        <h2 className="font-semibold text-red-800">Settings failed to load</h2>
        <p className="mt-1 text-sm text-red-700">{loadError ?? "No settings row"}</p>
      </div>
    );
  }

  const providerList = Object.values(PROVIDERS);
  const budgetPct = settings.monthly_budget_usd > 0
    ? Math.min(100, (settings.usage_current_usd / settings.monthly_budget_usd) * 100) : 0;
          return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <SettingsIcon className="h-6 w-6 text-indigo-600" /> AI Settings
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Pick a provider, save your API key, click Auto-detect. The system probes and locks in the best model.
        </p>
      </div>

      <TierCard
        tier="fast" label="Fast Tier"
        desc="Row-level enrichment, classification — high volume."
        iconClass="bg-emerald-50 text-emerald-600" Icon={Zap}
        provider={settings.bulk_provider} model={settings.bulk_model}
        hasKey={hasKeyFast} keyValue={keyFast} setKeyValue={setKeyFast}
        onProviderChange={(p) => setSettings({ ...settings, bulk_provider: p, bulk_model: null })}
        onSaveKey={() => saveKey("fast")} onProbe={() => probeAndSave("fast")}
        saving={savingKind === "fast"} probing={probing === "fast"} result={resultFast}
        providerList={providerList}
      />

      <TierCard
        tier="smart" label="Smart Tier"
        desc="Proposals, long reasoning — quality over speed."
        iconClass="bg-purple-50 text-purple-600" Icon={Sparkles}
        provider={settings.premium_provider} model={settings.premium_model}
        hasKey={hasKeySmart} keyValue={keySmart} setKeyValue={setKeySmart}
        onProviderChange={(p) => setSettings({ ...settings, premium_provider: p, premium_model: null })}
        onSaveKey={() => saveKey("smart")} onProbe={() => probeAndSave("smart")}
        saving={savingKind === "smart"} probing={probing === "smart"} result={resultSmart}
        providerList={providerList}
      />

      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Budget & Fallback</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600">Monthly budget ($USD)</label>
            <input type="number" value={settings.monthly_budget_usd}
              onChange={(e) => setSettings({ ...settings, monthly_budget_usd: Number(e.target.value) || 0 })}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500" />
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
              <div className={`h-full ${budgetPct > 90 ? "bg-red-500" : budgetPct > 70 ? "bg-amber-500" : "bg-indigo-500"}`} style={{ width: `${budgetPct}%` }} />
            </div>
            <div className="mt-1 text-xs text-slate-500">{budgetPct.toFixed(1)}% used</div>
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

type TierCardProps = {
  tier: Tier; label: string; desc: string; iconClass: string; Icon: typeof Zap;
  provider: ProviderId; model: string | null; hasKey: boolean;
  keyValue: string; setKeyValue: (v: string) => void;
  onProviderChange: (p: ProviderId) => void;
  onSaveKey: () => void; onProbe: () => void;
  saving: boolean; probing: boolean;
  result: { ok: boolean; msg: string } | null;
  providerList: Array<{ id: ProviderId; label: string; needsKey: boolean; keyDocsUrl: string }>;
};

function TierCard(p: TierCardProps) {
  const meta = PROVIDERS[p.provider];
  return (
    <div className="mb-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${p.iconClass}`}>
          <p.Icon className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-900">{p.label}</h2>
          <p className="text-xs text-slate-500">{p.desc}</p>
        </div>
        {p.hasKey && (
          <span className="ml-auto flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
            <CheckCircle2 className="h-3 w-3" /> Key saved
          </span>
        )}
      </div>

      <div className="mt-5">
        <label className="mb-1.5 block text-xs font-medium text-slate-600">Provider</label>
        <select value={p.provider} onChange={(e) => p.onProviderChange(e.target.value as ProviderId)}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500">
          {p.providerList.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
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
              <input type="password" value={p.keyValue} onChange={(e) => p.setKeyValue(e.target.value)}
                placeholder={p.hasKey ? "•••••••• (saved)" : "Paste your key"}
                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-sm outline-none focus:border-indigo-500" />
            </div>
            <button onClick={p.onSaveKey} disabled={!p.keyValue || p.saving}
              className="flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50">
              {p.saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
        <button onClick={p.onProbe} disabled={p.probing || (meta.needsKey && !p.hasKey)}
          className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:from-indigo-400 hover:to-purple-500 disabled:opacity-50">
          {p.probing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
          Auto-detect best model
        </button>
        {p.model && (
          <span className="flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-mono text-indigo-700">
            <CheckCircle2 className="h-3 w-3" /> {p.model}
          </span>
        )}
        {p.result && (
          <div className={`flex items-center gap-1 text-xs ${p.result.ok ? "text-emerald-700" : "text-red-700"}`}>
            {p.result.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
            {p.result.msg}
          </div>
        )}
      </div>
    </div>
  );
}
