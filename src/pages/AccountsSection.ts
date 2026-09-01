import type { Locator, Page } from "@playwright/test";
import type { NormalizedAccount } from "../core/models/normalized.js";
import { CustomerSection } from "./CustomerSection.js";
import {
  canonicalAccountNumber,
  canonicalIndicators,
  canonicalIsoDate,
  canonicalMoneyMinor,
  canonicalPartyId,
  canonicalStatus,
} from "../core/normalization/index.js";

export class AccountsSection {
  constructor(
    private readonly page: Page,
    private readonly root?: Locator,
  ) {}

  async getAccounts(_customerIdentifier: string): Promise<NormalizedAccount[]> {
    const snap = await new CustomerSection(this.page, this.root).snapshotArticle();
    return snap.accounts.map((acct) => {
      const parsed = this.parseLabel(acct.label);
      const f = acct.fields;
      const partyIds: string[] = [];
      for (let n = 1; n <= 8; n++) {
        const value = f[`Party id ${n}`];
        if (!value) break;
        partyIds.push(canonicalPartyId(value));
      }
      return {
        accountNumber: parsed.accountNumber,
        accountName: parsed.accountName,
        status: canonicalStatus(f["Account status"]),
        openedDate: canonicalIsoDate(f["Account opened"]),
        currentBalanceMinor: canonicalMoneyMinor(f["Current balance"]),
        pendingBalanceMinor: canonicalMoneyMinor(f["Balance after pending transactions"]),
        overdraftMinor: canonicalMoneyMinor(f["Overdraft amount"]),
        finalAvailableMinor: canonicalMoneyMinor(f["Final available balance"]),
        customerRole: canonicalStatus(f["Customer role on the product"]),
        partyIds: partyIds.sort(),
        relationshipToComplaint: acct.relationship,
        productIndicators: canonicalIndicators(f["Product indicators"]),
        sourcePath: `rendered.account[${parsed.accountNumber}]`,
      };
    });
  }

  private parseLabel(label: string): { accountName: string; accountNumber: string } {
    const m = label.trim().match(/^(.*?)\s+(\d{8,})$/);
    if (!m) return { accountName: label.trim(), accountNumber: canonicalAccountNumber(label) };
    return { accountName: m[1].trim(), accountNumber: canonicalAccountNumber(m[2]) };
  }
}
