

"use client";

import { useEffect, useState } from "react";
import {
  Settings as SettingsIcon,
  KeyRound,
  CheckCircle2,
  XCircle,
  Loader2,
  Zap,
  Sparkles,
  Save,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PROVIDERS, type ProviderId } from "@/lib/ai/providers";

type Tier = "bulk" | "premium";

type Settings = {
  bulk_provider: ProviderId;
  premium_provider: ProviderId;
  monthly_budget_usd: number;
  usage_current_usd: number;
};

export default function AISettingsPage() {
  const supabase = createClient();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [hasBulkKey, setHasBulkKey] = useState(false);
  const [hasPremiumKey, setHasPremiumKey] = useState(false);
  const [bulkKey, setBulkKey] = useState("");
  const [premiumKey, setPremiumKey] = useState("");
  const [savingKind, setSavingKind] = useState<Tier | null>(null);
  const [testing, setTesting] = useState<Tier | null>(null);
  const [testResult, setTestResult] = useState<Record<Tier, { ok: boolean; msg: string } | null>>({ bulk: null, premium: null });
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data: s } = await supabase
        .from("ai_settings")
        .select("bulk_provider,premium_provider,monthly_budget_usd,usage_current_usd")
        .eq("user_id", u.user.id)
        .single();
      if (s) setSettings(s as Settings);
      const [{ data: hb }, { data: hp }] = await Promise.all([
        supabase.rpc("has_ai_key", { p_kind: "bulk" }),
        supabase.rpc("has_ai_key", { p_kind: "premium" }),
      ]);
      setHasBulkKey(Boolean(hb));
      setHasPremiumKey(Boolean(hp));
      setLoaded(true);
    })();
  }, [supabase]);

  async function saveKey(kind: Tier) {
    const key = kind === "bulk" ? bulkKey : premiumKey;
    if (!key.trim()) return;
    setSavingKind(kind);
    const res = await fetch("/api/ai/save-key", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, key: key.trim() }),
    });
    const j = await res.json();
    if (j.ok) {
      if (kind === "bulk") { setBulkKey(""); setHasBulkKey(true); }
      else { setPremiumKey(""); setHasPremiumKey(true); }
      setTestResult((p) => ({ ...p, [kind]: { ok: true, msg: "Key saved securely." } }));
    } else {
      setTestResult((p) => ({ ...p, [kind]: { ok: false, msg: j.error ?? "Save failed" } }));
    }
    setSavingKind(null);
  }

  async function testConnection(kind: Tier) {
    if (!settings) return;
    const provider = kind === "bulk" ? settings.bulk_provider : settings.premium_provider;
    setTesting(kind);
    setTestResult((p) => ({ ...p, [kind]: null }));
    const res = await fetch("/api/ai/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, provider }),
    });
    const j = await res.json();
    if (j.ok) {
      setTestResult((p) => ({
        ...p,
        [kind]: {
          ok: true,
          msg: `${j.model} · ${j.inputTokens}+${j.outputTokens} tok · $${j.costUsd.toFixed(6)}`,
        },
      }));
    } else {
      setTestResult((p) => ({ ...p, [kind]: { ok: false, msg: j.error ?? "Test failed" } }));
    }
    setTesting(null);
  }

  async function savePrefs() {
    if (!settings) return;
    setSavingPrefs(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    await supabase
      .from("ai_settings")
      .update({
        bulk_provider: settings.bulk_provider,
        premium_provider: settings.premium_provider,
        monthly_budget_usd: settings.monthly_budget_usd,
      })
      .eq("user_id", u.user.id);
    setSavingPrefs(false);
  }

  if (!loaded || !settings) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
      </div>
    );
  }

  const budgetPct =
    settings.monthly_budget_usd > 0
      ? Math.min(100, (settings.usage_current_usd / settings.monthly_budget_usd) * 100)
      : 0;

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <SettingsIcon className="h-6 w-6 text-indigo-600" />
          AI Settings
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Configure providers for bulk enrichment and premium proposals. Keys are encrypted at rest.
        </p>
      </div>

      {/* Tier cards */}
      {(["bulk", "premium"] as const).map((kind) => {
        const isBulk = kind === "bulk";
        const provider = isBulk ? settings.bulk_provider : settings.premium_provider;
        const hasKey = isBulk ? hasBulkKey : hasPremiumKey;
        const key = isBulk ? bulkKey : premiumKey;
        const setKey = isBulk ? setBulkKey : setPremiumKey;
        const Icon = isBulk ? Zap : Sparkles;
        const r = testResult[kind];
        const meta = PROVIDERS[provider];
        return (
          <div key={kind} className="mb-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${isBulk ? "bg-emerald-50 text-emerald-600" : "bg-purple-50 text-purple-600"}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  {isBulk ? "Bulk Enrichment" : "Premium Proposals"}
                </h2>
                <p className="text-xs text-slate-500">
                  {isBulk ? "High-volume, low-cost for row-level tasks" : "Deep reasoning for long-form deliverables"}
                </p>
              </div>
              {hasKey && (
                <span className="ml-auto flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                  <CheckCircle2 className="h-3 w-3" /> Key saved
                </span>
              )}
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600">Provider</label>
                <select
                  value={provider}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      [isBulk ? "bulk_provider" : "premium_provider"]: e.target.value as ProviderId,
                    })
                  }
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500"
                >
                  {Object.values(PROVIDERS).map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
                <div className="mt-1 text-xs text-slate-500">
                  Default model: {isBulk ? meta.defaultBulkModel : meta.defaultPremiumModel}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600">
                  API Key {!meta.needsKey && "(not required for free tier)"}
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <KeyRound className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="password"
                      value={key}
                      onChange={(e) => setKey(e.target.value)}
                      placeholder={hasKey ? "•••••••• (saved)" : meta.needsKey ? "Paste your key" : "N/A"}
                      disabled={!meta.needsKey}
                      className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-sm outline-none focus:border-indigo-500 disabled:bg-slate-50"
                    />
                  </div>
                  <button
                    onClick={() => saveKey(kind)}
                    disabled={!meta.needsKey || !key || savingKind === kind}
                    className="flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    {savingKind === kind ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    Save
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-3 border-t border-slate-100 pt-4">
              <button
                onClick={() => testConnection(kind)}
                disabled={testing === kind || (meta.needsKey && !hasKey && !key)}
                className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:from-indigo-400 hover:to-purple-500 disabled:opacity-50"
              >
                {testing === kind ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                Test Connection
              </button>
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

      {/* Budget + fallback */}
      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Budget & Fallback</h2>
        <p className="mt-1 text-xs text-slate-500">
          When a primary provider fails, the router falls back to the other tier's provider, then to free rules.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600">Monthly budget ($USD)</label>
            <input
              type="number"
              value={settings.monthly_budget_usd}
              onChange={(e) =>
                setSettings({ ...settings, monthly_budget_usd: Number(e.target.value) || 0 })
              }
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
              <div
                className={`h-full transition-all ${budgetPct > 90 ? "bg-red-500" : budgetPct > 70 ? "bg-amber-500" : "bg-indigo-500"}`}
                style={{ width: `${budgetPct}%` }}
              />
            </div>
            <div className="mt-1 text-xs text-slate-500">{budgetPct.toFixed(1)}% of budget used</div>
          </div>
        )}

        <button
          onClick={savePrefs}
          disabled={savingPrefs}
          className="mt-5 flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {savingPrefs ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save preferences
        </button>
      </div>
    </div>
  );
}
