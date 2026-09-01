import type { Page, TestInfo } from "@playwright/test";
import { CommonPage } from "../common.page.js";

/** Placeholder so UIWorld matches the work-repo constructor. */
export class FactFindWorkflowPage extends CommonPage {
  constructor(page: Page, testInfo?: TestInfo) {
    super(page, testInfo);
  }
}
