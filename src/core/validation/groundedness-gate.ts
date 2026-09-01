import type { FieldDiff } from "../models/validation-result.js";

export function validateGroundedness(status: string | undefined): FieldDiff[] {
  const value = (status ?? "").trim().toLowerCase();
  if (value === "correct") return [];
  return [
    {
      entityType: "groundedness",
      entityId: "groundednessCheck",
      field: "status",
      expected: "correct",
      actual: status ?? null,
      classification: "GROUNDEDNESS_FAILURE",
      contractPath: "groundednessCheck.status",
      rule: "groundedness.correct",
      message: `Groundedness check failed: expected "correct", actual "${status ?? ""}"`,
    },
  ];
}
