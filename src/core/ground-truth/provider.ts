import type { NormalizedExpectedModel } from "../models/index.js";

export interface GroundTruthProvider {
  getComplaint(): {
    complaintRef: string;
    narrative?: string;
    investigation?: string;
    outcome?: string;
    relatedAccountNumbers: string[];
  };
  getCustomers(): RawCustomer[];
  getAccounts(partyId: string): RawAccount[];
  getContactNotes(partyId: string): RawNote[];
  getSupportNeeds(partyId: string): RawSupportNeed[];
  getRelatedParties(partyId: string): RawRelatedParty[];
  toNormalized(): NormalizedExpectedModel;
}

export interface RawCustomer {
  partyId: string;
  title?: string;
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  age?: number;
  maritalStatus?: string;
  timeWithBank?: string;
  addressLines: Array<string | null | undefined>;
  postcode?: string | null;
  sourcePath: string;
}

export interface RawAccount {
  accountNumber: string;
  accountName: string;
  status: string;
  openedDate: string;
  currentBalance?: number | null;
  pendingBalance?: number | null;
  overdraft?: number | null;
  finalAvailable?: number | null;
  customerRole?: string;
  partyIds: string[];
  productType?: string;
  indicators?: unknown;
  sourcePath: string;
}

export interface RawNote {
  text: string;
}

export interface RawSupportNeed {
  text: string;
}

export interface RawRelatedParty {
  partyId?: string;
  name?: string;
}
