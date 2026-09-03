import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertGroundednessContract,
  validateGroundednessContract,
} from "../../src/validators/groundedness-contract.validator.js";

describe("Tier 1 groundedness contract (zero-browser)", () => {
  const aggregated = JSON.parse(readFileSync(path.resolve("fixtures/NC10010449.json"), "utf8"));
  const trace = JSON.parse(readFileSync(path.resolve("fixtures/adk_NC10010449.json"), "utf8"));

  it("PASSes identity, related-account routing, and passed groundedness banner for NC10010449", () => {
    const result = validateGroundednessContract(aggregated, trace);
    expect(result.passed, JSON.stringify(result.checks, null, 2)).toBe(true);
    expect(result.groundednessStatus.toLowerCase()).toBe("correct");
    expect(result.checks.map((c) => c.name)).toEqual([
      "customer-identity",
      "account-categorization",
      "groundedness-banner",
    ]);
    expect(() => assertGroundednessContract(result)).not.toThrow();
  });

  it("fails customer-identity when a source party is dropped from agentOutput", () => {
    const inner = JSON.parse(trace.agentOutput);
    inner.fact_find.customers = [inner.fact_find.customers[0]];
    const mutated = { ...trace, agentOutput: JSON.stringify(inner) };
    const result = validateGroundednessContract(aggregated, mutated);
    expect(result.passed).toBe(false);
    const identity = result.checks.find((c) => c.name === "customer-identity");
    expect(identity?.passed).toBe(false);
    expect(result.diffs.some((d) => d.entityId === "1420289780")).toBe(true);
  });
});
