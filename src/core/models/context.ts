/** Test-only mutations applied to a parsed ADK contract. */
export interface ContractMutation {
  dropCustomerPartyId?: string;
  overrideDob?: { partyId: string; dateOfBirth: string };
  dropAccountNumber?: string;
  duplicateAccountNumber?: string;
  overrideBalance?: { accountNumber: string; currentBalance: string };
  dropSectionLabel?: string;
}
