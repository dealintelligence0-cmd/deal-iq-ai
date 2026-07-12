import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { analyzeProposalCoherence } from "../coherence";

const meta = {
  buyer: "Eicher Motors",
  target: "Volvo Financial Services India",
  sector: "Financial Services",
  geography: "India",
};

describe("proposal coherence gate", () => {
  it("BLOCKS an entity data-bleed (narrative about a different transaction)", () => {
    const bleed = `Sodexo's acquisition of Shashi Catering Services for 3.0B positions Sodexo as the
      dominant contract catering operator. Shashi Catering Services has a BBB- rating. Sodexo India
      Western region lags. Sodexo captures the discount. Shashi Catering Services operates kitchens.
      Sodexo acquires Shashi Catering Services defensively. Sodexo India leadership. Sodexo integration.`;
    const r = analyzeProposalCoherence(bleed, meta);
    assert.equal(r.blocking, true);
    assert.ok(r.violations.some((v) => v.kind === "entity" && v.severity === "block"));
  });

  it("PASSES a deck that names the real parties", () => {
    const ok = `Eicher Motors acquisition of Volvo Financial Services India. Eicher Motors captures
      scale in captive finance. Volvo book quality is strong. Eicher India leadership. Volvo retention
      secured. Eicher Motors synergy model delivers.`;
    const r = analyzeProposalCoherence(ok, meta);
    assert.equal(r.blocking, false);
  });

  it("does NOT block when comparables are merely cited a few times", () => {
    const comps = `Eicher Motors to acquire Volvo Financial Services India. We benchmark against
      Amgen Horizon and Reddy Mayne precedents. Eicher Motors gains scale. Volvo Financial Services
      India retention. Amgen Horizon at 1.5%. Eicher Motors integration plan.`;
    const r = analyzeProposalCoherence(comps, meta);
    assert.equal(r.blocking, false);
  });

  it("warns (not block) when the synergy figure lands in the EV slot", () => {
    const md = `Eicher Motors acquires Volvo Financial Services India. Enterprise Value ₹403.5M.
      Net run-rate synergy ₹403.5M by Year 3. Eicher Motors and Volvo integrate.`;
    const r = analyzeProposalCoherence(md, meta);
    assert.equal(r.blocking, false);
    assert.ok(r.violations.some((v) => v.kind === "numeric"));
  });
});
