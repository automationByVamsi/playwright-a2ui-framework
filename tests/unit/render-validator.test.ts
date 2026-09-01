import path from "node:path";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mapComplaintsContract } from "../../src/agents/complaints-workflow/mapper.js";
import { validateRenderedUi } from "../../src/core/validation/render-validator.js";
import { COMPLAINTS_WORKFLOW_PLAN } from "../../src/core/planning/validation-planner.js";
import type { RenderedUiModel } from "../../src/core/models/rendered.js";

describe("RenderValidator (Compare #2)", () => {
  const capture = JSON.parse(readFileSync(path.resolve("adk_NC10010449.json"), "utf8")) as unknown;
  const { model: contract } = mapComplaintsContract(capture);

  it("passes when rendered customers match the contract", () => {
    const rendered: RenderedUiModel = {
      complaintRef: contract.complaintRef,
      customers: contract.customers.map((c) => ({ ...c, sourcePath: `rendered.${c.partyId}` })),
      visibleText: "",
      strategy: "semantic",
    };
    expect(validateRenderedUi(contract, rendered, COMPLAINTS_WORKFLOW_PLAN)).toEqual([]);
  });

  it("classifies a dropped customer as UI_RENDERING_FAILURE", () => {
    const rendered: RenderedUiModel = {
      complaintRef: contract.complaintRef,
      customers: contract.customers.filter((c) => c.partyId !== "1420289780"),
      visibleText: "Ms Alexandra Taylor",
      strategy: "semantic",
    };
    const diffs = validateRenderedUi(contract, rendered, COMPLAINTS_WORKFLOW_PLAN);
    const missing = diffs.find((d) => d.entityId === "1420289780" && d.field === "presence");
    expect(missing?.classification).toBe("UI_RENDERING_FAILURE");
    expect(missing?.message).toMatch(/Frederick Hussain/);
    expect(missing?.renderedPath).toBe("NOT FOUND");
    expect(missing?.contractPath).toBe("fact_find.customers[1]");
  });
});
