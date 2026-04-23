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
        if (!u.user) {
          setLoadError("Not signed in");
          setLoaded(true);
          return;
        }
        const { data: s, error } = await supabase
          .from("ai_settings")
          .select("bulk_provider,premium_provider,bulk_model,premium_model,monthly_budget_usd,usage_current_usd")
          .eq("user_id", u.user.id)
          .maybeSingle();

        if (error) {
          setLoadError(error.message);
          setLoaded(true);
          return;
        }

        // If no row exists, create one with defaults
        let row = s;
        if (!row) {
          const { data: inserted } = await supabase
            .from("ai_settings")
            .insert({ user_id: u.user.id })
            .select("bulk_provider,premium_provider,bulk_model,premium_model,monthly_budget_usd,usage_current_usd")
            .single();
          row = inserted;
        }

        if (row) {
          // Normalize legacy values
          const normalized = {
            ...row,
            bulk_provider: (PROVIDERS as Record<string, unknown>)[row.bulk_provider ?? ""] ? row.bulk_provider : "free",
            premium_provider: (PROVIDERS as Record<string, unknown>)[row.premium_provider ?? ""] ? row.premium_provider : "free",
            monthly_budget_usd: Number(row.monthly_budget_usd ?? 0),
            usage_current_usd: Number(row.usage_current_usd ?? 0),
          } as Settings;
          setSettings(normalized);
        }

        try {
          const [{ data: hb }, { data: hp }] = await Promise.all([
            supabase.rpc("has_ai_key", { p_kind: "bulk" }),
            supabase.rpc("has_ai_key", { p_kind: "premium" }),
          ]);
          setHasKeyFast(Boolean(hb));
          setHasKeySmart(Boolean(hp));
        } catch {
          // RPCs may not exist yet — ignore
        }
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        setLoaded(true);
      }
    })();
  }, [supabase]);

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
      setSettings({
        ...settings,
        [tier === "fast" ? "bulk_model" : "premium_model"]: j.model,
      });
      const msg = { ok: true, msg: `Auto-selected: ${j.model} (tried ${j.tried?.length ?? 0})` };
      if (tier === "fast") setResultFast(msg); else setResultSmart(msg);
    } else {
      const msg = { ok: false, msg: `${j.error ?? "Probe failed"} · tried ${(j.tried ?? []).join(", ")}` };
      if (tier === "fast") setResultFast(msg); else setResultSmart(msg);
    }
    setProbing(null);
  }

  async function savePrefs() {
    if (!settings) return;
    setSavingPrefs(true);
    const { data: u } = await supabase.auth.getUser();
    if (u.user) {
      await supabase.from("ai_settings").u
