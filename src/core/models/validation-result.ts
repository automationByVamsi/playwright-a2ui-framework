import type { FailureClass } from "./failure.js";

export interface FieldDiff {
  entityType: string;
  entityId: string;
  field: string;
  expected: unknown;
  actual: unknown;
  classification: FailureClass;
  groundTruthPath?: string;
  contractPath?: string;
  renderedPath?: string;
  rule: string;
  message: string;
}
