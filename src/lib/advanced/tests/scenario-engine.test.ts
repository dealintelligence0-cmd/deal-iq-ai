

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildScenarioCases } from "../engines/scenario_engine";

describe("scenario engine", () => {
  it("returns three scenarios", () => {
    const scenarios = buildScenarioCases({ synergyRunRateUsdM: 1000, costToAchieveUsdM: 300 });
    assert.equal(scenarios.length, 3);
  });
});
