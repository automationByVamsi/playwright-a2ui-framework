import type { NormalizedContractModel, NormalizedExpectedModel } from "../models/normalized.js";
import type { RenderedUiModel } from "../models/rendered.js";
import type { FieldDiff } from "../models/validation-result.js";
import type { ValidationPlan } from "../planning/validation-planner.js";
import { classifyDiffs } from "../classification/failure-classifier.js";
import { validateContract } from "./contract-validator.js";

/**
 * Compare #2: ADK contract (expected) vs rendered UI (actual).
 * Reuses the same field comparator; remaps paths and class to UI_RENDERING_FAILURE.
 */
export function validateRenderedUi(
  contract: NormalizedContractModel,
  rendered: RenderedUiModel,
  plan: ValidationPlan,
): FieldDiff[] {
  const expectedFromContract: NormalizedExpectedModel = {
    complaint: {
      complaintRef: contract.complaintRef ?? "",
      relatedAccountNumbers: [],
    },
    customers: contract.customers,
  };
  const renderedAsContract: NormalizedContractModel = {
    ...contract,
    complaintRef: rendered.complaintRef ?? contract.complaintRef,
    customers: rendered.customers,
  };

  const renderPlan: ValidationPlan = {
    ...plan,
    checks: plan.checks.filter((c) => c !== "groundedness"),
  };

  const diffs = validateContract(expectedFromContract, renderedAsContract, renderPlan);
  return classifyDiffs(diffs, { layer: "render" }).map((d) => ({
    ...d,
    classification: "UI_RENDERING_FAILURE" as const,
    contractPath:
      d.field === "count" && d.entityType === "customer"
        ? "fact_find.customers"
        : (d.groundTruthPath ?? d.contractPath),
    renderedPath: d.field === "presence" || d.actual === "NOT FOUND" ? "NOT FOUND" : (d.contractPath ?? "rendered"),
    groundTruthPath: undefined,
  }));
}
