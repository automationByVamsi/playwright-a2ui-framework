import { mkdirSync } from "node:fs";
import path from "node:path";
import type { Locator, Page, TestInfo } from "@playwright/test";
import { CommonPage } from "../common.page.js";
import { CustomerSection } from "../../src/pages/CustomerSection.js";
import { AccountsSection } from "../../src/pages/AccountsSection.js";
import type { NormalizedCustomer } from "../../src/core/models/normalized.js";
import type { RenderedUiModel } from "../../src/core/models/rendered.js";
import type { ExecutedRender } from "../../src/core/playwright/executor.js";

/**
 * Work-repo shaped Complaints Workflow POM.
 *
 * Copy/merge into `pages/factfind/complaints-workflow.page.ts` in cce2ec-qe-playwright-e2e.
 * Keep your existing Hive login and locators; add `extractRenderedModel()`.
 * Locally, empty HIVE_UI uses the stub at STUB_URL (default http://127.0.0.1:4173).
 */
export class ComplaintsWorkflowPage extends CommonPage {
  dropRenderedPartyId?: string;

  readonly complaintReferenceInput: Locator;
  readonly searchButton: Locator;
  readonly clearButton: Locator;
  readonly factFinderButton: Locator;
  readonly analysisButton: Locator;

  constructor(page: Page, testInfo?: TestInfo) {
    super(page, testInfo);
    this.complaintReferenceInput = this.page.getByLabel("Complaint reference");
    this.searchButton = this.page.getByRole("button", { name: /^search$/i });
    this.clearButton = this.page.getByRole("button", { name: /^clear$/i });
    this.factFinderButton = this.page.getByRole("button", { name: /fact finder/i });
    this.analysisButton = this.page.getByRole("button", { name: /^analysis$/i });
  }

  get factFindRoot(): Locator {
    const article = this.page.getByRole("article");
    const liveGrid = this.page.locator('[role="tabpanel"]:not([hidden]) .csl-griditem').first();
    const livePanel = this.page.locator('[role="tabpanel"]:not([hidden])').first();
    return article.or(liveGrid).or(livePanel).first();
  }

  async openWorkflow(): Promise<void> {
    const hiveUi = process.env.HIVE_UI?.trim();
    if (hiveUi) {
      await this.openLiveWorkflow(hiveUi);
      return;
    }
    const stub = process.env.STUB_URL ?? "http://127.0.0.1:4173";
    const drop = this.dropRenderedPartyId ?? process.env.DROP_RENDERED_PARTY_ID;
    const url = drop ? `${stub.replace(/\/$/, "")}/?drop=${encodeURIComponent(drop)}` : stub;
    await this.page.goto(url, { waitUntil: "domcontentloaded" });
  }

  async searchComplaint(complaintRef: string): Promise<void> {
    await this.complaintReferenceInput.fill(complaintRef);
    await this.searchButton.click();
  }

  async waitForLoader(timeoutMs = Number(process.env.FACTFIND_RESPONSE_READY_TIMEOUT_MS ?? 180_000)): Promise<void> {
    const loader = this.page.getByRole("progressbar").or(this.page.getByText(/^loading/i)).first();
    try {
      await loader.waitFor({ state: "visible", timeout: 2_000 });
      await loader.waitFor({ state: "hidden", timeout: timeoutMs });
    } catch {
      // Stub and some live loads never show a loader.
    }
  }

  async waitForCustomerTabs(timeoutMs = Number(process.env.FACTFIND_RESPONSE_READY_TIMEOUT_MS ?? 180_000)): Promise<void> {
    await this.page.locator('[role="tablist"], [role="tab"], .tab').first().waitFor({
      state: "visible",
      timeout: timeoutMs,
    });
  }

  async expandAllAccordions(): Promise<void> {
    const closed = this.factFindRoot.locator("details:not([open])");
    const closedCount = await closed.count();
    for (let i = 0; i < closedCount; i++) {
      await closed.nth(i).locator("summary").click();
    }
    const buttons = this.page.getByRole("button", {
      name: /personal details|accounts and products|contact notes|support needs|related parties/i,
    });
    const n = await buttons.count();
    for (let i = 0; i < n; i++) {
      const btn = buttons.nth(i);
      const expanded = await btn.getAttribute("aria-expanded");
      if (expanded === "false") await btn.click();
    }
  }

  async ensureAccordionExpanded(label: string): Promise<void> {
    const button = this.page.getByRole("button", { name: new RegExp(`^\\s*${escapeRegExp(label)}`, "i") });
    if ((await button.count()) === 0) return;
    const expanded = await button.first().getAttribute("aria-expanded");
    if (expanded === "false") await button.first().click();
  }

  async getCustomerTabNames(): Promise<string[]> {
    const tabs = this.page.getByRole("tab");
    if ((await tabs.count()) === 0) return [];
    return (await tabs.allInnerTexts()).map((t) => t.trim()).filter(Boolean);
  }

  async selectCustomer(name: string): Promise<void> {
    await this.page.getByRole("tab", { name }).click();
    const article = this.page.getByRole("article", { name });
    if (await article.count()) {
      await article.first().waitFor({ state: "visible", timeout: 10_000 });
      return;
    }
    await this.factFindRoot.waitFor({ state: "visible", timeout: 10_000 });
  }

  async getCustomerProfiles(): Promise<NormalizedCustomer[]> {
    const names = await this.getCustomerTabNames();
    const profiles: NormalizedCustomer[] = [];
    const customers = new CustomerSection(this.page, this.factFindRoot);
    const accounts = new AccountsSection(this.page, this.factFindRoot);

    for (const name of names) {
      await this.selectCustomer(name);
      await this.expandAllAccordions();
      const snap = await customers.snapshotArticle();
      const personal = {
        name: snap.fields.Name ?? name,
        dateOfBirth: snap.fields["Date of birth"] ?? "",
        age: snap.fields.Age ?? "",
        maritalStatus: snap.fields["Marital status"] ?? "",
        address: snap.fields["Residential address"] ?? "",
        partyId: snap.fields["Party id"] ?? "",
        timeWithBank: snap.fields["Time with bank"] ?? "",
      };
      const accountRows = await accounts.getAccounts(personal.partyId || name);
      profiles.push(
        customers.toNormalized(name, personal, accountRows, {
          contactNotes: snap.contactNotes ? [snap.contactNotes] : [],
          supportNeeds: snap.supportNeeds ? [snap.supportNeeds] : [],
          relatedParties: snap.relatedParties ? [snap.relatedParties] : [],
        }),
      );
    }
    return profiles;
  }

  async getComplaintReference(): Promise<string> {
    const headingRef = this.page.locator("strong");
    if (await headingRef.count()) {
      const text = (await headingRef.first().innerText()).trim();
      if (text) return text;
    }
    return (await this.complaintReferenceInput.inputValue()).trim();
  }

  async extractRenderedModel(reportDir: string, complaintRef: string): Promise<ExecutedRender> {
    const customers = await this.getCustomerProfiles();
    const renderedRef = await this.getComplaintReference();
    const visibleText = await this.page.locator("body").innerText();

    const evidenceDir = path.join(reportDir, "evidence");
    mkdirSync(evidenceDir, { recursive: true });
    const shot = path.join(evidenceDir, `${complaintRef}-rendered.png`);
    await this.page.screenshot({ path: shot, fullPage: true });

    const model: RenderedUiModel = {
      complaintRef: renderedRef,
      customers,
      visibleText,
      strategy: customers.length > 0 ? "semantic" : "visual-fallback",
    };

    return {
      model,
      evidence: {
        screenshotPath: path.relative(process.cwd(), shot),
      },
    };
  }

  private async openLiveWorkflow(hiveUi: string): Promise<void> {
    await this.page.goto(hiveUi, { waitUntil: "domcontentloaded" });
    await this.maybeMicrosoftLogin();
    const candidate = this.page
      .getByRole("link", { name: /complaints workflow/i })
      .or(this.page.getByRole("button", { name: /complaints workflow/i }))
      .or(this.page.getByText(/complaints workflow/i));
    if (await candidate.count()) {
      await candidate.first().click();
    }
  }

  private async maybeMicrosoftLogin(): Promise<void> {
    const username = process.env.HIVE_USERNAME;
    const password = process.env.HIVE_PASSWORD;
    if (!username || !password) return;

    const email = this.page.locator("#i0116");
    try {
      await email.waitFor({ state: "visible", timeout: 8_000 });
    } catch {
      return;
    }
    await email.fill(username);
    await this.page.locator("#idSIButton9").click();
    await this.page.locator("#i0118").fill(password);
    await this.page.locator("#idSIButton9").click();
    const staySignedIn = this.page.locator("#idSIButton9");
    try {
      await staySignedIn.waitFor({ state: "visible", timeout: 8_000 });
      await staySignedIn.click();
    } catch {
      // Already past the stay-signed-in prompt.
    }
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
