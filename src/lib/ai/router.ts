

import { callProvider, probeBestModel, type ChatMessage, type ChatResult, type ProviderId, type Tier } from "./providers";

export type RouteConfig = {
  tier: Tier;
  primaryProvider: ProviderId;
  primaryKey: string | null;
  primaryModel?: string;           // resolved at Save time
  fallbackProvider?: ProviderId;
  fallbackKey?: string | null;
  fallbackModel?: string;
};

export async function routedCall(
  cfg: RouteConfig, messages: ChatMessage[], maxTokens = 1024
): Promise<ChatResult & { viaFallback: boolean }> {
  // Use cached model if we have it; else probe on demand.
  let pModel = cfg.primaryModel;
  if (!pModel) {
    const p = await probeBestModel(cfg.primaryProvider, cfg.tier, cfg.primaryKey);
    if (!p.ok) throw new Error(p.error ?? "probe failed");
    pModel = p.model!;
  }
  try {
    const res = await callProvider(cfg.primaryProvider, pModel, cfg.primaryKey, messages, maxTokens);
    return { ...res, viaFallback: false };
  } catch {
    if (cfg.fallbackProvider) {
      let fModel = cfg.fallbackModel;
      if (!fModel) {
        const p = await probeBestModel(cfg.fallbackProvider, cfg.tier, cfg.fallbackKey ?? null);
        if (p.ok) fModel = p.model!;
      }
      if (fModel) {
        try {
          const res = await callProvider(cfg.fallbackProvider, fModel, cfg.fallbackKey ?? null, messages, maxTokens);
          return { ...res, viaFallback: true };
        } catch { /* fall through */ }
      }
    }
    const res = await callProvider("free", "rules-v1", null, messages, maxTokens);
    return { ...res, viaFallback: true };
  }
}
