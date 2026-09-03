import { JsonGroundTruthProvider } from "../core/ground-truth/json-provider.js";
import { mapComplaintsContract } from "../agents/complaints-workflow/mapper.js";
import { parseAdkContract } from "../core/parser/adk-contract-parser.js";
import { canonicalAccountNumber } from "../core/normalization/index.js";
import type { FieldDiff } from "../core/models/validation-result.js";
import type { NormalizedContractModel, NormalizedExpectedModel } from "../core/models/normalized.js";
import {
  assertGroundednessContract,
  type GroundednessCheckResult,
  type GroundednessContractResult,
} from "./types.js";

function rec(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function diff(partial: Omit<FieldDiff, "classification"> & { classification?: FieldDiff["classification"] }): FieldDiff {
  return { classification: "AGENT_OUTPUT_FAILURE", ...partial };
}

function collectWarningSignals(raw: Record<string, unknown>): unknown[] {
  const groundedness = rec(raw.groundednessCheck);
  const named = [
    raw.account_category_warnings,
    raw.accountCategoryWarnings,
    groundedness.account_category_warnings,
    raw.warnings,
  ];
  return named.flatMap((value) => (value == null || value === "" ? [] : Array.isArray(value) ? value : [value]));
}

function identityInvariants(expected: NormalizedExpectedModel, contract: NormalizedContractModel): GroundednessCheckResult {
  const diffs: FieldDiff[] = [];
  const expectedIds = expected.customers.map((c) => c.partyId);
  const actualIds = contract.customers.map((c) => c.partyId);

  for (const customer of expected.customers) {
    if (!actualIds.includes(customer.partyId)) {
      diffs.push(
        diff({
          entityType: "customer",
          entityId: customer.partyId,
          field: "presence",
          expected: customer.name.display,
          actual: "NOT FOUND",
          groundTruthPath: customer.sourcePath,
          contractPath: "fact_find.customers",
          rule: "tier1.customer.identity",
          message: `Party ${customer.partyId} (${customer.name.display}) from aggregated payload is missing from agentOutput.fact_find.customers`,
        }),
      );
    }
  }

  for (const customer of contract.customers) {
    if (customer.partyId && !expectedIds.includes(customer.partyId)) {
      diffs.push(
        diff({
          entityType: "customer",
          entityId: customer.partyId,
          field: "unexpected",
          expected: "NOT PRESENT",
          actual: customer.name.display,
          contractPath: customer.sourcePath,
          rule: "tier1.customer.unexpected",
          message: `Party ${customer.partyId} is in agentOutput but not in the aggregated payload`,
        }),
      );
    }
  }

  return {
    name: "customer-identity",
    passed: diffs.length === 0,
    message:
      diffs.length === 0
        ? `All ${expectedIds.length} source party ids are present in fact_find.customers`
        : diffs.map((d) => d.message).join("; "),
    diffs,
  };
}

function accountCategorizationInvariants(
  expected: NormalizedExpectedModel,
  contract: NormalizedContractModel,
): GroundednessCheckResult {
  const diffs: FieldDiff[] = [];
  const relatedFromSource = new Set(expected.complaint.relatedAccountNumbers.map(canonicalAccountNumber));

  for (const exp of expected.customers) {
    const act = contract.customers.find((c) => c.partyId === exp.partyId);
    if (!act) continue;

    for (const acct of act.accounts) {
      const shouldBeRelated = relatedFromSource.has(acct.accountNumber);
      const actualRel = acct.relationshipToComplaint;
      if (shouldBeRelated && actualRel !== "related") {
        diffs.push(
          diff({
            entityType: "account",
            entityId: acct.accountNumber,
            field: "relationshipToComplaint",
            expected: "related",
            actual: actualRel,
            groundTruthPath: acct.sourcePath,
            contractPath: `${act.sourcePath} Accounts and products`,
            rule: "tier1.account.related",
            classification: "DATA_TRANSFORMATION_FAILURE",
            message: `Complaint account ${acct.accountNumber} must be under "Related to complaint" (was "${actualRel}")`,
          }),
        );
      }
      if (!shouldBeRelated && actualRel !== "unrelated") {
        diffs.push(
          diff({
            entityType: "account",
            entityId: acct.accountNumber,
            field: "relationshipToComplaint",
            expected: "unrelated",
            actual: actualRel,
            groundTruthPath: acct.sourcePath,
            contractPath: `${act.sourcePath} Accounts and products`,
            rule: "tier1.account.unrelated",
            classification: "DATA_TRANSFORMATION_FAILURE",
            message: `Holding ${acct.accountNumber} must be under "Unrelated to the complaint" (was "${actualRel}")`,
          }),
        );
      }
    }
  }

  if (relatedFromSource.size > 0) {
    const relatedInContract = contract.customers.flatMap((c) =>
      c.accounts.filter((a) => a.relationshipToComplaint === "related").map((a) => a.accountNumber),
    );
    for (const acct of relatedFromSource) {
      if (!relatedInContract.includes(acct)) {
        diffs.push(
          diff({
            entityType: "account",
            entityId: acct,
            field: "presence",
            expected: "Related to complaint",
            actual: "NOT FOUND",
            groundTruthPath: "sources.ica.items.accountNumberFull",
            contractPath: "fact_find.customers[*] Accounts and products",
            rule: "tier1.account.related.missing",
            classification: "DATA_TRANSFORMATION_FAILURE",
            message: `ICA complaint account ${acct} is not categorised as related in agentOutput`,
          }),
        );
      }
    }
  }

  return {
    name: "account-categorization",
    passed: diffs.length === 0,
    message:
      diffs.length === 0
        ? "Complaint-referencing accounts are related; remaining holdings are unrelated"
        : diffs.map((d) => d.message).join("; "),
    diffs,
  };
}

function groundednessBannerAssertion(raw: Record<string, unknown>): GroundednessCheckResult {
  const groundedness = rec(raw.groundednessCheck);
  const status = String(groundedness.status ?? "").trim().toLowerCase();
  const message = String(groundedness.message ?? "");
  const warnings = collectWarningSignals(raw);
  const diffs: FieldDiff[] = [];

  if (status === "correct") {
    if (!/pass/i.test(message) && !/✅/.test(message)) {
      diffs.push(
        diff({
          entityType: "groundedness",
          entityId: "groundednessCheck",
          field: "message",
          expected: "passed / correct banner copy",
          actual: message || null,
          classification: "GROUNDEDNESS_FAILURE",
          contractPath: "groundednessCheck.message",
          rule: "tier1.groundedness.passed-copy",
          message: `groundednessCheck.status is "correct" but the schema message does not describe a passed state`,
        }),
      );
    }
    if (warnings.length > 0) {
      diffs.push(
        diff({
          entityType: "groundedness",
          entityId: "groundednessCheck",
          field: "warnings",
          expected: "none when status is correct",
          actual: warnings,
          classification: "GROUNDEDNESS_FAILURE",
          contractPath: "account_category_warnings",
          rule: "tier1.groundedness.unexpected-warning",
          message: "status is correct but account_category_warnings / mismatch warnings are present",
        }),
      );
    }
  } else {
    const needsWarning = warnings.length > 0 || /verif|incorrect|fail|mismatch/i.test(status);
    if (!needsWarning && status) {
      diffs.push(
        diff({
          entityType: "groundedness",
          entityId: "groundednessCheck",
          field: "status",
          expected: "correct, or a warning/needs-verifying emission",
          actual: status,
          classification: "GROUNDEDNESS_FAILURE",
          contractPath: "groundednessCheck.status",
          rule: "tier1.groundedness.warning-state",
          message: `Groundedness is "${status}" but the schema did not emit a warning / needs-verifying state`,
        }),
      );
    }
    if (status !== "correct") {
      diffs.push(
        diff({
          entityType: "groundedness",
          entityId: "groundednessCheck",
          field: "status",
          expected: "correct",
          actual: status || null,
          classification: "GROUNDEDNESS_FAILURE",
          contractPath: "groundednessCheck.status",
          rule: "tier1.groundedness.status",
          message: `Groundedness check is not passed: "${status || ""}"`,
        }),
      );
    }
  }

  return {
    name: "groundedness-banner",
    passed: diffs.length === 0,
    message:
      diffs.length === 0
        ? `groundednessCheck.status="${status}" matches the expected banner state`
        : diffs.map((d) => d.message).join("; "),
    diffs,
  };
}

/**
 * Tier 1 — in-memory, zero-browser.
 * Source of truth = aggregated tool payload. Spec = ADK `agentOutput` tree.
 */
export function validateGroundednessContract(
  aggregatedPayload: unknown,
  agentOutputTrace: unknown,
): GroundednessContractResult {
  const expected = new JsonGroundTruthProvider(aggregatedPayload).toNormalized();
  const { model } = mapComplaintsContract(agentOutputTrace);
  const parsed = parseAdkContract(agentOutputTrace);

  const checks = [
    identityInvariants(expected, model),
    accountCategorizationInvariants(expected, model),
    groundednessBannerAssertion(parsed.raw),
  ];
  const diffs = checks.flatMap((c) => c.diffs);

  return {
    passed: diffs.length === 0,
    complaintRef: expected.complaint.complaintRef,
    groundednessStatus: model.groundedness.status,
    checks,
    diffs,
  };
}

export { assertGroundednessContract };
export type { GroundednessContractResult, GroundednessCheckResult };
