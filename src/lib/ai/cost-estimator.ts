// Approximate per-1M-token costs as of 2026 (output tokens, conservative)
const COSTS_PER_MTOK: Record<string, { input: number; output: number; tier: "premium" | "economic" | "offline" }> = {
  "anthropic":   { input: 3.00, output: 15.00, tier: "premium" },
  "openai":      { input: 2.50, output: 10.00, tier: "premium" },
  "google":      { input: 0.30, output: 2.50,  tier: "economic" },
  "groq":        { input: 0.10, output: 0.10,  tier: "economic" },
  "mistral":     { input: 0.40, output: 2.00,  tier: "economic" },
  "deepseek":    { input: 0.14, output: 0.28,  tier: "economic" },
  "alibaba":     { input: 0.40, output: 1.20,  tier: "economic" },
  "xai":         { input: 2.00, output: 10.00, tier: "premium" },
  "cohere":      { input: 0.50, output: 1.50,  tier: "economic" },
  "nvidia":      { input: 0.20, output: 0.60,  tier: "economic" },
  "openrouter":  { input: 1.00, output: 3.00,  tier: "economic" },
  "together":    { input: 0.30, output: 0.90,  tier: "economic" },
  "huggingface": { input: 0.20, output: 0.60,  tier: "economic" },
  "replicate":   { input: 0.40, output: 1.20,  tier: "economic" },
  "free":        { input: 0,    output: 0,     tier: "offline" },
};

export function estimateCost(provider: string, inputTokens: number, outputTokens: number) {
  const c = COSTS_PER_MTOK[provider] ?? COSTS_PER_MTOK["openrouter"];
  const cost = (inputTokens / 1_000_000) * c.input + (outputTokens / 1_000_000) * c.output;
  return { cost, tier: c.tier };
}

export function tierLabel(provider: string): "premium" | "economic" | "offline" {
  return COSTS_PER_MTOK[provider]?.tier ?? "economic";
}

// Pre-call estimation (we don't know exact tokens yet — use heuristics)
export function preCallEstimate(provider: string, module: "proposal" | "pmi" | "synergy" | "tsa") {
  const expectedTokens = {
    proposal: { in: 4000, out: 4000 },
    pmi:      { in: 3000, out: 5000 },
    synergy:  { in: 2500, out: 5000 },
    tsa:      { in: 2500, out: 4500 },
  };
  const t = expectedTokens[module];
  const { cost, tier } = estimateCost(provider, t.in, t.out);
  return {
    inputTokens: t.in,
    outputTokens: t.out,
    cost,
    costStr: cost === 0 ? "Free" : cost < 0.01 ? "<$0.01" : `~$${cost.toFixed(3)}`,
    tier,
  };
}

export function tierBadge(tier: "premium" | "economic" | "offline") {
  if (tier === "premium")  return { label: "Premium", color: "bg-purple-100 text-purple-700 dark:bg-purple-950/30 dark:text-purple-300" };
  if (tier === "economic") return { label: "Economic", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300" };
  return { label: "Offline", color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" };
}
