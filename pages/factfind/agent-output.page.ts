import type { Page, TestInfo } from "@playwright/test";
import { CommonPage } from "../common.page.js";

/**
 * Work-repo shaped agent-output page.
 * Keep waiters and complaint-ref assertion; replace harvest/A2UI trials with the engine.
 */
export class AgentOutputPage extends CommonPage {
  constructor(page: Page, testInfo?: TestInfo) {
    super(page, testInfo);
  }

  async waitForAgentOutput(timeoutMs = Number(process.env.FACTFIND_RESPONSE_READY_TIMEOUT_MS ?? 180_000)): Promise<void> {
    await this.page.getByRole("tab").first().waitFor({ state: "visible", timeout: timeoutMs });
  }

  async waitForGeneratedResponse(timeoutMs = Number(process.env.FACTFIND_RESPONSE_READY_TIMEOUT_MS ?? 180_000)): Promise<void> {
    const sentinels = this.page
      .getByRole("tab")
      .or(this.page.getByText(/complaint reference/i))
      .or(this.page.getByRole("heading", { name: /agent response/i }));
    await sentinels.first().waitFor({ state: "visible", timeout: timeoutMs });
  }

  async getAgentText(): Promise<string> {
    return (await this.page.locator("body").innerText()).trim();
  }

  async assertComplaintReference(complaintRef: string): Promise<void> {
    const heading = this.page.locator("strong");
    if (await heading.count()) {
      await heading.first().waitFor({ state: "visible", timeout: 15_000 });
      const text = (await heading.first().innerText()).trim();
      if (text.includes(complaintRef)) return;
    }
    const body = await this.getAgentText();
    if (!body.includes(complaintRef)) {
      throw new Error(`Complaint reference ${complaintRef} was not displayed`);
    }
  }
}
