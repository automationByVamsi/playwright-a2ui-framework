import type { Page } from "@playwright/test";

/** Navigation only. Schema assertions live in A2UIVerifier, not in the POM. */
export class ComplaintPage {
  constructor(private readonly page: Page) {}

  async enterComplaintReference(ref: string): Promise<void> {
    await this.page.getByLabel(/complaint reference/i).fill(ref);
  }

  async submit(): Promise<void> {
    await this.page.getByRole("button", { name: /^search$/i }).click();
  }

  async waitForWorkflowCompletion(): Promise<void> {
    await this.page.getByRole("tab").first().waitFor({ state: "visible", timeout: 15_000 });
  }
}
