export type ProviderId =
  | "google" | "openai" | "anthropic" | "mistral" | "deepseek"
  | "alibaba" | "xai" | "cohere" | "groq" | "nvidia"
  | "openrouter" | "together" | "huggingface" | "replicate"
  | "free";

export type Tier = "fast" | "smart" | "economic";
export type ApiStyle = "anthropic" | "openai" | "gemini" | "groq" | "openrouter" | "together" | "rules";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
  /**
   * Provider-neutral hint: this block is stable across calls and should be cached
   * if the underlying provider supports caching. The adapter translates this into:
   *   - Anthropic: cache_control: { type: "ephemeral" } block
   *   - OpenAI / OSS-OpenAI-compat: positioned at start of prompt for automatic prefix cache
   *   - Gemini: implicit caching applies automatically; explicit cachedContent if >32K tokens
   *   - Others: positioned first; pass-through to upstream
   * Setting this true is always safe — providers that don't support caching simply ignore it.
   */
  stable?: boolean;
};
export type ChatResult = {
  provider: ProviderId;
  model: string;
  text: string;
  inputTokens: number;
  outputTokens: number;
  /** Tokens served from cache (provider-reported). 0 or undefined when no cache hit. */
  cachedInputTokens?: number;
};

export type ProviderMeta = {
  id: ProviderId;
  label: string;
  needsKey: boolean;
  apiStyle: ApiStyle;
  baseUrl?: string;
  keyDocsUrl: string;
  fastCandidates: string[];
  smartCandidates: string[];
  listModelsUrl?: string;
};

export const PROVIDERS: Record<ProviderId, ProviderMeta> = {
google: {
    id: "google", label: "Google (Gemini)", needsKey: true, apiStyle: "gemini",
    keyDocsUrl: "https://aistudio.google.com/apikey",
    fastCandidates: ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"],
    smartCandidates: ["gemini-2.5-pro", "gemini-2.5-flash"],
    listModelsUrl: "https://generativelanguage.googleapis.com/v1beta/models",
  },
  openai: {
    id: "openai", label: "OpenAI", needsKey: true, apiStyle: "openai",
    baseUrl: "https://api.openai.com/v1",
    keyDocsUrl: "https://platform.openai.com/api-keys",
    fastCandidates: ["gpt-5-mini", "gpt-4.1-mini", "gpt-4o-mini"],
    smartCandidates: ["gpt-5", "gpt-4.1", "o4-mini", "gpt-4o"],
    listModelsUrl: "https://api.openai.com/v1/models",
  },
  anthropic: {
    id: "anthropic", label: "Anthropic Claude", needsKey: true, apiStyle: "anthropic",
    keyDocsUrl: "https://console.anthropic.com/settings/keys",
    fastCandidates: ["claude-haiku-4-5", "claude-haiku-latest"],
    smartCandidates: ["claude-opus-4-8", "claude-sonnet-4-6", "claude-opus-4-1", "claude-sonnet-4-5"],
    listModelsUrl: "https://api.anthropic.com/v1/models",
  },
  mistral: {
    id: "mistral", label: "Mistral", needsKey: true, apiStyle: "openai",
    baseUrl: "https://api.mistral.ai/v1",
    keyDocsUrl: "https://console.mistral.ai/api-keys",
    fastCandidates: ["mistral-small-latest", "ministral-8b-latest"],
    smartCandidates: ["mistral-large-latest", "mistral-medium-latest"],
    listModelsUrl: "https://api.mistral.ai/v1/models",
  },
  deepseek: {
    id: "deepseek", label: "DeepSeek", needsKey: true, apiStyle: "openai",
    baseUrl: "https://api.deepseek.com/v1",
    keyDocsUrl: "https://platform.deepseek.com/api_keys",
    fastCandidates: ["deepseek-chat"],
    smartCandidates: ["deepseek-reasoner", "deepseek-chat"],
    listModelsUrl: "https://api.deepseek.com/v1/models",
  },
  alibaba: {
    id: "alibaba", label: "Alibaba Qwen", needsKey: true, apiStyle: "openai",
    baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    keyDocsUrl: "https://dashscope.console.aliyun.com/apiKey",
    fastCandidates: ["qwen-turbo-latest", "qwen-plus-latest"],
    smartCandidates: ["qwen-max-latest", "qwen3-235b-a22b", "qwen-plus-latest"],
    listModelsUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/models",
  },
  xai: {
    id: "xai", label: "xAI Grok", needsKey: true, apiStyle: "openai",
    baseUrl: "https://api.x.ai/v1",
    keyDocsUrl: "https://console.x.ai/",
    fastCandidates: ["grok-4-fast", "grok-3-mini"],
    smartCandidates: ["grok-4", "grok-4-fast"],
    listModelsUrl: "https://api.x.ai/v1/models",
  },
  cohere: {
    id: "cohere", label: "Cohere", needsKey: true, apiStyle: "openai",
    baseUrl: "https://api.cohere.com/compatibility/v1",
    keyDocsUrl: "https://dashboard.cohere.com/api-keys",
    fastCandidates: ["command-r7b-12-2024", "command-r-08-2024"],
    smartCandidates: ["command-a-03-2025", "command-r-plus-08-2024"],
    listModelsUrl: "https://api.cohere.com/v1/models",
  },
  groq: {
    id: "groq", label: "Groq (ultra-fast)", needsKey: true, apiStyle: "groq",
    baseUrl: "https://api.groq.com/openai/v1",
    keyDocsUrl: "https://console.groq.com/keys",
    fastCandidates: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "meta-llama/llama-4-scout-17b-16e-instruct"],
    smartCandidates: ["meta-llama/llama-4-maverick-17b-128e-instruct", "llama-3.3-70b-versatile", "deepseek-r1-distill-llama-70b"],
    listModelsUrl: "https://api.groq.com/openai/v1/models",
  },
  nvidia: {
    id: "nvidia", label: "NVIDIA NIM", needsKey: true, apiStyle: "openai",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    keyDocsUrl: "https://build.nvidia.com/",
    fastCandidates: ["meta/llama-3.3-70b-instruct", "meta/llama-3.1-8b-instruct"],
    smartCandidates: ["qwen/qwen3-235b-a22b", "deepseek-ai/deepseek-r1", "meta/llama-3.3-70b-instruct"],
    listModelsUrl: "https://integrate.api.nvidia.com/v1/models",
  },
  openrouter: {
    id: "openrouter", label: "OpenRouter (aggregator)", needsKey: true, apiStyle: "openrouter",
    baseUrl: "https://openrouter.ai/api/v1",
    keyDocsUrl: "https://openrouter.ai/keys",
    fastCandidates: ["google/gemini-2.5-flash", "openai/gpt-5-mini", "meta-llama/llama-3.3-70b-instruct"],
    smartCandidates: ["anthropic/claude-opus-4.1", "openai/gpt-5", "google/gemini-2.5-pro"],
    listModelsUrl: "https://openrouter.ai/api/v1/models",
  },
  together: {
    id: "together", label: "Together AI (aggregator)", needsKey: true, apiStyle: "together",
    baseUrl: "https://api.together.xyz/v1",
    keyDocsUrl: "https://api.together.ai/settings/api-keys",
    fastCandidates: ["meta-llama/Llama-3.3-70B-Instruct-Turbo", "meta-llama/Llama-4-Scout-17B-16E-Instruct"],
    smartCandidates: ["deepseek-ai/DeepSeek-R1", "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8", "meta-llama/Llama-3.3-70B-Instruct-Turbo"],
    listModelsUrl: "https://api.together.xyz/v1/models",
  },
  huggingface: {
    id: "huggingface", label: "Hugging Face", needsKey: true, apiStyle: "openrouter",
    baseUrl: "https://router.huggingface.co/v1",
    keyDocsUrl: "https://huggingface.co/settings/tokens",
    fastCandidates: ["meta-llama/Llama-3.3-70B-Instruct", "Qwen/Qwen2.5-7B-Instruct"],
    smartCandidates: ["meta-llama/Llama-3.3-70B-Instruct", "Qwen/Qwen2.5-72B-Instruct"],
    listModelsUrl: "https://router.huggingface.co/v1/models",
  },
  replicate: {
    id: "replicate", label: "Replicate", needsKey: true, apiStyle: "openrouter",
    baseUrl: "https://openai-proxy.replicate.com/v1",
    keyDocsUrl: "https://replicate.com/account/api-tokens",
    fastCandidates: ["meta/meta-llama-3.3-70b-instruct"],
    smartCandidates: ["meta/meta-llama-3.3-70b-instruct"],
  },
  free: {
    id: "free", label: "Free (rule-based)", needsKey: false, apiStyle: "rules",
    keyDocsUrl: "",
  fastCandidates: ["rules-v1"],
    smartCandidates: ["rules-v1"],
  },
};

export function getModelsForTier(provider: ProviderId, tier: "fast" | "smart" | "economic"): string[] {
  const meta = PROVIDERS[provider];
  if (!meta) return [];
  if (tier === "smart") return meta.smartCandidates ?? [];
  return meta.fastCandidates ?? [];
}

// ===========================================================================
// Live model refresh — keeps the platform showing ACTIVE models only.
//
// The curated `*Candidates` arrays above are a PREFERENCE ORDERING, not the
// source of truth. `listActiveModels` queries each provider's own model-list
// endpoint so that:
//   - models a provider has retired automatically disappear from the platform,
//   - brand-new models a provider ships appear without a code change,
//   - the probe never wastes a round-trip on a model that no longer exists.
// If the live call fails (no key / network), callers fall back to the curated
// list so the product still works offline.
// ===========================================================================

/** Normalize a model id for loose comparison across version/snapshot suffixes. */
function normModelId(id: string): string {
  return id.toLowerCase().replace(/^models\//, "").trim();
}

/** Strip trailing version / snapshot suffixes (dates, -latest, -vN) so that
 *  "claude-haiku-4-5-20251001" → "claude-haiku-4-5" and
 *  "mistral-large-latest" / "mistral-large-2411" → "mistral-large".
 *  Semantic variants like -mini / -flash / -pro / -lite are NOT stripped. */
function stripSnapshot(id: string): string {
  let s = normModelId(id);
  let prev = "";
  while (s !== prev) {
    prev = s;
    s = s.replace(/-(?:latest|preview|stable|exp|\d{6,8}|\d{4}|\d{2}-\d{2,4}|v\d+)$/i, "");
  }
  return s;
}

/** Two ids refer to the same model once version/snapshot suffixes are removed.
 *  Avoids false positives between distinct variants (gpt-5 vs gpt-5-mini). */
function sameModelFamily(a: string, b: string): boolean {
  if (normModelId(a) === normModelId(b)) return true;
  return stripSnapshot(a) === stripSnapshot(b);
}

/** Parse a provider's model-list payload into a flat list of model ids. */
function parseModelList(apiStyle: ApiStyle, json: unknown): string[] {
  const j = json as Record<string, unknown>;
  // Gemini: { models: [{ name: "models/gemini-2.5-flash", supportedGenerationMethods: [...] }] }
  if (Array.isArray(j?.models)) {
    return (j.models as Array<Record<string, unknown>>)
      .filter((m) => {
        const methods = m.supportedGenerationMethods as string[] | undefined;
        return !methods || methods.includes("generateContent");
      })
      .map((m) => normModelId(String(m.name ?? m.id ?? "")))
      .filter(Boolean);
  }
  // OpenAI-style: { data: [{ id }] }  |  Anthropic: { data: [{ id }] }
  if (Array.isArray(j?.data)) {
    return (j.data as Array<Record<string, unknown>>).map((m) => normModelId(String(m.id ?? ""))).filter(Boolean);
  }
  // Together / some OSS: bare array [{ id }]
  if (Array.isArray(json)) {
    return (json as Array<Record<string, unknown>>).map((m) => normModelId(String(m.id ?? m.name ?? ""))).filter(Boolean);
  }
  return [];
}

/** Fetch the provider's currently-offered model ids. Returns [] on any failure. */
export async function listActiveModels(provider: ProviderId, apiKey: string | null): Promise<string[]> {
  const meta = PROVIDERS[provider];
  if (!meta?.listModelsUrl || provider === "free") return [];
  try {
    let url = meta.listModelsUrl;
    const headers: Record<string, string> = {};
    if (meta.apiStyle === "gemini") {
      url += `?key=${apiKey ?? ""}&pageSize=1000`;
    } else if (meta.apiStyle === "anthropic") {
      if (!apiKey) return [];
      headers["x-api-key"] = apiKey;
      headers["anthropic-version"] = "2023-06-01";
      url += url.includes("?") ? "&limit=1000" : "?limit=1000";
    } else {
      if (apiKey) headers["authorization"] = `Bearer ${apiKey}`;
    }
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(12_000) });
    if (!res.ok) return [];
    return parseModelList(meta.apiStyle, await res.json());
  } catch {
    return [];
  }
}

export type ActiveModels = {
  /** Curated candidates that are confirmed live, in preference order. */
  candidates: string[];
  /** Every live model id the provider currently offers (for an "all models" view). */
  all: string[];
  /** True when the live list was fetched; false means we fell back to curated. */
  live: boolean;
};

/**
 * Resolve the ACTIVE candidate list for a provider+tier: curated preference
 * order, filtered to what the provider currently offers, with any brand-new
 * matching-family live models appended. Obsolete/removed models drop out
 * automatically. Falls back to the curated list when the live list is empty.
 */
export async function resolveActiveCandidates(
  provider: ProviderId, tier: Tier, apiKey: string | null,
): Promise<ActiveModels> {
  const curated = getModelsForTier(provider, tier);
  const all = await listActiveModels(provider, apiKey);
  if (!all.length) return { candidates: curated, all: [], live: false };

  // Keep curated models that are still offered (loose family match).
  const candidates = curated.filter((c) => all.some((a) => sameModelFamily(a, c)));
  return {
    candidates: candidates.length ? candidates : curated.filter((c) => all.includes(normModelId(c))),
    all,
    live: true,
  };
}

export async function callProvider(
  provider: ProviderId, model: string, apiKey: string | null,
  messages: ChatMessage[], maxTokens = 1024
): Promise<ChatResult> {
  const meta = PROVIDERS[provider];

  if (meta.apiStyle === "rules") {
    const last = messages[messages.length - 1]?.content ?? "";
    const isProposal = /DEAL FACTS|generate the.*document|Executive Summary|Strategic Rationale/i.test(last);
    if (isProposal) {
      const { generateOfflineProposal } = await import("@/lib/proposal/offline-engine");
      return { provider, model, text: generateOfflineProposal(last), inputTokens: 0, outputTokens: 0 };
    }
    return { provider, model, text: `[rule-based] ${last.slice(0, 400)}`, inputTokens: 0, outputTokens: 0 };
  }
  if (!apiKey) throw new Error(`Missing API key for ${provider}`);

  if (meta.apiStyle === "anthropic") return callAnthropic(provider, model, apiKey, messages, maxTokens);
  if (meta.apiStyle === "gemini") return callGemini(provider, model, apiKey, messages, maxTokens);
  return callOpenAICompat(provider, model, apiKey, messages, maxTokens, meta.baseUrl!);
}

async function callAnthropic(
  provider: ProviderId, model: string, apiKey: string, messages: ChatMessage[], maxTokens: number
): Promise<ChatResult> {
  const systemMsgs = messages.filter((m) => m.role === "system");
  const rest = messages.filter((m) => m.role !== "system");

  let systemPayload: string | Array<{ type: "text"; text: string; cache_control?: { type: "ephemeral" } }> | undefined;
  if (systemMsgs.length > 0) {
    const hasStable = systemMsgs.some((m) => m.stable);
    if (hasStable) {
      const dynamic = systemMsgs.filter((m) => !m.stable).map((m) => m.content).join("\n\n");
      const stable = systemMsgs.filter((m) => m.stable).map((m) => m.content).join("\n\n");
      const blocks: Array<{ type: "text"; text: string; cache_control?: { type: "ephemeral" } }> = [];
      // Stable content first → maximizes Anthropic prefix cache hit rate
      if (stable) blocks.push({ type: "text", text: stable, cache_control: { type: "ephemeral" } });
      if (dynamic) blocks.push({ type: "text", text: dynamic });
      systemPayload = blocks;
    } else {
      systemPayload = systemMsgs.map((m) => m.content).join("\n\n");
    }
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "prompt-caching-2024-07-31",
    },
    body: JSON.stringify({
      model, max_tokens: maxTokens,
      ...(systemPayload ? { system: systemPayload } : {}),
      messages: rest.map((m) => ({ role: m.role, content: m.content })),
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const j = await res.json();
  return {
    provider, model,
    text: (j.content?.[0]?.text ?? "").toString(),
    inputTokens: j.usage?.input_tokens ?? 0,
    outputTokens: j.usage?.output_tokens ?? 0,
  };
}

async function callOpenAICompat(
  provider: ProviderId, model: string, apiKey: string,
  messages: ChatMessage[], maxTokens: number, base: string
): Promise<ChatResult> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    authorization: `Bearer ${apiKey}`,
  };
  if (provider === "openrouter") {
    headers["HTTP-Referer"] = "https://deal-iq-ai.vercel.app";
    headers["X-Title"] = "Deal IQ AI";
  }

  // Reorder: stable system blocks first, then dynamic system, then user/assistant.
  // This maximizes prefix cache hit rate on providers that do automatic caching (OpenAI, Azure, some OSS).
  const stableSys = messages.filter((m) => m.role === "system" && m.stable);
  const dynamicSys = messages.filter((m) => m.role === "system" && !m.stable);
  const rest = messages.filter((m) => m.role !== "system");
  const ordered = [...stableSys, ...dynamicSys, ...rest].map((m) => ({ role: m.role, content: m.content }));

  const res = await fetch(`${base}/chat/completions`, {
    method: "POST", headers,
    body: JSON.stringify({ model, messages: ordered, max_tokens: maxTokens }),
  });
  if (!res.ok) throw new Error(`${provider} ${res.status}: ${await res.text()}`);
  const j = await res.json();
  return {
    provider, model,
    text: (j.choices?.[0]?.message?.content ?? "").toString(),
    inputTokens: j.usage?.prompt_tokens ?? 0,
    outputTokens: j.usage?.completion_tokens ?? 0,
    // OpenAI returns prompt_tokens_details.cached_tokens; surface if present
    ...(j.usage?.prompt_tokens_details?.cached_tokens != null
      ? { cachedInputTokens: j.usage.prompt_tokens_details.cached_tokens }
      : {}),
  };
}

async function callGemini(
  provider: ProviderId, model: string, apiKey: string, messages: ChatMessage[], maxTokens: number
): Promise<ChatResult> {
  const systemMsgs = messages.filter((m) => m.role === "system");
  // Gemini implicit caching is automatic on 2.5+ models when the systemInstruction prefix matches a recent call.
  // We just concatenate (stable first, dynamic last) so the cacheable portion is at the start.
  const stable = systemMsgs.filter((m) => m.stable).map((m) => m.content).join("\n\n");
  const dynamic = systemMsgs.filter((m) => !m.stable).map((m) => m.content).join("\n\n");
  const systemMsg = [stable, dynamic].filter(Boolean).join("\n\n");

  const contents = messages.filter((m) => m.role !== "system").map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents,
        ...(systemMsg ? { systemInstruction: { parts: [{ text: systemMsg }] } } : {}),
        generationConfig: { maxOutputTokens: maxTokens },
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const j = await res.json();
  return {
    provider, model,
    text: (j.candidates?.[0]?.content?.parts?.[0]?.text ?? "").toString(),
    inputTokens: j.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: j.usageMetadata?.candidatesTokenCount ?? 0,
    ...(j.usageMetadata?.cachedContentTokenCount != null
      ? { cachedInputTokens: j.usageMetadata.cachedContentTokenCount }
      : {}),
  };
}


export async function probeBestModel(
  provider: ProviderId, tier: Tier, apiKey: string | null
): Promise<{ ok: boolean; model?: string; error?: string; tried: string[] }> {
  // Use the live, active-only candidate list so we never probe a retired model.
  // Falls back to the curated list when the live list can't be fetched.
  const { candidates } = await resolveActiveCandidates(provider, tier, apiKey);
  const tried: string[] = [];
  const ping: ChatMessage[] = [{ role: "user", content: "Reply with exactly: PONG" }];

  for (const model of candidates) {
    tried.push(model);
    try {
      const r = await callProvider(provider, model, apiKey, ping, 16);
      if (r.text && r.text.length > 0) return { ok: true, model, tried };
    } catch { /* try next */ }
  }
  return { ok: false, error: `No candidate responded (tried ${tried.length})`, tried };
}
