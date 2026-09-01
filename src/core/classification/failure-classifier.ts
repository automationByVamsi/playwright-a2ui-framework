import type { FailureClass } from "../models/failure.js";
import type { FieldDiff } from "../models/validation-result.js";

/**
 * Layer-aware classification.
 * Compare #1 diffs default to AGENT_OUTPUT_FAILURE.
 * Callers may pre-tag GROUNDEDNESS / UI_CONTRACT / DATA_TRANSFORMATION.
 */
export function classifyDiffs(
  diffs: FieldDiff[],
  options: { contractMalformed?: boolean; groundTruthInvalid?: boolean; layer: "contract" | "render" },
): FieldDiff[] {
  if (options.groundTruthInvalid) {
    return diffs.map((d) => ({ ...d, classification: "GROUND_TRUTH_FAILURE" as FailureClass }));
  }
  if (options.contractMalformed) {
    return diffs.map((d) => ({ ...d, classification: "UI_CONTRACT_FAILURE" as FailureClass }));
  }
  return diffs.map((d) => {
    if (d.classification && d.classification !== "AGENT_OUTPUT_FAILURE") return d;
    if (options.layer === "render") {
      return { ...d, classification: "UI_RENDERING_FAILURE" as FailureClass };
    }
    return { ...d, classification: "AGENT_OUTPUT_FAILURE" as FailureClass };
  });
}

export function primaryClassification(diffs: FieldDiff[]): FailureClass | undefined {
  const order: FailureClass[] = [
    "GROUND_TRUTH_FAILURE",
    "UI_CONTRACT_FAILURE",
    "GROUNDEDNESS_FAILURE",
    "AGENT_OUTPUT_FAILURE",
    "UI_RENDERING_FAILURE",
    "DATA_TRANSFORMATION_FAILURE",
    "TEST_EXECUTION_FAILURE",
    "VALIDATION_UNCERTAIN",
  ];
  const present = new Set(diffs.map((d) => d.classification));
  return order.find((c) => present.has(c));
}
