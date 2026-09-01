import path from "node:path";
import { describe, expect, it } from "vitest";
import { JsonGroundTruthProvider } from "../../src/core/ground-truth/json-provider.js";
import { mapComplaintsContract } from "../../src/agents/complaints-workflow/mapper.js";
import { readFileSync } from "node:fs";
import { validateContract } from "../../src/core/validation/contract-validator.js";
import { COMPLAINTS_WORKFLOW_PLAN } from "../../src/core/planning/validation-planner.js";

describe("ContractValidator (Compare #1)", () => {
  const expected = JsonGroundTruthProvider.fromFile(path.resolve("NC10010449.json")).toNormalized();
  const capture = JSON.parse(readFileSync(path.resolve("adk_NC10010449.json"), "utf8")) as unknown;

  it("passes the clean NC10010449 contract against ground truth", () => {
    const { model } = mapComplaintsContract(capture);
    const diffs = validateContract(expected, model, COMPLAINTS_WORKFLOW_PLAN);
    expect(diffs, JSON.stringify(diffs, null, 2)).toEqual([]);
    expect(model.customers).toHaveLength(2);
  });

  it("fails when customer 1420289780 is missing from the contract", () => {
    const { model } = mapComplaintsContract(capture, { dropCustomerPartyId: "1420289780" });
    const diffs = validateContract(expected, model, COMPLAINTS_WORKFLOW_PLAN);
    const missing = diffs.find((d) => d.entityId === "1420289780" && d.field === "presence");
    expect(missing).toBeTruthy();
    expect(missing?.message).toMatch(/Frederick Hussain/);
    expect(missing?.contractPath).toBe("fact_find.customers[1]");
    expect(model.customers).toHaveLength(1);
  });

  it("fails when DOB is wrong", () => {
    const { model } = mapComplaintsContract(capture, {
      overrideDob: { partyId: "46142591", dateOfBirth: "01/01/2000" },
    });
    const diffs = validateContract(expected, model, COMPLAINTS_WORKFLOW_PLAN);
    expect(diffs.some((d) => d.field === "dateOfBirth")).toBe(true);
  });

  it("fails when an account is missing", () => {
    const { model } = mapComplaintsContract(capture, { dropAccountNumber: "77110364291360" });
    const diffs = validateContract(expected, model, COMPLAINTS_WORKFLOW_PLAN);
    expect(diffs.some((d) => d.entityId === "77110364291360" && d.field === "presence")).toBe(true);
  });

  it("fails when an account is duplicated", () => {
    const { model } = mapComplaintsContract(capture, { duplicateAccountNumber: "77110364287668" });
    const diffs = validateContract(expected, model, COMPLAINTS_WORKFLOW_PLAN);
    expect(diffs.some((d) => d.field === "duplicate" && d.entityId === "77110364287668")).toBe(true);
  });

  it("fails when an account balance is wrong", () => {
    const { model } = mapComplaintsContract(capture, {
      overrideBalance: { accountNumber: "77110364287668", currentBalance: "£99.00" },
    });
    const diffs = validateContract(expected, model, COMPLAINTS_WORKFLOW_PLAN);
    expect(diffs.some((d) => d.field === "currentBalance")).toBe(true);
  });

  it("fails when a required section is missing", () => {
    const { model } = mapComplaintsContract(capture, { dropSectionLabel: "Support needs" });
    const diffs = validateContract(expected, model, COMPLAINTS_WORKFLOW_PLAN);
    expect(diffs.some((d) => d.field === "section" && d.expected === "Support needs")).toBe(true);
  });
});
