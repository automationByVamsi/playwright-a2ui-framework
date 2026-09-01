import type { Page, TestInfo } from "@playwright/test";

/**
 * Local stand-in for `@qecoe/playwright_automation` BasePage / CommonPage.
 * Do not copy this file into the work repo if CommonPage already exists there.
 */
export class CommonPage {
  constructor(
    public readonly page: Page,
    public readonly testInfo?: TestInfo,
  ) {}
}
