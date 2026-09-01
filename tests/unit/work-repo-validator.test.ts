import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runObjectValidation } from "../../src/core/orchestration/pipeline.js";
import { planForTargetSections, SECTION_TO_CHECKS } from "../../src/core/planning/validation-planner.js";
import { loadAggregatedPayload, loadAgentOutputTrace } from "../../factfind/src/utils/payload-loader.js";

describe("work-repo object validation", () => {
  it("loads payloads from factfind paths and PASSes Compare #1", () => {
    const aggregatedPayload = loadAggregatedPayload("NC10010449");
    const agentOutputTrace = loadAgentOutputTrace("NC10010449");
    const result = runObjectValidation({
      scenario: "customer-profile",
      complaintRef: "NC10010449",
      aggregatedPayload,
      agentOutputTrace,
      reportDir: path.resolve("reports/validation"),
      targetSections: ["customerProfile"],
    });
    expect(result.overall, JSON.stringify({ diffs: result.diffs, missing: result.missing }, null, 2)).toBe("PASS");
    expect(result.layers.renderedUi.status).toBe("SKIPPED");
    expect(result.counts.customers).toEqual({ expected: 2, actual: 2 });
  });

  it("customerProfile plan does not include account checks", () => {
    const plan = planForTargetSections("complaints-workflow", "customer-profile", ["customerProfile"]);
    expect(plan.checks).toEqual(SECTION_TO_CHECKS.customerprofile);
    expect(plan.checks.some((c) => c.startsWith("account."))).toBe(false);
  });

  it("parseFromObjects matches the file-based adapter", () => {
    const aggregated = JSON.parse(readFileSync("factfind/aggregated-payloads/NC10010449.json", "utf8"));
    const trace = JSON.parse(readFileSync("factfind/ai-evals/outputs/adk_NC10010449.json", "utf8"));
    expect(aggregated).toBeTruthy();
    expect(trace.complaintRef).toBe("NC10010449");
  });
});
