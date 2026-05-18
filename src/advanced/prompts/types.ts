export type MandateType =
  | "buy_side"
  | "sell_side"
  | "carve_out"
  | "joint_venture"
  | "pmi_only"
  | "synergy_capture"
  | "distressed";

export type AdvancedPromptContext = {
  buyer: string;
  target: string;
  sector: string;
  geography: string;
  dealSize: string;
  notes: string;
  researchInsights?: string;
};

export type AdvancedPromptBuilder = (ctx: AdvancedPromptContext) => string;
