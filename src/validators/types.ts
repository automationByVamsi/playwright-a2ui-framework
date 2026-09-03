import type { FieldDiff } from "../core/models/validation-result.js";

export interface GroundednessCheckResult {
  name: string;
  passed: boolean;
  message?: string;
  diffs: FieldDiff[];
}

export interface GroundednessContractResult {
  passed: boolean;
  complaintRef: string;
  groundednessStatus: string;
  checks: GroundednessCheckResult[];
  diffs: FieldDiff[];
}

export function flattenDiffs(result: GroundednessContractResult): FieldDiff[] {
  return result.diffs;
}

export function assertGroundednessContract(result: GroundednessContractResult): void {
  if (result.passed) return;
  const details = result.checks
    .filter((c) => !c.passed)
    .map((c) => `- ${c.name}: ${c.message ?? "failed"}`)
    .join("\n");
  throw new Error(`Tier 1 groundedness contract failed for ${result.complaintRef}\n${details}`);
}
