

export type ProviderId = "claude" | "openai" | "gemini" | "free";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type ChatResult = {
  provider: ProviderId;
  model: string;
  text: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
};

export type ProviderMeta = {
  id: ProviderId;
  label: string;
  needsKey: boolean;
  defaultBulkModel: string;
  defaultPremiumModel: string;
  testPrompt: string;
  /** $ per 1M tokens: [input, output] */
  pricing: Record<string, [number, number]>;
};

export const PROVIDERS: Record<ProviderId, ProviderMeta> = {
  claude: {
    id: "claude",
    label: "Anthropic Claude",
    needsKey: true,
    defaultBulkModel: "claude-haiku-4-5-20251001",
    defaultPremiumModel: "claude-opus-4-7",
    testPrompt: "Reply with exactly: PONG",
    pricing: {
      "claude-haiku-4-5-20251001": [1, 5],
      "claude-opus-4-7": [15, 75],
      "claude-sonnet-4-6": [3, 15],
    },
  },
  openai: {
    id: "openai",
    label: "OpenAI",
    needsKey: true,
    defaultBulkModel: "gpt-4o-mini",
    defaultPremiumModel: "gpt-4o",
    testPrompt: "Reply with exactly: PONG",
    pricing: {
      "gpt-4o-mini": [0.15, 0.6],
      "gpt-4o": [2.5, 10],
      "gpt-4-turbo": [10, 30],
    },
  },
  gemini: {
    id: "gemini",
    label: "Google Gemini",
    needsKey: true,
    defaultBulkModel: "gemini-2.0-flash",
    defaultPremiumModel: "gemini-1.5-pro",
    testPrompt: "Reply with exactly: PONG",
    pricing: {
      "gemini-2.0-flash": [0.1, 0.4],
      "gemini-1.5-pro": [1.25, 5],
    },
  },
  free: {
    id: "free",
    label: "Free (rule-based)",
    needsKey: false,
    defaultBulkModel: "rules-v1",
    defaultPremiumModel: "rules-v1",
    testPrompt: "",
    pricing: { "rules-v1": [0, 0] },
  },
};

function estimateCost(
  provider: ProviderId,
  model: string,
  inTok: number,
  outTok: number
): number {
  const p = PROVIDERS[provider].pricing[model];
  if (!p) return 0;
  return (inTok * p[0]) / 1e6 + (outTok * p[1]) / 1e6;
}

export async function callProvider(
  provider: ProviderId,
  model: string,
  apiKey: string | null,
  messages: ChatMessage[],
  maxTokens = 1024
): Promise<ChatResult> {
  if (provider === "free") {
    const last = messages[messages.length - 1]?.content ?? "";
    return {
      provider, model,
      text: `[rule-based reply] ${last.slice(0, 400)}`,
      inputTokens: 0, outputTokens: 0, costUsd: 0,
    };
  }
  if (!apiKey) throw new Error(`Missing API key for ${provider}`);

  if (provider === "claude") return callClaude(model, apiKey, messages, maxTokens);
  if (provider === "openai") return callOpenAI(model, apiKey, messages, maxTokens);
  if (provider === "gemini") return callGemini(model, apiKey, messages, maxTokens);
  throw new Error(`Unknown provider: ${provider}`);
}

// ---------- Claude ----------
async function callClaude(
  model: string, apiKey: string, messages: ChatMessage[], maxTokens: number
): Promise<ChatResult> {
  const system = messages.find((m) => m.role === "system")?.content;
  const rest = messages.filter((m) => m.role !== "system");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      ...(system ? { system } : {}),
      messages: rest.map((m) => ({ role: m.role, content: m.content })),
    }),
  });
  if (!res.ok) throw new Error(`Claude ${res.status}: ${await res.text()}`);
  const j = await res.json();
  const text = (j.content?.[0]?.text ?? "").toString();
  const inTok = j.usage?.input_tokens ?? 0;
  const outTok = j.usage?.output_tokens ?? 0;
  return {
    provider: "claude", model, text,
    inputTokens: inTok, outputTokens: outTok,
    costUsd: estimateCost("claude", model, inTok, outTok),
  };
}

// ---------- OpenAI ----------
async function callOpenAI(
  model: string, apiKey: string, messages: ChatMessage[], maxTokens: number
): Promise<ChatResult> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const j = await res.json();
  const text = (j.choices?.[0]?.message?.content ?? "").toString();
  const inTok = j.usage?.prompt_tokens ?? 0;
  const outTok = j.usage?.completion_tokens ?? 0;
  return {
    provider: "openai", model, text,
    inputTokens: inTok, outputTokens: outTok,
    costUsd: estimateCost("openai", model, inTok, outTok),
  };
}

// ---------- Gemini ----------
async function callGemini(
  model: string, apiKey: string, messages: ChatMessage[], maxTokens: number
): Promise<ChatResult> {
  const systemMsg = messages.find((m) => m.role === "system")?.content;
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
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
  const text = (j.candidates?.[0]?.content?.parts?.[0]?.text ?? "").toString();
  const inTok = j.usageMetadata?.promptTokenCount ?? 0;
  const outTok = j.usageMetadata?.candidatesTokenCount ?? 0;
  return {
    provider: "gemini", model, text,
    inputTokens: inTok, outputTokens: outTok,
    costUsd: estimateCost("gemini", model, inTok, outTok),
  };
}
