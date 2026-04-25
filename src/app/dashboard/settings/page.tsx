

"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PROVIDERS, type ProviderId } from "@/lib/ai/providers";

type Tier = "fast" | "smart";

export default function SettingsPage() {
  const sb = createClient();
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fastProv, setFastProv] = useState<ProviderId>("free");
  const [smartProv, setSmartProv] = useState<ProviderId>("free");
  const [fastModel, setFastModel] = useState<string | null>(null);
  const [smartModel, setSmartModel] = useState<string | null>(null);
  const [fastKey, setFastKey] = useState("");
  const [smartKey, setSmartKey] = useState("");
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    (async () => {
      try {
        const { data: u } = await sb.auth.getUser();
        if (!u.user) { setErr("Not signed in"); setLoaded(true); return; }
        const { data } = await sb.from("ai_settings")
          .select("bulk_provider,premium_provider,bulk_model,premium_model")
          .eq("user_id", u.user.id).maybeSingle();
        if (data) {
          if (PROVIDERS[data.bulk_provider as ProviderId]) setFastProv(data.bulk_provider as ProviderId);
          if (PROVIDERS[data.premium_provider as ProviderId]) setSmartProv(data.premium_provider as ProviderId);
          setFastModel(data.bulk_model ?? null);
          setSmartModel(data.premium_model ?? null);
        } else {
          await sb.from("ai_settings").insert({ user_id: u.user.id });
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : "load failed");
      } finally { setLoaded(true); }
    })();
  }, [sb]);

  async function saveProvider(tier: Tier, p: ProviderId) {
    if (tier === "fast") { setFastProv(p); setFastModel(null); }
    else { setSmartProv(p); setSmartModel(null); }
    const { data: u } = await sb.auth.getUser();
    if (!u.user) return;
    await sb.from("ai_settings").update({
      [tier === "fast" ? "bulk_provider" : "premium_provider"]: p,
      [tier === "fast" ? "bulk_model" : "premium_model"]: null,
    }).eq("user_id", u.user.id);
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
    setStatus(j.ok ? "Key saved." : `Error: ${j.error}`);
    if (j.ok) { if (tier === "fast") setFastKey(""); else setSmartKey(""); }
  }

  async function probe(tier: Tier) {
    const provider = tier === "fast" ? fastProv : smartProv;
    setStatus(`Probing ${tier}...`);
    const r = await fetch("/api/ai/test", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: tier, provider }),
    });
    const j = await r.json();
    if (j.ok) {
      if (tier === "fast") setFastModel(j.model); else setSmartModel(j.model);
      setStatus(`Auto-selected: ${j.model}`);
    } else {
      setStatus(`Probe failed: ${j.error}`);
    }
  }

  if (!loaded) return <div className="p-6">Loading...</div>;
  if (err) return <div className="p-6 text-red-600">{err}</div>;

  const providers = Object.values(PROVIDERS);

  return (
    <div className="max-w-3xl p-2">
      <h1 className="mb-6 text-2xl font-semibold">AI Settings</h1>

      {(["fast", "smart"] as const).map((tier) => {
        const prov = tier === "fast" ? fastProv : smartProv;
        const model = tier === "fast" ? fastModel : smartModel;
        const keyVal = tier === "fast" ? fastKey : smartKey;
        const setKeyVal = tier === "fast" ? setFastKey : setSmartKey;
        const meta = PROVIDERS[prov];
        return (
          <div key={tier} className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="font-semibold capitalize">{tier} Tier</h2>
            <div className="mt-3">
              <label className="text-xs text-slate-600">Provider</label>
              <select value={prov} onChange={(e) => saveProvider(tier, e.target.value as ProviderId)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                {providers.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
              {meta.keyDocsUrl && <a href={meta.keyDocsUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-indigo-600">Get API key →</a>}
            </div>
            {meta.needsKey && (
              <div className="mt-3">
                <label className="text-xs text-slate-600">API Key</label>
                <div className="mt-1 flex gap-2">
                  <input type="password" value={keyVal} onChange={(e) => setKeyVal(e.target.value)}
                    placeholder="Paste key"
                    className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <button onClick={() => saveKey(tier)} className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white">Save</button>
                </div>
              </div>
            )}
            <div className="mt-3 flex items-center gap-3">
              <button onClick={() => probe(tier)}
                className="rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white">Auto-detect</button>
              {model && <span className="rounded bg-indigo-50 px-2 py-1 font-mono text-xs text-indigo-700">{model}</span>}
            </div>
          </div>
        );
      })}
<div className="mb-6 rounded-xl border border-amber-200 bg-amber-50/50 p-5">
        <h2 className="font-semibold">ߔ Web Research (Tavily)</h2>
        <p className="mt-1 text-xs text-slate-600">For Premium AI proposals with live web intelligence. Free tier: 1000 searches/month.</p>
        <a href="https://app.tavily.com/home" target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-indigo-600">Get free Tavily API key →</a>
        <div className="mt-3 flex gap-2">
          <input id="tavily" type="password" placeholder="tvly-..."
            className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          <button onClick={async () => {
            const inp = document.getElementById("tavily") as HTMLInputElement;
            if (!inp?.value) return;
            const r = await fetch("/api/ai/save-tavily-key", {
              method: "POST", headers: { "content-type": "application/json" },
              body: JSON.stringify({ key: inp.value }),
            });
            const j = await r.json();
            setStatus(j.ok ? "Tavily key saved." : `Error: ${j.error}`);
            if (j.ok) inp.value = "";
          }} className="rounded-lg bg-amber-600 px-3 py-2 text-sm text-white">Save Key</button>
        </div>
      </div>
      {status && <div className="rounded-lg bg-slate-100 p-3 text-sm">{status}</div>}
    </div>
  );
}
