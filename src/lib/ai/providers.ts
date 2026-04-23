

export type ProviderId =
  | "google" | "openai" | "anthropic" | "mistral" | "deepseek"
  | "alibaba" | "xai" | "cohere" | "groq" | "nvidia"
  | "openrouter" | "together" | "huggingface" | "replicate"
  | "free";

export type Tier = "fast" | "smart"; // bulk vs premium intent
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
  /** Ordered list of model *candidates* to try (best → fallback). Never hardcoded version; provider resolves on probe. */
  fastCandidates: string[];
  smartCandidates: string[];
  /** Optional: if provider exposes a /models list, use this fn to fetch ids. */
  listModelsUrl?: string;
};

/** Ordering matters: first candidate that responds wins. Keep "latest/flash/mini" variants first. */
export const PROVIDERS: Record<ProviderId, ProviderMeta> = {
  google: {
    id: "google", label: "Google (Gemini / Gemma)", needsKey: true,
    apiStyle: "gemini",
    keyDocsUrl: "https://aistudio.google.com/apikey",
    fastCandidates: ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash", "gemma-3-27b-it"],
    smartCandidates: ["gemini-2.5-pro", "gemini-2.0-pro", "gemini-1.5-pro"],
    listModelsUrl: "https://generativelanguage.googleapis.com/v1beta/models",
  },
  openai: {
    id: "openai", label: "OpenAI", needsKey: true, apiStyle: "openai",
    baseUrl: "https://api.openai.com/v1",
    keyDocsUrl: "https://platform.openai.com/api-keys",
    fastCandidates: ["gpt-4o-mini", "gpt-4.1-mini", "gpt-4o"],
    smartCandidates: ["gpt-5.4-pro", "gpt-5", "o3", "gpt-4o", "gpt-4-turbo"],
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
    id: "
