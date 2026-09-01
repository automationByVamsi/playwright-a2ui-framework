import path from "node:path";
import { expect, test } from "@playwright/test";
import { ValidationService } from "../../src/services/validation-service.js";
import { primaryClassification } from "../../src/core/classification/failure-classifier.js";
import type { TestContext } from "../../src/core/models/context.js";

function ctx(overrides: Partial<TestContext> = {}): TestContext {
  return {
    agentId: "complaints-workflow",
    scenario: "customer-profile-render",
    complaintRef: "NC10010449",
    groundTruthPath: path.resolve("NC10010449.json"),
    contractPath: path.resolve("adk_NC10010449.json"),
    reportDir: path.resolve("reports/validation"),
    uiMode: "stub",
    renderCheck: true,
    ...overrides,
  };
}

test.describe("Complaints Workflow render check", () => {
  const service = new ValidationService();

  test("PASS — stub renders both customers from the contract", async ({ page }) => {
    const result = await service.runWithRender(ctx(), page);
    expect(result.layers.adkContract.status, JSON.stringify(result.diffs, null, 2)).toBe("PASS");
    expect(result.layers.renderedUi.status, JSON.stringify({ missing: result.missing, diffs: result.diffs }, null, 2)).toBe(
      "PASS",
    );
    expect(result.overall).toBe("PASS");
    expect(result.counts.renderedCustomers).toEqual({ expected: 2, actual: 2 });
  });

  test("FAIL — UI_RENDERING_FAILURE when the stub drops Frederick Hussain", async ({ page }) => {
    const result = await service.runWithRender(ctx({ dropRenderedPartyId: "1420289780" }), page);
    expect(result.layers.adkContract.status).toBe("PASS");
    expect(result.layers.renderedUi.status).toBe("FAIL");
    expect(result.overall).toBe("FAIL");
    expect(result.counts.renderedCustomers).toEqual({ expected: 2, actual: 1 });
    const classification = primaryClassification([...result.diffs, ...result.missing, ...result.duplicates]);
    expect(classification).toBe("UI_RENDERING_FAILURE");
    const missing = result.missing.find((m) => m.entityId === "1420289780");
    expect(missing?.message).toMatch(/Frederick Hussain/);
    expect(missing?.renderedPath).toBe("NOT FOUND");
    expect(missing?.contractPath).toMatch(/fact_find\.customers\[1\]/);
    expect(result.evidence.screenshot).toBeTruthy();
  });
});
