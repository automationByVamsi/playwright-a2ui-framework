import type { CheckStatus, FailureClass } from "./failure.js";

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

export interface EntityResult {
  type: string;
  id: string;
  displayName?: string;
  status: CheckStatus;
  paths?: {
    groundTruth?: string;
    contract?: string;
    rendered?: string;
  };
}

export interface LayerResult {
  status: CheckStatus;
  reason?: string;
}

export interface ValidationResult {
  schemaVersion: "1.0";
  agent: string;
  scenario: string;
  complaintRef: string;
  overall: CheckStatus;
  gating: CheckStatus;
  layers: {
    groundTruth: LayerResult;
    adkContract: LayerResult;
    renderedUi: LayerResult;
    semantic: LayerResult;
  };
  groundedness: { status: CheckStatus; value?: string; message?: string };
  counts: Record<string, { expected: number; actual: number }>;
  entities: EntityResult[];
  diffs: FieldDiff[];
  missing: FieldDiff[];
  duplicates: FieldDiff[];
  evidence: {
    redaction: "applied" | "none";
    reportPath?: string;
    screenshot?: string | null;
    trace?: string | null;
    accessibilitySnapshot?: string | null;
  };
}

export function isFailure(result: ValidationResult): boolean {
  return result.overall === "FAIL" || result.overall === "UNCERTAIN";
}
