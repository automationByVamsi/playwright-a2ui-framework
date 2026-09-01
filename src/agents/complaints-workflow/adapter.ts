import type { GroundTruthProvider } from "../../core/ground-truth/provider.js";
import { JsonGroundTruthProvider } from "../../core/ground-truth/json-provider.js";
import type { ContractMutation, TestContext } from "../../core/models/context.js";
import type { NormalizedContractModel, NormalizedExpectedModel } from "../../core/models/normalized.js";
import { planForScenario, type ValidationPlan } from "../../core/planning/validation-planner.js";
import { mapComplaintsContract } from "./mapper.js";
import { readFileSync } from "node:fs";

export interface AgentAdapter {
  readonly agentId: string;
  getGroundTruthProvider(ctx: TestContext): GroundTruthProvider;
  parseContract(ctx: TestContext, mutation?: ContractMutation): {
    expected: NormalizedExpectedModel;
    contract: NormalizedContractModel;
  };
  parseFromObjects(
    aggregatedPayload: unknown,
    agentOutputTrace: unknown,
    mutation?: ContractMutation,
  ): {
    expected: NormalizedExpectedModel;
    contract: NormalizedContractModel;
  };
  getValidationPlan(scenario: string): ValidationPlan;
}

export class ComplaintsWorkflowAdapter implements AgentAdapter {
  readonly agentId = "complaints-workflow";

  getGroundTruthProvider(ctx: TestContext): GroundTruthProvider {
    return JsonGroundTruthProvider.fromFile(ctx.groundTruthPath);
  }

  parseContract(ctx: TestContext, mutation?: ContractMutation) {
    const expected = this.getGroundTruthProvider(ctx).toNormalized();
    const raw = JSON.parse(readFileSync(ctx.contractPath, "utf8")) as unknown;
    const { model } = mapComplaintsContract(raw, mutation ?? ctx.mutateContract);
    return { expected, contract: model };
  }

  parseFromObjects(aggregatedPayload: unknown, agentOutputTrace: unknown, mutation?: ContractMutation) {
    const expected = new JsonGroundTruthProvider(aggregatedPayload).toNormalized();
    const { model } = mapComplaintsContract(agentOutputTrace, mutation);
    return { expected, contract: model };
  }

  getValidationPlan(scenario: string): ValidationPlan {
    return planForScenario(this.agentId, scenario);
  }
}

export function getAdapter(agentId: string): AgentAdapter {
  if (agentId === "complaints-workflow" || agentId === "compliance-workflow") {
    return new ComplaintsWorkflowAdapter();
  }
  throw new Error(`Unknown agent adapter: ${agentId}. Register it under src/agents/.`);
}
