

"use client";

import { useEffect, useState } from "react";
import { Trash2, Plus, Loader2, KeyRound, Star } from "lucide-react";
import { PROVIDERS, type ProviderId } from "@/lib/ai/providers";

type SavedKey = {
  id: string;
  provider: string;
  label: string;
  default_model: string | null;
  is_default_smart: boolean;
  is_default_economic: boolean;
  is_default_fast: boolean;
  created_at: string;
  last_used_at: string | null;
};

export default function KeyLibraryManager() {
  const [keys, setKeys] = useState<SavedKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [newProvider, setNewProvider] = useState<ProviderId>("anthropic");
  const [newLabel, setNewLabel] = useState("");
  const [newKey, setNewKey] = useState("");
  const [newModel, setNewModel] = useState("");
  const [newAsSmart, setNewAsSmart] = useState(false);
  const [newAsEconomic, setNewAsEconomic] = useState(false);
  const [newAsFast, setNewAsFast] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/keys");
      const j = await r.json();
      if (j.keys) setKeys(j.keys);
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function addKey() {
    if (!newLabel.trim() || !newKey.trim()) {
      setErr("Label and API key are both required.");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const r = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: newProvider,
          label: newLabel.trim(),
          key: newKey.trim(),
          default_model: newModel.trim() || null,
          is_default_smart: newAsSmart,
          is_default_economic: newAsEconomic,
          is_default_fast: newAsFast,
        }),
      });
      const j = await r.json();
      if (!r.ok || j.error) { setErr(j.error ?? "Failed to save"); return; }
      setNewLabel(""); setNewKey(""); setNewModel("");
      setNewAsSmart(false); setNewAsEconomic(false); setNewAsFast(false);
      setAddOpen(false);
      await load();
    } catch (e) {
      setErr(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function deleteKey(id: string) {
    if (!confirm("Delete this API key? This cannot be undone.")) return;
    const r = await fetch(`/api/keys/${id}`, { method: "DELETE" });
    if (r.ok) await load();
  }

  async function toggleDefault(id: string, tier: "smart" | "economic" | "fast", value: boolean) {
    const field = tier === "smart" ? "is_default_smart" : tier === "economic" ? "is_default_economic" : "is_default_fast";
    await fetch(`/api/keys/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    await load();
  }

  const providerOptions = Object.entries(PROVIDERS).filter(([id]) => id !== "free").map(([id, p]) => ({ id: id as ProviderId, label: p.label }));
  const candidateModels = newProvider && PROVIDERS[newProvider]
    ? Array.from(new Set([...PROVIDERS[newProvider].smartCandidates, ...PROVIDERS[newProvider].fastCandidates]))
    : [];

  return (
    <section className="card p-5 border-l-4 border-l-emerald-500">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-emerald-600" />
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">API Key Library</h2>
        </div>
        <button
          onClick={() => setAddOpen(!addOpen)}
          className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
        >
          <Plus className="h-3 w-3" /> Add Key
        </button>
      </div>
      <p className="mb-4 text-xs text-slate-600 dark:text-slate-400">
        Save unlimited API keys across providers. Label each one. Mark a default per tier (Smart / Economic / Fast). Switch keys per generation from the modal. Delete any key anytime — no slot limit.
      </p>

      {addOpen && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50/40 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/10">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-medium text-slate-700 dark:text-slate-300">Provider</label>
              <select
                value={newProvider}
                onChange={(e) => setNewProvider(e.target.value as ProviderId)}
                className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-white/10 dark:bg-[#15151f] dark:text-slate-200"
              >
                {providerOptions.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-medium text-slate-700 dark:text-slate-300">Label (your name for this key)</label>
              <input
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="e.g. Firm Anthropic Production"
                className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-white/10 dark:bg-[#15151f] dark:text-slate-200"
              />
            </div>
          </div>
          <div className="mt-3">
            <label className="text-[11px] font-medium text-slate-700 dark:text-slate-300">API Key</label>
            <input
              type="password"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="sk-..."
              className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-xs font-mono dark:border-white/10 dark:bg-[#15151f] dark:text-slate-200"
            />
          </div>
          <div className="mt-3">
            <label className="text-[11px] font-medium text-slate-700 dark:text-slate-300">Default Model (optional)</label>
            <select
              value={newModel}
              onChange={(e) => setNewModel(e.target.value)}
              className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-white/10 dark:bg-[#15151f] dark:text-slate-200"
            >
              <option value="">(no default)</option>
              {candidateModels.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-[11px]">
            <label className="flex items-center gap-1 text-slate-700 dark:text-slate-300">
              <input type="checkbox" checked={newAsSmart} onChange={(e) => setNewAsSmart(e.target.checked)} className="h-3 w-3" />
              Set as Smart default
            </label>
            <label className="flex items-center gap-1 text-slate-700 dark:text-slate-300">
              <input type="checkbox" checked={newAsEconomic} onChange={(e) => setNewAsEconomic(e.target.checked)} className="h-3 w-3" />
              Set as Economic default
            </label>
            <label className="flex items-center gap-1 text-slate-700 dark:text-slate-300">
              <input type="checkbox" checked={newAsFast} onChange={(e) => setNewAsFast(e.target.checked)} className="h-3 w-3" />
              Set as Fast default
            </label>
          </div>
          {err && <p className="mt-2 text-[11px] text-red-600">{err}</p>}
          <div className="mt-3 flex justify-end gap-2">
            <button
              onClick={() => { setAddOpen(false); setErr(null); }}
              className="rounded-md border border-slate-200 px-3 py-1.5 text-xs text-slate-700 dark:border-white/10 dark:text-slate-300"
            >
              Cancel
            </button>
            <button
              onClick={addKey}
              disabled={saving}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save key"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading…
        </div>
      ) : keys.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-500 dark:border-white/10 dark:bg-white/5">
          No keys saved yet. Click <strong>Add Key</strong> to save your first one.
        </p>
      ) : (
        <div className="space-y-2">
          {keys.map((k) => {
            const provLabel = PROVIDERS[k.provider as ProviderId]?.label ?? k.provider;
            return (
              <div key={k.id} className="rounded-lg border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-white/5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-900 dark:text-white">
                      {k.label}
                      <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium text-slate-600 dark:bg-white/10 dark:text-slate-300">
                        {provLabel}
                      </span>
                      {k.default_model && (
                        <span className="ml-1 text-[10px] text-slate-500">· {k.default_model}</span>
                      )}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-2 text-[10px]">
                      <button
                        onClick={() => toggleDefault(k.id, "smart", !k.is_default_smart)}
                        className={`flex items-center gap-1 rounded px-1.5 py-0.5 ${k.is_default_smart ? "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300" : "border border-slate-200 text-slate-500 dark:border-white/10"}`}
                      >
                        {k.is_default_smart && <Star className="h-2.5 w-2.5 fill-current" />} Smart default
                      </button>
                      <button
                        onClick={() => toggleDefault(k.id, "economic", !k.is_default_economic)}
                        className={`flex items-center gap-1 rounded px-1.5 py-0.5 ${k.is_default_economic ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "border border-slate-200 text-slate-500 dark:border-white/10"}`}
                      >
                        {k.is_default_economic && <Star className="h-2.5 w-2.5 fill-current" />} Economic default
                      </button>
                      <button
                        onClick={() => toggleDefault(k.id, "fast", !k.is_default_fast)}
                        className={`flex items-center gap-1 rounded px-1.5 py-0.5 ${k.is_default_fast ? "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" : "border border-slate-200 text-slate-500 dark:border-white/10"}`}
                      >
                        {k.is_default_fast && <Star className="h-2.5 w-2.5 fill-current" />} Fast default
                      </button>
                    </div>
                    <p className="mt-1 text-[10px] text-slate-400">
                      Added {new Date(k.created_at).toLocaleDateString()}
                      {k.last_used_at && ` · Last used ${new Date(k.last_used_at).toLocaleDateString()}`}
                    </p>
                  </div>
                  <button
                    onClick={() => deleteKey(k.id)}
                    className="rounded-md p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                    title="Delete this key permanently"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
