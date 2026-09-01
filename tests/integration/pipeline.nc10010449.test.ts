import path from "node:path";
import { describe, expect, it } from "vitest";
import { ValidationService } from "../../src/services/validation-service.js";
import { primaryClassification } from "../../src/core/classification/failure-classifier.js";
import type { TestContext } from "../../src/core/models/context.js";

function ctx(overrides: Partial<TestContext> = {}): TestContext {
  return {
    agentId: "complaints-workflow",
    scenario: "customer-profile",
    complaintRef: "NC10010449",
    groundTruthPath: path.resolve("NC10010449.json"),
    contractPath: path.resolve("adk_NC10010449.json"),
    reportDir: path.resolve("reports/validation"),
    uiMode: "stub",
    ...overrides,
  };
}

describe("Validation pipeline NC10010449", () => {
  const service = new ValidationService();

  it("PASS — clean ground truth and ADK contract", () => {
    const result = service.run(ctx());
    expect(result.overall, JSON.stringify({ diffs: result.diffs, missing: result.missing }, null, 2)).toBe("PASS");
    expect(result.gating).toBe("PASS");
    expect(result.counts.customers).toEqual({ expected: 2, actual: 2 });
    expect(result.groundedness.status).toBe("PASS");
    expect(result.layers.renderedUi.status).toBe("SKIPPED");
  });

  it("FAIL — AGENT_OUTPUT_FAILURE when contract drops Frederick Hussain", () => {
    const result = service.run(
      ctx({ mutateContract: { dropCustomerPartyId: "1420289780" } }),
    );
    expect(result.overall).toBe("FAIL");
    expect(result.gating).toBe("FAIL");
    expect(result.counts.customers).toEqual({ expected: 2, actual: 1 });
    const classification = primaryClassification([...result.diffs, ...result.missing, ...result.duplicates]);
    expect(classification).toBe("AGENT_OUTPUT_FAILURE");
    const missing = result.missing.find((m) => m.entityId === "1420289780");
    expect(missing?.message).toMatch(/Frederick Hussain/);
    expect(missing?.contractPath).toBe("fact_find.customers[1]");
  });
});
