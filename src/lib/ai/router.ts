

import { callProvider, probeBestModel, type ChatMessage, type ChatResult, type ProviderId, type Tier } from "./providers";
import { recordAiEvent, classifyFailure, type TelemetryContext } from "./telemetry";

export type RouteConfig = {
  tier: Tier;
  primaryProvider: ProviderId;
  primaryKey: string | null;
  primaryModel?: string;
  fallbackProvider?: ProviderId;
  fallbackKey?: string | null;
  fallbackModel?: string;
  blockFreeFallback?: boolean;
  // PHASE 7A (measurement only): optional attribution for telemetry. Purely additive —
  // when omitted the call is recorded as module/operation "unattributed" and behaves
  // exactly as before. Setting it never changes routing, retries, or output.
  telemetry?: TelemetryContext;
};

export async function routedCall(
  cfg: RouteConfig, messages: ChatMessage[], maxTokens = 1024
): Promise<ChatResult & { viaFallback: boolean; lastError?: string }> {
  // PHASE 7A: record-only helper. Never throws, never awaited — cannot affect routing.
  const ctx = cfg.telemetry ?? { module: "unattributed", operation: "unattributed" };
  const emit = (
    decision: "cloud" | "cloud_fallback",
    res: ChatResult | null,
    startedAt: number,
    provider: string,
    model: string | undefined,
    reason: ReturnType<typeof classifyFailure> | null,
  ) => {
    recordAiEvent({
      ...ctx,
      decision,
      provider: res?.provider ?? provider,
      model: res?.model ?? model ?? null,
      tier: cfg.tier,
      inputTokens: res?.inputTokens ?? 0,
      outputTokens: res?.outputTokens ?? 0,
      cachedInputTokens: res?.cachedInputTokens ?? 0,
      latencyMs: Date.now() - startedAt,
      fallbackReason: reason,
    });
  };

  let pModel = cfg.primaryModel;
  if (!pModel) {
    const p = await probeBestModel(cfg.primaryProvider, cfg.tier, cfg.primaryKey);
    if (!p.ok) throw new Error(`Probe failed for ${cfg.primaryProvider}: ${p.error ?? "unknown"} (tried: ${p.tried.join(", ")})`);
    pModel = p.model!;
  }
  let lastError = "";
  try {
    let res;
    const t0 = Date.now();
    try {
      res = await callProvider(cfg.primaryProvider, pModel, cfg.primaryKey, messages, maxTokens);
    } catch (e1) {
      lastError = e1 instanceof Error ? e1.message : String(e1);
      // This silent retry is a SECOND billable request. Recorded separately so the
      // baseline shows hidden retry volume rather than hiding it in the success event.
      emit("cloud", null, t0, cfg.primaryProvider, pModel, classifyFailure(e1));
      const t1 = Date.now();
      res = await callProvider(cfg.primaryProvider, pModel, cfg.primaryKey, messages, maxTokens);
      emit("cloud", res, t1, cfg.primaryProvider, pModel, null);
      return { ...res, viaFallback: false };
    }
    emit("cloud", res, t0, cfg.primaryProvider, pModel, null);
    return { ...res, viaFallback: false };
  } catch (e2) {
    lastError = e2 instanceof Error ? e2.message : String(e2);
    const reason = classifyFailure(e2);
    if (cfg.fallbackProvider) {
      let fModel = cfg.fallbackModel;
      if (!fModel) {
        const p = await probeBestModel(cfg.fallbackProvider, cfg.tier, cfg.fallbackKey ?? null);
        if (p.ok) fModel = p.model!;
      }
      if (fModel) {
        const t2 = Date.now();
        try {
          const res = await callProvider(cfg.fallbackProvider, fModel, cfg.fallbackKey ?? null, messages, maxTokens);
          emit("cloud_fallback", res, t2, cfg.fallbackProvider, fModel, reason);
          return { ...res, viaFallback: true, lastError };
        } catch (e3) {
          lastError = e3 instanceof Error ? e3.message : String(e3);
          emit("cloud_fallback", null, t2, cfg.fallbackProvider, fModel, classifyFailure(e3));
        }
      }
    }
    if (cfg.blockFreeFallback) {
      throw new Error(`AI generation failed: ${lastError}. No fallback available.`);
    }
    const t3 = Date.now();
    const res = await callProvider("free", "rules-v1", null, messages, maxTokens);
    emit("cloud_fallback", res, t3, "free", "rules-v1", reason);
    return { ...res, viaFallback: true, lastError };
  }
}
