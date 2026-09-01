import { namesMatch, moneyEquals } from "../normalization/index.js";
import { EMPTY } from "../models/normalized.js";
import type { NormalizedAccount, NormalizedContractModel, NormalizedCustomer, NormalizedExpectedModel } from "../models/normalized.js";
import type { FieldDiff } from "../models/validation-result.js";
import type { ValidationPlan } from "../planning/validation-planner.js";

function diff(partial: Omit<FieldDiff, "classification"> & { classification?: FieldDiff["classification"] }): FieldDiff {
  return {
    classification: "AGENT_OUTPUT_FAILURE",
    ...partial,
  };
}

function customerDisplay(c: NormalizedCustomer): string {
  return c.name.display || c.partyId;
}

function findCustomer(list: NormalizedCustomer[], partyId: string): NormalizedCustomer | undefined {
  return list.find((c) => c.partyId === partyId);
}

function findAccount(list: NormalizedAccount[], accountNumber: string): NormalizedAccount[] {
  return list.filter((a) => a.accountNumber === accountNumber);
}

export function validateContract(
  expected: NormalizedExpectedModel,
  contract: NormalizedContractModel,
  plan: ValidationPlan,
): FieldDiff[] {
  const diffs: FieldDiff[] = [];
  const checks = new Set(plan.checks);

  if (checks.has("complaintRef")) {
    const expRef = expected.complaint.complaintRef;
    const actRef = contract.complaintRef ?? "";
    if (expRef && actRef && expRef !== actRef) {
      diffs.push(
        diff({
          entityType: "complaint",
          entityId: expRef,
          field: "complaintRef",
          expected: expRef,
          actual: actRef,
          groundTruthPath: "complaintRef",
          contractPath: "summaryBox.complaintReference",
          rule: "complaintRef.match",
          message: `Complaint reference mismatch: expected ${expRef}, actual ${actRef}`,
        }),
      );
    }
    if (expRef && !actRef) {
      diffs.push(
        diff({
          entityType: "complaint",
          entityId: expRef,
          field: "complaintRef",
          expected: expRef,
          actual: null,
          groundTruthPath: "complaintRef",
          contractPath: "summaryBox.complaintReference",
          rule: "complaintRef.present",
          message: `Complaint reference ${expRef} missing from ADK contract`,
        }),
      );
    }
  }

  if (checks.has("customer.count") || checks.has("customer.identity")) {
    const expectedIds = expected.customers.map((c) => c.partyId);
    const actualIds = contract.customers.map((c) => c.partyId);

    if (expectedIds.length !== actualIds.length) {
      diffs.push(
        diff({
          entityType: "customer",
          entityId: "*",
          field: "count",
          expected: expectedIds.length,
          actual: actualIds.length,
          groundTruthPath: "derived.customerFlowPartyIds",
          contractPath: "fact_find.customers",
          rule: "customer.count",
          message: `Expected customer count: ${expectedIds.length}, actual: ${actualIds.length}`,
        }),
      );
    }

    for (const customer of expected.customers) {
      const actual = findCustomer(contract.customers, customer.partyId);
      if (!actual) {
        const expectedIndex = expected.customers.findIndex((c) => c.partyId === customer.partyId);
        diffs.push(
          diff({
            entityType: "customer",
            entityId: customer.partyId,
            field: "presence",
            expected: customerDisplay(customer),
            actual: "NOT FOUND",
            groundTruthPath: customer.sourcePath,
            contractPath: `fact_find.customers[${expectedIndex}]`,
            rule: "customer.identity",
            message: `Missing customer: ${customerDisplay(customer)} (partyId ${customer.partyId})`,
          }),
        );
      }
    }

    for (const customer of contract.customers) {
      if (!findCustomer(expected.customers, customer.partyId) && customer.partyId) {
        diffs.push(
          diff({
            entityType: "customer",
            entityId: customer.partyId,
            field: "unexpected",
            expected: "NOT PRESENT",
            actual: customerDisplay(customer),
            contractPath: customer.sourcePath,
            rule: "customer.unexpected",
            message: `Unexpected customer in contract: ${customerDisplay(customer)} (partyId ${customer.partyId})`,
          }),
        );
      }
    }
  }

  for (const expectedCustomer of expected.customers) {
    const actual = findCustomer(contract.customers, expectedCustomer.partyId);
    if (!actual) continue;

    if (checks.has("customer.personalDetails")) {
      comparePersonalDetails(expectedCustomer, actual, diffs);
    }
    if (checks.has("customer.address")) {
      if (expectedCustomer.address.canonical !== actual.address.canonical) {
        diffs.push(
          diff({
            entityType: "customer",
            entityId: expectedCustomer.partyId,
            field: "address",
            expected: expectedCustomer.address.canonical,
            actual: actual.address.canonical,
            groundTruthPath: `${expectedCustomer.sourcePath}.address`,
            contractPath: `${actual.sourcePath} Personal details block`,
            rule: "customer.address",
            message: `Address mismatch for ${customerDisplay(expectedCustomer)}`,
          }),
        );
      }
    }
    if (checks.has("customer.sections")) {
      for (const section of plan.requiredCustomerSections) {
        const has = actual.sections.some((s) => s.toLowerCase() === section.toLowerCase());
        if (!has) {
          diffs.push(
            diff({
              entityType: "customer",
              entityId: expectedCustomer.partyId,
              field: "section",
              expected: section,
              actual: "NOT FOUND",
              groundTruthPath: expectedCustomer.sourcePath,
              contractPath: `${actual.sourcePath}.sections`,
              rule: "customer.sections",
              message: `Expected section "${section}" missing for ${customerDisplay(expectedCustomer)}`,
            }),
          );
        }
      }
    }

    if (checks.has("account.count") || checks.has("account.identity") || checks.has("account.fields") || checks.has("account.duplicates")) {
      compareAccounts(expectedCustomer, actual, diffs, checks);
    }

    compareEmptySection("contactNotes", expectedCustomer, actual, diffs, checks.has("contactNotes.presence"));
    compareEmptySection("supportNeeds", expectedCustomer, actual, diffs, checks.has("supportNeeds.presence"));
    compareEmptySection("relatedParties", expectedCustomer, actual, diffs, checks.has("relatedParties.presence"));
  }

  return diffs;
}

function comparePersonalDetails(
  expected: NormalizedCustomer,
  actual: NormalizedCustomer,
  diffs: FieldDiff[],
): void {
  if (!namesMatch(expected.name, actual.name)) {
    diffs.push(
      diff({
        entityType: "customer",
        entityId: expected.partyId,
        field: "name",
        expected: expected.name.display,
        actual: actual.name.display,
        groundTruthPath: expected.sourcePath,
        contractPath: `${actual.sourcePath} name`,
        rule: "customer.name",
        message: `Name mismatch for partyId ${expected.partyId}`,
      }),
    );
  }
  if (expected.dateOfBirth !== actual.dateOfBirth) {
    diffs.push(
      diff({
        entityType: "customer",
        entityId: expected.partyId,
        field: "dateOfBirth",
        expected: expected.dateOfBirth,
        actual: actual.dateOfBirth,
        groundTruthPath: `${expected.sourcePath}.dateOfBirth`,
        contractPath: `${actual.sourcePath} date_of_birth`,
        rule: "customer.dateOfBirth",
        message: `Date of birth mismatch for ${customerDisplay(expected)}`,
      }),
    );
  }
  if (expected.age !== actual.age) {
    diffs.push(
      diff({
        entityType: "customer",
        entityId: expected.partyId,
        field: "age",
        expected: expected.age,
        actual: actual.age,
        groundTruthPath: `${expected.sourcePath}.age`,
        contractPath: `${actual.sourcePath} age`,
        rule: "customer.age",
        message: `Age mismatch for ${customerDisplay(expected)}`,
      }),
    );
  }
  if (expected.maritalStatus !== actual.maritalStatus) {
    diffs.push(
      diff({
        entityType: "customer",
        entityId: expected.partyId,
        field: "maritalStatus",
        expected: expected.maritalStatus,
        actual: actual.maritalStatus,
        groundTruthPath: `${expected.sourcePath}.maritalStatus`,
        contractPath: `${actual.sourcePath} marital_status`,
        rule: "customer.maritalStatus",
        message: `Marital status mismatch for ${customerDisplay(expected)}`,
      }),
    );
  }
  if (expected.timeWithBank.totalMonths !== actual.timeWithBank.totalMonths) {
    diffs.push(
      diff({
        entityType: "customer",
        entityId: expected.partyId,
        field: "timeWithBank",
        expected: `${expected.timeWithBank.totalMonths} months`,
        actual: `${actual.timeWithBank.totalMonths} months`,
        groundTruthPath: `${expected.sourcePath}.timeWithBank`,
        contractPath: `${actual.sourcePath} time_with_bank`,
        rule: "customer.timeWithBank",
        message: `Time with bank mismatch for ${customerDisplay(expected)}`,
      }),
    );
  }
}

function compareAccounts(
  expectedCustomer: NormalizedCustomer,
  actualCustomer: NormalizedCustomer,
  diffs: FieldDiff[],
  checks: Set<string>,
): void {
  const expectedNos = expectedCustomer.accounts.map((a) => a.accountNumber);
  const actualNos = actualCustomer.accounts.map((a) => a.accountNumber);

  if (checks.has("account.count") && expectedNos.length !== actualNos.length) {
    diffs.push(
      diff({
        entityType: "account",
        entityId: expectedCustomer.partyId,
        field: "count",
        expected: expectedNos.length,
        actual: actualNos.length,
        groundTruthPath: `${expectedCustomer.sourcePath} products`,
        contractPath: `${actualCustomer.sourcePath} Accounts and products`,
        rule: "account.count",
        message: `Expected ${expectedNos.length} accounts for ${customerDisplay(expectedCustomer)}, actual ${actualNos.length}`,
      }),
    );
  }

  if (checks.has("account.duplicates")) {
    const seen = new Map<string, number>();
    for (const acct of actualCustomer.accounts) {
      seen.set(acct.accountNumber, (seen.get(acct.accountNumber) ?? 0) + 1);
    }
    for (const [num, count] of seen) {
      if (count > 1) {
        diffs.push(
          diff({
            entityType: "account",
            entityId: num,
            field: "duplicate",
            expected: 1,
            actual: count,
            contractPath: `${actualCustomer.sourcePath} Accounts and products`,
            rule: "account.duplicates",
            message: `Duplicate account ${num} rendered ${count} times for ${customerDisplay(actualCustomer)}`,
          }),
        );
      }
    }
  }

  if (checks.has("account.identity") || checks.has("account.fields")) {
    for (const exp of expectedCustomer.accounts) {
      const matches = findAccount(actualCustomer.accounts, exp.accountNumber);
      if (matches.length === 0) {
        diffs.push(
          diff({
            entityType: "account",
            entityId: exp.accountNumber,
            field: "presence",
            expected: `${exp.accountName} ${exp.accountNumber}`,
            actual: "NOT FOUND",
            groundTruthPath: exp.sourcePath,
            contractPath: `${actualCustomer.sourcePath} Accounts and products`,
            rule: "account.identity",
            message: `Missing account ${exp.accountName} ${exp.accountNumber} for ${customerDisplay(expectedCustomer)}`,
          }),
        );
        continue;
      }
      if (checks.has("account.fields")) {
        compareAccountFields(exp, matches[0], expectedCustomer, diffs);
      }
    }
  }
}

function compareAccountFields(
  expected: NormalizedAccount,
  actual: NormalizedAccount,
  customer: NormalizedCustomer,
  diffs: FieldDiff[],
): void {
  const id = expected.accountNumber;
  const push = (field: string, exp: unknown, act: unknown, rule: string, message: string) => {
    diffs.push(
      diff({
        entityType: "account",
        entityId: id,
        field,
        expected: exp,
        actual: act,
        groundTruthPath: expected.sourcePath,
        contractPath: actual.sourcePath,
        rule,
        message,
      }),
    );
  };

  if (expected.accountName.toLowerCase() !== actual.accountName.toLowerCase()) {
    push("accountName", expected.accountName, actual.accountName, "account.name", `Account name mismatch for ${id}`);
  }
  if (expected.status !== actual.status) {
    push("status", expected.status, actual.status, "account.status", `Account status mismatch for ${id}`);
  }
  if (expected.openedDate !== actual.openedDate) {
    push("openedDate", expected.openedDate, actual.openedDate, "account.openedDate", `Opened date mismatch for ${id}`);
  }
  if (!moneyEquals(expected.currentBalanceMinor, actual.currentBalanceMinor)) {
    push(
      "currentBalance",
      expected.currentBalanceMinor,
      actual.currentBalanceMinor,
      "account.balance",
      `Current balance mismatch for ${id}`,
    );
  }
  if (!moneyEquals(expected.pendingBalanceMinor, actual.pendingBalanceMinor)) {
    push(
      "pendingBalance",
      expected.pendingBalanceMinor,
      actual.pendingBalanceMinor,
      "account.pendingBalance",
      `Pending balance mismatch for ${id}`,
    );
  }
  if (!moneyEquals(expected.overdraftMinor, actual.overdraftMinor)) {
    push(
      "overdraft",
      expected.overdraftMinor,
      actual.overdraftMinor,
      "account.overdraft",
      `Overdraft mismatch for ${id}`,
    );
  }
  if (!moneyEquals(expected.finalAvailableMinor, actual.finalAvailableMinor)) {
    push(
      "finalAvailable",
      expected.finalAvailableMinor,
      actual.finalAvailableMinor,
      "account.finalAvailable",
      `Final available balance mismatch for ${id}`,
    );
  }
  if (expected.customerRole !== actual.customerRole) {
    push("customerRole", expected.customerRole, actual.customerRole, "account.role", `Customer role mismatch for ${id}`);
  }
  if (expected.relationshipToComplaint !== actual.relationshipToComplaint) {
    push(
      "relationshipToComplaint",
      expected.relationshipToComplaint,
      actual.relationshipToComplaint,
      "account.relationship",
      `Complaint relationship mismatch for ${id}`,
    );
  }
  const expParties = [...expected.partyIds].sort().join(",");
  const actParties = [...actual.partyIds].sort().join(",");
  if (expParties !== actParties) {
    push("partyIds", expected.partyIds, actual.partyIds, "account.partyIds", `Parties on account mismatch for ${id}`);
  }
  if (expected.productIndicators !== actual.productIndicators) {
    push(
      "productIndicators",
      expected.productIndicators,
      actual.productIndicators,
      "account.indicators",
      `Product indicators mismatch for ${id}`,
    );
  }
  void customer;
}

function compareEmptySection(
  field: "contactNotes" | "supportNeeds" | "relatedParties",
  expected: NormalizedCustomer,
  actual: NormalizedCustomer,
  diffs: FieldDiff[],
  enabled: boolean,
): void {
  if (!enabled) return;
  const exp = expected[field];
  const act = actual[field];
  const expEmpty = exp === EMPTY;
  const actEmpty = act === EMPTY;
  if (expEmpty && actEmpty) return;
  if (!expEmpty && actEmpty) {
    diffs.push(
      diff({
        entityType: "customer",
        entityId: expected.partyId,
        field,
        expected: exp,
        actual: EMPTY,
        groundTruthPath: `${expected.sourcePath}.${field}`,
        contractPath: `${actual.sourcePath} ${field}`,
        rule: `${field}.missing`,
        message: `Expected ${field} content for ${customerDisplay(expected)} but contract is EMPTY`,
      }),
    );
    return;
  }
  if (expEmpty && !actEmpty) {
    diffs.push(
      diff({
        entityType: "customer",
        entityId: expected.partyId,
        field,
        expected: EMPTY,
        actual: act,
        groundTruthPath: `${expected.sourcePath}.${field}`,
        contractPath: `${actual.sourcePath} ${field}`,
        rule: `${field}.unexpected`,
        message: `Expected empty ${field} for ${customerDisplay(expected)} but contract has content`,
      }),
    );
  }
}
