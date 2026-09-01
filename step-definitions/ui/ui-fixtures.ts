import type { Page, TestInfo } from "@playwright/test";
import { test as base, createBdd } from "playwright-bdd";
import { CommonPage } from "../../pages/common.page.js";
import { FactFindPage } from "../../pages/factfind/fact-find.page.js";
import { FactFindWorkflowPage } from "../../pages/factfind/fact-find-workflow.page.js";
import { AgentOutputPage } from "../../pages/factfind/agent-output.page.js";
import { ComplaintsWorkflowPage } from "../../pages/factfind/complaints-workflow.page.js";
import type { ValidationResult } from "../../src/core/models/validation-result.js";

/**
 * Mirrors work-repo `step-definitions/ui/ui-fixtures.ts`.
 * On the work machine, keep extending their BasePage; swap only the validator import in steps.
 */
export class UIWorld extends CommonPage {
  readonly factFindPage: FactFindPage;
  readonly factFindWorkflowPage: FactFindWorkflowPage;
  readonly agentOutputPage: AgentOutputPage;
  readonly complaintsWorkflowPage: ComplaintsWorkflowPage;

  complaintRef = "";
  aggregatedPayload: unknown;
  agentOutputTrace: unknown;
  lastValidationResult?: ValidationResult;

  constructor(page: Page, testInfo: TestInfo) {
    super(page, testInfo);
    this.factFindPage = new FactFindPage(page, testInfo);
    this.factFindWorkflowPage = new FactFindWorkflowPage(page, testInfo);
    this.agentOutputPage = new AgentOutputPage(page, testInfo);
    this.complaintsWorkflowPage = new ComplaintsWorkflowPage(page, testInfo);
  }
}

export const test = base.extend<{ uiWorld: UIWorld }>({
  uiWorld: async ({ page }, use, testInfo) => {
    await use(new UIWorld(page, testInfo));
  },
});

export const { Given, When, Then, Before, After } = createBdd(test, { worldFixture: "uiWorld" });
