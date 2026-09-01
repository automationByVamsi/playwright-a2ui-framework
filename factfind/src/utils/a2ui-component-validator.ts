import type { Page } from "@playwright/test";
import { runObjectValidation } from "../../../src/core/orchestration/pipeline.js";
import type { ValidationResult } from "../../../src/core/models/validation-result.js";
import type { ComplaintsWorkflowPage } from "../../../pages/factfind/complaints-workflow.page.js";
import { ValidationAssert } from "./validation-assert.js";

export interface ValidateRenderedUiOptions {
  targetSections?: string[];
  reportDir?: string;
  complaintRef?: string;
  /** When false, returns the result instead of throwing. Default true. */
  assert?: boolean;
}

/**
 * Drop-in replacement for the broken work-repo `A2UIComponentValidator`.
 *
 * Constructor matches the existing step:
 *   new A2UIComponentValidator(this.page, this.complaintsWorkflowPage)
 *
 * Compare #1 (aggregated payload ↔ ADK contract) and Compare #2 (contract ↔ rendered UI)
 * both gate. Copy this file plus `src/core`, `src/agents/complaints-workflow`,
 * and `src/pages/{CustomerSection,AccountsSection}.ts`.
 */
export class A2UIComponentValidator {
  constructor(
    private readonly page: Page,
    private readonly complaintsWorkflowPage: ComplaintsWorkflowPage,
  ) {}

  async validateRenderedUI(
    aggregatedPayload: unknown,
    agentOutputTrace: unknown,
    options: ValidateRenderedUiOptions = {},
  ): Promise<ValidationResult> {
    const reportDir = options.reportDir ?? process.env.A2UI_REPORT_DIR ?? "reports/validation";
    const complaintRef = options.complaintRef ?? this.readComplaintRef(agentOutputTrace);
    const rendered = await this.complaintsWorkflowPage.extractRenderedModel(reportDir, complaintRef || "unknown");

    const result = runObjectValidation({
      scenario: options.targetSections?.join(",") || "customer-profile",
      complaintRef,
      aggregatedPayload,
      agentOutputTrace,
      reportDir,
      targetSections: options.targetSections,
      rendered,
    });

    if (options.assert !== false) {
      ValidationAssert.scenario(result);
    }
    return result;
  }

  private readComplaintRef(trace: unknown): string {
    if (!trace || typeof trace !== "object") return "";
    const rec = trace as Record<string, unknown>;
    if (typeof rec.complaintRef === "string") return rec.complaintRef;
    return "";
  }
}
