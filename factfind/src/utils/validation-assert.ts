import { ValidatorError } from "./validator-errors.js";
import { isFailure, type FieldDiff, type ValidationResult } from "../../../src/core/models/validation-result.js";

function formatValue(value: unknown): string {
  if (value === undefined) return "undefined";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function formatDiffs(diffs: FieldDiff[]): string {
  return diffs.map((d) => `[${d.classification}] ${d.message}`).join("\n");
}

/**
 * Map engine diffs through the same assertion helpers Allure/Xray already use in the work repo.
 * Replace this file with the work-repo copy if it already exists, but keep `scenario()`.
 */
export class ValidationAssert {
  static mismatch(field: string, expected: unknown, actual: unknown, path?: string): never {
    throw new ValidatorError(
      "MISMATCH",
      `${field}: expected ${formatValue(expected)}, actual ${formatValue(actual)}`,
      { path, expected, actual },
    );
  }

  static missing(entity: string, id: string, path?: string): never {
    throw new ValidatorError("MISSING", `Missing ${entity}: ${id}`, { path, id });
  }

  static equal(field: string, expected: unknown, actual: unknown, path?: string): void {
    if (expected !== actual) ValidationAssert.mismatch(field, expected, actual, path);
  }

  static present(label: string, value: unknown): void {
    if (value === undefined || value === null || value === "") {
      throw new ValidatorError("ABSENT", `${label} was not present`);
    }
  }

  static absent(label: string, value: unknown): void {
    if (value !== undefined && value !== null && value !== "") {
      throw new ValidatorError("UNEXPECTED", `${label} should be absent, actual ${formatValue(value)}`);
    }
  }

  static contains(haystack: string, needle: string, label = "text"): void {
    if (!haystack.includes(needle)) {
      throw new ValidatorError("CONTAINS", `${label} did not contain "${needle}"`);
    }
  }

  static count(label: string, expected: number, actual: number): void {
    if (expected !== actual) ValidationAssert.mismatch(`${label} count`, expected, actual);
  }

  static atLeastCount(label: string, minimum: number, actual: number): void {
    if (actual < minimum) {
      throw new ValidatorError("COUNT", `${label} count ${actual} is below minimum ${minimum}`);
    }
  }

  static visible(label: string, isVisible: boolean): void {
    if (!isVisible) throw new ValidatorError("VISIBLE", `${label} was not visible`);
  }

  static scenario(result: ValidationResult): void {
    if (!isFailure(result)) return;
    const diffs = [...result.missing, ...result.duplicates, ...result.diffs];
    const classification =
      result.layers.renderedUi.status === "FAIL"
        ? result.layers.renderedUi.reason ?? "UI_RENDERING_FAILURE"
        : result.layers.adkContract.reason ?? result.overall;
    throw new ValidatorError(classification, formatDiffs(diffs) || `Validation ${result.overall}`, result);
  }
}
