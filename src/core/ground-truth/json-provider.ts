import { readFileSync } from "node:fs";
import {
  canonicalAccountNumber,
  canonicalAddress,
  canonicalAge,
  canonicalDuration,
  canonicalEmptyOrList,
  canonicalIndicators,
  canonicalIsoDate,
  canonicalMoneyMinor,
  canonicalNameFromParts,
  canonicalPartyId,
  canonicalStatus,
} from "../normalization/index.js";
import { EMPTY } from "../models/normalized.js";
import type { NormalizedAccount, NormalizedCustomer, NormalizedExpectedModel } from "../models/normalized.js";
import type {
  GroundTruthProvider,
  RawAccount,
  RawCustomer,
  RawNote,
  RawRelatedParty,
  RawSupportNeed,
} from "./provider.js";

type Json = Record<string, unknown>;

function rec(value: unknown): Json {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Json;
  }
  return {};
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export class JsonGroundTruthProvider implements GroundTruthProvider {
  private readonly root: Json;
  private readonly sources: Json;
  private readonly derived: Json;

  constructor(payload: unknown) {
    this.root = rec(payload);
    this.sources = rec(this.root.sources);
    this.derived = rec(this.root.derived);
  }

  static fromFile(filePath: string): JsonGroundTruthProvider {
    const raw = readFileSync(filePath, "utf8");
    return new JsonGroundTruthProvider(JSON.parse(raw));
  }

  getComplaint() {
    const ica = rec(this.sources.ica);
    const header = rec(ica.header);
    const items = arr(ica.items);
    const first = rec(items[0]);
    const relatedAccountNumbers = [
      ...new Set(
        items
          .map((item) => canonicalAccountNumber(rec(item).accountNumberFull ?? rec(item).accountNumber))
          .filter((n) => n.length > 0),
      ),
    ];
    return {
      complaintRef: String(this.root.complaintRef ?? header.caseReference ?? ""),
      narrative: first.partVerbatim != null ? String(first.partVerbatim) : undefined,
      investigation: first.partInvestigationText != null ? String(first.partInvestigationText) : undefined,
      outcome: first.partOutcomeDecisionText != null ? String(first.partOutcomeDecisionText) : undefined,
      relatedAccountNumbers,
    };
  }

  getCustomers(): RawCustomer[] {
    const ids = this.resolvedPartyIds();
    const icaCustomers = arr(rec(this.sources.ica).customers);
    const holdings = rec(rec(this.sources.customerHolding).customerHoldingsByParty);

    return ids.map((partyId) => {
      const ica = icaCustomers.find((c) => canonicalPartyId(rec(c).customerOCISID) === partyId);
      const icaRec = rec(ica);
      const holding = rec(rec(holdings[partyId]).party);
      const address = rec(holding.address);
      const addressLines = arr(address.addressLines).map((l) => (l == null ? null : String(l)));

      if (addressLines.length === 0) {
        addressLines.push(
          icaRec.customerAddress1 as string,
          icaRec.customerAddress2 as string,
          icaRec.customerAddress3 as string,
        );
      }

      const postcode =
        (address.postcode as string | undefined) ?? (icaRec.customerAddressPostcode as string | undefined);

      return {
        partyId,
        title: String(holding.title ?? icaRec.customerNameTitleDescr ?? ""),
        firstName: String(holding.foreName ?? icaRec.customerFirstName ?? ""),
        lastName: String(holding.lastName ?? icaRec.customerLastName ?? ""),
        dateOfBirth: holding.dateOfBirth != null ? String(holding.dateOfBirth) : undefined,
        age: holding.age != null ? Number(holding.age) : undefined,
        maritalStatus: holding.maritalStatus != null ? String(holding.maritalStatus) : undefined,
        timeWithBank: holding.timeWithBank != null ? String(holding.timeWithBank) : undefined,
        addressLines,
        postcode,
        sourcePath: `sources.customerHolding.customerHoldingsByParty.${partyId}.party`,
      };
    });
  }

  getAccounts(partyId: string): RawAccount[] {
    const holdings = rec(rec(this.sources.customerHolding).customerHoldingsByParty);
    const partyHolding = rec(holdings[partyId]);
    const products = arr(partyHolding.product);
    const detailsRoot = rec(this.sources.accountDetails);

    return products.map((product, index) => {
      const p = rec(product);
      const accountNumber = canonicalAccountNumber(p.accountNumber);
      const detailsEntry = this.lookupAccountDetails(detailsRoot, accountNumber);
      const details = rec(rec(detailsEntry).details);
      const balance = rec(details.balance);
      const partyList = arr(p.partyList).map((x) => canonicalPartyId(rec(x).partyId));

      const current =
        balance.currentBalance != null ? Number(balance.currentBalance) : Number(balance.interimBookedBalance ?? 0);

      return {
        accountNumber,
        accountName: String(p.accountName ?? ""),
        status: String(p.accountStatus ?? ""),
        openedDate: String(p.accountOpenedDate ?? ""),
        currentBalance: Number.isFinite(current) ? current : 0,
        pendingBalance: balance.interimAvailableBalance != null ? Number(balance.interimAvailableBalance) : 0,
        overdraft: balance.overdraftAmount != null ? Number(balance.overdraftAmount) : 0,
        finalAvailable:
          balance.interimAvailableWithCreditBalance != null
            ? Number(balance.interimAvailableWithCreditBalance)
            : 0,
        customerRole: String(p.productHeldRoleType ?? ""),
        partyIds: partyList.length > 0 ? partyList : [partyId],
        productType: String(p.productType ?? ""),
        indicators: details.indicators ?? null,
        sourcePath: `sources.customerHolding.customerHoldingsByParty.${partyId}.product[${index}]`,
      };
    });
  }

  getContactNotes(partyId: string): RawNote[] {
    const byParty = rec(this.sources.contactNotesByParty);
    const entry = rec(byParty[partyId]);
    return arr(entry.notes).map((n) => ({
      text: typeof n === "string" ? n : JSON.stringify(n),
    }));
  }

  getSupportNeeds(partyId: string): RawSupportNeed[] {
    const holdings = rec(rec(this.sources.customerHolding).customerHoldingsByParty);
    const indicator = rec(rec(rec(holdings[partyId]).party).partyIndicator);
    return arr(indicator.supportNeeds).map((n) => ({
      text: typeof n === "string" ? n : JSON.stringify(n),
    }));
  }

  getRelatedParties(partyId: string): RawRelatedParty[] {
    const byParty = rec(this.sources.trustedPartiesByParty);
    const entry = rec(byParty[partyId]);
    return arr(entry.trustedParties).map((p) => {
      const r = rec(p);
      return {
        partyId: r.partyId != null ? canonicalPartyId(r.partyId) : undefined,
        name: r.name != null ? String(r.name) : undefined,
      };
    });
  }

  toNormalized(): NormalizedExpectedModel {
    const complaint = this.getComplaint();
    const relatedSet = new Set(complaint.relatedAccountNumbers);

    const customers: NormalizedCustomer[] = this.getCustomers().map((raw) => {
      const accounts: NormalizedAccount[] = this.getAccounts(raw.partyId).map((acct) =>
        this.normalizeAccount(acct, relatedSet),
      );

      return {
        partyId: raw.partyId,
        name: canonicalNameFromParts(raw.title, raw.firstName, raw.lastName),
        dateOfBirth: canonicalIsoDate(raw.dateOfBirth),
        age: canonicalAge(raw.age),
        maritalStatus: canonicalStatus(raw.maritalStatus),
        address: canonicalAddress(raw.addressLines, raw.postcode),
        timeWithBank: canonicalDuration(raw.timeWithBank),
        accounts,
        contactNotes: canonicalEmptyOrList(this.getContactNotes(raw.partyId).map((n) => n.text)),
        supportNeeds: canonicalEmptyOrList(this.getSupportNeeds(raw.partyId).map((n) => n.text)),
        relatedParties: canonicalEmptyOrList(
          this.getRelatedParties(raw.partyId).map((p) => p.name ?? p.partyId ?? ""),
        ),
        sections: [
          "Personal details",
          "Accounts and products",
          "Contact notes",
          "Support needs",
          "Related parties",
        ],
        sourcePath: raw.sourcePath,
      };
    });

    return { complaint, customers };
  }

  private normalizeAccount(acct: RawAccount, relatedSet: Set<string>): NormalizedAccount {
    return {
      accountNumber: acct.accountNumber,
      accountName: acct.accountName.trim(),
      status: canonicalStatus(acct.status),
      openedDate: canonicalIsoDate(acct.openedDate),
      currentBalanceMinor: canonicalMoneyMinor(acct.currentBalance),
      pendingBalanceMinor: canonicalMoneyMinor(acct.pendingBalance),
      overdraftMinor: canonicalMoneyMinor(acct.overdraft),
      finalAvailableMinor: canonicalMoneyMinor(acct.finalAvailable),
      customerRole: canonicalStatus(acct.customerRole),
      partyIds: [...acct.partyIds].map(canonicalPartyId).sort(),
      relationshipToComplaint: relatedSet.has(acct.accountNumber) ? "related" : "unrelated",
      productIndicators: canonicalIndicators(acct.indicators),
      sourcePath: acct.sourcePath,
    };
  }

  private resolvedPartyIds(): string[] {
    const fromDerived = arr(this.derived.customerFlowPartyIds).concat(arr(this.derived.resolvedPartyIds));
    const ids = fromDerived.map(canonicalPartyId).filter(Boolean);
    if (ids.length > 0) {
      return [...new Set(ids)];
    }
    return arr(rec(this.sources.ica).customers).map((c) => canonicalPartyId(rec(c).customerOCISID));
  }

  private lookupAccountDetails(detailsRoot: Json, accountNumber: string): unknown {
    for (const [key, value] of Object.entries(detailsRoot)) {
      if (canonicalAccountNumber(key) === accountNumber) return value;
      const inner = rec(rec(value).details).accountNumber;
      if (canonicalAccountNumber(inner) === accountNumber) return value;
    }
    return {};
  }
}

export function emptyToDisplay(value: typeof EMPTY | string[] | string): string {
  if (value === EMPTY) return "EMPTY";
  if (Array.isArray(value)) return value.join(" | ");
  return value;
}
