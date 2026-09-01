import type { Page } from "@playwright/test";

export class AnalysisSection {
  constructor(private readonly page: Page) {}

  async getAnalysisSections(): Promise<string[]> {
    const analysis = this.page.getByRole("button", { name: /^analysis$/i });
    if ((await analysis.count()) > 0) {
      await analysis.click();
    }
    const headings = this.page.getByRole("heading");
    return (await headings.allInnerTexts()).map((t) => t.trim()).filter(Boolean);
  }

  async getComplaintSummary(): Promise<{ headings: string[]; texts: string[] }> {
    const article = this.page.getByRole("article").first();
    const paras = (await article.locator("p").allInnerTexts()).map((t) => t.trim()).filter(Boolean);
    return {
      headings: paras.filter((p) => /^\d+\./.test(p)),
      texts: paras.filter((p) => p.startsWith("-")),
    };
  }
}
