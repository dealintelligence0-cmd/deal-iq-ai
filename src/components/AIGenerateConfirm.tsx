

"use client";

import { useState } from "react";
import { Sparkles, Zap, Cpu, X } from "lucide-react";
import { preCallEstimate, tierBadge } from "@/lib/ai/cost-estimator";
import { PROVIDERS, getModelsForTier, type ProviderId } from "@/lib/ai/providers";

type AvailableTier = {
  tier: "premium" | "economic" | "offline";
  provider: string | null;
  model: string | null;
  hasKey: boolean;
};

export default function AIGenerateConfirm({
  open, onClose, onConfirm,
  module, premiumProvider, economicProvider, hasOfflineFallback = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (tier: "premium" | "economic" | "offline", modelOverride?: string) => void;
  module: "proposal" | "pmi" | "synergy" | "tsa";
  premiumProvider: AvailableTier;
  economicProvider: AvailableTier;
  hasOfflineFallback?: boolean;
}) {
  const [premiumModel, setPremiumModel] = useState<string>(premiumProvider.model ?? "");
  const [economicModel, setEconomicModel] = useState<string>(economicProvider.model ?? "");

  if (!open) return null;

  const premiumModels = premiumProvider.provider ? getModelsForTier(premiumProvider.provider as ProviderId, "smart") : [];
  const economicModels = economicProvider.provider ? getModelsForTier(economicProvider.provider as ProviderId, "fast") : [];

  const premiumEst = premiumProvider.provider ? preCallEstimate(premiumProvider.provider, module) : null;
  const economicEst = economicProvider.provider ? preCallEstimate(economicProvider.provider, module) : null;

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
                    <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${tierBadge("premium").color}`}>{tierBadge("premium").label}</span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-purple-800 dark:text-purple-300">
                    {PROVIDERS[premiumProvider.provider as ProviderId]?.label}
                  </p>
                  {premiumModels.length > 1 && (
                    <select value={premiumModel} onChange={(e) => setPremiumModel(e.target.value)}
                      className="mt-1.5 w-full rounded border border-purple-200 bg-white px-2 py-1 text-[11px] dark:border-purple-900/50 dark:bg-slate-900 dark:text-white">
                      {premiumModels.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  )}
                  <p className="mt-1 text-[10px] font-mono text-slate-500">
                    ~{(premiumEst.inputTokens + premiumEst.outputTokens).toLocaleString()} tokens · {premiumEst.costStr}
                  </p>
                  <button onClick={() => onConfirm("premium", premiumModel || undefined)}
                    className="mt-2 w-full rounded bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-700">
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
                    <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${tierBadge("economic").color}`}>{tierBadge("economic").label}</span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-emerald-800 dark:text-emerald-300">
                    {PROVIDERS[economicProvider.provider as ProviderId]?.label}
                  </p>
                  {economicModels.length > 1 && (
                    <select value={economicModel} onChange={(e) => setEconomicModel(e.target.value)}
                      className="mt-1.5 w-full rounded border border-emerald-200 bg-white px-2 py-1 text-[11px] dark:border-emerald-900/50 dark:bg-slate-900 dark:text-white">
                      {economicModels.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  )}
                  <p className="mt-1 text-[10px] font-mono text-slate-500">
                    ~{(economicEst.inputTokens + economicEst.outputTokens).toLocaleString()} tokens · {economicEst.costStr}
                  </p>
                  <button onClick={() => onConfirm("economic", economicModel || undefined)}
                    className="mt-2 w-full rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">
                    Use Economic {economicModel ? `· ${economicModel}` : ""}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* OFFLINE */}
          {hasOfflineFallback && (
            <button onClick={() => onConfirm("offline")}
              className="w-full rounded-lg border-2 border-slate-300 bg-slate-50 p-3 text-left transition hover:border-slate-500 dark:border-slate-700 dark:bg-slate-900/50">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-500">
                  <Cpu className="h-4 w-4 text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900 dark:text-slate-200">Offline (Rule-based)</span>
                    <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${tierBadge("offline").color}`}>{tierBadge("offline").label}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-400">
                    Deterministic template — instant, free, no AI.
                  </p>
                  <p className="mt-1 text-[10px] font-mono text-slate-500">0 tokens · Free · Instant</p>
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

        <button onClick={onClose}
          className="mt-4 w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
          Cancel
        </button>
      </div>
    </div>
  );
}
