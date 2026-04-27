export type ProviderId =
  | "google" | "openai" | "anthropic" | "mistral" | "deepseek"
  | "alibaba" | "xai" | "cohere" | "groq" | "nvidia"
  | "openrouter" | "together" | "huggingface" | "replicate"
  | "free";

export type Tier = "fast" | "smart" | "economic";
export type ApiStyle = "anthropic" | "openai" | "gemini" | "groq" | "openrouter" | "together" | "rules";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
export type ChatResult = {
  provider: ProviderId;
  model: string;
  text: string;
  inputTokens: number;
  outputTokens: number;
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
    fastCandidates: ["gemini-2.5-flash", "gemini-2.5-flash-preview-05-20", "gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-flash"],
    smartCandidates: ["gemini-2.5-pro-preview-06-05", "gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-pro"],
    listModelsUrl: "https://generativelanguage.googleapis.com/v1beta/models",
  },
  openai: {
    id: "openai", label: "OpenAI", needsKey: true, apiStyle: "openai",
    baseUrl: "https://api.openai.com/v1",
    keyDocsUrl: "https://platform.openai.com/api-keys",
    fastCandidates: ["gpt-4.1-mini", "gpt-4o-mini", "gpt-4o"],
    smartCandidates: ["gpt-4.1", "gpt-4o", "gpt-4-turbo"],
    listModelsUrl: "https://api.openai.com/v1/models",
  },
  anthropic: {
    id: "anthropic", label: "Anthropic Claude", needsKey: true, apiStyle: "anthropic",
    keyDocsUrl: "https://console.anthropic.com/settings/keys",
    fastCandidates: ["claude-haiku-4-5", "claude-3-5-haiku-latest", "claude-haiku-latest"],
    smartCandidates: ["claude-opus-4-7", "claude-opus-4", "claude-sonnet-4-6", "claude-3-5-sonnet-latest"],
    listModelsUrl: "https://api.anthropic.com/v1/models",
  },
  mistral: {
    id: "mistral", label: "Mistral", needsKey: true, apiStyle: "openai",
    baseUrl: "https://api.mistral.ai/v1",
    keyDocsUrl: "https://console.mistral.ai/api-keys",
    fastCandidates: ["mistral-small-latest", "open-mixtral-8x7b", "open-mistral-7b"],
    smartCandidates: ["mistral-large-latest", "mistral-large-3"],
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
    smartCandidates: ["qwen-max-latest", "qwen3-72b-instruct", "qwen-vl-max"],
    listModelsUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/models",
  },
  xai: {
    id: "xai", label: "xAI Grok", needsKey: true, apiStyle: "openai",
    baseUrl: "https://api.x.ai/v1",
    keyDocsUrl: "https://console.x.ai/",
    fastCandidates: ["grok-4-mini", "grok-3-mini"],
    smartCandidates: ["grok-4.1", "grok-4", "grok-3"],
    listModelsUrl: "https://api.x.ai/v1/models",
  },
  cohere: {
    id: "cohere", label: "Cohere", needsKey: true, apiStyle: "openai",
    baseUrl: "https://api.cohere.com/compatibility/v1",
    keyDocsUrl: "https://dashboard.cohere.com/api-keys",
    fastCandidates: ["command-r", "command-light"],
    smartCandidates: ["command-r-plus", "command-r"],
  },
  groq: {
    id: "groq", label: "Groq (ultra-fast)", needsKey: true, apiStyle: "groq",
    baseUrl: "https://api.groq.com/openai/v1",
    keyDocsUrl: "https://console.groq.com/keys",
    fastCandidates: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "llama-4-scout-17b-16e-instruct", "gemma2-9b-it"],
    smartCandidates: ["llama-3.3-70b-versatile", "llama-4-scout-17b-16e-instruct", "qwen-2.5-32b", "deepseek-r1-distill-llama-70b"],
    listModelsUrl: "https://api.groq.com/openai/v1/models",
  },
  nvidia: {
    id: "nvidia", label: "NVIDIA NIM", needsKey: true, apiStyle: "openai",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    keyDocsUrl: "https://build.nvidia.com/",
    fastCandidates: ["meta/llama-3.3-70b-instruct", "meta/llama-3.1-8b-instruct"],
    smartCandidates: ["qwen/qwen3-235b-a22b", "meta/llama-3.3-70b-instruct"],
    listModelsUrl: "https://integrate.api.nvidia.com/v1/models",
  },
  openrouter: {
    id: "openrouter", label: "OpenRouter (aggregator)", needsKey: true, apiStyle: "openrouter",
    baseUrl: "https://openrouter.ai/api/v1",
    keyDocsUrl: "https://openrouter.ai/keys",
    fastCandidates: ["meta-llama/llama-3.3-70b-instruct:free", "google/gemini-2.5-flash", "openai/gpt-4o-mini"],
    smartCandidates: ["anthropic/claude-opus-4", "openai/gpt-5.4-pro", "google/gemini-2.5-pro"],
    listModelsUrl: "https://openrouter.ai/api/v1/models",
  },
  together: {
    id: "together", label: "Together AI (aggregator)", needsKey: true, apiStyle: "together",
    baseUrl: "https://api.together.xyz/v1",
    keyDocsUrl: "https://api.together.ai/settings/api-keys",
    fastCandidates: ["meta-llama/Llama-3.3-70B-Instruct-Turbo", "mistralai/Mixtral-8x7B-Instruct-v0.1"],
    smartCandidates: ["meta-llama/Llama-3.3-70B-Instruct-Turbo"],
    listModelsUrl: "https://api.together.xyz/v1/models",
  },
  huggingface: {
    id: "huggingface", label: "Hugging Face", needsKey: true, apiStyle: "openrouter",
    baseUrl: "https://api-inference.huggingface.co/v1",
    keyDocsUrl: "https://huggingface.co/settings/tokens",
    fastCandidates: ["meta-llama/Llama-3.3-70B-Instruct", "mistralai/Mixtral-8x7B-Instruct-v0.1"],
    smartCandidates: ["meta-llama/Llama-3.3-70B-Instruct"],
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
  const system = messages.find((m) => m.role === "system")?.content;
  const rest = messages.filter((m) => m.role !== "system");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model, max_tokens: maxTokens,
      ...(system ? { system } : {}),
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
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST", headers,
    body: JSON.stringify({ model, messages, max_tokens: maxTokens }),
  });
  if (!res.ok) throw new Error(`${provider} ${res.status}: ${await res.text()}`);
  const j = await res.json();
  return {
    provider, model,
    text: (j.choices?.[0]?.message?.content ?? "").toString(),
    inputTokens: j.usage?.prompt_tokens ?? 0,
    outputTokens: j.usage?.completion_tokens ?? 0,
  };
}

async function callGemini(
  provider: ProviderId, model: string, apiKey: string, messages: ChatMessage[], maxTokens: number
): Promise<ChatResult> {
  const systemMsg = messages.find((m) => m.role === "system")?.content;
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
  };
}

export async function probeBestModel(
  provider: ProviderId, tier: Tier, apiKey: string | null
): Promise<{ ok: boolean; model?: string; error?: string; tried: string[] }> {
  const meta = PROVIDERS[provider];
  const candidates = tier === "fast" ? meta.fastCandidates : meta.smartCandidates;
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
