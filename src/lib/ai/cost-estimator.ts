

/**
 * Per-model cost rates (USD per million tokens), May 2026 published prices.
 * Sources: each provider's official pricing page.
 *
 * The partner can override any rate in Settings → AI → Cost overrides.
 * No model is "preferred" or "default" — the partner's rubric in Settings drives recommendations.
 */

export type CostMode = "standard" | "batch" | "cached";

export type ModelCost = {
  input: number;       // $/MTok
  output: number;      // $/MTok
  cachedInput?: number; // effective $/MTok on cache hit (only set if provider supports caching)
  contextK?: number;   // max context in thousands of tokens
  qualityTier?: 1 | 2 | 3 | 4 | 5;  // 5 = frontier reasoning, 1 = small/fast
  latencyTier?: 1 | 2 | 3;          // 3 = ultra-fast (Groq), 2 = fast, 1 = standard
  supportsTools?: boolean;
};

export const MODEL_COSTS: Record<string, ModelCost> = {
  // Anthropic
  "claude-opus-4-7":           { input: 5.00, output: 25.00, cachedInput: 0.50, contextK: 1000, qualityTier: 5, latencyTier: 1, supportsTools: true },
  "claude-opus-4-6":           { input: 5.00, output: 25.00, cachedInput: 0.50, contextK: 1000, qualityTier: 5, latencyTier: 1, supportsTools: true },
  "claude-sonnet-4-6":         { input: 3.00, output: 15.00, cachedInput: 0.30, contextK: 1000, qualityTier: 4, latencyTier: 2, supportsTools: true },
  "claude-3-5-sonnet-latest":  { input: 3.00, output: 15.00, cachedInput: 0.30, contextK: 200,  qualityTier: 4, latencyTier: 2, supportsTools: true },
  "claude-haiku-4-5":          { input: 1.00, output:  5.00, cachedInput: 0.10, contextK: 200,  qualityTier: 3, latencyTier: 2, supportsTools: true },
  "claude-3-5-haiku-latest":   { input: 0.80, output:  4.00, cachedInput: 0.08, contextK: 200,  qualityTier: 2, latencyTier: 2, supportsTools: true },

  // OpenAI (caching is automatic on gpt-4o+, ~50% off cached input)
  "gpt-4.1":                   { input: 2.00, output:  8.00, cachedInput: 0.50, contextK: 1000, qualityTier: 4, latencyTier: 2, supportsTools: true },
  "gpt-4.1-mini":              { input: 0.40, output:  1.60, cachedInput: 0.10, contextK: 1000, qualityTier: 3, latencyTier: 2, supportsTools: true },
  "gpt-4o":                    { input: 2.50, output: 10.00, cachedInput: 1.25, contextK: 128,  qualityTier: 4, latencyTier: 2, supportsTools: true },
  "gpt-4o-mini":               { input: 0.15, output:  0.60, cachedInput: 0.075,contextK: 128,  qualityTier: 3, latencyTier: 2, supportsTools: true },
  "gpt-4-turbo":               { input:10.00, output: 30.00,                   contextK: 128,  qualityTier: 4, latencyTier: 1, supportsTools: true },

  // Google Gemini (implicit caching ~75-90% off on 2.5+ when prefix matches)
  "gemini-2.5-pro":            { input: 1.25, output: 10.00, cachedInput: 0.125,contextK: 1000, qualityTier: 5, latencyTier: 2, supportsTools: true },
  "gemini-2.5-flash":          { input: 0.30, output:  2.50, cachedInput: 0.075,contextK: 1000, qualityTier: 3, latencyTier: 3, supportsTools: true },
  "gemini-2.0-flash":          { input: 0.10, output:  0.40, cachedInput: 0.025,contextK: 1000, qualityTier: 2, latencyTier: 3, supportsTools: true },
  "gemini-2.0-flash-lite":     { input: 0.075,output:  0.30,                   contextK: 1000, qualityTier: 2, latencyTier: 3, supportsTools: true },
  "gemini-1.5-pro":            { input: 1.25, output:  5.00,                   contextK: 1000, qualityTier: 4, latencyTier: 2, supportsTools: true },

  // xAI
  "grok-4.1":                  { input: 3.00, output: 15.00,                   contextK: 256,  qualityTier: 5, latencyTier: 2, supportsTools: true },
  "grok-4":                    { input: 3.00, output: 15.00,                   contextK: 256,  qualityTier: 4, latencyTier: 2, supportsTools: true },
  "grok-4-mini":               { input: 0.30, output:  0.50,                   contextK: 128,  qualityTier: 3, latencyTier: 2, supportsTools: true },

  // DeepSeek
  "deepseek-reasoner":         { input: 0.55, output:  2.19,                   contextK: 128,  qualityTier: 4, latencyTier: 1, supportsTools: false },
  "deepseek-chat":             { input: 0.14, output:  0.28,                   contextK: 128,  qualityTier: 3, latencyTier: 2, supportsTools: true },

  // Groq (Llama family on dedicated inference)
  "llama-3.3-70b-versatile":   { input: 0.59, output:  0.79,                   contextK: 128,  qualityTier: 3, latencyTier: 3, supportsTools: true },
  "llama-3.1-8b-instant":      { input: 0.05, output:  0.08,                   contextK: 128,  qualityTier: 1, latencyTier: 3, supportsTools: true },

  // Mistral / Cohere
  "mistral-large-latest":      { input: 2.00, output:  6.00,                   contextK: 128,  qualityTier: 4, latencyTier: 2, supportsTools: true },
  "mistral-small-latest":      { input: 0.20, output:  0.60,                   contextK: 128,  qualityTier: 2, latencyTier: 3, supportsTools: true },
  "command-r-plus":            { input: 2.50, output: 10.00,                   contextK: 128,  qualityTier: 4, latencyTier: 2, supportsTools: true },
  "command-r":                 { input: 0.15, output:  0.60,                   contextK: 128,  qualityTier: 2, latencyTier: 2, supportsTools: true },

  // OpenRouter free tier and OSS (rates approximate; partner can override)
  "meta-llama/llama-3.3-70b-instruct:free": { input: 0, output: 0, contextK: 128, qualityTier: 3, latencyTier: 1, supportsTools: false },

  // Self-hosted / Ollama / vLLM — partner sets baseUrl; cost defaults to 0 (override in Settings)
  "ollama:local":              { input: 0,    output:  0,                      contextK: 128,  qualityTier: 2, latencyTier: 2, supportsTools: false },
};

const PROVIDER_FALLBACK: Record<string, ModelCost> = {
  anthropic:   { input: 3.00, output: 15.00 },
  openai:      { input: 2.50, output: 10.00 },
  google:      { input: 0.30, output:  2.50 },
  groq:        { input: 0.59, output:  0.79 },
  mistral:     { input: 0.40, output:  2.00 },
  deepseek:    { input: 0.14, output:  0.28 },
  alibaba:     { input: 0.40, output:  1.20 },
  xai:         { input: 2.00, output: 10.00 },
  cohere:      { input: 0.50, output:  1.50 },
  nvidia:      { input: 0.20, output:  0.60 },
  openrouter:  { input: 1.00, output:  3.00 },
  together:    { input: 0.30, output:  0.90 },
  huggingface: { input: 0.20, output:  0.60 },
  replicate:   { input: 0.40, output:  1.20 },
  free:        { input: 0,    output:  0    },
};

/**
 * Per-user cost overrides — read from ai_settings.cost_overrides JSONB.
 * Lets enterprise users plug in negotiated rates, Azure deployments, or self-hosted estimates.
 */
export function lookupCost(
  provider: string,
  model?: string | null,
  userOverrides?: Record<string, Partial<ModelCost>>,
): ModelCost {
  const baseCost = (model && MODEL_COSTS[model]) ?? PROVIDER_FALLBACK[provider] ?? PROVIDER_FALLBACK["openrouter"];
  const override = userOverrides?.[model ?? provider];
  return override ? { ...baseCost, ...override } : baseCost;
}

export function tierFromCost(c: ModelCost): "premium" | "economic" | "offline" {
  if (c.input === 0 && c.output === 0) return "offline";
  if (c.output >= 8) return "premium";
  return "economic";
}

export function estimateCost(
  provider: string,
  inputTokens: number,
  outputTokens: number,
  model?: string | null,
  mode: CostMode = "standard",
  userOverrides?: Record<string, Partial<ModelCost>>,
) {
  const c = lookupCost(provider, model, userOverrides);
  const batchMul = mode === "batch" ? 0.5 : 1;
  const inputRate = mode === "cached" && c.cachedInput != null ? c.cachedInput : c.input;
  const cost = (inputTokens / 1_000_000) * inputRate * batchMul + (outputTokens / 1_000_000) * c.output * batchMul;
  return { cost, tier: tierFromCost(c), mode, supportsCaching: c.cachedInput != null };
}

const EXPECTED_TOKENS = {
  proposal: { in: 4500, out: 5000, stableInput: 3500 },
  pmi:      { in: 4000, out: 5500, stableInput: 3200 },
  synergy:  { in: 2800, out: 5000, stableInput: 1800 },
  tsa:      { in: 2700, out: 4500, stableInput: 1700 },
} as const;

export function preCallEstimate(
  provider: string,
  module: keyof typeof EXPECTED_TOKENS,
  model?: string | null,
  userOverrides?: Record<string, Partial<ModelCost>>,
) {
  const t = EXPECTED_TOKENS[module];
  const c = lookupCost(provider, model, userOverrides);
  const std = estimateCost(provider, t.in, t.out, model, "standard", userOverrides);
  const batched = estimateCost(provider, t.in, t.out, model, "batch", userOverrides);

  // Cache estimate: only meaningful if the provider exposes a cached-input rate
  let cachedTotal = std.cost;
  let cachedSavingsPct = 0;
  if (c.cachedInput != null) {
    const cachedPart = (t.stableInput / 1_000_000) * c.cachedInput;
    const dynamicPart = ((t.in - t.stableInput) / 1_000_000) * c.input;
    const outputPart = (t.out / 1_000_000) * c.output;
    cachedTotal = cachedPart + dynamicPart + outputPart;
    cachedSavingsPct = std.cost > 0 ? Math.round((1 - cachedTotal / std.cost) * 100) : 0;
  }

  const fmt = (n: number) => n === 0 ? "Free" : n < 0.005 ? "<$0.01" : `~$${n.toFixed(3)}`;
  return {
    inputTokens: t.in,
    outputTokens: t.out,
    stableInput: t.stableInput,
    cost: std.cost,
    costStr: fmt(std.cost),
    batchCost: batched.cost,
    batchStr: fmt(batched.cost),
    cachedCost: cachedTotal,
    cachedStr: fmt(cachedTotal),
    cachedSavingsPct,
    supportsCaching: c.cachedInput != null,
    tier: std.tier,
  };
}

export function tierBadge(tier: "premium" | "economic" | "offline") {
  if (tier === "premium")  return { label: "Premium", color: "bg-purple-100 text-purple-700 dark:bg-purple-950/30 dark:text-purple-300" };
  if (tier === "economic") return { label: "Economic", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300" };
  return { label: "Free / OSS", color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" };
}
