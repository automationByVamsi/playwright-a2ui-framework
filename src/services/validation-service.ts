import type { Page } from "@playwright/test";
import { runContractValidation, runFullValidation } from "../core/orchestration/pipeline.js";
import type { TestContext } from "../core/models/context.js";
import type { ValidationResult } from "../core/models/validation-result.js";
import { isFailure } from "../core/models/validation-result.js";

export class ValidationService {
  run(ctx: TestContext): ValidationResult {
    return runContractValidation(ctx);
  }

  async runWithRender(ctx: TestContext, page: Page): Promise<ValidationResult> {
    return runFullValidation(ctx, page);
  }

  assertPassed(result: ValidationResult): void {
    if (isFailure(result)) {
      const details = [
        ...result.missing.map((d) => d.message),
        ...result.duplicates.map((d) => d.message),
        ...result.diffs.map((d) => d.message),
      ].join("\n");
      throw new Error(`Validation failed (${result.overall}).\n${details}`);
    }
  }
}
