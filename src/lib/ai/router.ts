

import { callProvider, type ChatMessage, type ChatResult, type ProviderId, PROVIDERS } from "./providers";

export type RouteConfig = {
  tier: "bulk" | "premium";
  primaryProvider: ProviderId;
  primaryKey: string | null;
  fallbackProvider?: ProviderId;
  fallbackKey?: string | null;
};

export async function routedCall(
  cfg: RouteConfig,
  messages: ChatMessage[],
  maxTokens = 1024
): Promise<ChatResult & { viaFallback: boolean }> {
  const primaryModel =
    cfg.tier === "bulk"
      ? PROVIDERS[cfg.primaryProvider].defaultBulkModel
      : PROVIDERS[cfg.primaryProvider].defaultPremiumModel;
  try {
    const res = await callProvider(cfg.primaryProvider, primaryModel, cfg.primaryKey, messages, maxTokens);
    return { ...res, viaFallback: false };
  } catch (primaryErr) {
    if (!cfg.fallbackProvider) {
      // Last resort: free rules
      const res = await callProvider("free", "rules-v1", null, messages, maxTokens);
      return { ...res, viaFallback: true };
    }
    const fbModel =
      cfg.tier === "bulk"
        ? PROVIDERS[cfg.fallbackProvider].defaultBulkModel
        : PROVIDERS[cfg.fallbackProvider].defaultPremiumModel;
    try {
      const res = await callProvider(cfg.fallbackProvider, fbModel, cfg.fallbackKey ?? null, messages, maxTokens);
      return { ...res, viaFallback: true };
    } catch {
      const res = await callProvider("free", "rules-v1", null, messages, maxTokens);
      return { ...res, viaFallback: true };
    }
  }
}
