

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

type AvailableTier = {
  tier: "premium" | "economic" | "offline";
  provider: string | null;
  model: string | null;
  hasKey: boolean;
};

export default function AIGenerateConfirm({
  open, onClose, onConfirm,
  module, premiumProvider, economicProvider,
  hasOfflineFallback = false,
  userWeights,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (tier: "premium" | "economic" | "offline", modelOverride?: string) => void;
  module: "proposal" | "pmi" | "synergy" | "tsa";
  premiumProvider: AvailableTier;
  economicProvider: AvailableTier;
  hasOfflineFallback?: boolean;
  userWeights?: RubricWeights;
}) {
  const [premiumModel, setPremiumModel] = useState<string>(premiumProvider.model ?? "");
  const [economicModel, setEconomicModel] = useState<string>(economicProvider.model ?? "");

  // Live model lists. Seeded with the curated picks so the modal renders instantly,
  // then replaced with the provider's full active model list fetched from
  // /api/ai/models (so newer models like Gemini 3.x appear without a code change).
  const curatedPremium = premiumProvider.provider ? getModelsForTier(premiumProvider.provider as ProviderId, "smart") : [];
  const curatedEconomic = economicProvider.provider ? getModelsForTier(economicProvider.provider as ProviderId, "fast") : [];
  const [premiumModels, setPremiumModels] = useState<string[]>(curatedPremium);
  const [economicModels, setEconomicModels] = useState<string[]>(curatedEconomic);
  const [loadingModels, setLoadingModels] = useState(false);

  // Fetch the full, live model list for each configured tier when the modal opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    async function loadModels(provider: string | null, tier: "smart" | "fast"): Promise<string[]> {
      if (!provider || provider === "free") return [];
      try {
        const res = await fetch("/api/ai/models", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tier, provider }),
        });
        if (!res.ok) return [];
        const j = (await res.json()) as { candidates?: string[]; all?: string[]; live?: boolean };
        // Recommended candidates first, then every other live model the provider offers.
        return dedupeModels([...(j.candidates ?? []), ...(j.all ?? [])]);
      } catch {
        return [];
      }
    }

    (async () => {
      setLoadingModels(true);
      const [prem, econ] = await Promise.all([
        loadModels(premiumProvider.provider, "smart"),
        loadModels(economicProvider.provider, "fast"),
      ]);
      if (cancelled) return;
      if (prem.length) {
        setPremiumModels(prem);
        // Keep the saved model if it's still offered, otherwise lead with the top recommendation.
        setPremiumModel((cur) => (cur && prem.includes(cur) ? cur : prem[0]));
      }
      if (econ.length) {
        setEconomicModels(econ);
        setEconomicModel((cur) => (cur && econ.includes(cur) ? cur : econ[0]));
      }
      setLoadingModels(false);
    })();

    return () => { cancelled = true; };
  }, [open, premiumProvider.provider, economicProvider.provider]);

  if (!open) return null;

  const premiumEst = premiumProvider.provider ? preCallEstimate(premiumProvider.provider, module) : null;
  const economicEst = economicProvider.provider ? preCallEstimate(economicProvider.provider, module) : null;

  // Score all available models against rubric weights
  const allAvailable = [
    ...premiumModels.map((m) => ({
      provider: premiumProvider.provider as string,
      modelId: m,
    })),
    ...economicModels.map((m) => ({
      provider: economicProvider.provider as string,
      modelId: m,
    })),
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
          {premiumProvider.hasKey && premiumProvider.provider && premiumEst && (
            <div className="rounded-lg border-2 border-purple-300 bg-gradient-to-br from-purple-50 to-indigo-50 p-3 dark:border-purple-900/50 dark:from-purple-950/30 dark:to-indigo-950/30">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-indigo-500">
                  <Sparkles className="h-4 w-4 text-white" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-purple-900 dark:text-purple-200">Premium AI</span>
                    <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${tierBadge("premium").color}`}>
                      {tierBadge("premium").label}
                    </span>
                  </div>

                  <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-purple-800 dark:text-purple-300">
                    {PROVIDERS[premiumProvider.provider as ProviderId]?.label}
                    {loadingModels && <Loader2 className="h-3 w-3 animate-spin opacity-60" />}
                  </p>

                  {premiumModels.length > 1 && (
                    <select
                      value={premiumModel}
                      onChange={(e) => setPremiumModel(e.target.value)}
                      className="mt-1.5 w-full rounded border border-purple-200 bg-white px-2 py-1 text-[11px] dark:border-purple-900/50 dark:bg-slate-900 dark:text-white"
                    >
                      {premiumModels.map((m) => {
                        const r = ranked.find(
                          (x) =>
                            x.modelId === m &&
                            x.provider === premiumProvider.provider
                        );

                        const star = m === topId ? "★ " : "";

                        const reason = r
                          ? ` — ${r.why} (rubric: ${r.totalScore.toFixed(2)})`
                          : "";

                        return (
                          <option key={m} value={m}>
                            {star}{m}{reason}
                          </option>
                        );
                      })}
                    </select>
                  )}

                  <p className="mt-1 text-[10px] font-mono text-slate-500">
                    ~{(premiumEst.inputTokens + premiumEst.outputTokens).toLocaleString()} tokens · {premiumEst.costStr}
                  </p>

                  <button
                    onClick={() => onConfirm("premium", premiumModel || undefined)}
                    className="mt-2 w-full rounded bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-700"
                  >
                    Use Premium {premiumModel ? `· ${premiumModel}` : ""}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ECONOMIC */}
          {economicProvider.hasKey && economicProvider.provider && economicEst && (
            <div className="rounded-lg border-2 border-emerald-300 bg-emerald-50 p-3 dark:border-emerald-900/50 dark:bg-emerald-950/20">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500">
                  <Zap className="h-4 w-4 text-white" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-emerald-900 dark:text-emerald-200">Economic AI</span>
                    <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${tierBadge("economic").color}`}>
                      {tierBadge("economic").label}
                    </span>
                  </div>

                  <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-emerald-800 dark:text-emerald-300">
                    {PROVIDERS[economicProvider.provider as ProviderId]?.label}
                    {loadingModels && <Loader2 className="h-3 w-3 animate-spin opacity-60" />}
                  </p>

                  {economicModels.length > 1 && (
                    <select
                      value={economicModel}
                      onChange={(e) => setEconomicModel(e.target.value)}
                      className="mt-1.5 w-full rounded border border-emerald-200 bg-white px-2 py-1 text-[11px] dark:border-emerald-900/50 dark:bg-slate-900 dark:text-white"
                    >
                      {economicModels.map((m) => {
                        const r = ranked.find(
                          (x) =>
                            x.modelId === m &&
                            x.provider === economicProvider.provider
                        );

                        const star = m === topId ? "★ " : "";

                        const reason = r
                          ? ` — ${r.why} (rubric: ${r.totalScore.toFixed(2)})`
                          : "";

                        return (
                          <option key={m} value={m}>
                            {star}{m}{reason}
                          </option>
                        );
                      })}
                    </select>
                  )}

                  <p className="mt-1 text-[10px] font-mono text-slate-500">
                    ~{(economicEst.inputTokens + economicEst.outputTokens).toLocaleString()} tokens · {economicEst.costStr}
                  </p>

                  <button
                    onClick={() => onConfirm("economic", economicModel || undefined)}
                    className="mt-2 w-full rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                  >
                    Use Economic {economicModel ? `· ${economicModel}` : ""}
                  </button>
                </div>
              </div>
            </div>
          )}

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

          {!premiumProvider.hasKey && !economicProvider.hasKey && !hasOfflineFallback && (
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
