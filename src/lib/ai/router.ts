import { callProvider, probeBestModel, type ChatMessage, type ChatResult, type ProviderId, type Tier } from "./providers";

export type RouteConfig = {
  tier: Tier;
  primaryProvider: ProviderId;
  primaryKey: string | null;
  primaryModel?: string;
  fallbackProvider?: ProviderId;
  fallbackKey?: string | null;
  fallbackModel?: string;
};

export async function routedCall(
  cfg: RouteConfig, messages: ChatMessage[], maxTokens = 1024
): Promise<ChatResult & { viaFallback: boolean; lastError?: string }> {
  let pModel = cfg.primaryModel;
  if (!pModel) {
    const p = await probeBestModel(cfg.primaryProvider, cfg.tier, cfg.primaryKey);
    if (!p.ok) throw new Error(`Probe failed for ${cfg.primaryProvider}: ${p.error ?? "unknown"} (tried: ${p.tried.join(", ")})`);
    pModel = p.model!;
  }

  let lastError = "";
  try {
    let res;
    try {
      res = await callProvider(cfg.primaryProvider, pModel, cfg.primaryKey, messages, maxTokens);
    } catch (e1) {
      lastError = e1 instanceof Error ? e1.message : String(e1);
      // single retry on transient failure
      res = await callProvider(cfg.primaryProvider, pModel, cfg.primaryKey, messages, maxTokens);
    }
    return { ...res, viaFallback: false };
  } catch (e2) {
    lastError = e2 instanceof Error ? e2.message : String(e2);
    if (cfg.fallbackProvider) {
      let fModel = cfg.fallbackModel;
      if (!fModel) {
        const p = await probeBestModel(cfg.fallbackProvider, cfg.tier, cfg.fallbackKey ?? null);
        if (p.ok) fModel = p.model!;
      }
      if (fModel) {
        try {
          const res = await callProvider(cfg.fallbackProvider, fModel, cfg.fallbackKey ?? null, messages, maxTokens);
          return { ...res, viaFallback: true, lastError };
        } catch (e3) {
          lastError = e3 instanceof Error ? e3.message : String(e3);
        }
      }
    }
    const res = await callProvider("free", "rules-v1", null, messages, maxTokens);
    return { ...res, viaFallback: true, lastError };
  }
}
