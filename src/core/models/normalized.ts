import type { UIComponent } from "./ui-component.js";

export const EMPTY = "EMPTY" as const;
export type EmptySentinel = typeof EMPTY;

export interface NormalizedName {
  title?: string;
  first: string;
  last: string;
  display: string;
}

export interface NormalizedAddress {
  lines: string[];
  postcode?: string;
  canonical: string;
}

export interface NormalizedDuration {
  totalMonths: number;
}

export interface NormalizedAccount {
  accountNumber: string;
  accountName: string;
  status: string;
  openedDate: string;
  currentBalanceMinor: number | EmptySentinel;
  pendingBalanceMinor: number | EmptySentinel;
  overdraftMinor: number | EmptySentinel;
  finalAvailableMinor: number | EmptySentinel;
  customerRole: string;
  partyIds: string[];
  relationshipToComplaint: "related" | "unrelated";
  productIndicators: EmptySentinel | string;
  sourcePath: string;
}

export interface NormalizedCustomer {
  partyId: string;
  name: NormalizedName;
  dateOfBirth: string;
  age: number;
  maritalStatus: string;
  address: NormalizedAddress;
  timeWithBank: NormalizedDuration;
  accounts: NormalizedAccount[];
  contactNotes: EmptySentinel | string[];
  supportNeeds: EmptySentinel | string[];
  relatedParties: EmptySentinel | string[];
  sections: string[];
  sourcePath: string;
}

export interface NormalizedComplaint {
  complaintRef: string;
  narrative?: string;
  investigation?: string;
  outcome?: string;
  relatedAccountNumbers: string[];
}

export interface NormalizedExpectedModel {
  complaint: NormalizedComplaint;
  customers: NormalizedCustomer[];
}

export interface NormalizedContractModel {
  complaintRef?: string;
  groundedness: { status: string; message?: string };
  summaryHeadings: string[];
  summaryTexts: string[];
  analysisSectionLabels: string[];
  customers: NormalizedCustomer[];
  tree: UIComponent[];
}
