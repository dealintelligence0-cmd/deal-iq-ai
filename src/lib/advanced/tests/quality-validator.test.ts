

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluateProposalQuality } from "../validators/quality_validator";

describe("quality validator", () => {
  it("scores richer content higher", () => {
    const high = evaluateProposalQuality("## A\n$100 20% owner: CFO HSR EU Merger CCI\n## B\n$200 30% owner: CTO DOJ FTC").score;
    const low = evaluateProposalQuality("the deal is expected to be strategic rationale the deal is expected to be strategic rationale").score;
    assert.ok(high > low);
  });
});
