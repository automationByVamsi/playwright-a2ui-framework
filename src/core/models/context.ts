export interface TestContext {
  agentId: string;
  scenario: string;
  complaintRef?: string;
  groundTruthPath: string;
  contractPath: string;
  headed?: boolean;
  debug?: boolean;
  reportDir: string;
  uiMode: "stub" | "live";
  mutateContract?: ContractMutation;
  /** Run Compare #2 against the stub/live page. */
  renderCheck?: boolean;
  /** Stub query ?drop= — contract stays complete, UI hides this party. */
  dropRenderedPartyId?: string;
}

export interface ContractMutation {
  dropCustomerPartyId?: string;
  overrideDob?: { partyId: string; dateOfBirth: string };
  dropAccountNumber?: string;
  duplicateAccountNumber?: string;
  overrideBalance?: { accountNumber: string; currentBalance: string };
  dropSectionLabel?: string;
}
