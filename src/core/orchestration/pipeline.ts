import path from "node:path";
import type { Page } from "@playwright/test";
import { ComplaintsWorkflowAdapter, getAdapter } from "../../agents/complaints-workflow/adapter.js";
import { validateContract } from "../validation/contract-validator.js";
import { validateRenderedUi } from "../validation/render-validator.js";
import { validateGroundedness } from "../validation/groundedness-gate.js";
import { classifyDiffs, primaryClassification } from "../classification/failure-classifier.js";
import { writeDomainReport } from "../reporting/report-service.js";
import { executeAndExtract, type ExecutedRender } from "../playwright/executor.js";
import { planForTargetSections, type ValidationPlan } from "../planning/validation-planner.js";
import type { TestContext } from "../models/context.js";
import type { CheckStatus } from "../models/failure.js";
import type { NormalizedContractModel, NormalizedExpectedModel } from "../models/normalized.js";
import type { EntityResult, FieldDiff, ValidationResult } from "../models/validation-result.js";

export interface EvaluateValidationInput {
  agentId: string;
  scenario: string;
  complaintRef?: string;
  expected: NormalizedExpectedModel;
  contract: NormalizedContractModel;
  plan: ValidationPlan;
  reportDir: string;
  rendered?: ExecutedRender;
}

export interface ObjectValidationInput {
  agentId?: string;
  scenario: string;
  complaintRef?: string;
  aggregatedPayload: unknown;
  agentOutputTrace: unknown;
  reportDir: string;
  targetSections?: string[];
  rendered?: ExecutedRender;
}

export function evaluateValidation(input: EvaluateValidationInput): ValidationResult {
  const { expected, contract, plan, rendered } = input;
  const complaintRef = input.complaintRef || expected.complaint.complaintRef || "unknown";

  const groundednessDiffs = plan.checks.includes("groundedness")
    ? validateGroundedness(contract.groundedness.status)
    : [];

  const contractDiffs = classifyDiffs(validateContract(expected, contract, plan), {
    layer: "contract",
    contractMalformed: false,
    groundTruthInvalid: false,
  });

  let renderDiffs: FieldDiff[] = [];
  if (rendered) {
    renderDiffs = validateRenderedUi(contract, rendered.model, plan);
  }

  const allContract = [...groundednessDiffs, ...contractDiffs];
  const allRender = renderDiffs;
  const allDiffs = [...allContract, ...allRender];

  const missing = allDiffs.filter((d) => d.field === "presence" || d.rule.endsWith(".missing") || d.field === "section");
  const duplicates = allDiffs.filter((d) => d.field === "duplicate");
  const other = allDiffs.filter((d) => !missing.includes(d) && !duplicates.includes(d));

  const contractFailed = allContract.length > 0;
  const renderFailed = allRender.length > 0;
  const failed = contractFailed || renderFailed;
  const classPrimary = primaryClassification(allDiffs);

  const entities: EntityResult[] = expected.customers.map((exp) => {
    const inContract = contract.customers.find((c) => c.partyId === exp.partyId);
    const inUi = rendered?.model.customers.find((c) => c.partyId === exp.partyId);
    const entityDiffs = allDiffs.filter((d) => d.entityId === exp.partyId);
    return {
      type: "customer",
      id: exp.partyId,
      displayName: exp.name.display,
      status: entityDiffs.length > 0 || !inContract || (rendered && !inUi) ? "FAIL" : "PASS",
      paths: {
        groundTruth: exp.sourcePath,
        contract: inContract?.sourcePath,
        rendered: rendered ? (inUi?.sourcePath ?? "NOT FOUND") : inContract ? undefined : "NOT FOUND",
      },
    };
  });

  const result: ValidationResult = {
    schemaVersion: "1.0",
    agent: input.agentId,
    scenario: input.scenario,
    complaintRef,
    overall: failed ? "FAIL" : "PASS",
    gating: failed ? "FAIL" : "PASS",
    layers: {
      groundTruth: { status: "PASS" },
      adkContract: { status: contractFailed ? "FAIL" : "PASS", reason: contractFailed ? classPrimary : undefined },
      renderedUi: rendered
        ? {
            status: renderFailed ? "FAIL" : "PASS",
            reason: renderFailed ? "UI_RENDERING_FAILURE" : rendered.model.strategy,
          }
        : { status: "SKIPPED", reason: "render check not executed" },
      semantic: { status: "SKIPPED", reason: "semantic validator not executed" },
    },
    groundedness: {
      status: groundednessDiffs.length ? "FAIL" : "PASS",
      value: contract.groundedness.status,
      message: contract.groundedness.message,
    },
    counts: {
      customers: { expected: expected.customers.length, actual: contract.customers.length },
      accounts: {
        expected: expected.customers.reduce((n, c) => n + c.accounts.length, 0),
        actual: contract.customers.reduce((n, c) => n + c.accounts.length, 0),
      },
      ...(rendered
        ? {
            renderedCustomers: {
              expected: contract.customers.length,
              actual: rendered.model.customers.length,
            },
          }
        : {}),
    },
    entities,
    diffs: other,
    missing,
    duplicates,
    evidence: {
      redaction: "applied",
      screenshot: rendered?.evidence.screenshotPath ?? null,
      trace: null,
      accessibilitySnapshot: rendered?.evidence.accessibilitySnapshotPath ?? null,
    },
  };

  const files = writeDomainReport(result, input.reportDir);
  result.evidence.reportPath = path.relative(process.cwd(), files.jsonPath);
  return result;
}

export function runObjectValidation(opts: ObjectValidationInput): ValidationResult {
  const agentId = opts.agentId ?? "complaints-workflow";
  const adapter = new ComplaintsWorkflowAdapter();
  const plan = planForTargetSections(agentId, opts.scenario, opts.targetSections);

  try {
    const { expected, contract } = adapter.parseFromObjects(opts.aggregatedPayload, opts.agentOutputTrace);
    return evaluateValidation({
      agentId,
      scenario: opts.scenario,
      complaintRef: opts.complaintRef || expected.complaint.complaintRef,
      expected,
      contract,
      plan,
      reportDir: opts.reportDir,
      rendered: opts.rendered,
    });
  } catch (err) {
    const message = (err as Error).message;
    const contractMalformed = /agentOutput|ADK contract|JSON/i.test(message);
    const result = baseResult(
      {
        agentId,
        scenario: opts.scenario,
        complaintRef: opts.complaintRef ?? "unknown",
        reportDir: opts.reportDir,
      },
      opts.complaintRef ?? "unknown",
      {
        overall: "FAIL",
        gating: "FAIL",
        groundTruth: contractMalformed ? "PASS" : "FAIL",
        adkContract: contractMalformed ? "FAIL" : "SKIPPED",
        diffs: [
          {
            entityType: "pipeline",
            entityId: opts.complaintRef ?? "unknown",
            field: "parse",
            expected: "valid payload",
            actual: message,
            classification: contractMalformed ? "UI_CONTRACT_FAILURE" : "GROUND_TRUTH_FAILURE",
            rule: "pipeline.parse",
            message,
          },
        ],
      },
    );
    const files = writeDomainReport(result, opts.reportDir);
    result.evidence.reportPath = path.relative(process.cwd(), files.jsonPath);
    return result;
  }
}

export function runContractValidation(ctx: TestContext): ValidationResult {
  const adapter = getAdapter(ctx.agentId);
  const plan = adapter.getValidationPlan(ctx.scenario);

  try {
    const { expected, contract } = adapter.parseContract(ctx, ctx.mutateContract);
    return evaluateValidation({
      agentId: adapter.agentId,
      scenario: ctx.scenario,
      complaintRef: ctx.complaintRef || expected.complaint.complaintRef,
      expected,
      contract,
      plan,
      reportDir: ctx.reportDir,
    });
  } catch (err) {
    const message = (err as Error).message;
    const contractMalformed = /agentOutput|ADK contract|JSON/i.test(message);
    const groundTruthInvalid = !contractMalformed;
    const complaintRef = ctx.complaintRef ?? "unknown";
    const result = baseResult(ctx, complaintRef, {
      overall: "FAIL",
      gating: "FAIL",
      groundTruth: groundTruthInvalid ? "FAIL" : "PASS",
      adkContract: contractMalformed ? "FAIL" : "SKIPPED",
      diffs: [
        {
          entityType: "pipeline",
          entityId: complaintRef,
          field: "parse",
          expected: "valid payload",
          actual: message,
          classification: contractMalformed ? "UI_CONTRACT_FAILURE" : "GROUND_TRUTH_FAILURE",
          rule: "pipeline.parse",
          message,
        },
      ],
    });
    const files = writeDomainReport(result, ctx.reportDir);
    result.evidence.reportPath = files.jsonPath;
    return result;
  }
}

export async function runFullValidation(ctx: TestContext, page: Page): Promise<ValidationResult> {
  const adapter = getAdapter(ctx.agentId);
  const plan = adapter.getValidationPlan(ctx.scenario);

  let parsed: ReturnType<typeof adapter.parseContract>;
  try {
    parsed = adapter.parseContract(ctx, ctx.mutateContract);
  } catch (err) {
    const result = runContractValidation(ctx);
    result.layers.renderedUi = { status: "SKIPPED", reason: (err as Error).message };
    return result;
  }

  try {
    const executed = await executeAndExtract(page, ctx);
    return evaluateValidation({
      agentId: adapter.agentId,
      scenario: ctx.scenario,
      complaintRef: ctx.complaintRef || parsed.expected.complaint.complaintRef,
      expected: parsed.expected,
      contract: parsed.contract,
      plan,
      reportDir: ctx.reportDir,
      rendered: executed,
    });
  } catch (err) {
    const message = (err as Error).message;
    const result = evaluateValidation({
      agentId: adapter.agentId,
      scenario: ctx.scenario,
      complaintRef: ctx.complaintRef || parsed.expected.complaint.complaintRef,
      expected: parsed.expected,
      contract: parsed.contract,
      plan,
      reportDir: ctx.reportDir,
    });
    result.overall = "FAIL";
    result.gating = "FAIL";
    result.layers.renderedUi = { status: "FAIL", reason: "TEST_EXECUTION_FAILURE" };
    result.diffs.push({
      entityType: "pipeline",
      entityId: result.complaintRef,
      field: "render",
      expected: "rendered UI extract",
      actual: message,
      classification: "TEST_EXECUTION_FAILURE",
      rule: "pipeline.render",
      message,
    });
    const files = writeDomainReport(result, ctx.reportDir);
    result.evidence.reportPath = path.relative(process.cwd(), files.jsonPath);
    return result;
  }
}

function baseResult(
  ctx: { agentId: string; scenario: string; complaintRef?: string; reportDir: string },
  complaintRef: string,
  opts: {
    overall: CheckStatus;
    gating: CheckStatus;
    groundTruth: CheckStatus;
    adkContract: CheckStatus;
    diffs: FieldDiff[];
  },
): ValidationResult {
  return {
    schemaVersion: "1.0",
    agent: ctx.agentId,
    scenario: ctx.scenario,
    complaintRef,
    overall: opts.overall,
    gating: opts.gating,
    layers: {
      groundTruth: { status: opts.groundTruth },
      adkContract: { status: opts.adkContract },
      renderedUi: { status: "SKIPPED", reason: "not executed" },
      semantic: { status: "SKIPPED", reason: "not executed" },
    },
    groundedness: { status: "SKIPPED" },
    counts: {},
    entities: [],
    diffs: opts.diffs,
    missing: [],
    duplicates: [],
    evidence: { redaction: "applied", screenshot: null, trace: null },
  };
}
