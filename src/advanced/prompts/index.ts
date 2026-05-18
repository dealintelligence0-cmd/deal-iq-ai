import { buy_sidePrompt } from "./buy_side/prompt";
import { sell_sidePrompt } from "./sell_side/prompt";
import { carveOutPrompt } from "./carve_out/prompt";
import { joint_venturePrompt } from "./joint_venture/prompt";
import { pmi_onlyPrompt } from "./pmi_only/prompt";
import { synergy_capturePrompt } from "./synergy_capture/prompt";
import { distressedPrompt } from "./distressed/prompt";
import type { AdvancedPromptBuilder, MandateType } from "./types";

const builders: Record<MandateType, AdvancedPromptBuilder> = {
  buy_side: buy_sidePrompt,
  sell_side: sell_sidePrompt,
  carve_out: carveOutPrompt,
  joint_venture: joint_venturePrompt,
  pmi_only: pmi_onlyPrompt,
  synergy_capture: synergy_capturePrompt,
  distressed: distressedPrompt,
};

export function getAdvancedPromptBuilder(mandate: string): AdvancedPromptBuilder | null {
  return (builders as Record<string, AdvancedPromptBuilder | undefined>)[mandate] ?? null;
}
