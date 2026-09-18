import assert from "node:assert/strict";
import { first14, readFactFindUi, str, uniqueSorted } from "./json-get";
import { factFindMap } from "./factfind-map";
import {
  failuresOf,
  money,
  readSourceView,
  readUiView,
  runCompare,
  toIsoDate,
  toIsoDateTime,
  type CompareResult,
  type CustomerView,
  type ItemView,
  type SideView,
} from "./compare-map";
import { reportOf, type ComparisonReport } from "./comparison-report";

/**
 * Step-1: Fact Find UI vs aggregated Fact Find source.
 *
 * Reads final_agent_response first (Bruno / raw_events), then agentOutput.
 * Compares fact_find only — not summaryBox / analysis / groundedness.
 *
 * The compare contract is a config: factfind-map.ts. Locators are read by
 * json-get.ts and matched by compare-map.ts. To add a field, add a row to the
 * map — nothing in this file needs to change.
 */

export { first14, readFactFindUi };

export type AccountFacts = {
  number: string;
  productName: string;
  related: boolean;
  status: string;
  opened: string;
  role: string;
  productIndicators: string;
  currentBalance: string;
  balanceAfterPending: string;
  overdraftAmount: string;
  finalAvailableBalance: string;
  partiesOnAccount: string;
  partyIds: string[];
};

export type SupportNeedFacts = {
  description: string;
  lastChanged: string;
  dateRecorded: string;
  consentStatus: string;
  nextReview: string;
  furtherInformation: string;
};

export type RelatedPartyFacts = {
  relationship: string;
  relationshipCode: string;
  name: string;
  relatedPartyId: string;
  partyType: string;
};

export type ContactNoteFacts = {
  contactAt: string;
  details: string;
  classification: string;
  outcome: string;
  direction: string;
  method: string;
  location: string;
  associatedCaseId: string;
  brand: string;
};

export type CustomerFacts = {
  partyId: string;
  title: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  age: string;
  maritalStatus: string;
  addressLines: string[];
  postcode: string;
  addressTag: string;
  timeWithBank: string;
  relatedAccounts: string[];
  unrelatedAccounts: string[];
  accounts: AccountFacts[];
  supportNeeds: SupportNeedFacts[];
  relatedParties: RelatedPartyFacts[];
  contactNotes: ContactNoteFacts[];
};

export type FactFindFacts = {
  partyIds: string[];
  icaAccounts: string[];
  customers: Record<string, CustomerFacts>;
};

const TITLES = /^(ms|mr|mrs|miss|mx|dr)$/i;
const POSTCODE = /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i;

function one(values: string[] | undefined): string {
  return values?.[0] ?? "";
}

/** Source quotes title / forename / surname; the UI quotes one line. */
function splitName(values: string[]): { title: string; firstName: string; lastName: string } {
  const parts = (values.length > 1 ? values : one(values).split(/\s+/)).map(str).filter(Boolean);
  const title = TITLES.test(parts[0] ?? "") ? (parts[0] as string) : "";
  const rest = parts.slice(title ? 1 : 0);
  return {
    title,
    firstName: rest.slice(0, -1).join(" "),
    lastName: rest[rest.length - 1] ?? "",
  };
}

/** Source quotes lines then postcode; the UI quotes one block of copy. */
function splitAddress(values: string[]): { addressLines: string[]; postcode: string } {
  if (values.length > 1) {
    return { addressLines: values.slice(0, -1), postcode: values[values.length - 1] as string };
  }
  const lines = one(values)
    .split(/[\n,]/)
    .map((line) => line.trim())
    .filter(Boolean);
  return {
    addressLines: lines,
    postcode: (lines.join(" ").match(POSTCODE)?.[0] ?? "").replace(/\s+/g, " ").toUpperCase(),
  };
}

function toAccountFacts(item: ItemView, related: string[]): AccountFacts {
  const fields = item.fields;
  return {
    number: item.id,
    productName: one(fields.productName).replace(/\(?\s*\d[\d\s]*\)?\s*$/, "").trim(),
    related: related.includes(item.id),
    status: one(fields.status).toUpperCase(),
    opened: toIsoDate(one(fields.opened)),
    role: one(fields.role).toUpperCase(),
    productIndicators: /^none$/i.test(one(fields.productIndicators))
      ? "none"
      : one(fields.productIndicators),
    currentBalance: money(one(fields.currentBalance)),
    balanceAfterPending: money(one(fields.balanceAfterPending)),
    overdraftAmount: money(one(fields.overdraftAmount)),
    finalAvailableBalance: money(one(fields.finalAvailableBalance)),
    partiesOnAccount: one(fields.partiesOnAccount),
    partyIds: uniqueSorted(fields.partyIds ?? []),
  };
}

function toCustomerFacts(customer: CustomerView): CustomerFacts {
  const accounts = customer.collections.accounts ?? [];
  const held = accounts.map((account) => account.id);
  const related = uniqueSorted((customer.fields.relatedAccounts ?? []).filter((number) => held.includes(number)));

  return {
    partyId: customer.partyId,
    ...splitName(customer.fields.name ?? []),
    dateOfBirth: toIsoDate(one(customer.fields.dateOfBirth)),
    age: one(customer.fields.age),
    maritalStatus: one(customer.fields.maritalStatus).toUpperCase(),
    ...splitAddress(customer.fields.address ?? []),
    addressTag: one(customer.fields.addressTag),
    timeWithBank: one(customer.fields.timeWithBank),
    relatedAccounts: related,
    unrelatedAccounts: uniqueSorted(held.filter((number) => !related.includes(number))),
    accounts: accounts.map((account) => toAccountFacts(account, related)),
    supportNeeds: (customer.collections.supportNeeds ?? []).map((need) => ({
      description: need.id,
      lastChanged: toIsoDateTime(one(need.fields.lastChanged)),
      dateRecorded: toIsoDateTime(one(need.fields.dateRecorded)),
      consentStatus: one(need.fields.consentStatus),
      nextReview: /ongoing/i.test(one(need.fields.nextReview))
        ? "ongoing"
        : toIsoDate(one(need.fields.nextReview)),
      furtherInformation: one(need.fields.furtherInformation),
    })),
    relatedParties: (customer.collections.relatedParties ?? []).map((party) => ({
      relationship: one(party.fields.relationship),
      relationshipCode: one(party.fields.relationshipCode),
      name: one(party.fields.name),
      relatedPartyId: party.id,
      partyType: one(party.fields.partyType).toUpperCase(),
    })),
    contactNotes: (customer.collections.contactNotes ?? []).map((note) => ({
      contactAt: note.key,
      details: one(note.fields.details),
      classification: one(note.fields.classification),
      outcome: one(note.fields.outcome),
      direction: one(note.fields.direction),
      method: one(note.fields.method),
      location: one(note.fields.location),
      associatedCaseId: one(note.fields.associatedCaseId),
      brand: one(note.fields.brand),
    })),
  };
}

/** Flat read of one side of the map. Handy in a failing test; compare uses the views. */
function toFacts(view: SideView): FactFindFacts {
  const customers: Record<string, CustomerFacts> = {};
  for (const [partyId, customer] of Object.entries(view.customers)) {
    customers[partyId] = toCustomerFacts(customer);
  }
  return {
    partyIds: view.partyIds,
    icaAccounts: uniqueSorted(
      Object.values(view.customers).flatMap((customer) => customer.fields.relatedAccounts ?? []),
    ),
    customers,
  };
}

export function extractFromAggregated(aggregated: unknown): FactFindFacts {
  return toFacts(readSourceView(aggregated, factFindMap));
}

export function extractFromAgentOutput(adk: unknown): FactFindFacts {
  return toFacts(readUiView(adk, factFindMap));
}

function compare(aggregated: unknown, adk: unknown): CompareResult {
  return runCompare(readSourceView(aggregated, factFindMap), readUiView(adk, factFindMap), factFindMap);
}

export function compareFactFind(aggregated: unknown, adk: unknown): void {
  const failures = failuresOf(compare(aggregated, adk));
  assert.equal(failures.length, 0, `Fact-find mismatch:\n\n${failures.join("\n\n")}`);
}

/**
 * The same comparison as compareFactFind, classified for a reader instead of
 * thrown. `report.passed` is false on exactly the runs compareFactFind rejects.
 */
export function compareFactFindReport(aggregated: unknown, adk: unknown): ComparisonReport {
  return reportOf(compare(aggregated, adk));
}

export function assertComplaintsRules(aggregated: unknown, adk: unknown): void {
  compareFactFind(aggregated, adk);
}
