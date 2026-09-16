import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assertComplaintsRules, first14 } from "../../src/agents/complaints-workflow/complaints-rules.js";

describe("complaints-rules", () => {
  const aggregated = JSON.parse(readFileSync(path.resolve("fixtures/NC10010449.json"), "utf8"));
  const trace = JSON.parse(readFileSync(path.resolve("fixtures/adk_NC10010449.json"), "utf8"));

  it("passes NC10010449 — both parties, related ICA account, groundedness correct", () => {
    expect(() => assertComplaintsRules(aggregated, trace)).not.toThrow();
  });

  it("fails with a clear message when ADK drops Frederick", () => {
    const inner = JSON.parse(trace.agentOutput);
    inner.fact_find.customers = [inner.fact_find.customers[0]];
    const mutated = { ...trace, agentOutput: JSON.stringify(inner) };
    expect(() => assertComplaintsRules(aggregated, mutated)).toThrow(/1420289780/);
  });

  it("takes the first 14 digits of an account number", () => {
    expect(first14("LTPB Current 77110364287668")).toBe("77110364287668");
    expect(first14("7711036429136000000")).toBe("77110364291360");
  });
});
