

"use client";

import { useState, useEffect } from "react";
import { Sparkles, Zap, Cpu, X, Loader2 } from "lucide-react";
import { preCallEstimate, tierBadge } from "@/lib/ai/cost-estimator";
import { PROVIDERS, getModelsForTier, type ProviderId } from "@/lib/ai/providers";
import { scoreModels, DEFAULT_WEIGHTS_BY_MODULE, type RubricWeights, type ScoredModel } from "@/lib/ai/rubric";

/** De-duplicate model ids while preserving order (recommended first). */
function dedupeModels(xs: string[]): string[] {
  const seen = new Set<string>();
  return xs.filter((x) => {
    const k = x.toLowerCase().replace(/^models\//, "").trim();
    if (!x || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** A key saved in the new API Key Library (provider_keys / GET /api/keys). */
type SavedKey = {
  id: string;
  provider: string;
  label: string;
  default_model: string | null;
  is_default_smart: boolean;
  is_default_economic: boolean;
  is_default_fast: boolean;
};

type AvailableTier = {
  tier: "premium" | "economic" | "offline";
  provider: string | null;
  model: string | null;
  hasKey: boolean;
};

/** A reusable tier card (Premium = smart tier, Economic = economic/fast tier). */
function TierCard({
  tier, providerId, hasKey, keyId, onSelectKey, models, model, onSelectModel, est,
  libraryKeys, usingLibrary, ranked, topId, loadingModels, onConfirm,
}: {
  tier: "premium" | "economic";
  providerId: string | null;
  hasKey: boolean;
  keyId: string;
  onSelectKey: (id: string) => void;
  models: string[];
  model: string;
  onSelectModel: (m: string) => void;
  est: ReturnType<typeof preCallEstimate> | null;
  libraryKeys: SavedKey[];
  usingLibrary: boolean;
  ranked: ScoredModel[];
  topId: string | undefined;
  loadingModels: boolean;
  onConfirm: (tier: "premium" | "economic" | "offline", modelOverride?: string, keyId?: string) => void;
}) {
  if (!hasKey || !providerId || !est) return null;
  const isPremium = tier === "premium";

  const a = isPremium
    ? {
        wrap: "rounded-lg border-2 border-purple-300 bg-gradient-to-br from-purple-50 to-indigo-50 p-3 dark:border-purple-900/50 dark:from-purple-950/30 dark:to-indigo-950/30",
        icon: "bg-gradient-to-br from-purple-500 to-indigo-500",
        title: "text-purple-900 dark:text-purple-200",
        name: "Premium AI",
        sub: "text-purple-800 dark:text-purple-300",
        select: "border-purple-200 dark:border-purple-900/50",
        button: "bg-purple-600 hover:bg-purple-700",
        IconEl: Sparkles,
        badge: tierBadge("premium"),
        label: "Use Premium",
      }
    : {
        wrap: "rounded-lg border-2 border-emerald-300 bg-emerald-50 p-3 dark:border-emerald-900/50 dark:bg-emerald-950/20",
        icon: "bg-emerald-500",
        title: "text-emerald-900 dark:text-emerald-200",
        name: "Economic AI",
        sub: "text-emerald-800 dark:text-emerald-300",
        select: "border-emerald-200 dark:border-emerald-900/50",
        button: "bg-emerald-600 hover:bg-emerald-700",
        IconEl: Zap,
        badge: tierBadge("economic"),
        label: "Use Economic",
      };

  const Icon = a.IconEl;
  const selectedKey = libraryKeys.find((k) => k.id === keyId) ?? null;
  const providerLabel = PROVIDERS[providerId as ProviderId]?.label ?? providerId;

  return (
    <div className={a.wrap}>
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${a.icon}`}>
          <Icon className="h-4 w-4 text-white" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-bold ${a.title}`}>{a.name}</span>
            <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${a.badge.color}`}>
              {a.badge.label}
            </span>
          </div>

          <p className={`mt-0.5 flex items-center gap-1.5 text-[11px] ${a.sub}`}>
            {providerLabel}
            {usingLibrary && selectedKey ? ` · ${selectedKey.label}` : ""}
            {loadingModels && <Loader2 className="h-3 w-3 animate-spin opacity-60" />}
          </p>

          {/* Key picker — every key in the API Key Library is selectable. */}
          {usingLibrary && libraryKeys.length > 1 && (
            <select
              value={keyId}
              onChange={(e) => onSelectKey(e.target.value)}
              className={`mt-1.5 w-full rounded border bg-white px-2 py-1 text-[11px] dark:bg-slate-900 dark:text-white ${a.select}`}
            >
              {libraryKeys.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label} — {PROVIDERS[k.provider as ProviderId]?.label ?? k.provider}
                </option>
              ))}
            </select>
          )}

          {/* Model picker for the selected key's provider. */}
          {models.length > 1 && (
            <select
              value={model}
              onChange={(e) => onSelectModel(e.target.value)}
              className={`mt-1.5 w-full rounded border bg-white px-2 py-1 text-[11px] dark:bg-slate-900 dark:text-white ${a.select}`}
            >
              {models.map((m) => {
                const r = ranked.find((x) => x.modelId === m && x.provider === providerId);
                const star = m === topId ? "★ " : "";
                const reason = r ? ` — ${r.why} (rubric: ${r.totalScore.toFixed(2)})` : "";
                return (
                  <option key={m} value={m}>
                    {star}{m}{reason}
                  </option>
                );
              })}
            </select>
          )}

          <p className="mt-1 text-[10px] font-mono text-slate-500">
            ~{(est.inputTokens + est.outputTokens).toLocaleString()} tokens · {est.costStr}
          </p>

          <button
            onClick={() => onConfirm(tier, model || undefined, usingLibrary ? (keyId || undefined) : undefined)}
            className={`mt-2 w-full rounded px-3 py-1.5 text-xs font-semibold text-white ${a.button}`}
          >
            {a.label} {model ? `· ${model}` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AIGenerateConfirm({
  open, onClose, onConfirm,
  module, premiumProvider, economicProvider,
  hasOfflineFallback = false,
  userWeights,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (tier: "premium" | "economic" | "offline", modelOverride?: string, keyId?: string) => void;
  module: "proposal" | "pmi" | "synergy" | "tsa";
  premiumProvider: AvailableTier;
  economicProvider: AvailableTier;
  hasOfflineFallback?: boolean;
  userWeights?: RubricWeights;
}) {
  // New mode: every key saved in the API Key Library. The modal sources its
  // provider/model choices from here so all saved keys (not just the legacy
  // 3 slots) are selectable. premiumProvider/economicProvider remain as a
  // fallback for users who never migrated to the library.
  const [libraryKeys, setLibraryKeys] = useState<SavedKey[]>([]);
  const [libraryLoaded, setLibraryLoaded] = useState(false);
  const [premiumKeyId, setPremiumKeyId] = useState<string>("");
  const [economicKeyId, setEconomicKeyId] = useState<string>("");

  const [premiumModel, setPremiumModel] = useState<string>(premiumProvider.model ?? "");
  const [economicModel, setEconomicModel] = useState<string>(economicProvider.model ?? "");

  const [premiumModels, setPremiumModels] = useState<string[]>([]);
  const [economicModels, setEconomicModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  // Whether we render from the new key library or the legacy tier props.
  const usingLibrary = libraryLoaded && libraryKeys.length > 0;

  const premiumKey = libraryKeys.find((k) => k.id === premiumKeyId) ?? null;
  const economicKey = libraryKeys.find((k) => k.id === economicKeyId) ?? null;

  // Effective provider/model/hasKey per tier — from the library when available,
  // otherwise the legacy props.
  const premiumProviderId = usingLibrary ? (premiumKey?.provider ?? null) : premiumProvider.provider;
  const economicProviderId = usingLibrary ? (economicKey?.provider ?? null) : economicProvider.provider;
  const premiumSeedModel = usingLibrary ? (premiumKey?.default_model ?? null) : premiumProvider.model;
  const economicSeedModel = usingLibrary ? (economicKey?.default_model ?? null) : economicProvider.model;
  const premiumHasKey = usingLibrary ? !!premiumKey : premiumProvider.hasKey;
  const economicHasKey = usingLibrary ? !!economicKey : economicProvider.hasKey;

  // Fetch the full key library when the modal opens, then pick sensible
  // defaults (tier defaults marked in Settings, falling back to the first key).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    (async () => {
      try {
        const r = await fetch("/api/keys");
        const j = (await r.json()) as { keys?: SavedKey[] };
        if (cancelled) return;
        const ks = j.keys ?? [];
        setLibraryKeys(ks);
        setLibraryLoaded(true);
        if (ks.length) {
          const smart = ks.find((k) => k.is_default_smart) ?? ks[0];
          const econ =
            ks.find((k) => k.is_default_economic) ??
            ks.find((k) => k.id !== smart.id) ??
            ks[0];
          setPremiumKeyId((prev) => prev || smart.id);
          setEconomicKeyId((prev) => prev || econ.id);
        }
      } catch {
        if (!cancelled) setLibraryLoaded(true);
      }
    })();

    return () => { cancelled = true; };
  }, [open]);

  // Fetch the live model list for each tier's selected provider. Re-runs when
  // the user switches the selected key (and therefore the provider) for a tier.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    async function loadModels(provider: string | null, tier: "smart" | "fast"): Promise<string[]> {
      if (!provider || provider === "free") return [];
      const curated = getModelsForTier(provider as ProviderId, tier);
      try {
        const res = await fetch("/api/ai/models", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tier, provider }),
        });
        if (!res.ok) return curated;
        const j = (await res.json()) as { candidates?: string[]; all?: string[]; live?: boolean };
        // Recommended candidates first, then every other live model the provider offers.
        const live = dedupeModels([...(j.candidates ?? []), ...(j.all ?? [])]);
        return live.length ? live : curated;
      } catch {
        return curated;
      }
    }

    (async () => {
      setLoadingModels(true);
      const [prem, econ] = await Promise.all([
        loadModels(premiumProviderId, "smart"),
        loadModels(economicProviderId, "fast"),
      ]);
      if (cancelled) return;

      // Lead with the key's saved default model (if the provider still offers it).
      const premFinal = dedupeModels([...(premiumSeedModel ? [premiumSeedModel] : []), ...prem]);
      const econFinal = dedupeModels([...(economicSeedModel ? [economicSeedModel] : []), ...econ]);

      setPremiumModels(premFinal);
      setPremiumModel((cur) =>
        cur && premFinal.includes(cur) ? cur
          : premiumSeedModel && premFinal.includes(premiumSeedModel) ? premiumSeedModel
          : premFinal[0] ?? "");

      setEconomicModels(econFinal);
      setEconomicModel((cur) =>
        cur && econFinal.includes(cur) ? cur
          : economicSeedModel && econFinal.includes(economicSeedModel) ? economicSeedModel
          : econFinal[0] ?? "");

      setLoadingModels(false);
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, premiumProviderId, economicProviderId, premiumSeedModel, economicSeedModel]);

  // When the selected key changes, reset the model so the new provider's list takes over.
  function selectPremiumKey(id: string) {
    setPremiumKeyId(id);
    setPremiumModel("");
  }
  function selectEconomicKey(id: string) {
    setEconomicKeyId(id);
    setEconomicModel("");
  }

  if (!open) return null;

  const premiumEst = premiumProviderId ? preCallEstimate(premiumProviderId, module) : null;
  const economicEst = economicProviderId ? preCallEstimate(economicProviderId, module) : null;

  // Score all available models against rubric weights
  const allAvailable = [
    ...premiumModels.map((m) => ({ provider: premiumProviderId as string, modelId: m })),
    ...economicModels.map((m) => ({ provider: economicProviderId as string, modelId: m })),
  ].filter((m) => m.provider);

  const weights: RubricWeights =
    userWeights ??
    DEFAULT_WEIGHTS_BY_MODULE[module] ??
    DEFAULT_WEIGHTS_BY_MODULE.proposal;

  const ranked: ScoredModel[] = scoreModels(allAvailable, weights);

  const topId = ranked[0]?.modelId;

  const moduleNames = { proposal: "Proposal", pmi: "PMI Plan", synergy: "Synergy Model", tsa: "TSA Framework" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="card relative max-w-lg w-full p-6">
        <button onClick={onClose} className="absolute right-3 top-3 rounded p-1 hover:bg-slate-100 dark:hover:bg-white/5">
          <X className="h-4 w-4 text-slate-400" />
        </button>

        <h2 className="text-base font-semibold text-slate-900 dark:text-white">AI Generation — Token Usage Reminder</h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          You&apos;re about to generate a {moduleNames[module]}. Pick tier and model:
        </p>

        <div className="mt-4 space-y-2">

          {/* PREMIUM */}
          <TierCard
            tier="premium"
            providerId={premiumProviderId}
            hasKey={premiumHasKey}
            keyId={premiumKeyId}
            onSelectKey={selectPremiumKey}
            models={premiumModels}
            model={premiumModel}
            onSelectModel={setPremiumModel}
            est={premiumEst}
            libraryKeys={libraryKeys}
            usingLibrary={usingLibrary}
            ranked={ranked}
            topId={topId}
            loadingModels={loadingModels}
            onConfirm={onConfirm}
          />

          {/* ECONOMIC */}
          <TierCard
            tier="economic"
            providerId={economicProviderId}
            hasKey={economicHasKey}
            keyId={economicKeyId}
            onSelectKey={selectEconomicKey}
            models={economicModels}
            model={economicModel}
            onSelectModel={setEconomicModel}
            est={economicEst}
            libraryKeys={libraryKeys}
            usingLibrary={usingLibrary}
            ranked={ranked}
            topId={topId}
            loadingModels={loadingModels}
            onConfirm={onConfirm}
          />

          {/* OFFLINE */}
          {hasOfflineFallback && (
            <button
              onClick={() => onConfirm("offline")}
              className="w-full rounded-lg border-2 border-slate-300 bg-slate-50 p-3 text-left transition hover:border-slate-500 dark:border-slate-700 dark:bg-slate-900/50"
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-500">
                  <Cpu className="h-4 w-4 text-white" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900 dark:text-slate-200">Offline (Rule-based)</span>
                    <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${tierBadge("offline").color}`}>
                      {tierBadge("offline").label}
                    </span>
                  </div>

                  <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-400">
                    Deterministic template — instant, free, no AI.
                  </p>

                  <p className="mt-1 text-[10px] font-mono text-slate-500">
                    0 tokens · Free · Instant
                  </p>
                </div>
              </div>
            </button>
          )}

          {!premiumHasKey && !economicHasKey && !hasOfflineFallback && (
            <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
              No AI providers configured. <a href="/dashboard/settings" className="font-medium underline">Save a key in Settings</a> first.
            </div>
          )}
        </div>

        <details className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
          <summary className="cursor-pointer font-medium">
            How models are ranked (rubric)
          </summary>

          <div className="mt-2 space-y-1.5">
            <p className="text-[10px] opacity-75">
              Weights for {module}: cost {Math.round(weights.cost * 100)}%
              · quality {Math.round(weights.quality * 100)}%
              · latency {Math.round(weights.latency * 100)}%
              · context {Math.round(weights.context * 100)}%
              · caching {Math.round(weights.caching * 100)}%.
              Edit in Settings → AI → Rubric.
            </p>

            <table className="w-full text-[10px]">
              <thead>
                <tr className="text-slate-500">
                  <th className="text-left">Model</th>
                  <th>Score</th>
                  <th className="text-left">Why</th>
                </tr>
              </thead>

              <tbody>
                {ranked.slice(0, 8).map((r) => (
                  <tr
                    key={r.provider + "/" + r.modelId}
                    className={
                      r.modelId === topId
                        ? "font-medium text-slate-900 dark:text-slate-100"
                        : ""
                    }
                  >
                    <td className="py-0.5 pr-2">
                      <span className="opacity-50">
                        {r.provider}/
                      </span>
                      {r.modelId}
                    </td>

                    <td className="text-center font-mono">
                      {r.totalScore.toFixed(2)}
                    </td>

                    <td className="pl-2 opacity-75">
                      {r.why}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>

        <button
          onClick={onClose}
          className="mt-4 w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
