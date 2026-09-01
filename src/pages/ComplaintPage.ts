import type { Page } from "@playwright/test";
import { CustomerSection } from "./CustomerSection.js";
import { AccountsSection } from "./AccountsSection.js";
import { AnalysisSection } from "./AnalysisSection.js";
import type { NormalizedCustomer } from "../core/models/normalized.js";

/**
 * Semantic extractors: tabs by accessible name, article by role,
 * fields by visible dt labels. No hashed CSS or generated IDs.
 */
export class ComplaintPage {
  readonly customers: CustomerSection;
  readonly accounts: AccountsSection;
  readonly analysis: AnalysisSection;

  constructor(private readonly page: Page) {
    this.customers = new CustomerSection(page);
    this.accounts = new AccountsSection(page);
    this.analysis = new AnalysisSection(page);
  }

  async enterComplaintReference(ref: string): Promise<void> {
    await this.page.getByLabel(/complaint reference/i).fill(ref);
  }

  async submit(): Promise<void> {
    await this.page.getByRole("button", { name: /^search$/i }).click();
  }

  async waitForWorkflowCompletion(): Promise<void> {
    await this.page.getByRole("tab").first().waitFor({ state: "visible", timeout: 15_000 });
  }

  async getCustomerTabNames(): Promise<string[]> {
    const tabs = this.page.getByRole("tab");
    if ((await tabs.count()) === 0) return [];
    return (await tabs.allInnerTexts()).map((t) => t.trim()).filter(Boolean);
  }

  async getComplaintReference(): Promise<string> {
    const headingRef = this.page.locator("strong");
    if (await headingRef.count()) {
      const text = (await headingRef.first().innerText()).trim();
      if (text) return text;
    }
    return (await this.page.getByLabel(/complaint reference/i).inputValue()).trim();
  }

  async selectCustomer(name: string): Promise<void> {
    await this.page.getByRole("tab", { name }).click();
    await this.page.getByRole("article", { name }).waitFor({ state: "visible", timeout: 5_000 });
  }

  async getCustomerProfiles(): Promise<NormalizedCustomer[]> {
    const names = await this.getCustomerTabNames();
    const profiles: NormalizedCustomer[] = [];
    for (const name of names) {
      await this.selectCustomer(name);
      const snap = await this.customers.snapshotArticle();
      const personal = {
        name: snap.fields.Name ?? name,
        dateOfBirth: snap.fields["Date of birth"] ?? "",
        age: snap.fields.Age ?? "",
        maritalStatus: snap.fields["Marital status"] ?? "",
        address: snap.fields["Residential address"] ?? "",
        partyId: snap.fields["Party id"] ?? "",
        timeWithBank: snap.fields["Time with bank"] ?? "",
      };
      const accounts = await this.accounts.getAccounts(personal.partyId || name);
      profiles.push(
        this.customers.toNormalized(name, personal, accounts, {
          contactNotes: snap.contactNotes ? [snap.contactNotes] : [],
          supportNeeds: snap.supportNeeds ? [snap.supportNeeds] : [],
          relatedParties: snap.relatedParties ? [snap.relatedParties] : [],
        }),
      );
    }
    return profiles;
  }
}
